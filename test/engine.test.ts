import { describe, expect, test } from "bun:test";
import {
  createRoom,
  join,
  start,
  rolePlan,
  muhtarWeightFor,
  EngineError,
  MAX_PLAYERS,
  nominate,
  electionVote,
  electionComplete,
  resolveElection,
  nightAction,
  nightComplete,
  resolveNight,
  nameHeir,
  startDay,
  closeDay,
  accuse,
  second,
  openVerdict,
  castVerdict,
  resolveVerdict,
  nextRound,
  gvote,
} from "../src/engine/engine";
import { RoomState } from "../src/engine/types";
import { makeRoom, byRole, dealt, electMuhtar, inNight, inDay } from "./helpers";

function closeDayForTest(state: RoomState) {
  closeDay(state, "muhtar");
}

/** Lynch `target` today with everyone alive voting guilty (verdict forced open by the host). */
function lynchToday(state: RoomState, target: string) {
  const alive = state.players.filter((p) => p.alive).map((p) => p.id);
  const accuser = alive.find((id) => id !== target)!;
  const seconder = alive.find((id) => id !== target && id !== accuser)!;
  accuse(state, accuser, target);
  second(state, seconder, target);
  openVerdict(state, null, { force: true, by: "host" });
  for (const id of alive) if (state.day.stage === "verdict") castVerdict(state, id, true);
}

describe("ghosts, badges, win", () => {
  test("ghost prophecy during DAY; correct guess scores; Kâhin badge at END", () => {
    const state = inDay(7);
    const [vampir] = byRole(state, "vampir");
    const ghostId = state.players.find((p) => p.id !== vampir && p.id !== "p0")!.id;
    lynchToday(state, ghostId); // kill a villager first → ghost exists
    expect(state.phase).toBe("EXECUTION");
    nextRound(state);
    resolveNight(state);
    startDay(state);
    expect(() => gvote(state, "p0", vampir!)).toThrow(EngineError); // alive cannot gvote
    const ev = gvote(state, ghostId, vampir!);
    expect(ev[0]!.memo).toEqual({ v: 2, g: "TEST", t: "gvote", r: 2, p: ghostId, x: vampir });
    lynchToday(state, vampir!); // last vampire → koy wins → END
    expect(state.phase).toBe("END");
    expect(state.winner).toBe("koy");
    expect(state.kahinScore[ghostId]).toBe(1);
    const kinds = state.badges!.filter((b) => b.playerId === ghostId).map((b) => b.kind);
    expect(kinds).toContain("kahin");
  });
  test("village win: alive non-vampires get kazanan, sitting Muhtar gets muhtar", () => {
    const state = inDay(7);
    const [vampir] = byRole(state, "vampir");
    lynchToday(state, vampir!);
    expect(state.winner).toBe("koy");
    const winners = state.badges!.filter((b) => b.kind === "kazanan").map((b) => b.playerId).sort();
    expect(winners).toEqual(
      state.players.filter((p) => p.alive && p.role !== "vampir").map((p) => p.id).sort(),
    );
    if (state.muhtar)
      expect(state.badges!.some((b) => b.kind === "muhtar" && b.playerId === state.muhtar)).toBe(true);
    expect(state.phase).toBe("END");
  });
  test("vampires win at parity; all vampires (dead or alive) get kazanan", () => {
    const state = inDay(7); // 1 vampir, 6 others
    const [vampir] = byRole(state, "vampir");
    let round = 1;
    while (state.phase !== "END") {
      const victim = state.players.find((p) => p.alive && p.id !== vampir)!.id;
      lynchToday(state, victim);
      if (state.phase === "END") break;
      nextRound(state);
      const next = state.players.find((p) => p.alive && p.id !== vampir)!.id;
      nightAction(state, vampir!, next);
      resolveNight(state);
      if (state.phase === "END") break;
      startDay(state);
      round++;
      if (round > 10) throw new Error("oyun bitmedi");
    }
    expect(state.winner).toBe("vampir");
    expect(state.badges!.filter((b) => b.kind === "kazanan").map((b) => b.playerId)).toEqual([vampir]);
  });
  test("lynching the Deli: Deli wins alone, game continues, deli badge at END", () => {
    const state = inDay(8);
    const [deli] = byRole(state, "deli");
    const [vampir] = byRole(state, "vampir");
    lynchToday(state, deli!);
    expect(state.deliWon).toBe(true);
    expect(state.phase).toBe("EXECUTION");
    nextRound(state);
    resolveNight(state);
    startDay(state);
    lynchToday(state, vampir!);
    expect(state.phase).toBe("END");
    expect(state.badges!.some((b) => b.kind === "deli" && b.playerId === deli)).toBe(true);
  });
  test("END memos: phase END with winner, one badge memo per badge, seedr reveal", () => {
    const state = inDay(7);
    state.seedSalt = "tuz";
    const [vampir] = byRole(state, "vampir");
    const alive = state.players.filter((p) => p.alive).map((p) => p.id);
    const accuser = alive.find((id) => id !== vampir)!;
    const seconder = alive.find((id) => id !== vampir && id !== accuser)!;
    accuse(state, accuser, vampir!);
    second(state, seconder, vampir!);
    openVerdict(state, null, { force: true });
    let events: ReturnType<typeof castVerdict> = [];
    for (const id of alive) if (state.day.stage === "verdict") events = castVerdict(state, id, true);
    expect(state.phase).toBe("END");
    expect(events.find((e) => e.memo.t === "phase")!.memo).toMatchObject({ ph: "END", winner: "koy" });
    expect(events.filter((e) => e.memo.t === "badge").length).toBe(state.badges!.length);
    expect(events.find((e) => e.memo.t === "seedr")!.memo).toEqual({
      v: 2,
      g: "TEST",
      t: "seedr",
      seed: 42,
      salt: "tuz",
    });
  });
});

