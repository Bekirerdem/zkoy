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

/* ── SEÇİM (SPEC §1 Muhtar) ── */

export function nominate(state: RoomState, playerId: string): MemoEvent[] {
  requirePhase(state, "ELECTION");
  const p = player(state, playerId);
  if (!p.alive) throw new EngineError("ölüler aday olamaz");
  if (!state.election.candidates.includes(playerId))
    state.election.candidates.push(playerId);
  return []; // adaylık off-chain
}

export function electionVote(
  state: RoomState,
  voterId: string,
  candidateId: string,
): MemoEvent[] {
  requirePhase(state, "ELECTION");
  const voter = player(state, voterId);
  if (!voter.alive) throw new EngineError("ölüler oy atamaz");
  if (!state.election.candidates.includes(candidateId))
    throw new EngineError("aday değil");
  state.election.votes[voterId] = candidateId;
  return [
    { to: "room", memo: memo(state, { t: "mvote", r: 0, p: voterId, x: candidateId }) },
  ];
}

/** True when every living player has voted (server uses it to resolve early). */
export function electionComplete(state: RoomState): boolean {
  return alivePlayers(state).every((p) => state.election.votes[p.id] !== undefined);
}

/**
 * Plurality → Muhtar. Tie → seeded pick among tied. No candidates → seeded
 * pick among the living (SPEC §1: "aday yoksa ebe kura çeker"). ELECTION → NIGHT.
 */
export function resolveElection(state: RoomState, tieSeed: number): MemoEvent[] {
  requirePhase(state, "ELECTION");
  const rng = mulberry32(tieSeed);
  let pool: string[];
  if (state.election.candidates.length === 0) {
    pool = alivePlayers(state).map((p) => p.id);
  } else {
    const tally: Record<string, number> = {};
    for (const c of state.election.candidates) tally[c] = 0;
    for (const cand of Object.values(state.election.votes))
      tally[cand] = (tally[cand] ?? 0) + 1;
    const top = Math.max(...Object.values(tally));
    pool = Object.keys(tally).filter((c) => tally[c] === top);
  }
  const muhtar = pool[Math.floor(rng() * pool.length)]!;
  state.muhtar = muhtar;
  state.phase = "NIGHT";
  state.round = 1;
  return [
    { to: "room", memo: memo(state, { t: "muhtar", p: muhtar, w: state.muhtarWeight }) },
  ];
}

/* ── GECE ── */

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
      state.night.doctorSave = targetId; // her gece serbest (SPEC §1)
      break;
    case "gozcu":
      if (targetId === playerId) throw new EngineError("gözcü kendini sorgulayamaz");
      state.night.gozcuTarget = targetId;
      break;
    default:
      throw new EngineError("bu rolün gece hamlesi yok");
  }
  return [
    { to: "room", memo: memo(state, { t: "night", r: state.round, p: playerId, x: targetId }) },
  ];
}

/** True when every living night actor has acted (server resolves early). */
export function nightComplete(state: RoomState): boolean {
  const alive = alivePlayers(state);
  const vampires = alive.filter((p) => p.role === "vampir");
  const doctor = alive.find((p) => p.role === "doktor");
  const gozcu = alive.find((p) => p.role === "gozcu");
  return (
    vampires.every((v) => state.night.vampireTargets[v.id] !== undefined) &&
    (!doctor || state.night.doctorSave !== null) &&
    (!gozcu || state.night.gozcuTarget !== null)
  );
}

