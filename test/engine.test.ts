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
} from "../src/engine/engine";
import { RoomState } from "../src/engine/types";
import { makeRoom, byRole, dealt, electMuhtar, inNight } from "./helpers";

function closeDayForTest(state: RoomState) {
  closeDay(state, "muhtar");
}

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
