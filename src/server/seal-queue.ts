// Kalıcı mühür kuyruğu: oyun temposu zinciri asla beklemez (SPEC §7). Her
// olay önce SQLite'a yazılır; kuyruk oda başına toplu tek tx gönderir,
// başarısızlıkta bekleyip yeniden dener, süreç yeniden başlarsa kaldığı
// yerden devam eder (29 Ağu dersi: bellekteki kuyruk uykuda kayboldu).

import { MemoEvent } from "../engine/types";
import { ZcashService } from "../zcash/service";
import { Db } from "./db";

const RETRY_MS = Number(process.env.ZKOY_SEAL_RETRY_MS ?? 15_000);

export class SealQueue {
  private flushing = false;
  /** Called after each successful send (rooms re-broadcast their seal count). */
  onSealed: (code: string) => void = () => {};

  constructor(
    private readonly db: Db,
    private readonly zcash: ZcashService,
  ) {}

  enqueue(code: string, events: MemoEvent[], eventIds: number[]): void {
    if (events.length === 0) return;
    this.db.enqueueSeal(code, events, eventIds);
    void this.flush();
  }

  /** Kick the loop (startup: resumes whatever the DB still holds). */
  resume(): void {
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

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (;;) {
        const pending = this.db.pendingSeals();
        if (pending.length === 0) break;
        const code = pending[0]!.code;
        const batch = pending.filter((p) => p.code === code);
        const events = batch.flatMap((b) => b.events);
        try {
          const txid = await this.zcash.send(code, events);
          this.db.completeSeal(batch.map((b) => b.id), txid);
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
