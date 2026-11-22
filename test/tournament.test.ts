import { afterAll, describe, expect, test } from "bun:test";
import { sha256Hex } from "../src/engine/fair";
import { POINTS, gamePoints, gameWinners } from "../src/engine/score";
import { Db, deviceTag } from "../src/server/db";
import { startServer } from "../src/server/index";
import { parseClientMsg } from "../src/server/protocol";
import { Room } from "../src/server/room";
import { SealQueue } from "../src/server/seal-queue";
import { Tournament, admit } from "../src/server/tournaments";
import { privateView } from "../src/server/views";
import { verifyGame } from "../src/verify/verify";
import { MockZcashService } from "../src/zcash/mock";
import { Table, playRandom, roomMemos } from "./play";

/** Seats `devices` at a fresh table of `db`, every table of one evening sharing devices. */
function table(db: Db, code: string, devices: string[], tournament: string | null, test = false): Table {
  const zcash = new MockZcashService();
  const seals = new SealQueue(db, zcash, { holdMaxMs: 3_600_000 });
  const room = new Room(code, { db, zcash, seals }, {}, { tournament, test });
  devices.forEach((d, i) => room.join(d, `Oyuncu${d.slice(1)}`, (i + 1).toString(16).padStart(8, "0")));
  return { room, db, zcash, seals };
}

describe("tournament points", () => {
  test("the points follow the badges, the living and the ghosts", async () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const db = new Db(":memory:");
      const devs = Array.from({ length: 7 + (seed % 7) }, (_, i) => `d${i}`);
      const t = table(db, `PUAN${seed}`, devs, "BTU23");
      expect(await playRandom(t, seed)).toBe(true);
      const s = t.room.state;
      const pts = gamePoints(s);
      const won = gameWinners(s);
      expect(won.length).toBeGreaterThan(0);
      const side = (id: string) => s.badges!.some((b) => b.playerId === id && b.kind === "kazanan");
      for (const p of s.players) {
        expect(won.includes(p.id)).toBe(side(p.id) || (s.deliWon && p.role === "deli"));
        const expected =
          (side(p.id) ? POINTS.win : 0) +
          (s.deliWon && p.role === "deli" ? POINTS.fool : 0) +
          (p.alive ? POINTS.alive : 0) +
          (s.kahinScore[p.id] ?? 0) * POINTS.prophecy;
        expect(pts[p.id]).toBe(expected);
      }
      // The verifier gets the same numbers from the sealed memos alone.
      const report = verifyGame(roomMemos(t), { code: t.room.code });
      expect(report.ok).toBe(true);
      for (const p of report.summary!.players) expect(p.points).toBe(pts[p.id]!);
    }
  });

  test("a game outside a tournament stores points but shows none", async () => {
    const db = new Db(":memory:");
    const t = table(db, "SERBES", ["a", "b", "c", "d", "e", "f", "g"].map((x) => `d${x}`), null);
    expect(await playRandom(t, 3)).toBe(true);
    expect(t.room.standing("p0")).toBeNull();
    expect(privateView(t.room, "p0")!.standing).toBeNull();
  });
});

