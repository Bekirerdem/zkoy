// Kalıcı mühür kuyruğu: oyun temposu zinciri asla beklemez (SPEC §7). Her
// olay önce SQLite'a yazılır ve oda masada tutulur; oda turu kapatınca
// (`release`) o ana kadar biriken her şey tek tx olarak gider → oyun başına
// "seçim + her tur + son" kadar tx. Başarısızlıkta bekleyip yeniden dener,
// süreç yeniden başlarsa kaldığı yerden devam eder (29 Ağu dersi: bellekteki
// kuyruk uykuda kayboldu).

import { MemoEvent } from "../engine/types";
import { ZcashService } from "../zcash/service";
import { Db } from "./db";

const RETRY_MS = Number(process.env.ZKOY_SEAL_RETRY_MS ?? 15_000);
/** Terk edilen masa turu kapatmaz; tutulan olaylar en geç bu süre sonra gider. */
const HOLD_MAX_MS = Number(process.env.ZKOY_SEAL_HOLD_MAX_MS ?? 10 * 60_000);

export class SealQueue {
  private flushing = false;
  /** Called after each successful send (rooms re-broadcast their seal count). */
  onSealed: (code: string) => void = () => {};
  /** Oda → gönderilmeye bırakılan son kuyruk satırı (dahil). */
  private released = new Map<string, number>();
  private holdTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly db: Db,
    private readonly zcash: ZcashService,
  ) {}

  /** Olayları kalıcı yazar ve tutar; zincire `release` ile gider. */
  enqueue(code: string, events: MemoEvent[], eventIds: number[]): void {
    if (events.length === 0) return;
    this.db.enqueueSeal(code, events, eventIds);
    if (!this.holdTimers.has(code)) {
      const t = setTimeout(() => this.release(code), HOLD_MAX_MS);
      t.unref?.();
      this.holdTimers.set(code, t);
    }
  }

  /** Tur kapandı: odanın şu ana kadar tuttuğu her şey tek tx olarak gider. */
  release(code: string): void {
    clearTimeout(this.holdTimers.get(code));
    this.holdTimers.delete(code);
    const last = this.db
      .pendingSeals()
      .filter((p) => p.code === code)
      .at(-1);
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
    return this.db
      .pendingSeals()
      .filter((p) => p.code === code)
      .reduce((n, p) => n + p.events.length, 0);
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
    this.flushing = true;
    try {
      for (;;) {
        const pending = this.db.pendingSeals();
        const next = pending.find((p) => p.id <= (this.released.get(p.code) ?? -1));
        if (!next) break;
        const code = next.code;
        const upTo = this.released.get(code)!;
        const batch = pending.filter((p) => p.code === code && p.id <= upTo);
        const events = batch.flatMap((b) => b.events);
        try {
          const txid = await this.zcash.send(code, events);
          this.db.completeSeal(batch.map((b) => b.id), txid);
          if (this.released.get(code) === upTo) this.released.delete(code);
          this.onSealed(code);
        } catch (e) {
          console.error(`[seal] ${code} gönderilemedi, yeniden denenecek:`, String(e).slice(0, 400));
          await new Promise((r) => setTimeout(r, RETRY_MS));
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
