import { createRoom, join, start } from "../src/engine/engine";
import { Role, RoomState } from "../src/engine/types";

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
