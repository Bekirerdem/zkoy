// Zcash service seam: the engine emits MemoEvents; a service seals them on
// chain (zingo) or pretends to (mock). The game must stay playable with the
// mock alone (SPEC §5 Faz 1 — demo sigortası).

import { MemoEvent } from "../engine/types";

export interface SealedMemo {
  /** Chain txid once transmitted, or a mock: id. */
  txid: string;
  /** The memo events folded into this tx. */
  events: MemoEvent[];
  at: number;
}

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
  /**
   * Queue memo events for sealing. The service batches them into
   * multi-receiver quicksends from the ops wallet. Fire-and-forget with an
   * internal retry queue: game tempo never blocks on the chain (SPEC §3).
   */
  seal(code: string, events: MemoEvent[]): void;
  /** Everything sealed so far for the audit timeline (txids + status). */
  sealed(code: string): SealedMemo[];
  /** Kuyrukta bekleyen (henüz zincire oturmamış) memo olayları. */
  pendingEvents(code: string): MemoEvent[];
  /** Read the room account's memo feed (ghost view / audit). */
  readRoomMemos(code: string): Promise<string[]>;
  /** Last known chain height — the village clock tower (SPEC Ö5). */
  height(): Promise<number>;
}
