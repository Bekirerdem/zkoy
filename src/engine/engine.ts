// ZKöy room engine — pure state machine per SPEC.md §3.
// Phase flow: LOBBY → NIGHT → DAWN → DAY → VOTE → EXECUTION → (win?) → NIGHT … → END
// Every mutation returns the MemoEvents to seal on chain; the caller (server)
// owns timers and passes resolutions in.

import {
  MemoEvent,
  Mode,
  Payout,
  Phase,
  Player,
  Role,
  RoomState,
  TIER_ENTRY_ZATS,
  Tier,
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

export function createRoom(code: string, mode: Mode): RoomState {
  return {
    code,
    mode,
    phase: "LOBBY",
    round: 0,
    players: [],
    night: { vampireTargets: {}, doctorSave: null, gozcuTarget: null },
    lastNight: null,
    votes: {},
    gvotes: {},
    lastVote: null,
    winner: null,
    deliWon: false,
    doctorSaves: 0,
    potZats: 0,
    payouts: null,
  };
}

export function join(
  state: RoomState,
  id: string,
  name: string,
  tier: Tier,
  tierCommit: string | null,
): MemoEvent[] {
  requirePhase(state, "LOBBY");
  if (state.players.length >= MAX_PLAYERS) throw new EngineError("oda dolu");
  if (state.players.some((p) => p.name === name))
    throw new EngineError("bu isim alınmış");
  if (state.mode === "klasik" && tier !== 1)
    throw new EngineError("klasik modda herkes Rençber");
  if (state.mode === "agalik" && !tierCommit)
    throw new EngineError("ağalık modunda tier taahhüdü zorunlu");
  state.players.push({
    id,
    name,
    role: null,
    alive: true,
    tier,
    tierCommit,
    tierSalt: null,
    will: null,
    diedInRound: null,
  });
  state.potZats += TIER_ENTRY_ZATS[tier];
  return [
    {
      to: "room",
      memo: {
        v: 1,
        t: "join",
        g: state.code,
        p: id,
        name,
        ...(tierCommit ? { c: tierCommit } : {}),
      },
    },
  ];
}

/** Role plan per player count: vampir 2 at 10+, deli at 8+. */
export function rolePlan(count: number): Role[] {
  const roles: Role[] = ["vampir", "doktor", "gozcu"];
  if (count >= 10) roles.push("vampir");
  if (count >= 8) roles.push("deli");
  while (roles.length < count) roles.push("koylu");
  return roles;
}

/** Deterministic PRNG so a seeded game is replayable in tests. */
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

export function start(
  state: RoomState,
  seed: number,
  minPlayers = MIN_PLAYERS,
): MemoEvent[] {
  requirePhase(state, "LOBBY");
  if (state.players.length < minPlayers)
    throw new EngineError(`en az ${minPlayers} oyuncu gerek`);
  const rng = mulberry32(seed);
  const roles = rolePlan(state.players.length);
  // Fisher–Yates with the seeded rng
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roles[i], roles[j]] = [roles[j]!, roles[i]!];
  }
  const events: MemoEvent[] = [];
  state.players.forEach((p, i) => {
    p.role = roles[i]!;
    events.push({ to: { player: p.id }, memo: { v: 1, t: "role", role: p.role } });
  });
  state.phase = "NIGHT";
  state.round = 1;
  return events;
}

export function nightAction(
  state: RoomState,
  playerId: string,
  targetId: string,
): MemoEvent[] {
  requirePhase(state, "NIGHT");
  const actor = player(state, playerId);
  const target = player(state, targetId);
  if (!actor.alive) throw new EngineError("ölüler gece hamlesi yapamaz");
  if (!target.alive) throw new EngineError("hedef zaten ölü");
  switch (actor.role) {
    case "vampir":
      if (targetId === playerId) throw new EngineError("vampir kendini yiyemez");
      state.night.vampireTargets[playerId] = targetId;
      break;
    case "doktor":
      state.night.doctorSave = targetId;
      break;
    case "gozcu":
      if (targetId === playerId) throw new EngineError("gözcü kendini sorgulayamaz");
      state.night.gozcuTarget = targetId;
      break;
    default:
      throw new EngineError("bu rolün gece hamlesi yok");
  }
  return [
    {
      to: "room",
      memo: { v: 1, t: "night", r: state.round, p: playerId, x: targetId },
    },
  ];
}