describe("leaderboard", () => {
  test("one evening: points add up per phone across tables, ranks and ties", async () => {
    const db = new Db(":memory:");
    const all = Array.from({ length: 12 }, (_, i) => `d${i}`);
    // Three games, overlapping players, one of them a test table that must not count.
    const games = [
      table(db, "MASA01", all.slice(0, 8), "BTU23"),
      table(db, "MASA02", all.slice(4, 12), "BTU23"),
      table(db, "MASA03", all.slice(0, 7), "BTU23", true),
      table(db, "MASA04", all.slice(2, 9), "OTHER"),
    ];
    for (const [i, g] of games.entries()) expect(await playRandom(g, 40 + i)).toBe(true);

    const board = db.board("BTU23");
    const expected = new Map<string, number>();
    for (const g of games.slice(0, 2)) {
      const pts = gamePoints(g.room.state);
      for (const [pid, dev] of g.room.devices) expected.set(dev, (expected.get(dev) ?? 0) + pts[pid]!);
    }
    expect(board).toHaveLength(12);
    for (const [dev, n] of expected) expect(board.find((r) => r.id === deviceTag(dev))!.points).toBe(n);
    // Sorted, every rank unique, real ties flagged as settled by the draw, no device key leaks.
    expect(board.map((r) => r.rank)).toEqual(board.map((_, i) => i + 1));
    for (let i = 1; i < board.length; i++) {
      const a = board[i - 1]!;
      const b = board[i]!;
      expect(a.points).toBeGreaterThanOrEqual(b.points);
      if (a.points === b.points && a.wins === b.wins && a.games === b.games) expect(a.tie && b.tie).toBe(true);
    }
    // The draw is fixed by the sealed games: asking twice gives the same order.
    expect(db.board("BTU23")).toEqual(board);
    expect(JSON.stringify(board)).not.toContain('"d1"');
    expect(db.board("BTU23", true)).toHaveLength(7);
    expect(db.tournamentGames("BTU23").map((g) => g.code)).toEqual(["MASA01", "MASA02"]);

    // Each phone sees its own place at the end of its game.
    const g2 = games[1]!;
    const pid = [...g2.room.devices.entries()].find(([, d]) => d === "d6")![0];
    const st = privateView(g2.room, pid)!.standing!;
    const row = board.find((r) => r.id === deviceTag("d6"))!;
    expect(st).toEqual({ points: gamePoints(g2.room.state)[pid]!, total: row.points, rank: row.rank, of: 12 });
  });

  test("a restarted server keeps the table's tournament", async () => {
    const db = new Db(":memory:");
    const t = table(db, "GERIYE", ["a", "b", "c", "d", "e", "f", "g"].map((x) => `d${x}`), "BTU23");
    t.room.cmd(t.room.hostPid!, { t: "cmd", c: "start" });
    const back = Room.restore(db.getSnapshot("GERIYE")!, { db, zcash: t.zcash, seals: t.seals });
    expect(back.tournament).toBe("BTU23");
  });
});

describe("tournament keys", () => {
  const list: Tournament[] = [
    { code: "GECE", title: "x", titleEn: "x", keyHash: sha256Hex("dogru"), from: 1000, to: 2000 },
  ];
  test("only the key opens a table, and only while the tournament runs", () => {
    expect(admit("gece", "dogru", 1500, list).code).toBe("GECE");
    expect(() => admit("GECE", "yanlis", 1500, list)).toThrow("turnuva anahtarı geçersiz");
    expect(() => admit("YOK", "dogru", 1500, list)).toThrow("turnuva anahtarı geçersiz");
    expect(() => admit("GECE", "dogru", 999, list)).toThrow("turnuva şu an açık değil");
    expect(() => admit("GECE", "dogru", 2001, list)).toThrow("turnuva şu an açık değil");
  });

  test("the create frame carries the key", () => {
    const m = parseClientMsg(JSON.stringify({ t: "create", name: "ali", tour: { code: "btu23", key: "K" } }));
    expect(m).toMatchObject({ t: "create", tour: { code: "BTU23", key: "K" } });
    expect(() => parseClientMsg(JSON.stringify({ t: "create", name: "ali", tour: { code: "BTU23" } }))).toThrow(
      "turnuva anahtarı geçersiz",
    );
  });
});

describe("over the wire", () => {
  const app = startServer({ port: 0, db: new Db(":memory:"), zcash: new MockZcashService(), webDir: "web" });
  const base = `127.0.0.1:${app.server.port}`;
  afterAll(() => app.server.stop(true));

  test("a wrong key is refused; the board and its page are served", async () => {
    const ws = new WebSocket(`ws://${base}/ws`);
    await new Promise((r) => (ws.onopen = r));
    const err = new Promise<any>((r) => (ws.onmessage = (ev) => r(JSON.parse(String(ev.data)))));
    ws.send(JSON.stringify({ t: "hello", device: "devT", lang: "en" }));
    ws.send(JSON.stringify({ t: "create", name: "ali", tour: { code: "BTU23", key: "uydurma" } }));
    expect((await err).e).toBe("This tournament link is not valid.");
    ws.close();

    const res = await fetch(`http://${base}/e/btu23.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ code: "BTU23", board: [], games: [], points: POINTS, test: false, prizesUsd: [50, 30, 20] });
    expect((await fetch(`http://${base}/e/YOKBOYLE.json`)).status).toBe(404);
    const page = await fetch(`http://${base}/e/BTU23`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("app.js");
  });
});
