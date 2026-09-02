// ZKöy game engine types (v2). The engine is a pure state machine: it never
// does I/O. Chain writes are emitted as MemoEvent values (SPEC.md §5) and
// consumed by the Zcash service (real or mock).

export type Role = "vampir" | "koylu" | "doktor" | "gozcu" | "deli";

/** SPEC §1: LOBBY → SEÇİM(ELECTION) → GECE(NIGHT) → ŞAFAK(DAWN) → GÜNDÜZ(DAY) → İNFAZ(EXECUTION) → … → SON(END) */
export type Phase =
  | "LOBBY"
  | "ELECTION"
  | "NIGHT"
  | "DAWN"
  | "DAY"
  | "EXECUTION"
  | "END";

/** Day sub-states: serbest → dava (savunma) → karar. */
export type DayStage = "free" | "trial" | "verdict";

export interface Player {
  id: string;
  name: string;
  role: Role | null;
  alive: boolean;
  will: string | null;
  /** Round the player died in, null while alive. */
  diedInRound: number | null;
}

export interface NightActions {
  /** vampire id -> target id */
  vampireTargets: Record<string, string>;
  doctorSave: string | null;
  gozcuTarget: string | null;
}

export interface NightResult {
  round: number;
  died: string | null;
  saved: boolean;
  gozcuResult: { target: string; vamp: boolean } | null;
}

export interface Trial {
  accused: string;
  accuser: string;
  seconder: string;
  /** voter id -> true (assın) / false (asmasın) */
  verdicts: Record<string, boolean>;
}

export interface DayState {
  stage: DayStage;
  /** accuser id -> accused id (unseconded accusations, "askıda") */
  accusations: Record<string, string>;
  trial: Trial | null;
  /** accused ids that already stood trial today (no second trial same day) */
  triedToday: string[];
}

export interface Election {
  candidates: string[];
  /** voter id -> candidate id */
  votes: Record<string, string>;
}

export interface VerdictResult {
  round: number;
  accused: string;
  lynched: string | null;
  role: Role | null;
  guilty: number;
  notGuilty: number;
}

export type Winner = "koy" | "vampir" | null;

export type BadgeKind = "kazanan" | "deli" | "kahin" | "muhtar";

export interface Badge {
  playerId: string;
  kind: BadgeKind;
}

/** A sealed memo destined for the chain, per SPEC.md §5. */
export interface MemoEvent {
  /** "room" writes to the room account; {player} writes to that player's account. */
  to: "room" | { player: string };
  memo: Record<string, unknown>;
  /** Zatoshis to attach (prize payments only; default dust). */
  zats?: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  round: number;
  players: Player[];
  /** Kanıtlı kura: seed + commitment sealed at start, salt injected by server, revealed at END. */
  seed: number | null;
  seedCommit: string | null;
  seedSalt: string | null;
  muhtar: string | null;
  muhtarWeight: number;
  /** Dead Muhtar who may still name an heir during the current DAWN/EXECUTION beat. */
  heirPending: string | null;
  election: Election;
  night: NightActions;
  lastNight: NightResult | null;
  day: DayState;
  lastVerdict: VerdictResult | null;
  /** ghost prophecy: ghost id -> predicted lynch target (reset daily) */
  gvotes: Record<string, string>;
  /** ghost id -> correct prophecies */
  kahinScore: Record<string, number>;
  winner: Winner;
  deliWon: boolean;
  badges: Badge[] | null;
}