/** Majority target among vampire picks; tie → first vampire's pick. */
function vampireVerdict(state: RoomState): string | null {
  const picks = Object.values(state.night.vampireTargets);
  if (picks.length === 0) return null;
  const tally = new Map<string, number>();
  for (const t of picks) tally.set(t, (tally.get(t) ?? 0) + 1);
  let best: string = picks[0]!;
  let bestCount = 0;
  for (const t of picks) {
    const c = tally.get(t)!;
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  return best;
}

function checkWin(state: RoomState): Winner {
  const alive = alivePlayers(state);
  const vampires = alive.filter((p) => p.role === "vampir").length;
  if (vampires === 0) return "koy";
  if (vampires >= alive.length - vampires) return "vampir";
  return null;
}

function kill(state: RoomState, id: string): MemoEvent[] {
  const p = player(state, id);
  p.alive = false;
  p.diedInRound = state.round;
  // Dying player gets the full spoiler: ghosts watch with open eyes.
  const roles: Record<string, Role> = {};
  for (const q of state.players) roles[q.name] = q.role!;
  return [{ to: { player: id }, memo: { v: 1, t: "spoiler", roles } }];
}

export function resolveNight(state: RoomState): MemoEvent[] {
  requirePhase(state, "NIGHT");
  const events: MemoEvent[] = [];
  const victim = vampireVerdict(state);
  const saved = victim !== null && state.night.doctorSave === victim;
  let died: string | null = null;
  if (victim && !saved) {
    died = victim;
    events.push(...kill(state, victim));
  }
  if (saved) state.doctorSaves += 1;

  let gozcuResult: { target: string; vamp: boolean } | null = null;
  const gozcuTarget = state.night.gozcuTarget;
  const gozcu = state.players.find((p) => p.role === "gozcu" && p.alive);
  if (gozcuTarget && gozcu) {
    gozcuResult = {
      target: gozcuTarget,
      vamp: player(state, gozcuTarget).role === "vampir",
    };
    events.push({
      to: "room",
      memo: {
        v: 1,
        t: "seerr",
        r: state.round,
        p: gozcu.id,
        x: gozcuTarget,
        vamp: gozcuResult.vamp,
      },
    });
  }

  state.lastNight = { round: state.round, died, saved, gozcuResult };
  events.push({
    to: "room",
    memo: {
      v: 1,
      t: "result",
      r: state.round,
      died: died ? player(state, died).name : null,
      saved,
      lynched: null,
      role: died ? player(state, died).role : null,
    },
  });
  state.night = { vampireTargets: {}, doctorSave: null, gozcuTarget: null };

  const winner = checkWin(state);
  if (winner) {
    state.winner = winner;
    state.phase = "END";
    events.push(...settle(state));
  } else {
    state.phase = "DAWN";
  }
  return events;
}

/** DAWN → DAY → VOTE are timer-driven; the server calls this on expiry. */
export function advancePhase(state: RoomState): void {
  if (state.phase === "DAWN") state.phase = "DAY";
  else if (state.phase === "DAY") state.phase = "VOTE";
  else throw new EngineError(`advance ${state.phase} fazından çağrılmaz`);
}

export function vote(
  state: RoomState,
  voterId: string,
  targetId: string,
): MemoEvent[] {
  requirePhase(state, "VOTE");
  const voter = player(state, voterId);
  const target = player(state, targetId);
  if (!voter.alive) throw new EngineError("ölüler oy atamaz (kehanet hariç)");
  if (!target.alive) throw new EngineError("hedef zaten ölü");
  state.votes[voterId] = targetId;
  return [
    {
      to: "room",
      memo: {
        v: 1,
        t: "vote",
        r: state.round,
        p: voterId,
        x: targetId,
        w: voter.tier,
      },
    },
  ];
}

/** Ö8 pipe: ghosts predict the next lynch. Intake only — scoring is gated
 *  behind Faz 2 E2E (SPEC §5 kapı kuralı). */
export function gvote(
  state: RoomState,
  ghostId: string,
  targetId: string,
): MemoEvent[] {
  requirePhase(state, "VOTE");
  const ghost = player(state, ghostId);
  if (ghost.alive) throw new EngineError("kehanet oyu yalnız hayaletlerin");
  state.gvotes[ghostId] = targetId;
  return [
    {
      to: "room",
      memo: { v: 1, t: "gvote", r: state.round, p: ghostId, x: targetId },
    },
  ];
}

/** Weighted tally; tie → nobody hangs. */
export function resolveVote(state: RoomState): MemoEvent[] {
  requirePhase(state, "VOTE");
  const tally: Record<string, number> = {};
  for (const [voterId, targetId] of Object.entries(state.votes)) {
    const voter = player(state, voterId);
    if (!voter.alive) continue;
    tally[targetId] = (tally[targetId] ?? 0) + voter.tier;
  }
  let lynched: string | null = null;
  let top = 0;
  let tied = false;
  for (const [targetId, weight] of Object.entries(tally)) {
    if (weight > top) {
      top = weight;
      lynched = targetId;
      tied = false;
    } else if (weight === top) {
      tied = true;
    }
  }
  if (tied || top === 0) lynched = null;

  const events: MemoEvent[] = [];
  let lynchedRole: Role | null = null;
  if (lynched) {
    const victim = player(state, lynched);
    lynchedRole = victim.role;
    events.push(...kill(state, lynched));
    if (victim.role === "deli") state.deliWon = true;
  }
  state.lastVote = { round: state.round, lynched, role: lynchedRole, tally };
  events.push({
    to: "room",
    memo: {
      v: 1,
      t: "result",
      r: state.round,
      died: null,
      saved: false,
      lynched: lynched ? player(state, lynched).name : null,
      role: lynchedRole,
    },
  });
  state.votes = {};
  state.gvotes = {};
  state.phase = "EXECUTION";

  const winner = checkWin(state);
  if (winner) {
    state.winner = winner;
    state.phase = "END";
    events.push(...settle(state));
  }
  return events;
}

/** EXECUTION → next NIGHT (server calls after the reveal beat on screen). */
export function nextRound(state: RoomState): void {
  requirePhase(state, "EXECUTION");
  state.round += 1;
  state.phase = "NIGHT";
}

/** END: pot distribution per SPEC §2 table + tier reveals. */
function settle(state: RoomState): MemoEvent[] {
  const events: MemoEvent[] = [];
  const payouts: Payout[] = [];
  let pot = state.potZats;

  if (state.deliWon) {
    const deli = state.players.find((p) => p.role === "deli")!;
    const cut = Math.floor(state.potZats * 0.1);
    payouts.push({ playerId: deli.id, zats: cut, reason: "deli asıldı" });
    pot -= cut;
  }
  const primCount = Math.min(state.doctorSaves, 2); // %5 each, capped %10
  if (primCount > 0) {
    const doktor = state.players.find((p) => p.role === "doktor");
    if (doktor) {
      const cut = Math.floor(state.potZats * 0.05) * primCount;
      payouts.push({ playerId: doktor.id, zats: cut, reason: "doktor primi" });
      pot -= cut;
    }
  }

  const side =
    state.winner === "koy"
      ? state.players.filter((p) => p.alive && p.role !== "vampir")
      : state.players.filter((p) => p.role === "vampir");
  const totalEntry = side.reduce((s, p) => s + TIER_ENTRY_ZATS[p.tier], 0);
  for (const p of side) {
    const share = Math.floor((pot * TIER_ENTRY_ZATS[p.tier]) / totalEntry);
    payouts.push({
      playerId: p.id,
      zats: share,
      reason: state.winner === "koy" ? "köy kazandı" : "vampirler kazandı",
    });
  }
  state.payouts = payouts;

  for (const p of payouts) {
    events.push({
      to: { player: p.playerId },
      memo: { v: 1, t: "prize", zat: p.zats, reason: p.reason },
      zats: p.zats,
    });
  }
  // Ağalık: commitment reveals close the seal (server injects salts it held).
  if (state.mode === "agalik") {
    for (const p of state.players) {
      if (p.tierCommit && p.tierSalt) {
        events.push({
          to: "room",
          memo: { v: 1, t: "reveal", p: p.id, tier: p.tier, salt: p.tierSalt },
        });
      }
    }
  }
  return events;
}

export function setWill(
  state: RoomState,
  playerId: string,
  txt: string,
): MemoEvent[] {
  const p = player(state, playerId);
  if (!p.alive) throw new EngineError("ölüler vasiyet güncelleyemez");
  if (txt.length > 200) throw new EngineError("vasiyet en çok 200 karakter");
  p.will = txt;
  return [{ to: "room", memo: { v: 1, t: "will", p: playerId, txt } }];
}
