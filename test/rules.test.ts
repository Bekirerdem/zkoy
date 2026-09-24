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
  supportWeight,
  trialNeed,
} from "../src/engine/engine";
import { byRole, electMuhtar, makeRoom } from "./helpers";
import { resolveNight, startDay } from "../src/engine/engine";

describe("dava eşiği (25 Eyl)", () => {
  function day(n: number) {
    const state = makeRoom(n, {});
    start(state, 3, "c");
    electMuhtar(state, "p0");
    resolveNight(state);
    startDay(state);
    return state;
  }

  test("tablo: 4-9 yaşayan → 3, 10-12 → 4, 13-15 → 5", () => {
    expect(trialNeed(day(7))).toBe(3);
    expect(trialNeed(day(9))).toBe(3);
    expect(trialNeed(day(10))).toBe(4);
    expect(trialNeed(day(12))).toBe(4);
    expect(trialNeed(day(13))).toBe(5);
    expect(trialNeed(day(15))).toBe(5);
  });

  test("iki sıradan kişi dava açamaz; üçüncü destekle açılır", () => {
    const s = day(8);
    accuse(s, "p1", "p5");
    second(s, "p2", "p5");
    expect(s.day.stage).toBe("free");
    expect(supportWeight(s, "p5")).toBe(2);
    second(s, "p3", "p5");
    expect(s.day.stage).toBe("trial");
    expect(s.day.trial!.backers).toEqual(["p1", "p2", "p3"]);
  });

  test("Muhtar + 1 kişi yeter (Muhtar desteği 2 sayılır)", () => {
    const s = day(8);
    accuse(s, "p0", "p5"); // Muhtar: 2
    expect(s.day.stage).toBe("free");
    const ev = second(s, "p3", "p5"); // 3
    expect(s.day.stage).toBe("trial");
    expect(ev.some((e) => e.memo.t === "trial")).toBe(true);
  });

  test("destek geri alınabilir: başkasını destekleyen önceki desteğini çeker", () => {
    const s = day(8);
    accuse(s, "p1", "p5");
    second(s, "p2", "p5");
    accuse(s, "p2", "p6"); // p2 fikir değiştirdi
    expect(s.day.backers["p5"]).toEqual(["p1"]);
    expect(s.day.backers["p6"]).toEqual(["p2"]);
  });
});

describe("SPEC v3 §2.1 oda kuralları", () => {
  test("varsayılan: gözcü otomatik, sanık oy kullanmaz", () => {
    expect(createRoom("X").rules).toEqual({ gozcu: null, accusedVotes: false, trialSupport: null });
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
    second(state, "p3", "p6");
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