describe("day trial", () => {
  test("accusation is pending until seconded; seconder cannot be the accuser or the accused", () => {
    const state = inDay(7);
    const ev = accuse(state, "p1", "p2");
    expect(ev[0]!.memo).toEqual({ v: 2, g: "TEST", t: "accuse", r: 1, p: "p1", x: "p2" });
    expect(state.day.stage).toBe("free");
    expect(() => second(state, "p1", "p2")).toThrow(EngineError);
    expect(() => second(state, "p2", "p2")).toThrow(EngineError);
    expect(() => second(state, "p3", "p4")).toThrow(EngineError); // no accusation on p4
    const ev2 = second(state, "p3", "p2");
    expect(ev2[0]!.memo).toMatchObject({ t: "second", p: "p3", x: "p2" });
    expect(state.day.stage).toBe("trial");
    expect(state.day.trial).toMatchObject({ accused: "p2", accuser: "p1", seconder: "p3" });
    expect(() => accuse(state, "p4", "p5")).toThrow(EngineError); // one trial at a time
  });
  test("only the accused or the Muhtar opens the verdict; host can force", () => {
    const state = inDay(7); // p0 Muhtar
    accuse(state, "p1", "p2");
    second(state, "p3", "p2");
    expect(() => openVerdict(state, "p4")).toThrow(EngineError);
    expect(() => castVerdict(state, "p1", true)).toThrow(EngineError); // not open yet
    const ev = openVerdict(state, "p2");
    expect(ev[0]!.memo).toMatchObject({ t: "phase", ph: "VERDICT", by: "accused" });
    expect(state.day.stage).toBe("verdict");

    const s2 = inDay(7);
    accuse(s2, "p1", "p2");
    second(s2, "p3", "p2");
    expect(openVerdict(s2, null, { force: true, by: "host" })[0]!.memo).toMatchObject({ by: "host" });
  });
  test("verdict closes itself the moment guilty weight exceeds half; lynch → EXECUTION", () => {
    const state = inDay(7); // 7 alive, p0 Muhtar (2x) → total weight 8, need > 4
    accuse(state, "p1", "p2");
    second(state, "p3", "p2");
    openVerdict(state, "p0");
    castVerdict(state, "p1", true); // 1
    castVerdict(state, "p3", true); // 2
    castVerdict(state, "p4", true); // 3
    expect(state.phase).toBe("DAY");
    const ev = castVerdict(state, "p0", true); // +2 = 5 > 4 → decided
    expect(state.phase).toBe("EXECUTION");
    expect(state.players.find((p) => p.id === "p2")!.alive).toBe(false);
    expect(state.lastVerdict).toMatchObject({ accused: "p2", lynched: "p2", guilty: 5, notGuilty: 0 });
    expect(ev.find((e) => e.memo.t === "result")!.memo).toMatchObject({ lynched: "oyuncu2" });
    expect(ev.find((e) => e.memo.t === "verdict")!.memo).toEqual({
      v: 2,
      g: "TEST",
      t: "verdict",
      r: 1,
      p: "p0",
      x: "p2",
      y: 1,
    });
  });
  test("verdict closes itself when guilty can no longer exceed half; acquittal returns to free and blocks a second trial", () => {
    const state = inDay(7); // total 8, need > 4
    accuse(state, "p1", "p2");
    second(state, "p3", "p2");
    openVerdict(state, "p0");
    castVerdict(state, "p0", false); // notGuilty 2, pending 6
    castVerdict(state, "p4", false); // notGuilty 3, pending 5 → guilty max 5 > 4 still possible
    expect(state.day.stage).toBe("verdict");
    castVerdict(state, "p5", false); // notGuilty 4, pending 4 → guilty max 4, not > 4 → decided
    expect(state.day.stage).toBe("free");
    expect(state.phase).toBe("DAY");
    expect(state.players.find((p) => p.id === "p2")!.alive).toBe(true);
    expect(state.lastVerdict).toMatchObject({ accused: "p2", lynched: null });
    expect(state.day.triedToday).toEqual(["p2"]);
    expect(() => accuse(state, "p1", "p2")).toThrow(EngineError); // no second trial today
    accuse(state, "p1", "p4"); // but a new accusation on someone else is fine
  });
  test("cap resolution with partial votes uses the same rule", () => {
    const state = inDay(7);
    accuse(state, "p1", "p2");
    second(state, "p3", "p2");
    openVerdict(state, "p0");
    castVerdict(state, "p1", true);
    resolveVerdict(state); // server cap: 1 of 8 → acquitted
    expect(state.lastVerdict!.lynched).toBeNull();
    expect(state.day.stage).toBe("free");
  });
  test("closeDay refuses during a trial; nextRound after execution increments the round", () => {
    const state = inDay(7);
    accuse(state, "p1", "p2");
    second(state, "p3", "p2");
    expect(() => closeDay(state)).toThrow(EngineError);
    openVerdict(state, "p2");
    for (const v of ["p0", "p1", "p3", "p4"]) castVerdict(state, v, true);
    expect(state.phase).toBe("EXECUTION");
    const ev = nextRound(state, "auto");
    expect(state.phase).toBe("NIGHT");
    expect(state.round).toBe(2);
    expect(ev[0]!.memo).toMatchObject({ t: "phase", ph: "NIGHT", r: 2 });
  });
  test("lynched Muhtar opens the heir beat in EXECUTION; nextRound clears it", () => {
    const state = inDay(7); // p0 Muhtar
    accuse(state, "p1", "p0");
    second(state, "p3", "p0");
    openVerdict(state, "p0");
    for (const v of ["p1", "p3", "p4", "p5", "p6"]) castVerdict(state, v, true); // 5 > 4
    expect(state.phase).toBe("EXECUTION");
    expect(state.heirPending).toBe("p0");
    nameHeir(state, "p0", "p6");
    expect(state.muhtar).toBe("p6");
    nextRound(state);
    expect(state.heirPending).toBeNull();
  });
});

