import {
  createRoom,
  join,
  start,
  nominate,
  electionVote,
  resolveElection,
} from "../src/engine/engine";
import { Role, RoomState } from "../src/engine/types";

/** ELECTION → NIGHT with `id` as Muhtar (everyone votes for them). */
export function electMuhtar(state: RoomState, id: string): void {
  nominate(state, id);
  for (const p of state.players) if (p.alive) electionVote(state, p.id, id);
  resolveElection(state, 1);
}

/** Full deal + election shortcut: LOBBY → NIGHT round 1 with p0 as Muhtar. */
export function inNight(n: number, seed = 42): RoomState {
  const state = dealt(n, seed);
  electMuhtar(state, "p0");
  return state;
}

export function makeRoom(n: number): RoomState {
  const state = createRoom("TEST");
  for (let i = 0; i < n; i++) join(state, `p${i}`, `oyuncu${i}`);
  return state;
}

export function byRole(state: RoomState, role: Role): string[] {
  return state.players.filter((p) => p.role === role).map((p) => p.id);
}

/** LOBBY → ELECTION with a fixed seed and dummy commitment. */
export function dealt(n: number, seed = 42): RoomState {
  const state = makeRoom(n);
  start(state, seed, `commit-${seed}`);
  return state;
}
