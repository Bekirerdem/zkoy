// Mock Zcash service — Faz 1 demo sigortası. Same seam, no chain.

import { MemoEvent } from "../engine/types";
import { RoomWallet, SealedMemo, ZcashService } from "./service";

export class MockZcashService implements ZcashService {
  readonly kind = "mock" as const;
  private wallets = new Map<string, RoomWallet>();
  private log = new Map<string, SealedMemo[]>();
  private seq = 0;

  async createRoomWallet(code: string): Promise<RoomWallet> {
    let w = this.wallets.get(code);
    if (!w) {
      w = {
        address: `utest1mock${code.toLowerCase()}${"x".repeat(20)}`,
        ufvk: `uviewtest1mock${code.toLowerCase()}${"x".repeat(40)}`,
      };
      this.wallets.set(code, w);
    }
    return w;
  }

  async createPlayerWallet(code: string, playerId: string): Promise<string> {
    return `utest1mock${code.toLowerCase()}${playerId}${"x".repeat(12)}`;
  }

  seal(code: string, events: MemoEvent[]): void {
    if (events.length === 0) return;
    const list = this.log.get(code) ?? [];
    list.push({ txid: `mock:${++this.seq}`, events, at: Date.now() });
    this.log.set(code, list);
  }

  sealed(code: string): SealedMemo[] {
    return this.log.get(code) ?? [];
  }

  async readRoomMemos(code: string): Promise<string[]> {
    return (this.log.get(code) ?? [])
      .flatMap((s) => s.events)
      .filter((e) => e.to === "room")
      .map((e) => JSON.stringify(e.memo));
  }
}