describe("election", () => {
  test("only alive players nominate and vote; votes must target a candidate", () => {
    const state = dealt(7);
    expect(() => electionVote(state, "p1", "p0")).toThrow(EngineError); // p0 not a candidate
    nominate(state, "p0");
    const events = electionVote(state, "p1", "p0");
    expect(events[0]!.memo).toEqual({ v: 2, g: "TEST", t: "mvote", r: 0, p: "p1", x: "p0" });
    expect(electionComplete(state)).toBe(false);
  });
  test("plurality wins; muhtar memo carries weight; phase → NIGHT round 1", () => {
    const state = dealt(7);
    nominate(state, "p0");
    nominate(state, "p1");
    for (const v of ["p2", "p3", "p4"]) electionVote(state, v, "p0");
    for (const v of ["p5", "p6"]) electionVote(state, v, "p1");
    electionVote(state, "p0", "p1");
    electionVote(state, "p1", "p0");
    expect(electionComplete(state)).toBe(true);
    const events = resolveElection(state, 99);
    expect(state.muhtar).toBe("p0");
    expect(events[0]!.memo).toEqual({ v: 2, g: "TEST", t: "muhtar", p: "p0", w: 2 });
    expect(state.phase).toBe("NIGHT");
    expect(state.round).toBe(1);
  });
  test("tie is broken by the seed among tied candidates; no candidates → seed picks anyone alive", () => {
    const state = dealt(8);
    nominate(state, "p0");
    nominate(state, "p1");
    electionVote(state, "p2", "p0");
    electionVote(state, "p3", "p1");
    resolveElection(state, 5);
    expect(["p0", "p1"]).toContain(state.muhtar);

    const empty = dealt(8);
    resolveElection(empty, 5);
    expect(empty.muhtar).not.toBeNull();
    expect(empty.players.find((p) => p.id === empty.muhtar)!.alive).toBe(true);
  });
  test("13 players elect a 3x Muhtar", () => {
    const state = dealt(13);
    electMuhtar(state, "p4");
    expect(state.muhtar).toBe("p4");
    expect(state.muhtarWeight).toBe(3);
  });
});

