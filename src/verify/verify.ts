// Independent check of a finished game (memo v4). Input: the memos of the room
// wallet, in any order, exactly as a Zcash wallet reads them with the room's
// viewing key. Nothing else is trusted: not the server's database, not its
// reveal screen.
//
// What is checked:
//  1. the shuffle: sha256(secret) is the commitment sealed before the deal, and
//     the seed follows from that secret plus every seat's own nonce;
//  2. the play: the sealed moves are replayed through the same rule engine the
//     server runs. Every outcome on chain (who became Muhtar, who died, who was
//     hanged, who won) must be exactly what the rules produce from those moves;
//  3. the whole log: the replay also regenerates the memos the room key cannot
//     read (role cards, ghost spoilers, badges); the SHA-256 over all of them
//     must equal the `gameroot` memo.
//
// What this cannot show: that a sealed move is the one the player tapped. Moves
// are not signed by the phones; players check that part with their own eyes at
// the reveal party.

import * as engine from "../engine/engine";
import { EngineError, MEMO_VERSION } from "../engine/engine";
import { commitOf, seedFrom, sha256Hex, tieSeedFrom } from "../engine/fair";
import { gamePoints } from "../engine/score";
import { MemoEvent, Role, RoomRules, RoomState, Winner } from "../engine/types";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerifyReport {
  ok: boolean;
  code: string | null;
  checks: Check[];
  summary: {
    /** `points`: tournament points of the seat (src/engine/score.ts), from the replay. */
    players: Array<{ id: string; name: string; role: Role | null; points: number }>;
    winner: Winner;
    rounds: number;
    /** Memos in the full log, role cards included. */
    memos: number;
    /** Memos read from the room wallet. */
    roomMemos: number;
  } | null;
}

type Memo = Record<string, unknown>;

class Mismatch extends Error {}

const text = (v: unknown, what: string): string => {
  if (typeof v !== "string" || v === "") throw new Mismatch(`${what} is missing`);
  return v;
};

/** One sealed move → the engine call the server made for it. */
function apply(state: RoomState, m: Memo, secret: string): MemoEvent[] {
  const p = () => text(m.p, `player of memo ${m.i}`);
  const x = () => text(m.x, `target of memo ${m.i}`);
  const by = typeof m.by === "string" ? m.by : "auto";
  switch (m.t) {
    case "nom":
      return engine.nominate(state, p());
    case "mvote": {
      const ev = engine.electionVote(state, p(), x());
      if (engine.electionComplete(state)) ev.push(...engine.resolveElection(state, tieSeedFrom(secret)));
      return ev;
    }
    case "night": {
      const ev = engine.nightAction(state, p(), x());
      if (engine.nightComplete(state)) ev.push(...engine.resolveNight(state));
      return ev;
    }
    case "force": {
      const what = m.what;
      if (what !== "election" && what !== "night" && what !== "verdict")
        throw new Mismatch(`memo ${m.i}: unknown forced step`);
      const pre = engine.forceMemo(state, what, by);
      if (what === "election") return [pre, ...engine.resolveElection(state, tieSeedFrom(secret))];
      if (what === "night") return [pre, ...engine.resolveNight(state)];
      return [pre, ...engine.resolveVerdict(state)];
    }
    case "phase":
      if (m.ph === "DAY") return engine.startDay(state, by);
      if (m.ph === "NIGHT")
        return state.phase === "DAY" ? engine.closeDay(state, by) : engine.nextRound(state, by);
      if (m.ph === "VERDICT") {
        const trial = state.day.trial;
        if (by === "accused" && trial) return engine.openVerdict(state, trial.accused);
        if (by === "muhtar" && state.muhtar) return engine.openVerdict(state, state.muhtar);
        if (by === "accused" || by === "muhtar") throw new Mismatch(`memo ${m.i}: nobody could open this vote`);
        return engine.openVerdict(state, null, { force: true, by });
      }
      break;
    case "accuse":
      return engine.accuse(state, p(), x());
    case "second":
      return engine.second(state, p(), x());
    case "verdict":
      return engine.castVerdict(state, p(), m.y === 1);
    case "gvote":
      return engine.gvote(state, p(), x());
    case "will":
      return engine.setWill(state, p(), typeof m.txt === "string" ? m.txt : "");
    case "heir":
      return engine.nameHeir(state, p(), x());
  }
  throw new Mismatch(`memo ${m.i} (${String(m.t)}) is an outcome, but no sealed move leads to it`);
}

