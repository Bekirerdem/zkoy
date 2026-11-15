// Kalıcı mühür kuyruğu: oyun temposu zinciri asla beklemez (SPEC §7). Her
// olay önce SQLite'a yazılır ve oda masada tutulur; oda bir bölümü kapatınca
// (`release`) o ana kadar biriken her şey tek tx olarak gider → oyun başına
// "dağıtım + seçim + her gece + her gündüz" kadar tx. Gönderim yavaşsa
// bırakılanlar birleşir, kuyruk birikmez. Süreç yeniden başlarsa kaldığı yerden
// devam eder (29 Ağu dersi: bellekteki kuyruk uykuda kayboldu).
//
// Bir odanın gönderimi düşerse yalnız o oda bekler (artan aralıkla yeniden
// denenir); diğer odaların mührü yoluna devam eder.

import { byteLength } from "../engine/fair";
import { MemoEvent } from "../engine/types";
import { ZcashService } from "../zcash/service";
import { Db } from "./db";

export interface SealOptions {
  /** İlk yeniden deneme aralığı; her düşüşte ikiye katlanır. */
  retryMs: number;
  maxBackoffMs: number;
  /** Terk edilen masa turu kapatmaz; tutulan olaylar en geç bu süre sonra gider. */
  holdMaxMs: number;
  /** Bir tx en çok bu kadar memo taşır; daha uzun tur bölünür. */
  maxOutputs: number;
}

const DEFAULTS: SealOptions = {
  retryMs: Number(process.env.ZKOY_SEAL_RETRY_MS ?? 15_000),
  maxBackoffMs: Number(process.env.ZKOY_SEAL_MAX_BACKOFF_MS ?? 10 * 60_000),
  holdMaxMs: Number(process.env.ZKOY_SEAL_HOLD_MAX_MS ?? 10 * 60_000),
  maxOutputs: Number(process.env.ZKOY_SEAL_MAX_OUTPUTS ?? 60),
};
/** A Zcash memo field is 512 bytes. */
export const MEMO_MAX_BYTES = 512;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SealQueue {
  /** Called after each successful send (rooms re-broadcast their seal count). */
  onSealed: (code: string) => void = () => {};
  /** Oda → gönderilmeye bırakılan son kuyruk satırı (dahil). */
  private released = new Map<string, number>();
  private holdTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Oda → art arda düşen deneme sayısı ve bir sonraki denemenin en erken anı. */
  private fails = new Map<string, { n: number; notBefore: number }>();
  private readonly opts: SealOptions;

  constructor(
    private readonly db: Db,
    private readonly zcash: ZcashService,
    opts: Partial<SealOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** Olayları kalıcı yazar ve tutar; zincire `release` ile gider. */
  enqueue(code: string, events: MemoEvent[], eventIds: number[]): void {
    // Son savunma hattı: 512 baytı aşan bir memo hiçbir zaman gönderilemez ve
    // içinde olduğu paketi sonsuza kadar düşürür. Motor bunu zaten engeller;
    // yine de sızan olursa yalnız o olay mühürsüz kalır.
    const keep: MemoEvent[] = [];
    const keepIds: number[] = [];
    events.forEach((e, k) => {
      const size = byteLength(JSON.stringify(e.memo));
      if (size > MEMO_MAX_BYTES) {
        console.error(`[seal] ${code} ${String(e.memo.t)} memo'su ${size} bayt, mühürlenmedi`);
        return;
      }
      keep.push(e);
      if (eventIds[k] !== undefined) keepIds.push(eventIds[k]!);
    });
    if (keep.length === 0) return;
    this.db.enqueueSeal(code, keep, keepIds);
    if (!this.holdTimers.has(code)) {
      const t = setTimeout(() => this.release(code), this.opts.holdMaxMs);
      t.unref?.();
      this.holdTimers.set(code, t);
    }
  }

  /** Tur kapandı: odanın şu ana kadar tuttuğu her şey gider. */
  release(code: string): void {
    clearTimeout(this.holdTimers.get(code));
    this.holdTimers.delete(code);
    const last = this.db.pendingFor(code).at(-1);
    if (!last) return;
    this.released.set(code, last.id);
    void this.flush();
  }

  /** Kick the loop (startup: whatever the DB still holds goes out). */
  resume(): void {
    for (const p of this.db.pendingSeals()) this.released.set(p.code, p.id);
    void this.flush();
  }

  pendingCount(code: string): number {
    return this.db.pendingFor(code).reduce((n, p) => n + p.events.length, 0);
  }

  /** Rooms whose last send failed, with the number of failed attempts in a row. */
  failing(): Array<{ code: string; attempts: number }> {
    return [...this.fails].map(([code, f]) => ({ code, attempts: f.n }));
  }

  /** Sealed txids for a room, oldest first, with memo counts. */
  sealed(code: string): Array<{ txid: string; n: number }> {
    return this.db.sql
      .query(
        `SELECT txid, COUNT(*) AS n FROM events WHERE code = ? AND txid IS NOT NULL
         GROUP BY txid ORDER BY MIN(id)`,
      )
      .all(code) as Array<{ txid: string; n: number }>;
  }

  /** Bırakılanlar gidene kadar bekler; zaten çalışıyorsa o çalışmayı döndürür. */
  flush(): Promise<void> {
    if (!this.running) this.running = this.drain().finally(() => (this.running = null));
    return this.running;
  }

  private running: Promise<void> | null = null;

  private async drain(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const ready = this.db
        .pendingCodes()
        .filter((c) => c.firstId <= (this.released.get(c.code) ?? -1));
      if (ready.length === 0) break;
      const next = ready.find((c) => (this.fails.get(c.code)?.notBefore ?? 0) <= now);
      if (!next) {
        // Bekleyen her oda cezalı: en erken sırası gelene kadar uyu.
        const wake = Math.min(...ready.map((c) => this.fails.get(c.code)!.notBefore));
        await sleep(Math.max(25, wake - now));
        continue;
      }
      const code = next.code;
      const upTo = this.released.get(code)!;
      const rows = this.db.pendingFor(code).filter((p) => p.id <= upTo);
      const batch: typeof rows = [];
      let outputs = 0;
      for (const r of rows) {
        if (batch.length > 0 && outputs + r.events.length > this.opts.maxOutputs) break;
        batch.push(r);
        outputs += r.events.length;
      }
      try {
        const txid = await this.zcash.send(code, batch.flatMap((b) => b.events));
        this.db.completeSeal(batch.map((b) => b.id), txid);
        this.fails.delete(code);
        if (batch.length === rows.length && this.released.get(code) === upTo) this.released.delete(code);
        this.onSealed(code);
      } catch (e) {
        const n = (this.fails.get(code)?.n ?? 0) + 1;
        const wait = Math.min(this.opts.retryMs * 2 ** (n - 1), this.opts.maxBackoffMs);
        this.fails.set(code, { n, notBefore: Date.now() + wait });
        console.error(
          `[seal] ${code} gönderilemedi (${n}. deneme, ${Math.round(wait / 1000)} sn sonra yeniden):`,
          String(e).slice(0, 400),
        );
      }
    }
  }
}
