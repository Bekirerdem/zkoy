// A seeded table for tests: plays whole games through the Room layer with
// random but legal moves, including the awkward paths (forced closes, changed
// minds, heirs, wills, ghosts, a kick in the lobby).

import { mulberry32 } from "../src/engine/engine";
import { RoomRules } from "../src/engine/types";
import { Db } from "../src/server/db";
import { Room } from "../src/server/room";
import { SealQueue } from "../src/server/seal-queue";
import { MockZcashService } from "../src/zcash/mock";

export interface Table {
  room: Room;
  db: Db;
  zcash: MockZcashService;
  seals: SealQueue;
}

const NAMES = ["Hasan", "Fadime", "Rıza", "Nuriye", "Cemal", "Şükran", "Kâzım", "Hatice", "Veli", "Zehra", "Osman", "Emine", "Temel", "Gül'naz", "İbo"];
const WILLS = ["Vampir Ahmet'tir, Ali'ye güvenmeyin", "doktor benim…", 'O "masum" değil', "🧛 p3\\p4", "sustum"];

export function seat(n: number, code: string, rules: Partial<RoomRules> = {}, rnd: () => number = Math.random): Table {
  const db = new Db(":memory:");
  const zcash = new MockZcashService();
  const seals = new SealQueue(db, zcash, { holdMaxMs: 3_600_000 });
  const room = new Room(code, { db, zcash, seals }, rules);
  const hex = () => Math.floor(rnd() * 0xffffffff).toString(16).padStart(8, "0");
  for (let i = 0; i < n; i++) room.join(`${code}-d${i}`, NAMES[i]!, i % 5 === 4 ? "" : hex() + hex());
  return { room, db, zcash, seals };
}

/** The room-wallet memos of a table, as a wallet with the viewing key reads them. */
export function roomMemos(t: Table): string[] {
  return t.zcash.sent.flatMap((b) => b.events.filter((e) => e.to === "room").map((e) => JSON.stringify(e.memo)));
}

export function shuffled<T>(xs: T[], rnd: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Plays the seated table to END. Returns false if the guard ran out first. */
export async function playRandom(t: Table, seed: number): Promise<boolean> {
  const { room } = t;
  const s = room.state;
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const chance = (p: number) => rnd() < p;
  const alive = () => s.players.filter((p) => p.alive).map((p) => p.id);
  const roleOf = (id: string) => s.players.find((p) => p.id === id)!.role;
  const host = () => room.hostPid!;
  const leader = () => s.muhtar ?? host();
  const act = (pid: string, a: string, extra: Record<string, unknown> = {}) =>
    room.act(pid, { t: "act", a, ...extra } as never);
  const cmd = (pid: string, c: string) => room.cmd(pid, { t: "cmd", c } as never);

  // A kick and a late guest before the start: the sealed roster must still be the real one.
  if (s.players.length > 8 && chance(0.5)) {
    const out = pick(s.players.filter((p) => p.id !== host())).id;
    room.cmd(host(), { t: "cmd", c: "kick", x: out });
    room.join(`${room.code}-late`, "Geç Gelen", "0f0f0f0f");
  }
  cmd(host(), "start");

  let guard = 0;
  while (s.phase !== "END" && guard++ < 400) {
    if (s.phase === "ELECTION") {
      for (const id of alive()) if (chance(0.3)) act(id, "nominate");
      if (s.election.candidates.length === 0 || chance(0.2)) {
        // nobody (or not everybody) votes; the host closes the election
        for (const id of alive()) if (s.election.candidates.length && chance(0.4)) act(id, "mvote", { x: pick(s.election.candidates) });
        if (s.phase === "ELECTION") cmd(host(), "closeElection");
      } else {
        for (const id of alive()) if (s.phase === "ELECTION") act(id, "mvote", { x: pick(s.election.candidates) });
      }
    } else if (s.phase === "NIGHT") {
      const skip = chance(0.15) ? pick(alive().filter((id) => ["vampir", "doktor", "gozcu"].includes(roleOf(id)!))) : null;
      for (const id of alive()) {
        if (s.phase !== "NIGHT") break;
        const r = roleOf(id);
        if (id === skip) continue;
        const others = alive().filter((x) => x !== id);
        if (r === "vampir") {
          const prey = others.filter((x) => roleOf(x) !== "vampir");
          if (chance(0.3)) act(id, "night", { x: pick(prey) }); // changes their mind
          if (s.phase === "NIGHT") act(id, "night", { x: pick(prey) });
        } else if (r === "doktor") act(id, "night", { x: pick(alive()) });
        else if (r === "gozcu") act(id, "night", { x: pick(others) });
      }
      for (const id of alive()) if (s.phase === "NIGHT" && chance(0.2)) act(id, "will", { txt: pick(WILLS) });
      if (s.phase === "NIGHT") {
        room.nightStartedAt = 0; // the 90 s have passed
        cmd(host(), "closeNight");
      }
    } else if (s.phase === "DAWN" || s.phase === "EXECUTION") {
      if (s.heirPending && chance(0.7)) act(s.heirPending, "heir", { x: pick(alive()) });
      cmd(leader(), s.phase === "DAWN" ? "startDay" : "nextRound");
    } else if (s.phase === "DAY") {
      if (s.day.stage === "free") {
        for (const p of s.players) if (!p.alive && chance(0.5)) act(p.id, "gvote", { x: pick(alive()) });
        if (chance(0.15)) {
          cmd(leader(), "closeDay");
          continue;
        }
        const free = alive().filter((id) => !s.day.triedToday.includes(id));
        if (free.length === 0) {
          cmd(leader(), "closeDay");
          continue;
        }
        const target = pick(free);
        for (const id of shuffled(alive(), rnd)) {
          if (s.day.stage !== "free") break;
          if (id === target || chance(0.25)) continue;
          if (chance(0.15)) {
            const other = pick(alive().filter((x) => x !== id && !s.day.triedToday.includes(x)));
            if (other) act(id, "accuse", { x: other }); // a stray accusation first
            if (s.day.stage !== "free") break;
          }
          if (s.day.backers[target]?.includes(id)) continue;
          act(id, s.day.backers[target] ? "second" : "accuse", { x: target });
        }
        if (s.day.stage === "free" && chance(0.5)) cmd(leader(), "closeDay");
      } else if (s.day.stage === "trial") {
        const accused = s.day.trial!.accused;
        if (chance(0.6)) act(accused, "done");
        else cmd(leader(), "toVerdict");
      } else {
        const accused = s.day.trial!.accused;
        const voters = alive().filter((id) => s.rules.accusedVotes || id !== accused);
        const absent = chance(0.3) ? pick(voters) : null;
        const lean = rnd();
        for (const id of voters) {
          if (s.day.stage !== "verdict") break;
          if (id === absent) continue;
          act(id, "verdict", { y: chance(lean) });
        }
        if (s.day.stage === "verdict") {
          // someone left the table: the vote is closed after the wait
          room.verdictStartedAt = 0;
          const closer = [leader(), host()].find((id) => id !== accused);
          if (closer) cmd(closer, "closeVerdict");
          else act(absent ?? accused, "verdict", { y: false });
        }
      }
    }
  }
  if (s.phase !== "END") return false;
  await t.seals.flush();
  return true;
}
