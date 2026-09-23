// SQLite kalıcılık (SPEC v3 §8, kamp alt kümesi): cihazlar, oyunlar, olay
// günlüğü (her memo'nun ikizi), kalıcı mühür kuyruğu, oda anlık görüntüleri.
// Q4 retro kanıtı `stats()`'tan çıkar: kaç oyun, kaç tekil cihaz, kaç mühür.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
  since: number | null;
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

export class Db {
  readonly sql: Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.sql = new Database(path, { create: true });
    this.sql.exec(SCHEMA);
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

  createGame(code: string, players: GamePlayer[], seedCommit: string): number {
    const res = this.sql
      .query(
        `INSERT INTO games (code, started_at, players, seed_commit) VALUES (?, ?, ?, ?)`,
      )
      .run(code, Date.now(), players.length, seedCommit);
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

  logEvents(
    gameId: number | null,
    code: string,
    round: number,
    phase: string,
    events: MemoEvent[],
  ): number[] {
    const ins = this.sql.query(
      `INSERT INTO events (game_id, code, round, phase, memo, at) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    return events.map((e) =>
      Number(ins.run(gameId, code, round, phase, JSON.stringify(e.memo), now).lastInsertRowid),
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

  stats(): Stats {
    const one = (q: string) => Number((this.sql.query(q).get() as { n: number | null }).n ?? 0);
    const since = (this.sql.query(`SELECT MIN(started_at) AS n FROM games`).get() as {
      n: number | null;
    }).n;
    return {
      games: one(`SELECT COUNT(*) AS n FROM games`),
      finishedGames: one(`SELECT COUNT(*) AS n FROM games WHERE ended_at IS NOT NULL`),
      uniqueDevices: one(`SELECT COUNT(DISTINCT device_key) AS n FROM game_players`),
      playerSeats: one(`SELECT COUNT(*) AS n FROM game_players`),
      sealedTx: one(`SELECT COUNT(DISTINCT txid) AS n FROM events WHERE txid IS NOT NULL`),
      sealedMemos: one(`SELECT COUNT(*) AS n FROM events WHERE txid IS NOT NULL`),
      since,
    };
  }
}

export function openDb(path = process.env.ZKOY_DB ?? "data/zkoy.sqlite"): Db {
  return new Db(path);
}
