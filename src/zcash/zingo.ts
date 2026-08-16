// Real Zcash service: drives zingo-cli (patched build with `network clearnet`,
// see docs/zingo-patch.md) as child processes.
//
// Faz 0 findings this design rests on:
// - zingo-cli v5 has no multi-account CLI: isolation = one wallet per data-dir.
//   Offline wallet creation is instant; the UA and UFVK are exported offline.
// - Mixnet transmit correspondents are mainnet-only → testnet sends MUST go
//   clearnet via `network clearnet` (our patch) inside a piped session.
// - quicksend accepts a multi-receiver JSON arg → one tx can carry many memos.
// - Memos are readable from the mempool already (no block wait for reads).

import { MemoEvent } from "../engine/types";
import { RoomWallet, SealedMemo, ZcashService } from "./service";

const ZINGO =
  process.env.ZINGO_BIN ??
  "C:\\Users\\l3eki\\Desktop\\Web3-projeleri\\zcash-camp\\zingolib\\target\\release\\zingo-cli.exe";
const OPS_DIR = process.env.ZKOY_OPS_DIR ?? "C:\\Users\\l3eki\\.zingo-testnet";
const WALLETS_ROOT =
  process.env.ZKOY_WALLETS_ROOT ?? "C:\\Users\\l3eki\\.zkoy-wallets";
const SERVER = process.env.ZKOY_LWD ?? "https://testnet.zec.rocks:443";
const DUST_ZATS = 10_000;

/** Extract the last balanced top-level JSON value from noisy CLI output. */
export function extractLastJson(out: string): unknown {
  let best: unknown = undefined;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (ch !== "{" && ch !== "[") continue;
    let depth = 0;
    let inStr = false;
    for (let j = i; j < out.length; j++) {
      const c = out[j];
      if (inStr) {
        if (c === "\\") j++;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) {
          try {
            best = JSON.parse(out.slice(i, j + 1));
          } catch {
            // not JSON after all; keep scanning
          }
          i = j;
          break;
        }
      }
    }
  }
  return best;
}

/** One in-flight process per data-dir — zingo wallets are single-writer. */
const locks = new Map<string, Promise<unknown>>();
async function withWalletLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(dir) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(dir, next);
  return next;
}

async function runOffline(dataDir: string, cmd: string[]): Promise<unknown> {
  return withWalletLock(dataDir, async () => {
    const p = Bun.spawn(
      [ZINGO, "--chain", "testnet", "--data-dir", dataDir, "--offline", ...cmd],
      { stdout: "pipe", stderr: "pipe" },
    );
    const out = await new Response(p.stdout).text();
    const err = await new Response(p.stderr).text();
    if ((await p.exited) !== 0)
      throw new Error(`zingo offline ${cmd[0]} failed: ${err || out}`);
    return extractLastJson(out);
  });
}