describe("rolePlan v2", () => {
  test("vampire count follows the composition table", () => {
    const v = (n: number) => rolePlan(n).filter((r) => r === "vampir").length;
    expect(v(7)).toBe(1);
    expect(v(9)).toBe(1);
    expect(v(10)).toBe(2);
    expect(v(12)).toBe(2);
    expect(v(13)).toBe(3);
    expect(v(15)).toBe(3);
  });
  test("doktor and gozcu always once, deli from 8, rest koylu", () => {
    for (const n of [7, 8, 13, 15]) {
      const roles = rolePlan(n);
      expect(roles.length).toBe(n);
      expect(roles.filter((r) => r === "doktor").length).toBe(1);
      expect(roles.filter((r) => r === "gozcu").length).toBe(1);
      expect(roles.includes("deli")).toBe(n >= 8);
    }
  });
  test("muhtar weight is 2, and 3 from 13 players", () => {
    expect(muhtarWeightFor(7)).toBe(2);
    expect(muhtarWeightFor(12)).toBe(2);
    expect(muhtarWeightFor(13)).toBe(3);
  });
});

describe("lobby v2", () => {
  test("join emits v2 join memo with room code, no tier", () => {
    const state = createRoom("TEST");
    const events = join(state, "p0", "ali");
    expect(events[0]!.memo).toEqual({ v: 2, g: "TEST", t: "join", p: "p0", name: "ali" });
    expect(state.players[0]).toMatchObject({ id: "p0", name: "ali", alive: true, role: null });
  });
  test("duplicate name and full room are rejected", () => {
    const state = makeRoom(MAX_PLAYERS);
    expect(() => join(state, "x", "oyuncu0")).toThrow(EngineError);
    expect(() => join(state, "x", "yeni")).toThrow(EngineError);
  });
  test("start needs 7 players and a seed commitment", () => {
    expect(() => start(makeRoom(6), 42, "c")).toThrow(EngineError);
    expect(() => start(makeRoom(7), 42, "")).toThrow(EngineError);
  });
  test("start seals the seed commitment first, deals roles, opens ELECTION", () => {
    const state = makeRoom(10);
    const events = start(state, 42, "commit-42");
    expect(events[0]!.memo).toEqual({ v: 2, g: "TEST", t: "seed", c: "commit-42" });
    expect(events.length).toBe(11); // seed + 10 role cards
    expect(state.phase).toBe("ELECTION");
    expect(state.round).toBe(0);
    expect(state.seed).toBe(42);
    expect(state.seedCommit).toBe("commit-42");
    expect(state.muhtarWeight).toBe(2);
    expect(byRole(state, "vampir").length).toBe(2);
    expect(byRole(state, "deli").length).toBe(1);
  });
  test("same seed deals the same roles (replayable kura)", () => {
    const a = dealt(9, 7);
    const b = dealt(9, 7);
    expect(a.players.map((p) => p.role)).toEqual(b.players.map((p) => p.role));
  });
});

