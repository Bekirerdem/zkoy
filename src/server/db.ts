// SQLite kalıcılık (SPEC v3 §8, kamp alt kümesi): cihazlar, oyunlar, olay
// günlüğü (her memo'nun ikizi), kalıcı mühür kuyruğu, oda anlık görüntüleri.
// Kullanım kanıtı `stats()`'tan çıkar: kaç oyun, kaç tekil cihaz, kaç mühür.
// Test oyunları (`games.test = 1`) hiçbir sayaca girmez.

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join as joinPath } from "node:path";
import { MemoEvent } from "../engine/types";

export interface GamePlayer {
  pid: string;
  deviceKey: string;
  name: string;
  role: string | null;
}

export interface PendingSeal {
  id: number;
  code: string;
  events: MemoEvent[];
}

export interface Stats {
  games: number;
  finishedGames: number;
  uniqueDevices: number;
  playerSeats: number;
  sealedTx: number;
  sealedMemos: number;
  /** Distinct calendar days (UTC) with at least one finished game. */
  activeDays: number;
  /** Labelled test games; they are not part of any number above. */
  testGames: number;
  since: number | null;
}

export interface GameRow {
  id: number;
  code: string;
  started_at: number;
  ended_at: number | null;
  winner: string | null;
  players: number;
  seed_commit: string | null;
  gameroot: string | null;
  test: number;
}

/** A finished game as the public list shows it: no room code, no names. */
export interface PublicGame {
  startedAt: number;
  endedAt: number;
  players: number;
  rounds: number;
  winner: string | null;
  gameroot: string | null;
  memos: number;
  txids: string[];
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS devices (
  key TEXT PRIMARY KEY, first_name TEXT, first_seen INTEGER, last_seen INTEGER);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, started_at INTEGER,
  ended_at INTEGER, winner TEXT, players INTEGER, seed_commit TEXT, gameroot TEXT);
CREATE TABLE IF NOT EXISTS game_players (
  game_id INTEGER, pid TEXT, device_key TEXT, name TEXT, role TEXT);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, code TEXT, round INTEGER,
  phase TEXT, memo TEXT, txid TEXT, at INTEGER);
CREATE TABLE IF NOT EXISTS seal_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, events TEXT, event_ids TEXT,
  created_at INTEGER);
CREATE TABLE IF NOT EXISTS snapshots (
  code TEXT PRIMARY KEY, json TEXT, updated_at INTEGER);
