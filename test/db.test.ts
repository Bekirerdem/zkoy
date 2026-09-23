import { describe, expect, test } from "bun:test";
import { Db } from "../src/server/db";

describe("db", () => {
  test("stats: oyun, tekil cihaz, koltuk", () => {
    const db = new Db(":memory:");
    const g1 = db.createGame("AAAAAA", [
      { pid: "p0", deviceKey: "d1", name: "ali", role: "vampir" },
      { pid: "p1", deviceKey: "d2", name: "ayşe", role: "koylu" },
    ], "c1");
    db.createGame("BBBBBB", [
      { pid: "p0", deviceKey: "d1", name: "ali", role: "koylu" },
      { pid: "p1", deviceKey: "d3", name: "can", role: "doktor" },
    ], "c2");
    db.endGame(g1, "koy", "hash");
    const s = db.stats();
    expect(s.games).toBe(2);
    expect(s.finishedGames).toBe(1);
    expect(s.uniqueDevices).toBe(3);
    expect(s.playerSeats).toBe(4);
    expect(s.since).not.toBeNull();
  });

  test("mühür kuyruğu: enqueue → pending → complete txid'i olaylara yazar", () => {
    const db = new Db(":memory:");
    const ev = [{ to: "room" as const, memo: { v: 3, g: "X", t: "join" } }];
    const ids = db.logEvents(null, "X", 0, "LOBBY", ev);
    const q = db.enqueueSeal("X", ev, ids);
    expect(db.pendingSeals().map((p) => p.id)).toEqual([q]);
    db.completeSeal([q], "tx1");
    expect(db.pendingSeals()).toEqual([]);
    const s = db.stats();
    expect(s.sealedTx).toBe(1);
    expect(s.sealedMemos).toBe(1);
  });

  test("snapshot upsert + yaşa göre yükleme", () => {
    const db = new Db(":memory:");
    db.saveSnapshot("X", "{}");
    db.saveSnapshot("X", '{"a":1}');
    expect(db.loadSnapshots(60_000)).toEqual([{ code: "X", json: '{"a":1}' }]);
  });
});
