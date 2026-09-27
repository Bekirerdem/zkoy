// Ops cüzdanı sessiz depo (SPEC v3 §9.5): bakiye eşiğin altına inince jinolabs
// testnet musluğundan (PoW, adres başı 0,1 TAZ / 24 s) kendiliğinden talep.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ZcashService } from "./service";

const BASE = process.env.ZKOY_FAUCET_URL ?? "https://zcashfaucet.jinolabs.xyz";
const STATE_FILE = process.env.ZKOY_FAUCET_STATE ?? "data/faucet.json";
const DAY_MS = 24 * 3600_000;

function leadingZeroBits(buf: Buffer): number {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    for (let m = 0x80; m; m >>= 1) {
      if (byte & m) return bits;
      bits++;
    }
  }
  return bits;
}

/** Smallest nonce with sha256(`${seed}:${nonce}`) having ≥ difficulty leading zero bits. */
export function solvePow(seed: string, difficulty: number): number {
  for (let nonce = 0; ; nonce++) {
    const h = createHash("sha256").update(`${seed}:${nonce}`).digest();
    if (leadingZeroBits(h) >= difficulty) return nonce;
  }
}

export function powOk(seed: string, nonce: number, difficulty: number): boolean {
  return leadingZeroBits(createHash("sha256").update(`${seed}:${nonce}`).digest()) >= difficulty;
}

/** One claim; resolves to the faucet's JSON answer. */
export async function claim(address: string): Promise<unknown> {
  const ch = (await (await fetch(`${BASE}/api/pow/challenge`)).json()) as {
    ok?: boolean;
    seed: string;
    difficulty: number;
    exp: unknown;
    sig: unknown;
  };
  if (!ch?.ok) throw new Error(`challenge alınamadı: ${JSON.stringify(ch)}`);
  const nonce = solvePow(ch.seed, ch.difficulty);
  const res = await fetch(`${BASE}/api/faucet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address,
      network: "taz",
      pow: { seed: ch.seed, difficulty: ch.difficulty, exp: ch.exp, sig: ch.sig, nonce: String(nonce) },
    }),
  });
  return res.json();
}

const FAUZEC = process.env.ZKOY_FAUZEC_URL ?? "https://fauzec.com";

/**
 * Zcash Foundation musluğu (fauzec.com): adres başı 1 TAZ / 24 s, CAPTCHA'sız
 * belgeli API. `runtime_unavailable` = musluk motoru kapalı (25 Eyl'de görüldü).
 */
export async function claimFauzec(address: string): Promise<unknown> {
  const res = await fetch(`${FAUZEC}/api/v1/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ network: "testnet", address }),
  });
  const out = (await res.json()) as { outcome?: string; error_code?: string };
  if (out.outcome !== "accepted") throw new Error(`fauzec reddetti: ${JSON.stringify(out)}`);
  return out;
}

interface FaucetSource {
  name: string;
  claim: (address: string) => Promise<unknown>;
}

const SOURCES: FaucetSource[] = [
  { name: "fauzec", claim: claimFauzec },
  { name: "jinolabs", claim },
];

type FaucetState = Record<string, { at: number; out?: unknown; error?: string }>;

function readState(): FaucetState {
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    // Eski biçim: tek kaynak {at, out} → jinolabs.
    return typeof raw?.at === "number" ? { jinolabs: raw } : raw;
  } catch {
    return {};
  }
}

function writeState(state: FaucetState) {
  if (!existsSync(dirname(STATE_FILE))) mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Saatlik kontrol: bakiye yedek eşiğinin altındaysa her musluktan kendi 24
 * saatlik hakkı dolduğunda talep eder. Eşik (varsayılan 2 TAZ ≈ 650 oyun)
 * aşılınca durur; musluk ortak kaynak, ihtiyaçtan fazlası biriktirilmez.
 * Başarısız talep de zamanlanır (bir saat sonra yeniden denenir).
 */
export function startFaucetLoop(
  zcash: ZcashService,
  opsAddress: string,
  { reserveZat = Number(process.env.ZKOY_FAUCET_RESERVE_ZAT ?? 200_000_000), everyMs = 3_600_000 } = {},
): ReturnType<typeof setInterval> {
  const tick = async () => {
    const bal = await zcash.balance().catch(() => null);
    if (bal === null || bal >= reserveZat) return;
    const state = readState();
    for (const src of SOURCES) {
      const last = state[src.name];
      if (last && !last.error && Date.now() - last.at < DAY_MS) continue;
      if (last?.error && Date.now() - last.at < everyMs) continue;
      try {
        const out = await src.claim(opsAddress);
        state[src.name] = { at: Date.now(), out };
        console.log(`[faucet] ${src.name} talep edildi (bakiye ${bal} zat):`, JSON.stringify(out).slice(0, 160));
      } catch (e) {
        state[src.name] = { at: Date.now(), error: String(e).slice(0, 300) };
        console.error(`[faucet] ${src.name} başarısız:`, String(e).slice(0, 300));
      }
      writeState(state);
    }
  };
  void tick();
  return setInterval(tick, everyMs);
}