`;

/** Columns added after the first release; each is applied once to an older file. */
const MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "games", column: "test", ddl: "ALTER TABLE games ADD COLUMN test INTEGER NOT NULL DEFAULT 0" },
  // 'room' or the seat id the memo was sent to; older rows stay NULL.
  { table: "events", column: "dest", ddl: "ALTER TABLE events ADD COLUMN dest TEXT" },
];

const INDEXES = `
CREATE INDEX IF NOT EXISTS events_code ON events (code);
CREATE INDEX IF NOT EXISTS events_game ON events (game_id);
CREATE INDEX IF NOT EXISTS seal_queue_code ON seal_queue (code);
CREATE INDEX IF NOT EXISTS games_code ON games (code);
`;

export class Db {
  readonly sql: Database;

  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.sql = new Database(path, { create: true });
    this.migrate();
  }

  /** Brings a file of any earlier version up to the current schema; safe to repeat. */
  migrate(): void {
    this.sql.exec(SCHEMA);
    for (const m of MIGRATIONS) {
      const cols = this.sql.query(`PRAGMA table_info(${m.table})`).all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === m.column)) this.sql.exec(m.ddl);
    }
    this.sql.exec(INDEXES);
  }

  touchDevice(key: string, name: string): void {
    const now = Date.now();
    this.sql
      .query(
        `INSERT INTO devices (key, first_name, first_seen, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET last_seen = excluded.last_seen`,
      )
      .run(key, name, now, now);
  }

  createGame(code: string, players: GamePlayer[], seedCommit: string, test = false): number {
    const res = this.sql
      .query(
        `INSERT INTO games (code, started_at, players, seed_commit, test) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(code, Date.now(), players.length, seedCommit, test ? 1 : 0);
    const gameId = Number(res.lastInsertRowid);
    const ins = this.sql.query(
      `INSERT INTO game_players (game_id, pid, device_key, name, role) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const p of players) ins.run(gameId, p.pid, p.deviceKey, p.name, p.role);
    return gameId;
  }

  endGame(gameId: number, winner: string | null, gameroot: string): void {
    this.sql
      .query(`UPDATE games SET ended_at = ?, winner = ?, gameroot = ? WHERE id = ?`)
      .run(Date.now(), winner, gameroot, gameId);
  }

  /** Labels every game played under a room code as a test; returns how many. */
  markTest(code: string, test = true): number {
    return this.sql.query(`UPDATE games SET test = ? WHERE code = ?`).run(test ? 1 : 0, code).changes;
  }

  logEvents(
    gameId: number | null,
    code: string,
    round: number,
    phase: string,
    events: MemoEvent[],
  ): number[] {
    const ins = this.sql.query(
      `INSERT INTO events (game_id, code, round, phase, memo, at, dest) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    return events.map((e) =>
      Number(
        ins.run(gameId, code, round, phase, JSON.stringify(e.memo), now, e.to === "room" ? "room" : e.to.player)
          .lastInsertRowid,
      ),
    );
  }

  markSealed(eventIds: number[], txid: string): void {
    const upd = this.sql.query(`UPDATE events SET txid = ? WHERE id = ?`);
    for (const id of eventIds) upd.run(txid, id);
  }

  enqueueSeal(code: string, events: MemoEvent[], eventIds: number[] = []): number {
    return Number(
      this.sql
        .query(
          `INSERT INTO seal_queue (code, events, event_ids, created_at) VALUES (?, ?, ?, ?)`,
        )
        .run(code, JSON.stringify(events), JSON.stringify(eventIds), Date.now())
        .lastInsertRowid,
    );
  }

  /** Mühür oturdu: kuyruktan düş, olay satırlarına txid yaz. */
  completeSeal(queueIds: number[], txid: string): void {
    for (const id of queueIds) {
      const row = this.sql
        .query(`SELECT event_ids FROM seal_queue WHERE id = ?`)
        .get(id) as { event_ids: string } | null;
      if (row) this.markSealed(JSON.parse(row.event_ids) as number[], txid);
      this.sql.query(`DELETE FROM seal_queue WHERE id = ?`).run(id);
    }
  }

  pendingSeals(): PendingSeal[] {
    const rows = this.sql
      .query(`SELECT id, code, events FROM seal_queue ORDER BY id`)
      .all() as Array<{ id: number; code: string; events: string }>;
    return rows.map((r) => ({ id: r.id, code: r.code, events: JSON.parse(r.events) }));
  }

  pendingFor(code: string): PendingSeal[] {
    const rows = this.sql
      .query(`SELECT id, code, events FROM seal_queue WHERE code = ? ORDER BY id`)
      .all(code) as Array<{ id: number; code: string; events: string }>;
    return rows.map((r) => ({ id: r.id, code: r.code, events: JSON.parse(r.events) }));
  }

  /** Room codes that still have something waiting, oldest first. */
  pendingCodes(): Array<{ code: string; firstId: number }> {
    return this.sql
      .query(`SELECT code, MIN(id) AS firstId FROM seal_queue GROUP BY code ORDER BY firstId`)
      .all() as Array<{ code: string; firstId: number }>;
  }

  saveSnapshot(code: string, json: string): void {
    this.sql
      .query(
        `INSERT INTO snapshots (code, json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(code, json, Date.now());
  }

  loadSnapshots(maxAgeMs: number): Array<{ code: string; json: string }> {
    return this.sql
      .query(`SELECT code, json FROM snapshots WHERE updated_at >= ?`)
      .all(Date.now() - maxAgeMs) as Array<{ code: string; json: string }>;
  }

  getSnapshot(code: string): string | null {
    const row = this.sql.query(`SELECT json FROM snapshots WHERE code = ?`).get(code) as { json: string } | null;
    return row?.json ?? null;
  }

  deleteSnapshot(code: string): void {
    this.sql.query(`DELETE FROM snapshots WHERE code = ?`).run(code);
  }

  /** The last game played under a room code (a room hosts one game). */
  gameByCode(code: string): GameRow | null {
    return this.sql
      .query(`SELECT * FROM games WHERE code = ? ORDER BY id DESC LIMIT 1`)
      .get(code) as GameRow | null;
  }

  gameEvents(gameId: number): Array<{ memo: string; txid: string | null; dest: string | null }> {
    return this.sql
      .query(`SELECT memo, txid, dest FROM events WHERE game_id = ? ORDER BY id`)
      .all(gameId) as Array<{ memo: string; txid: string | null; dest: string | null }>;
  }

  /** Finished real games, newest first. Deliberately without room codes or names. */
  recentGames(limit = 50): PublicGame[] {
    const rows = this.sql
      .query(
        `SELECT id, started_at, ended_at, players, winner, gameroot FROM games
         WHERE test = 0 AND ended_at IS NOT NULL ORDER BY id DESC LIMIT ?`,
      )
      .all(limit) as Array<Pick<GameRow, "id" | "started_at" | "players" | "winner" | "gameroot"> & { ended_at: number }>;
    const agg = this.sql.query(
      `SELECT COUNT(*) AS memos, MAX(round) AS rounds FROM events WHERE game_id = ?`,
    );
    const txs = this.sql.query(
      `SELECT txid FROM events WHERE game_id = ? AND txid IS NOT NULL GROUP BY txid ORDER BY MIN(id)`,
    );
    return rows.map((g) => {
      const a = agg.get(g.id) as { memos: number; rounds: number | null };
      return {
        startedAt: g.started_at,
        endedAt: g.ended_at,
        players: g.players,
        rounds: Number(a.rounds ?? 0),
        winner: g.winner,
        gameroot: g.gameroot,
        memos: a.memos,
        txids: (txs.all(g.id) as Array<{ txid: string }>).map((t) => t.txid),
      };
    });
  }

  stats(): Stats {
    const one = (q: string) => Number((this.sql.query(q).get() as { n: number | null }).n ?? 0);
    const since = (this.sql.query(`SELECT MIN(started_at) AS n FROM games WHERE test = 0`).get() as {
      n: number | null;
    }).n;
    const real = `SELECT id FROM games WHERE test = 0`;
    return {
      games: one(`SELECT COUNT(*) AS n FROM games WHERE test = 0`),
      finishedGames: one(`SELECT COUNT(*) AS n FROM games WHERE test = 0 AND ended_at IS NOT NULL`),
      uniqueDevices: one(`SELECT COUNT(DISTINCT device_key) AS n FROM game_players WHERE game_id IN (${real})`),
      playerSeats: one(`SELECT COUNT(*) AS n FROM game_players WHERE game_id IN (${real})`),
      sealedTx: one(`SELECT COUNT(DISTINCT txid) AS n FROM events WHERE txid IS NOT NULL AND game_id IN (${real})`),
      sealedMemos: one(`SELECT COUNT(*) AS n FROM events WHERE txid IS NOT NULL AND game_id IN (${real})`),
      activeDays: one(
        `SELECT COUNT(DISTINCT date(ended_at / 1000, 'unixepoch')) AS n FROM games WHERE test = 0 AND ended_at IS NOT NULL`,
      ),
      testGames: one(`SELECT COUNT(*) AS n FROM games WHERE test = 1`),
      since,
    };
  }

  /**
   * Writes a consistent copy next to the live file and keeps the newest `keep`.
   * It protects against a damaged file, not against losing the machine: copy
   * the folder somewhere else as well.
   */
  backup(keep = 14): string | null {
    if (this.path === ":memory:") return null;
    const dir = joinPath(dirname(this.path), "backups");
    mkdirSync(dir, { recursive: true });
    const file = joinPath(dir, `zkoy-${new Date().toISOString().slice(0, 10)}.sqlite`);
    if (existsSync(file)) rmSync(file);
    this.sql.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
    const old = readdirSync(dir)
      .filter((f) => /^zkoy-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
      .sort()
      .slice(0, -keep);
    for (const f of old) rmSync(joinPath(dir, f));
    return file;
  }
}

export function openDb(path = process.env.ZKOY_DB ?? "data/zkoy.sqlite"): Db {
  return new Db(path);
}
