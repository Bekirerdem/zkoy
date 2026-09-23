import { describe, expect, test } from "bun:test";
import {
  EngineError,
  accuse,
  castVerdict,
  createRoom,
  openVerdict,
  rolePlan,
  second,
  start,
} from "../src/engine/engine";
import { byRole, electMuhtar, makeRoom } from "./helpers";
import { resolveNight, startDay } from "../src/engine/engine";

describe("SPEC v3 §2.1 oda kuralları", () => {
  test("varsayılan: gözcü otomatik, sanık oy kullanmaz", () => {
    expect(createRoom("X").rules).toEqual({ gozcu: null, accusedVotes: false });
  });

  test("rolePlan gözcüsüz: bir köylü fazla", () => {
    const withG = rolePlan(9);
    const noG = rolePlan(9, false);
    expect(noG.includes("gozcu")).toBe(false);
    expect(noG.length).toBe(9);
    expect(noG.filter((r) => r === "koylu").length).toBe(
      withG.filter((r) => r === "koylu").length + 1,
    );
  });

  test("otomatik gözcü: 9 kişide yok, 13 kişide var; kurucu açarsa 9'da da var", () => {
    const s9 = makeRoom(9, {});
    start(s9, 1, "c");
    expect(byRole(s9, "gozcu").length).toBe(0);
    const s13 = makeRoom(13, {});
    start(s13, 1, "c");
    expect(byRole(s13, "gozcu").length).toBe(1);
    const s9g = makeRoom(9, { gozcu: true });
    start(s9g, 1, "c");
    expect(byRole(s9g, "gozcu").length).toBe(1);
  });

  test("sanık oy kullanmaz; yarı hesabı sanıksız ağırlıkla", () => {
    // 7 kişi, Muhtar p0 (ağırlık 2), sanık p6: oy kullananlar p0..p5 = toplam 7
    const state = makeRoom(7, {});
    start(state, 3, "c");
    electMuhtar(state, "p0");
    resolveNight(state);
    startDay(state);
    accuse(state, "p1", "p6");
    second(state, "p2", "p6");
    openVerdict(state, "p6");
    expect(() => castVerdict(state, "p6", false)).toThrow(EngineError);
    castVerdict(state, "p1", true); // 1
    castVerdict(state, "p2", true); // 2
    castVerdict(state, "p3", true); // 3 — henüz 3*2 > 7 değil
    expect(state.day.stage).toBe("verdict");
    const ev = castVerdict(state, "p4", true); // 4*2 > 7 → asılır
    expect(state.lastVerdict?.lynched).toBe("p6");
    expect(ev.some((e) => e.memo.t === "result")).toBe(true);
  });
});