describe("night v2", () => {
  test("three vampires at 13 players: majority pick dies unless saved", () => {
    const state = inNight(13);
    const vamps = byRole(state, "vampir");
    expect(vamps.length).toBe(3);
    const [doktor] = byRole(state, "doktor");
    const civ = state.players
      .filter((p) => !vamps.includes(p.id) && p.id !== doktor)
      .map((p) => p.id);
    nightAction(state, vamps[0]!, civ[0]!);
    nightAction(state, vamps[1]!, civ[0]!);
    nightAction(state, vamps[2]!, civ[1]!);
    nightAction(state, doktor!, civ[1]!); // guards the minority target — no effect
    expect(nightComplete(state)).toBe(false); // gozcu has not acted
    const [gozcu] = byRole(state, "gozcu");
    nightAction(state, gozcu!, vamps[0]!);
    expect(nightComplete(state)).toBe(true);
    const events = resolveNight(state);
    expect(state.players.find((p) => p.id === civ[0])!.alive).toBe(false);
    expect(state.phase).toBe("DAWN");
    expect(events.find((e) => e.memo.t === "seerr")!.memo).toMatchObject({
      v: 2,
      g: "TEST",
      x: vamps[0],
      vamp: true,
    });
    expect(events.find((e) => e.memo.t === "result")!.memo).toMatchObject({ r: 1, saved: false });
  });
  test("doctor may guard the same person on consecutive nights", () => {
    const state = inNight(7);
    const [vampir] = byRole(state, "vampir");
    const [doktor] = byRole(state, "doktor");
    const victim = state.players.find((p) => p.id !== vampir && p.id !== doktor)!.id;
    nightAction(state, vampir!, victim);
    nightAction(state, doktor!, victim);
    resolveNight(state);
    startDay(state);
    closeDayForTest(state);
    nightAction(state, vampir!, victim);
    nightAction(state, doktor!, victim); // second night, same target: allowed
    resolveNight(state);
    expect(state.players.find((p) => p.id === victim)!.alive).toBe(true);
  });
  test("Muhtar dies at night → heirPending; heir named during DAWN; startDay clears it", () => {
    const state = inNight(7); // p0 is Muhtar
    const [vampir] = byRole(state, "vampir");
    if (vampir === "p0") return; // seed 42 gives p0 a non-vampire role; guard anyway
    nightAction(state, vampir!, "p0");
    resolveNight(state);
    expect(state.muhtar).toBeNull();
    expect(state.heirPending).toBe("p0");
    expect(() => nameHeir(state, "p1", "p2")).toThrow(EngineError); // only the dead Muhtar
    const events = nameHeir(state, "p0", "p2");
    expect(events[0]!.memo).toEqual({ v: 2, g: "TEST", t: "heir", p: "p0", x: "p2" });
    expect(state.muhtar).toBe("p2");
    startDay(state, "muhtar");
    expect(state.heirPending).toBeNull();
    expect(state.phase).toBe("DAY");
    expect(state.day.stage).toBe("free");
  });
  test("unnamed heir: village continues without a Muhtar", () => {
    const state = inNight(7);
    const [vampir] = byRole(state, "vampir");
    if (vampir === "p0") return;
    nightAction(state, vampir!, "p0");
    resolveNight(state);
    const events = startDay(state);
    expect(state.muhtar).toBeNull();
    expect(state.heirPending).toBeNull();
    expect(events[0]!.memo).toMatchObject({ t: "phase", ph: "DAY", by: "auto", r: 1 });
  });
});