/** Online piped session: `network clearnet` + given commands + quit. */
async function runOnlineSession(
  dataDir: string,
  cmds: string[],
  timeoutMs = 240_000,
): Promise<string> {
  return withWalletLock(dataDir, async () => {
    const p = Bun.spawn(
      [ZINGO, "--chain", "testnet", "--server", SERVER, "--data-dir", dataDir],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    const script = ["network clearnet", ...cmds, "quit"].join("\n") + "\n";
    p.stdin.write(script);
    p.stdin.end();
    const killer = setTimeout(() => p.kill(), timeoutMs);
    const out = await new Response(p.stdout).text();
    const err = await new Response(p.stderr).text();
    clearTimeout(killer);
    if ((await p.exited) !== 0)
      throw new Error(`zingo session failed: ${(err || out).slice(-2000)}`);
    return out;
  });
}

interface PendingSeal {
  code: string;
  events: MemoEvent[];
}

export class ZingoService implements ZcashService {
  readonly kind = "zingo" as const;
  private rooms = new Map<string, RoomWallet>();
  private playerAddrs = new Map<string, string>(); // `${code}/${playerId}` → UA
  private log = new Map<string, SealedMemo[]>();
  private pending: PendingSeal[] = [];
  private flushing = false;

  private roomDir(code: string): string {
    return `${WALLETS_ROOT}\\${code}\\room`;
  }
  private playerDir(code: string, playerId: string): string {
    return `${WALLETS_ROOT}\\${code}\\players\\${playerId}`;
  }

  private async walletAddress(dataDir: string): Promise<string> {
    const json = (await runOffline(dataDir, ["addresses"])) as Array<{
      encoded_address: string;
    }>;
    const ua = json?.[0]?.encoded_address;
    if (!ua) throw new Error(`no address in wallet ${dataDir}`);
    return ua;
  }

  async createRoomWallet(code: string): Promise<RoomWallet> {
    const cached = this.rooms.get(code);
    if (cached) return cached;
    const dir = this.roomDir(code);
    const address = await this.walletAddress(dir);
    const ufvkJson = (await runOffline(dir, ["export_ufvk"])) as {
      ufvk: string;
    };
    const wallet = { address, ufvk: ufvkJson.ufvk };
    this.rooms.set(code, wallet);
    return wallet;
  }

  async createPlayerWallet(code: string, playerId: string): Promise<string> {
    const key = `${code}/${playerId}`;
    const cached = this.playerAddrs.get(key);
    if (cached) return cached;
    const ua = await this.walletAddress(this.playerDir(code, playerId));
    this.playerAddrs.set(key, ua);
    return ua;
  }

  seal(code: string, events: MemoEvent[]): void {
    if (events.length === 0) return;
    this.pending.push({ code, events });
    void this.flush();
  }

  sealed(code: string): SealedMemo[] {
    return this.log.get(code) ?? [];
  }

  /** Drain the queue: one multi-receiver quicksend per room batch, retried. */
  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.pending.length > 0) {
        const code = this.pending[0]!.code;
        const batch = this.pending.filter((p) => p.code === code);
        this.pending = this.pending.filter((p) => p.code !== code);
        const events = batch.flatMap((b) => b.events);
        try {
          const txid = await this.sendBatch(code, events);
          const list = this.log.get(code) ?? [];
          list.push({ txid, events, at: Date.now() });
          this.log.set(code, list);
        } catch (e) {
          console.error(`[zingo] seal failed for ${code}, requeueing:`, e);
          this.pending.push({ code, events });
          await new Promise((r) => setTimeout(r, 15_000));
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async sendBatch(code: string, events: MemoEvent[]): Promise<string> {
    const room = await this.createRoomWallet(code);
    const receivers: Array<{ address: string; amount: number; memo: string }> =
      [];
    for (const e of events) {
      const address =
        e.to === "room"
          ? room.address
          : await this.createPlayerWallet(code, e.to.player);
      receivers.push({
        address,
        amount: e.zats && e.zats > 0 ? e.zats : DUST_ZATS,
        memo: JSON.stringify(e.memo),
      });
    }
    const arg = JSON.stringify(receivers).replaceAll("'", "");
    const out = await runOnlineSession(OPS_DIR, [`quicksend '${arg}'`]);
    const json = extractLastJson(out) as { txids?: string[] } | undefined;
    const txid = json?.txids?.[0];
    if (!txid) throw new Error(`quicksend returned no txid: ${out.slice(-1500)}`);
    return txid;
  }

  async readRoomMemos(code: string): Promise<string[]> {
    const dir = this.roomDir(code);
    const out = await withWalletLock(dir, async () => {
      const p = Bun.spawn(
        [
          ZINGO,
          "--chain",
          "testnet",
          "--server",
          SERVER,
          "--data-dir",
          dir,
          "--waitsync",
          "messages",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const text = await new Response(p.stdout).text();
      await p.exited;
      return text;
    });
    const json = extractLastJson(out) as
      | { value_transfers?: Array<{ memos?: string[] }> }
      | undefined;
    return (json?.value_transfers ?? []).flatMap((t) => t.memos ?? []);
  }
}
