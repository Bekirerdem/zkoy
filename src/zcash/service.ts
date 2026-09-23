// Zcash service seam: the engine emits MemoEvents; the server's SealQueue
// batches and persists them, and a service sends one multi-memo tx per batch
// (zingo) or pretends to (mock). The game stays playable with the mock alone.

import { MemoEvent } from "../engine/types";

export interface RoomWallet {
  address: string;
  ufvk: string;
}

export interface ZcashService {
  readonly kind: "zingo" | "mock";
  /** Create (or load) the room wallet; its UFVK is the ghost/audit key. */
  createRoomWallet(code: string): Promise<RoomWallet>;
  /** Create (or load) a receive-only player wallet, returns its UA. */
  createPlayerWallet(code: string, playerId: string): Promise<string>;
  /** Send one tx carrying every memo of the batch; resolves to its txid. */
  send(code: string, events: MemoEvent[]): Promise<string>;
  /** Last known chain height — the village clock tower. */
  height(): Promise<number>;
  /** Ops wallet spendable balance in zatoshis (null when unknown). */
  balance(): Promise<number | null>;
}
