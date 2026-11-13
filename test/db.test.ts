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
    const game = db.createGame("X", [{ pid: "p0", deviceKey: "d1", name: "ali", role: "koylu" }], "c");
    const ev = [{ to: "room" as const, memo: { v: 4, g: "X", t: "seat" } }];
    const ids = db.logEvents(game, "X", 0, "ELECTION", ev);
    const q = db.enqueueSeal("X", ev, ids);
    expect(db.pendingSeals().map((p) => p.id)).toEqual([q]);
    expect(db.pendingFor("X").length).toBe(1);
    expect(db.pendingFor("Y")).toEqual([]);
    db.completeSeal([q], "tx1");
    expect(db.pendingSeals()).toEqual([]);
    const s = db.stats();
    expect(s.sealedTx).toBe(1);
    expect(s.sealedMemos).toBe(1);
    expect(db.gameEvents(game)).toEqual([{ memo: JSON.stringify(ev[0]!.memo), txid: "tx1", dest: "room" }]);
  });

  test("test oyunları hiçbir sayaca girmez; sonradan da etiketlenebilir", () => {
    const db = new Db(":memory:");
    const seat = [{ pid: "p0", deviceKey: "d1", name: "ali", role: "koylu" }];
    const real = db.createGame("REAL11", seat, "c1");
    const bots = db.createGame("BOTS11", [{ ...seat[0]!, deviceKey: "bot1" }], "c2", true);
    for (const [g, code] of [[real, "REAL11"], [bots, "BOTS11"]] as const) {
      const ev = [{ to: "room" as const, memo: { v: 4, g: code, t: "seat" } }];
      db.completeSeal([db.enqueueSeal(code, ev, db.logEvents(g, code, 0, "ELECTION", ev))], `tx-${g}`);
      db.endGame(g, "koy", "h");
    }
    let s = db.stats();
    expect(s).toMatchObject({ games: 1, finishedGames: 1, uniqueDevices: 1, sealedTx: 1, sealedMemos: 1, testGames: 1, activeDays: 1 });
    expect(db.recentGames().length).toBe(1);
    expect(JSON.stringify(db.recentGames())).not.toContain("REAL11"); // liste oda kodu vermez
    // Eski bir prova oyununu sonradan etiketle (tools/mark-test.ts).
    expect(db.markTest("REAL11")).toBe(1);
    s = db.stats();
    expect(s).toMatchObject({ games: 0, uniqueDevices: 0, sealedTx: 0, testGames: 2, activeDays: 0 });
  });

  test("eski veritabanı dosyası açılınca yeni sütunlar eklenir", () => {
    const db = new Db(":memory:");
    // İlk sürümün şemasına geri dön, eski bir oyun satırı bırak.
    db.sql.exec("ALTER TABLE games DROP COLUMN test");
    db.sql.exec("ALTER TABLE events DROP COLUMN dest");
    db.sql.exec("INSERT INTO games (code, started_at, players) VALUES ('ESKI11', 1, 7)");
    expect(() => db.stats()).toThrow();
    db.migrate();
    expect(db.stats()).toMatchObject({ games: 1, testGames: 0 });
    expect(db.gameEvents(1)).toEqual([]);
    db.migrate(); // ikinci kez çalışması zararsız
  });

  test("snapshot upsert + yaşa göre yükleme", () => {
    const db = new Db(":memory:");
    db.saveSnapshot("X", "{}");
    db.saveSnapshot("X", '{"a":1}');
    expect(db.loadSnapshots(60_000)).toEqual([{ code: "X", json: '{"a":1}' }]);
  });
});
