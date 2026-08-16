// ZKöy game engine types. The engine is a pure state machine: it never does
// I/O. Chain writes are emitted as MemoEvent values (matching SPEC.md's memo
// schema) and consumed by the Zcash service (real or mock).

export type Mode = "klasik" | "agalik";
export type Role = "vampir" | "koylu" | "doktor" | "gozcu" | "deli";
export type Phase =
  | "LOBBY"
  | "NIGHT"
  | "DAWN"
  | "DAY"
  | "VOTE"
  | "EXECUTION"
  | "END";

/** Rençber = 1, Muhtar = 2, Ağa = 3 (weight equals tier). */
export type Tier = 1 | 2 | 3;

export const TIER_ENTRY_ZATS: Record<Tier, number> = {
  1: 100_000, // 0.001 TAZ
  2: 400_000, // 0.004 TAZ
  3: 900_000, // 0.009 TAZ
};

export interface Player {
  id: string;
  name: string;
  role: Role | null;
  alive: boolean;
  tier: Tier;
  /** sha256(tier|salt) hex — agalik mode only. */
  tierCommit: string | null;
  tierSalt: string | null;
  will: string | null;
  /** Round the player died in, null while alive. */
  diedInRound: number | null;
}

export interface NightActions {
  /** vampire id -> target id */
  vampireTargets: Record<string, string>;
  /** doctor's save target */
  doctorSave: string | null;
  /** gozcu's inspect target */
  gozcuTarget: string | null;
}

export interface NightResult {
  round: number;
  died: string | null;
  saved: boolean;
  gozcuResult: { target: string; vamp: boolean } | null;
}

export interface VoteResult {
  round: number;
  lynched: string | null;
  role: Role | null;
  tally: Record<string, number>;
}

export type Winner = "koy" | "vampir" | null;

/** A sealed memo destined for the chain, per SPEC.md's schema. */
export interface MemoEvent {
  /** "room" writes to the room account; {player} writes to that player's account. */
  to: "room" | { player: string };
  memo: Record<string, unknown>;
  /** Zatoshis to attach; prize payments only, else dust default. */
  zats?: number;
}

export interface Payout {
  playerId: string;
  zats: number;
  reason: string;
}

export interface RoomState {
  code: string;
  mode: Mode;
  phase: Phase;
  round: number;
  players: Player[];
  night: NightActions;
  lastNight: NightResult | null;
  /** vote round: voter id -> target id */
  votes: Record<string, string>;
  /** ghost prophecy votes (Ö8 pipe; scoring gated behind Faz 2 E2E) */
  gvotes: Record<string, string>;
  lastVote: VoteResult | null;
  winner: Winner;
  deliWon: boolean;
  /** number of approved doctor saves (prim) */
  doctorSaves: number;
  potZats: number;
  payouts: Payout[] | null;
}
