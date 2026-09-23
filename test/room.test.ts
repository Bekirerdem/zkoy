import { describe, expect, test } from "bun:test";
import { Db } from "../src/server/db";
import { Room, RoomDeps } from "../src/server/room";
import { SealQueue } from "../src/server/seal-queue";
import { privateView, publicView } from "../src/server/views";
import { MockZcashService } from "../src/zcash/mock";

function deps(): RoomDeps & { zcash: MockZcashService } {
  const db = new Db(":memory:");
  const zcash = new MockZcashService();
  return { db, zcash, seals: new SealQueue(db, zcash) };
}

async function lobby(n: number) {
  const d = deps();
  const room = new Room("ABCDEF", d);
  await room.init();
  const pids: string[] = [];
  for (let i = 0; i < n; i++) pids.push(room.join(`dev${i}`, `oyuncu${i}`).pid);
  return { room, d, pids };
}

const alive = (room: Room) => room.state.players.filter((p) => p.alive).map((p) => p.id);
const roleOf = (room: Room, id: string) => room.state.players.find((p) => p.id === id)!.role;

/** Plays until END: vampires eat the first villager, the day lynches a living vampire. */
async function playOut(room: Room, host: string) {
  const s = room.state;
  let guard = 0;
  while (s.phase !== "END" && guard++ < 60) {
    const liv = alive(room);
    if (s.phase === "ELECTION") {
      room.act(liv[1]!, { t: "act", a: "nominate" });
      for (const id of liv) room.act(id, { t: "act", a: "mvote", x: liv[1]! });
    } else if (s.phase === "NIGHT") {
      const vamps = liv.filter((id) => roleOf(room, id) === "vampir");
      const prey = liv.find((id) => roleOf(room, id) !== "vampir")!;
      for (const id of liv) {
        const r = roleOf(room, id);
        if (r === "vampir") room.act(id, { t: "act", a: "night", x: prey });
        else if (r === "doktor") room.act(id, { t: "act", a: "night", x: id });
        else if (r === "gozcu") room.act(id, { t: "act", a: "night", x: vamps[0]! });
        if (s.phase !== "NIGHT") break;
      }
    } else if (s.phase === "DAWN") {
      room.cmd(s.muhtar ?? host, { t: "cmd", c: "startDay" });
    } else if (s.phase === "DAY") {
      const target = liv.find((id) => roleOf(room, id) === "vampir")!;
      const others = liv.filter((id) => id !== target);
      room.act(others[0]!, { t: "act", a: "accuse", x: target });
      room.act(others[1]!, { t: "act", a: "second", x: target });
      room.act(target, { t: "act", a: "done" });
      for (const id of others) if (s.day.stage === "verdict") room.act(id, { t: "act", a: "verdict", y: true });
    } else if (s.phase === "EXECUTION") {
      if (s.heirPending) room.act(s.heirPending, { t: "act", a: "heir", x: alive(room)[0]! });
      room.cmd(s.muhtar ?? host, { t: "cmd", c: "nextRound" });
    }
  }
}

describe("Room", () => {
  test("tam oyun: kurucu başlatır, END'de oyun kaydı + gameroot mühürlenir", async () => {
    const { room, d, pids } = await lobby(8);
    expect(() => room.cmd(pids[3]!, { t: "cmd", c: "start" })).toThrow("kurucu");
    room.cmd(pids[0]!, { t: "cmd", c: "start" });
    expect(room.state.phase).toBe("ELECTION");
    await playOut(room, pids[0]!);
    expect(room.state.phase).toBe("END");
    await d.seals.flush();
    const st = d.db.stats();
    expect(st.games).toBe(1);
    expect(st.finishedGames).toBe(1);
    expect(st.uniqueDevices).toBe(8);
    const memos = d.zcash.sent.flatMap((b) => b.events.map((e) => e.memo));
    expect(memos.some((m) => m.t === "gameroot")).toBe(true);
    expect(memos.every((m) => m.v === 3)).toBe(true);
    const pub = publicView(room, d.seals, "mock");
    expect(pub.reveal?.salt).toBeTruthy();
    expect(pub.seals.pending).toBe(0);
    expect(pub.seals.memoCount).toBeGreaterThan(20);
  });

  test("meydan gece rol sızdırmaz; vampir takımını görür", async () => {
    const { room, d, pids } = await lobby(10);
    room.cmd(pids[0]!, { t: "cmd", c: "start" });
    const pub = publicView(room, d.seals, "mock");
    expect(pub.players.every((p) => p.role === null)).toBe(true);
    const json = JSON.stringify(pub);
    for (const r of ["vampir", "doktor", "gozcu", "deli", "koylu"]) expect(json.includes(`:"${r}"`)).toBe(false);
    const vamps = room.state.players.filter((p) => p.role === "vampir").map((p) => p.id);
    expect(vamps.length).toBe(2);
    expect(privateView(room, vamps[0]!)!.team).toEqual([vamps[1]!]);
    const villager = room.state.players.find((p) => p.role === "koylu")!.id;
    expect(privateView(room, villager)!.team).toEqual([]);
  });

  test("yetki: Muhtar olmayan günü kapatamaz; sanık 'bitti' deyince karar oyu açılır", async () => {
    const { room, pids } = await lobby(8);
    const host = pids[0]!;
    room.cmd(host, { t: "cmd", c: "start" });
    for (const id of pids) room.act(id, { t: "act", a: "nominate" });
    for (const id of pids) room.act(id, { t: "act", a: "mvote", x: pids[2]! });
    expect(room.state.muhtar).toBe(pids[2]!);
    // sessiz gece: kurucu zorla kapatamaz (90 sn dolmadı)
    expect(() => room.cmd(host, { t: "cmd", c: "closeNight" })).toThrow("bekleyin");
    room.nightStartedAt = Date.now() - 100_000;
    room.cmd(host, { t: "cmd", c: "closeNight" });
    expect(room.state.phase).toBe("DAWN");
    const plain = pids.find((p) => p !== host && p !== pids[2])!;
    expect(() => room.cmd(plain, { t: "cmd", c: "startDay" })).toThrow("Muhtar");
    room.cmd(pids[2]!, { t: "cmd", c: "startDay" });
    room.act(pids[3]!, { t: "act", a: "accuse", x: pids[4]! });
    room.act(pids[5]!, { t: "act", a: "second", x: pids[4]! });
    expect(room.state.day.stage).toBe("trial");
    expect(() => room.cmd(plain === pids[4] ? pids[6]! : plain, { t: "cmd", c: "closeDay" })).toThrow();
    room.act(pids[4]!, { t: "act", a: "done" });
    expect(room.state.day.stage).toBe("verdict");
    expect(privateView(room, pids[4]!)!.can.includes("verdict")).toBe(false);
  });

  test("anlık görüntüden geri yükleme aynı yerden devam eder; token geçerli kalır", async () => {
    const { room, d, pids } = await lobby(7);
    const tok = room.join("dev6", "oyuncu6").token; // aynı cihaz = aynı koltuk
    room.cmd(pids[0]!, { t: "cmd", c: "start" });
    const row = d.db.loadSnapshots(60_000).find((r) => r.code === "ABCDEF")!;
    const back = Room.restore(row.json, d);
    expect(back.state.phase).toBe("ELECTION");
    expect(back.auth(tok)).toBe(pids[6]!);
    expect(back.state.players.length).toBe(7);
  });
});
