// Mock Zcash service — demo sigortası. Same seam, no chain.

import { MemoEvent } from "../engine/types";
import { RoomWallet, ZcashService } from "./service";

export class MockZcashService implements ZcashService {
  readonly kind = "mock" as const;
  private wallets = new Map<string, RoomWallet>();
  private seq = 0;
  /** Every batch "sent", for tests. */
  readonly sent: Array<{ code: string; events: MemoEvent[]; txid: string }> = [];

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

  async send(code: string, events: MemoEvent[]): Promise<string> {
    const txid = `mock:${++this.seq}`;
    this.sent.push({ code, events, txid });
    return txid;
  }

  private t0 = Date.now();
  async height(): Promise<number> {
    return 4_276_000 + Math.floor((Date.now() - this.t0) / 75_000);
  }

  async balance(): Promise<number | null> {
    return null;
  }
}