export function verifyGame(rawMemos: string[], opts: { code?: string } = {}): VerifyReport {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    return ok;
  };
  const fail = (code: string | null): VerifyReport => ({ ok: false, code, checks, summary: null });

  // 1. Read what is there. A resent transaction repeats memos; identical copies count once.
  const parsed: Array<{ raw: string; m: Memo }> = [];
  for (const raw of new Set(rawMemos.map((r) => r.trim()))) {
    try {
      const m = JSON.parse(raw) as Memo;
      if (m && typeof m === "object" && m.v === MEMO_VERSION && typeof m.g === "string") parsed.push({ raw, m });
    } catch {
      // not a game memo
    }
  }
  const codes = [...new Set(parsed.map((x) => String(x.m.g)))];
  const code = opts.code ?? (codes.length === 1 ? codes[0]! : null);
  if (!code || !codes.includes(code)) {
    add("memos", false, codes.length === 0 ? `no v${MEMO_VERSION} game memos found` : `several rooms found (${codes.join(", ")}); name one`);
    return fail(null);
  }
  const mine = parsed.filter((x) => x.m.g === code);

  const roots = mine.filter((x) => x.m.t === "gameroot");
  const byI = new Map<number, string>();
  for (const { raw, m } of mine) {
    if (m.t === "gameroot") continue;
    if (!Number.isInteger(m.i) || (m.i as number) < 0) {
      add("sequence", false, `a ${String(m.t)} memo has no sequence number`);
      return fail(code);
    }
    const i = m.i as number;
    if (byI.has(i)) {
      add("sequence", false, `two different memos claim position ${i}`);
      return fail(code);
    }
    byI.set(i, raw);
  }
  const memoAt = (i: number): Memo | null => (byI.has(i) ? (JSON.parse(byI.get(i)!) as Memo) : null);

  // 2. The roster, the rules and the commitment, sealed before any role was dealt.
  const seats: Array<{ p: string; name: string; n: string }> = [];
  for (let i = 0; memoAt(i)?.t === "seat"; i++) {
    const m = memoAt(i)!;
    seats.push({ p: String(m.p), name: String(m.name), n: typeof m.n === "string" ? m.n : "" });
  }
  const seedMemo = memoAt(seats.length);
  if (seats.length === 0 || seedMemo?.t !== "seed" || seedMemo.k !== seats.length || typeof seedMemo.c !== "string") {
    add("roster", false, "the roster or the seed commitment is missing from the start of the log");
    return fail(code);
  }
  add("roster", true, `${seats.length} seats, sealed with the commitment before the deal`);
  const commit = seedMemo.c;
  const rules = (seedMemo.rules ?? {}) as Partial<RoomRules>;

  // 3. The reveal.
  const seedr = mine.map((x) => x.m).find((m) => m.t === "seedr");
  if (!seedr || typeof seedr.salt !== "string" || typeof seedr.seed !== "number") {
    add("reveal", false, "the game has no reveal memo: it did not finish, or its last transaction is not on chain yet");
    return fail(code);
  }
  const secret = seedr.salt;
  const seed = seedr.seed;
  const commitOk = add(
    "commitment",
    commitOf(secret) === commit,
    commitOf(secret) === commit
      ? "sha256(secret) equals the commitment sealed before the deal"
      : "the revealed secret does not match the commitment",
  );
  const derived = seedFrom(secret, seats.map((s) => s.n));
  const seedOk = add(
    "shuffle seed",
    derived === seed,
    derived === seed
      ? `seed ${seed} follows from the secret and ${seats.filter((s) => s.n).length} player nonces`
      : `the seed should be ${derived}, the server used ${seed}`,
  );
  if (!commitOk || !seedOk) return fail(code);

  // 4. Replay.
  const state = engine.createRoom(code, rules);
  const log: string[] = [];
  const emit = (events: MemoEvent[]) => {
    for (const e of events) {
      const i = log.length;
      e.memo.i = i;
      const str = JSON.stringify(e.memo);
      log.push(str);
      const onChain = byI.get(i);
      if (e.to === "room") {
        if (onChain === undefined)
          throw new Mismatch(`memo ${i} (${String(e.memo.t)}) follows from the rules but is not on chain`);
        if (onChain !== str) throw new Mismatch(`memo ${i} differs. On chain: ${onChain} By the rules: ${str}`);
      } else if (onChain !== undefined) {
        throw new Mismatch(`memo ${i} should be a private card, but the room wallet holds ${onChain}`);
      }
    }
  };
  try {
    for (const s of seats) engine.join(state, s.p, s.name, s.n);
    emit(engine.start(state, seed, commit, 1));
    state.seedSalt = secret;
    while (state.phase !== "END") {
      const i = log.length;
      const m = memoAt(i);
      if (!m) throw new Mismatch(`the game is not over, but memo ${i} is missing`);
      const events = apply(state, m, secret);
      if (events.length === 0) throw new Mismatch(`memo ${i} (${String(m.t)}) changes nothing`);
      emit(events);
    }
    const extra = [...byI.keys()].filter((i) => i >= log.length);
    if (extra.length > 0) throw new Mismatch(`${extra.length} memo(s) come after the end of the game`);
  } catch (e) {
    if (e instanceof Mismatch) add("replay", false, e.message);
    else if (e instanceof EngineError) add("replay", false, `memo ${log.length} is not a legal move: ${e.message}`);
    else throw e;
    return fail(code);
  }
  add("replay", true, `${byI.size} sealed memos replayed; every outcome follows from the rules`);

  // 5. The root over the whole log.
  if (roots.length !== 1) {
    add("gameroot", false, roots.length === 0 ? "no gameroot memo on chain" : "more than one gameroot memo");
    return fail(code);
  }
  const root = roots[0]!.m;
  const h = sha256Hex(log.join("\n"));
  const rootOk = root.h === h && root.n === log.length && root.w === state.winner;
  add(
    "gameroot",
    rootOk,
    rootOk
      ? `sha256 over all ${log.length} memos (private cards included) equals the sealed root`
      : `the sealed root does not match: expected h=${h} n=${log.length} w=${String(state.winner)}`,
  );

  const points = gamePoints(state);
  return {
    ok: checks.every((c) => c.ok),
    code,
    checks,
    summary: {
      players: state.players.map((p) => ({ id: p.id, name: p.name, role: p.role, points: points[p.id] ?? 0 })),
      winner: state.winner,
      rounds: state.round,
      memos: log.length,
      roomMemos: byI.size + roots.length,
    },
  };
}
