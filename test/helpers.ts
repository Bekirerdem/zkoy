import {
  createRoom,
  join,
  start,
  nominate,
  electionVote,
  resolveElection,
  resolveNight,
  startDay,
  accuse,
  second,
} from "../src/engine/engine";
import { MemoEvent, Role, RoomRules, RoomState } from "../src/engine/types";

/** NIGHT round 1 with nobody acting → DAWN → DAY (quiet night). */
export function inDay(n: number, seed = 42): RoomState {
  const state = inNight(n, seed);
  resolveNight(state);
  startDay(state);
  return state;
}

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

/** v2 kural seti: gözcü her zaman, sanık oy kullanır (eski testlerin varsayımı). */
export const V2_RULES = { gozcu: true, accusedVotes: true, trialSupport: 2 };

export function makeRoom(n: number, rules: Partial<RoomRules> = V2_RULES): RoomState {
  const state = createRoom("TEST", rules);
  for (let i = 0; i < n; i++) join(state, `p${i}`, `oyuncu${i}`);
  return state;
}

/**
 * Dava eşiğine kadar destek topla: ilk yaşayan suçlar, sonrakiler destekler.
 * Muhtar'ın ağırlığı ve otomatik eşik motorun kuralıyla sayılır.
 */
export function bringToTrial(state: RoomState, target: string, skip: string[] = []): MemoEvent[] {
  const events: MemoEvent[] = [];
  for (const p of state.players) {
    if (state.day.stage !== "free") break;
    if (!p.alive || p.id === target || skip.includes(p.id)) continue;
    events.push(...(state.day.backers[target] ? second(state, p.id, target) : accuse(state, p.id, target)));
  }
  return events;
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