/** Majority target among vampire picks; tie → first vampire's pick. */
function vampireVerdict(state: RoomState): string | null {
  const picks = Object.values(state.night.vampireTargets);
  if (picks.length === 0) return null;
  const tally = new Map<string, number>();
  for (const t of picks) tally.set(t, (tally.get(t) ?? 0) + 1);
  let best = picks[0]!;
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

/** Marks dead, sends the spoiler; if it was the Muhtar, opens the heir beat. */
function kill(state: RoomState, id: string): MemoEvent[] {
  const p = player(state, id);
  p.alive = false;
  p.diedInRound = state.round;
  if (state.muhtar === id) {
    state.muhtar = null;
    state.heirPending = id;
  }
  const roles: Record<string, Role> = {};
  for (const q of state.players) roles[q.name] = q.role!;
  return [{ to: { player: id }, memo: memo(state, { t: "spoiler", roles }) }];
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
  let gozcuResult: { target: string; vamp: boolean } | null = null;
  const gozcuTarget = state.night.gozcuTarget;
  const gozcu = state.players.find((p) => p.role === "gozcu" && p.alive);
  if (gozcuTarget && gozcu) {
    gozcuResult = { target: gozcuTarget, vamp: player(state, gozcuTarget).role === "vampir" };
    events.push({
      to: "room",
      memo: memo(state, {
        t: "seerr",
        r: state.round,
        p: gozcu.id,
        x: gozcuTarget,
        vamp: gozcuResult.vamp,
      }),
    });
  }
  state.lastNight = { round: state.round, died, saved, gozcuResult };
  events.push({
    to: "room",
    memo: memo(state, {
      t: "result",
      r: state.round,
      died: died ? player(state, died).name : null,
      saved,
      lynched: null,
      role: died ? player(state, died).role : null,
    }),
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

/** Dead Muhtar names a living heir during the DAWN/EXECUTION beat right after death. */
export function nameHeir(state: RoomState, playerId: string, heirId: string): MemoEvent[] {
  requirePhase(state, "DAWN", "EXECUTION");
  if (state.heirPending !== playerId) throw new EngineError("halef gösterme hakkı yok");
  const heir = player(state, heirId);
  if (!heir.alive) throw new EngineError("halef yaşayan biri olmalı");
  state.muhtar = heirId;
  state.heirPending = null;
  return [{ to: "room", memo: memo(state, { t: "heir", p: playerId, x: heirId }) }];
}

/** DAWN → DAY. `by` = who closed the dawn beat ("muhtar" | "host" | "cap" | "auto"). */
export function startDay(state: RoomState, by = "auto"): MemoEvent[] {
  requirePhase(state, "DAWN");
  state.heirPending = null; // unnamed heir → köy Muhtar'sız devam eder
  state.day = freshDay();
  state.gvotes = {};
  state.phase = "DAY";
  return [{ to: "room", memo: memo(state, { t: "phase", r: state.round, ph: "DAY", by }) }];
}

/** DAY (no open trial) → NIGHT, next round. Muhtar or host closes the day. */
export function closeDay(state: RoomState, by = "muhtar"): MemoEvent[] {
  requirePhase(state, "DAY");
  if (state.day.stage !== "free") throw new EngineError("dava sürerken gün kapanmaz");
  state.round += 1;
  state.gvotes = {};
  state.phase = "NIGHT";
  return [{ to: "room", memo: memo(state, { t: "phase", r: state.round, ph: "NIGHT", by }) }];
}

/* ── GÜNDÜZ: dava akışı (SPEC §1) ── */

export function accuse(state: RoomState, accuserId: string, accusedId: string): MemoEvent[] {
  requirePhase(state, "DAY");
  if (state.day.stage !== "free") throw new EngineError("dava sürüyor");
  const accuser = player(state, accuserId);
  const accused = player(state, accusedId);
  if (!accuser.alive) throw new EngineError("ölüler suçlayamaz");
  if (!accused.alive) throw new EngineError("hedef zaten ölü");
  if (accuserId === accusedId) throw new EngineError("kendini suçlayamazsın");
  if (state.day.triedToday.includes(accusedId))
    throw new EngineError("bugün zaten yargılandı");
  state.day.accusations[accuserId] = accusedId;
  return [
    { to: "room", memo: memo(state, { t: "accuse", r: state.round, p: accuserId, x: accusedId }) },
  ];
}

export function second(state: RoomState, seconderId: string, accusedId: string): MemoEvent[] {
  requirePhase(state, "DAY");
  if (state.day.stage !== "free") throw new EngineError("dava sürüyor");
  const seconder = player(state, seconderId);
  if (!seconder.alive) throw new EngineError("ölüler destekleyemez");
  if (seconderId === accusedId) throw new EngineError("kendini destekleyemezsin");
  const found = Object.entries(state.day.accusations).find(
    ([who, target]) => target === accusedId && who !== seconderId,
  );
  if (!found) throw new EngineError("ortada suçlama yok");
  state.day.trial = { accused: accusedId, accuser: found[0], seconder: seconderId, verdicts: {} };
  state.day.stage = "trial";
  state.day.accusations = {};
  return [
    { to: "room", memo: memo(state, { t: "second", r: state.round, p: seconderId, x: accusedId }) },
  ];
}

/** Savunma biter: suçlanan "bitti" der ya da Muhtar "oylamaya geç" der; host/cap force eder. */
export function openVerdict(
  state: RoomState,
  byId: string | null,
  opts: { force?: boolean; by?: string } = {},
): MemoEvent[] {
  requirePhase(state, "DAY");
  const trial = state.day.trial;
  if (!trial || state.day.stage !== "trial") throw new EngineError("savunma aşamasında değil");
  if (!opts.force && byId !== trial.accused && byId !== state.muhtar)
    throw new EngineError("oylamayı yalnız suçlanan ya da Muhtar açar");
  state.day.stage = "verdict";
  const by = opts.by ?? (byId === trial.accused ? "accused" : "muhtar");
  return [{ to: "room", memo: memo(state, { t: "phase", r: state.round, ph: "VERDICT", by }) }];
}

function verdictTally(state: RoomState) {
  const trial = state.day.trial!;
  let total = 0;
  let guiltyW = 0;
  let notGuiltyW = 0;
  let pending = 0;
  for (const p of alivePlayers(state)) {
    const w = weightOf(state, p.id);
    total += w;
    const v = trial.verdicts[p.id];
    if (v === undefined) pending += w;
    else if (v) guiltyW += w;
    else notGuiltyW += w;
  }
  return { total, guiltyW, notGuiltyW, pending };
}

/** Açık oy. Sonuç matematiksel olarak kesinleşince oylama kendiliğinden kapanır. */
export function castVerdict(state: RoomState, voterId: string, guilty: boolean): MemoEvent[] {
  requirePhase(state, "DAY");
  const trial = state.day.trial;
  if (!trial || state.day.stage !== "verdict") throw new EngineError("karar oyu açık değil");
  const voter = player(state, voterId);
  if (!voter.alive) throw new EngineError("ölüler oy atamaz");
  trial.verdicts[voterId] = guilty;
  const events: MemoEvent[] = [
    {
      to: "room",
      memo: memo(state, {
        t: "verdict",
        r: state.round,
        p: voterId,
        x: trial.accused,
        y: guilty ? 1 : 0,
      }),
    },
  ];
  const { total, guiltyW, pending } = verdictTally(state);
  const decided = guiltyW * 2 > total || (guiltyW + pending) * 2 <= total || pending === 0;
  if (decided) events.push(...resolveVerdict(state));
  return events;
}

/** Lynch iff guilty weight exceeds half of living weight. Also called by the server on a cap. */
export function resolveVerdict(state: RoomState): MemoEvent[] {
  requirePhase(state, "DAY");
  const trial = state.day.trial;
  if (!trial || state.day.stage !== "verdict") throw new EngineError("karar oyu açık değil");
  const { total, guiltyW, notGuiltyW } = verdictTally(state);
  const lynched = guiltyW * 2 > total;
  const victim = player(state, trial.accused);
  const events: MemoEvent[] = [];
  state.lastVerdict = {
    round: state.round,
    accused: trial.accused,
    lynched: lynched ? trial.accused : null,
    role: lynched ? victim.role : null,
    guilty: guiltyW,
    notGuilty: notGuiltyW,
  };
  state.day.trial = null;
  state.day.stage = "free";
  if (lynched) {
    events.push(...kill(state, victim.id));
    if (victim.role === "deli") state.deliWon = true;
    for (const [ghost, guess] of Object.entries(state.gvotes))
      if (guess === victim.id) state.kahinScore[ghost] = (state.kahinScore[ghost] ?? 0) + 1;
    state.phase = "EXECUTION";
    events.push({
      to: "room",
      memo: memo(state, {
        t: "result",
        r: state.round,
        died: null,
        saved: false,
        lynched: victim.name,
        role: victim.role,
      }),
    });
    const winner = checkWin(state);
    if (winner) {
      state.winner = winner;
      state.phase = "END";
      events.push(...settle(state));
    }
  } else {
    state.day.triedToday.push(victim.id);
    events.push({
      to: "room",
      memo: memo(state, {
        t: "result",
        r: state.round,
        died: null,
        saved: false,
        lynched: null,
        role: null,
        acq: victim.name,
      }),
    });
  }
  return events;
}

/** EXECUTION → NIGHT (next round). */
export function nextRound(state: RoomState, by = "auto"): MemoEvent[] {
  requirePhase(state, "EXECUTION");
  state.heirPending = null;
  state.round += 1;
  state.gvotes = {};
  state.phase = "NIGHT";
  return [{ to: "room", memo: memo(state, { t: "phase", r: state.round, ph: "NIGHT", by }) }];
}

/** END: badges (SPEC §4 badges tablosu) + kura ifşası. Ödül havuzu sunucu işidir. */
function settle(state: RoomState): MemoEvent[] {
  const badges: Badge[] = [];
  const side =
    state.winner === "koy"
      ? state.players.filter((p) => p.alive && p.role !== "vampir")
      : state.players.filter((p) => p.role === "vampir");
  for (const p of side) badges.push({ playerId: p.id, kind: "kazanan" });
  if (state.deliWon) {
    const deli = state.players.find((p) => p.role === "deli");
    if (deli) badges.push({ playerId: deli.id, kind: "deli" });
  }
  if (state.muhtar) badges.push({ playerId: state.muhtar, kind: "muhtar" });
  const scores = Object.entries(state.kahinScore);
  if (scores.length > 0) {
    const top = Math.max(...scores.map(([, s]) => s));
    if (top > 0)
      for (const [ghost, s] of scores)
        if (s === top) badges.push({ playerId: ghost, kind: "kahin" });
  }
  state.badges = badges;
  const events: MemoEvent[] = [
    {
      to: "room",
      memo: memo(state, { t: "phase", r: state.round, ph: "END", by: "auto", winner: state.winner }),
    },
  ];
  for (const b of badges)
    events.push({ to: { player: b.playerId }, memo: memo(state, { t: "badge", kind: b.kind }) });
  if (state.seed !== null && state.seedSalt)
    events.push({
      to: "room",
      memo: memo(state, { t: "seedr", seed: state.seed, salt: state.seedSalt }),
    });
  return events;
}
