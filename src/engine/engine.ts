// ZKöy room engine v2 — pure state machine per SPEC.md §1/§3/§5.
// Phase flow: LOBBY → ELECTION → NIGHT → DAWN → DAY → EXECUTION → NIGHT … → END
// Every mutation returns the MemoEvents to seal on chain; the server owns
// triggers (actor completion, Muhtar/host commands, remote-mode caps).

import {
  Badge,
  DayState,
  MemoEvent,
  Phase,
  Player,
  Role,
  RoomState,
  Winner,
} from "./types";

export const MIN_PLAYERS = 7;
export const MAX_PLAYERS = 15;

export class EngineError extends Error {}

function requirePhase(state: RoomState, ...phases: Phase[]) {
  if (!phases.includes(state.phase)) {
    throw new EngineError(
      `bu hamle ${phases.join("/")} fazında yapılır (şu an: ${state.phase})`,
    );
  }
}

function player(state: RoomState, id: string): Player {
  const p = state.players.find((p) => p.id === id);
  if (!p) throw new EngineError(`oyuncu yok: ${id}`);
  return p;
}

function alivePlayers(state: RoomState): Player[] {
  return state.players.filter((p) => p.alive);
}

/** SPEC §5: every memo carries v:2 and the room code. */
function memo(state: RoomState, body: Record<string, unknown>): Record<string, unknown> {
  return { v: 2, g: state.code, ...body };
}

function freshDay(): DayState {
  return { stage: "free", accusations: {}, trial: null, triedToday: [] };
}

/** Muhtar's vote counts muhtarWeight; everyone else 1. */
export function weightOf(state: RoomState, id: string): number {
  return state.muhtar === id ? state.muhtarWeight : 1;
}

export function createRoom(code: string): RoomState {
  return {
    code,
    phase: "LOBBY",
    round: 0,
    players: [],
    seed: null,
    seedCommit: null,
    seedSalt: null,
    muhtar: null,
    muhtarWeight: 2,
    heirPending: null,
    election: { candidates: [], votes: {} },
    night: { vampireTargets: {}, doctorSave: null, gozcuTarget: null },
    lastNight: null,
    day: freshDay(),
    lastVerdict: null,
    gvotes: {},
    kahinScore: {},
    winner: null,
    deliWon: false,
    badges: null,
  };
}

export function join(state: RoomState, id: string, name: string): MemoEvent[] {
  requirePhase(state, "LOBBY");
  if (state.players.length >= MAX_PLAYERS) throw new EngineError("oda dolu");
  if (state.players.some((p) => p.name === name))
    throw new EngineError("bu isim alınmış");
  state.players.push({ id, name, role: null, alive: true, will: null, diedInRound: null });
  return [{ to: "room", memo: memo(state, { t: "join", p: id, name }) }];
}

/** SPEC §1 composition table: vampir 1 (7-9), 2 (10-12), 3 (13-15); deli from 8. */
export function rolePlan(count: number): Role[] {
  const vampires = count >= 13 ? 3 : count >= 10 ? 2 : 1;
  const roles: Role[] = ["doktor", "gozcu"];
  for (let i = 0; i < vampires; i++) roles.push("vampir");
  if (count >= 8) roles.push("deli");
  while (roles.length < count) roles.push("koylu");
  return roles;
}

export function muhtarWeightFor(count: number): number {
  return count >= 13 ? 3 : 2;
}

/** Deterministic PRNG so a seeded game is replayable (kanıtlı kura). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * LOBBY → ELECTION. The server computes seedCommit = sha256(`${seed}|${salt}`)
 * and keeps the salt (state.seedSalt) for the END reveal.
 */
export function start(
  state: RoomState,
  seed: number,
  seedCommit: string,
  minPlayers = MIN_PLAYERS,
): MemoEvent[] {
  requirePhase(state, "LOBBY");
  if (state.players.length < minPlayers)
    throw new EngineError(`en az ${minPlayers} oyuncu gerek`);
  if (!seedCommit) throw new EngineError("kura taahhüdü zorunlu");
  const rng = mulberry32(seed);
  const roles = rolePlan(state.players.length);
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roles[i], roles[j]] = [roles[j]!, roles[i]!];
  }
  const events: MemoEvent[] = [
    { to: "room", memo: memo(state, { t: "seed", c: seedCommit }) },
  ];
  state.players.forEach((p, i) => {
    p.role = roles[i]!;
    events.push({ to: { player: p.id }, memo: memo(state, { t: "role", role: p.role }) });
  });
  state.seed = seed;
  state.seedCommit = seedCommit;
  state.muhtarWeight = muhtarWeightFor(state.players.length);
  state.phase = "ELECTION";
  state.round = 0;
  return events;
}
