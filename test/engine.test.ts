import { describe, expect, test } from "bun:test";
import {
  createRoom,
  join,
  start,
  rolePlan,
  muhtarWeightFor,
  EngineError,
  MAX_PLAYERS,
} from "../src/engine/engine";
import { makeRoom, byRole, dealt } from "./helpers";

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
