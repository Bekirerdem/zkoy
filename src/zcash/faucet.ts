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

function lastClaim(): number {
  try {
    return (JSON.parse(readFileSync(STATE_FILE, "utf8")) as { at: number }).at;
  } catch {
    return 0;
  }
}

/** Hourly check; claims when balance < threshold and 24 h passed since the last claim. */
export function startFaucetLoop(
  zcash: ZcashService,
  opsAddress: string,
  { thresholdZat = 5_000_000, everyMs = 3_600_000 } = {},
): ReturnType<typeof setInterval> {
  const tick = async () => {
    try {
      const bal = await zcash.balance();
      if (bal === null || bal >= thresholdZat) return;
      if (Date.now() - lastClaim() < DAY_MS) {
        console.error(`[faucet] ops bakiyesi düşük (${bal} zat), talep hakkı henüz dolmadı`);
        return;
      }
      const out = await claim(opsAddress);
      if (!existsSync(dirname(STATE_FILE))) mkdirSync(dirname(STATE_FILE), { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify({ at: Date.now(), out }));
      console.log(`[faucet] talep edildi (bakiye ${bal} zat):`, JSON.stringify(out).slice(0, 200));
    } catch (e) {
      console.error("[faucet] talep başarısız:", String(e).slice(0, 300));
    }
  };
  void tick();
  return setInterval(tick, everyMs);
}
