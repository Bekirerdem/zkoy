// Kasım 2026 denetiminde bulunan hataların her biri için bir test: oyunu
// kilitleyenler, mühür hattını durdurabilenler, kötüye kullanılabilenler.

import { afterAll, describe, expect, test } from "bun:test";
import { MemoEvent } from "../src/engine/types";
import { Db } from "../src/server/db";
import { startServer } from "../src/server/index";
import { Room } from "../src/server/room";
import { SealQueue } from "../src/server/seal-queue";
import { privateView, publicView } from "../src/server/views";
import { MockZcashService } from "../src/zcash/mock";
import { seat } from "./play";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const act = (room: Room, pid: string, a: string, extra: Record<string, unknown> = {}) =>
  room.act(pid, { t: "act", a, ...extra } as never);
const cmd = (room: Room, pid: string, c: string, extra: Record<string, unknown> = {}) =>
  room.cmd(pid, { t: "cmd", c, ...extra } as never);

/** 7 kişilik masa, karar oyu açık; `voters` = sanık dışındaki yaşayanlar. */
function atVerdict() {
  const t = seat(7, "KILITT");
  const { room } = t;
  const s = room.state;
  const host = room.hostPid!;
  cmd(room, host, "start");
  cmd(room, host, "closeElection");
  const vamp = s.players.find((p) => p.role === "vampir")!.id;
  const doc = s.players.find((p) => p.role === "doktor")!.id;
  const prey = s.players.find((p) => p.id !== vamp)!.id;
  act(room, vamp, "night", { x: prey });
  act(room, doc, "night", { x: prey }); // doktor yetişir: 7 kişi hayatta
  cmd(room, s.muhtar!, "startDay");
  // Sanık ne Muhtar ne kurucu olsun: kura kimi Muhtar yaparsa yapsın senaryo aynı kalır.
  const accused = s.players.find((p) => p.id !== s.muhtar && p.id !== host)!.id;
  const voters = s.players.filter((p) => p.id !== accused).map((p) => p.id);
  act(room, voters[0]!, "accuse", { x: accused });
  for (const id of voters.slice(1)) if (s.day.stage === "free") act(room, id, "second", { x: accused });
  act(room, accused, "done");
  expect(s.day.stage).toBe("verdict");
  return { ...t, host, accused, voters };
}

describe("oyunu kilitleyenler", () => {
  test("biri oy vermezse karar oyu kapatılabilir: bekleme süresinden sonra, sanık dışında bir yönetici", () => {
    const { room, host, accused, voters } = atVerdict();
    const s = room.state;
    const muhtar = s.muhtar!;
    const plain = voters.filter((v) => v !== muhtar);
    // 3 assın, 3 asmasın (Muhtar 2 sayılır), bir kişi masadan kalkmış: sonuç açık.
    for (const id of plain.slice(0, 3)) act(room, id, "verdict", { y: true });
    act(room, plain[3]!, "verdict", { y: false });
    act(room, muhtar, "verdict", { y: false });
    expect(s.day.stage).toBe("verdict");

    const closer = muhtar;
    expect(() => cmd(room, closer, "closeVerdict")).toThrow("henüz kapatılamaz");
    expect(privateView(room, closer)!.can).not.toContain("closeVerdict");
    room.verdictStartedAt = Date.now() - 61_000;
    expect(privateView(room, closer)!.can).toContain("closeVerdict");
    expect(privateView(room, accused)!.can).not.toContain("closeVerdict");
    const outsider = plain.find((id) => id !== host)!;
    expect(() => cmd(room, outsider, "closeVerdict")).toThrow("Muhtar ya da kurucu");
    expect(() => cmd(room, accused, "closeVerdict")).toThrow("Muhtar ya da kurucu");
    cmd(room, closer, "closeVerdict");
    // Verilmeyen oy "asmasın": 3'e karşı 3+ → beraat, gün sürer.
    expect(s.day.stage).toBe("free");
    expect(s.lastVerdict).toMatchObject({ accused, lynched: null });
    expect(room.verdictStartedAt).toBeNull();
    expect(room.announcements.at(-1)!.text).toContain("beraat etti");
  });

  test("sanık Muhtar'sa kendi davasını kapatamaz", () => {
    const { room, accused } = atVerdict();
    room.state.muhtar = accused; // sanık makamda
    room.hostPid = accused;
    room.verdictStartedAt = 0;
    expect(() => cmd(room, accused, "closeVerdict")).toThrow("sanık kendi davasını kapatamaz");
  });

  test("kurucu koparsa masadaki biri devralır; kurucu bağlıyken devralınamaz", () => {
    const { room } = seat(5, "DEVRAL");
    const host = room.hostPid!;
    const guest = room.state.players[2]!.id;
    room.presence(host, 1);
    room.presence(guest, 1);
    expect(() => cmd(room, guest, "claimHost")).toThrow("kurucu masada");
    room.presence(host, -1);
    expect(room.hostAway()).toBe(false); // henüz iki dakika olmadı
    expect(() => cmd(room, guest, "claimHost")).toThrow("kurucu masada");
    (room as unknown as { awaySince: Map<string, number> }).awaySince.set(host, Date.now() - 119_000);
    expect(room.hostAway()).toBe(false);
    (room as unknown as { awaySince: Map<string, number> }).awaySince.set(host, Date.now() - 121_000);
    expect(room.hostAway()).toBe(true);
    expect(privateView(room, guest)!.can).toContain("claimHost");
    expect(privateView(room, host)!.can).not.toContain("claimHost");
    cmd(room, guest, "claimHost");
    expect(room.hostPid).toBe(guest);
    expect(privateView(room, guest)!.can).toContain("start");
    expect(room.announcements.at(-1)!.text).toContain("devraldı");
    // Eski kurucu dönerse sıradan oyuncudur.
    room.presence(host, 1);
    expect(() => cmd(room, host, "start")).toThrow("kurucu");
  });

  test("anlık görüntü: kilit, sıra numarası ve test etiketi geri gelir; kura aynı kalır", async () => {
    const db = new Db(":memory:");
    const zcash = new MockZcashService();
    const seals = new SealQueue(db, zcash);
    const room = new Room("GERIGL", { db, zcash, seals }, {}, { test: true });
    for (let i = 0; i < 7; i++) room.join(`d${i}`, `o${i}`, `0${i}`);
    const commit = room.state.seedCommit;
    cmd(room, room.hostPid!, "start");
    const back = Room.restore(db.getSnapshot("GERIGL")!, { db, zcash, seals });
    expect(back.test).toBe(true);
    expect(back.state.seedCommit).toBe(commit);
    cmd(back, back.hostPid!, "closeElection");
    const last = db.gameEvents(back.gameId!).map((e) => JSON.parse(e.memo).i as number);
    expect(last).toEqual(last.map((_, k) => k)); // 0..n, boşluksuz
    expect(db.stats()).toMatchObject({ games: 0, testGames: 1 });
  });
});

describe("mühür hattı", () => {
  test("lobide hiçbir şey mühürlenmez; cüzdan oyun başlayınca açılır", async () => {
    const t = seat(8, "LOBIII");
    const wallets: string[] = [];
    const real = t.zcash.createRoomWallet.bind(t.zcash);
    t.zcash.createRoomWallet = async (code: string) => {
      wallets.push(code);
      return real(code);
    };
    cmd(t.room, t.room.hostPid!, "kick", { x: "p3" });
    t.room.join("geç", "Geç Gelen");
    expect(() => act(t.room, "p1", "will", { txt: "lobiden vasiyet" })).toThrow("oyun sırasında");
    t.seals.release("LOBIII");
    await t.seals.flush();
    expect(t.zcash.sent).toEqual([]);
    expect(t.seals.pendingCount("LOBIII")).toBe(0);
    expect(wallets).toEqual([]);
    cmd(t.room, t.room.hostPid!, "start");
    await sleep(5);
    expect(wallets).toEqual(["LOBIII"]);
    expect(t.room.ufvk).toContain("uviewtest");
    // Kadro, masadan atılan ve sonradan gelenle birlikte, başlangıçta mühürlenir.
    const seats = t.db.gameEvents(t.room.gameId!).map((e) => JSON.parse(e.memo)).filter((m) => m.t === "seat");
    expect(seats.map((m) => `${m.p}:${m.name}`)).toEqual(t.room.state.players.map((p) => `${p.id}:${p.name}`));
  });

  test("bir oyuncu bir turda sınırsız hamle üretemez", () => {
    const { room } = seat(7, "SPAMMM");
    cmd(room, room.hostPid!, "start");
    cmd(room, room.hostPid!, "closeElection");
    let refused = 0;
    for (let i = 0; i < 500; i++) {
      try {
        act(room, "p1", "will", { txt: `x${i}` });
      } catch (e) {
        expect(String(e)).toContain("çok fazla hamle");
        refused++;
      }
    }
    expect(refused).toBe(420); // 80 hamle geçer, gerisi reddedilir
    // Yeni turda hak yenilenir.
    room.nightStartedAt = 0;
    cmd(room, room.hostPid!, "closeNight");
    cmd(room, room.state.muhtar ?? room.hostPid!, "startDay");
    cmd(room, room.state.muhtar ?? room.hostPid!, "closeDay");
    if (room.state.players.find((p) => p.id === "p1")!.alive) act(room, "p1", "will", { txt: "yeni tur" });
  });

  test("uzun tur birden çok tx'e bölünür, hiçbir tx sınırı aşmaz", async () => {
    const db = new Db(":memory:");
    const zcash = new MockZcashService();
    const seals = new SealQueue(db, zcash, { maxOutputs: 10 });
    const ev = (n: number): MemoEvent[] => Array.from({ length: n }, (_, k) => ({ to: "room" as const, memo: { v: 4, g: "UZUNNN", t: "will", k } }));
    for (const n of [4, 4, 4, 25, 3]) seals.enqueue("UZUNNN", ev(n), []);
    seals.release("UZUNNN");
    await seals.flush();
    expect(zcash.sent.map((b) => b.events.length)).toEqual([8, 4, 25, 3]); // tek satır bölünmez, yalnız gider
    expect(seals.pendingCount("UZUNNN")).toBe(0);
  });

  test("bir odanın düşen mührü diğer odaları bekletmez; kendi sırası gelince yeniden denenir", async () => {
    const db = new Db(":memory:");
    const zcash = new MockZcashService();
    const real = zcash.send.bind(zcash);
    let broken = true;
    let attempts = 0;
    zcash.send = async (code, events) => {
      if (code === "BOZUKK" && broken) {
        attempts++;
        throw new Error("lightwalletd yanıt vermedi");
      }
      return real(code, events);
    };
    const seals = new SealQueue(db, zcash, { retryMs: 40, maxBackoffMs: 200 });
    const one: MemoEvent[] = [{ to: "room", memo: { v: 4, g: "x", t: "will" } }];
    seals.enqueue("BOZUKK", one, []);
    seals.enqueue("SAGLAM", one, []);
    seals.release("BOZUKK");
    seals.release("SAGLAM");
    await sleep(120);
    expect(zcash.sent.map((b) => b.code)).toEqual(["SAGLAM"]);
    expect(seals.failing()[0]).toMatchObject({ code: "BOZUKK" });
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(attempts).toBeLessThan(6); // artan aralık: sürekli vurmaz
    broken = false;
    await seals.flush();
    expect(zcash.sent.map((b) => b.code)).toEqual(["SAGLAM", "BOZUKK"]);
    expect(seals.failing()).toEqual([]);
  });

  test("512 baytı aşan memo kuyruğa hiç girmez, yanındaki olaylar gider", async () => {
    const db = new Db(":memory:");
    const zcash = new MockZcashService();
    const seals = new SealQueue(db, zcash);
    const game = db.createGame("BUYUKK", [], "c");
    const events: MemoEvent[] = [
      { to: "room", memo: { v: 4, g: "BUYUKK", t: "will", txt: "kısa" } },
      { to: "room", memo: { v: 4, g: "BUYUKK", t: "will", txt: "€".repeat(200) } },
    ];
    seals.enqueue("BUYUKK", events, db.logEvents(game, "BUYUKK", 1, "NIGHT", events));
    seals.release("BUYUKK");
    await seals.flush();
    expect(zcash.sent.length).toBe(1);
    expect(zcash.sent[0]!.events.length).toBe(1);
    expect(db.gameEvents(game).map((e) => !!e.txid)).toEqual([true, false]);
  });
});

describe("sunucu", () => {
  const app = startServer({ port: 0, db: new Db(":memory:"), zcash: new MockZcashService(), webDir: "web" });
  const base = `127.0.0.1:${app.server.port}`;
  afterAll(() => app.server.stop(true));

  async function client(device: string) {
    const ws = new WebSocket(`ws://${base}/ws`);
    const frames: any[] = [];
    ws.onmessage = (ev) => frames.push(JSON.parse(String(ev.data)));
    await new Promise((r) => (ws.onopen = r));
    const send = (m: unknown) => ws.send(JSON.stringify(m));
    const until = async (pred: (f: any) => boolean) => {
      for (let k = 0; k < 200; k++) {
        const f = frames.find(pred);
        if (f) return f;
        await sleep(10);
      }
      throw new Error("zaman aşımı");
    };
    send({ t: "hello", device });
    return { ws, send, until, frames };
  }

  test("güvenlik başlıkları her cevapta; statik yol kökün dışına çıkamaz", async () => {
    for (const path of ["/", "/app.js", "/stats", "/yok"]) {
      const res = await fetch(`http://${base}${path}`);
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    }
    expect((await fetch(`http://${base}/app.js`)).status).toBe(200);
    expect((await fetch(`http://${base}/..%2fpackage.json`)).status).toBe(404);
  });

  test("soket başına hız sınırı: art arda mesaj yağdıran reddedilir, bağlantı açık kalır", async () => {
    const c = await client("hızlı");
    for (let i = 0; i < 80; i++) c.send({ t: "watch", code: "YOKYOK" });
    const err = await c.until((f) => f.t === "error" && /çok hızlı|çok fazla deneme/.test(f.e));
    expect(err).toBeTruthy();
    expect(c.ws.readyState).toBe(1);
    c.ws.close();
  });

  test("test masası: kurulurken etiketlenir, sayaçlara girmez; biten oyunun kaydı koduyla okunur ve doğrulanır", async () => {
    const { verifyGame } = await import("../src/verify/verify");
    const host = await client("kurucu");
    host.send({ t: "create", name: "Kurucu", n: "abcd", test: true });
    const j = await host.until((f) => f.t === "joined");
    const st = await host.until((f) => f.t === "state");
    expect(st.s.test).toBe(true);
    expect(st.s.seedCommit).toMatch(/^[0-9a-f]{64}$/); // kilit lobiden itibaren görünür
    expect((await fetch(`http://${base}/g/${j.code}.json`)).status).toBe(404);

    // Masayı doldur, oyunu sunucu tarafında sonuna kadar oynat.
    const room = app.rooms.get(j.code)!;
    for (let i = 1; i < 7; i++) room.join(`misafir${i}`, `Misafir ${i}`, `0${i}`);
    const { playRandom } = await import("./play");
    // playRandom başlatmayı da yapar; kurucu p0.
    expect(await playRandom({ room, db: app.db, zcash: app.zcash as MockZcashService, seals: app.seals }, 5)).toBe(true);

    const stats = await (await fetch(`http://${base}/stats`)).json();
    expect(stats).toMatchObject({ games: 0, testGames: 1, sealsFailing: 0 });
    expect((await (await fetch(`http://${base}/games`)).json()).games).toEqual([]);

    const res = await fetch(`http://${base}/g/${j.code.toLowerCase()}.json`);
    expect(res.status).toBe(200);
    const record = await res.json();
    expect(record).toMatchObject({ v: 4, code: j.code, test: true, players: 7, unsealed: 0 });
    expect(record.reveal.ufvk).toContain("uviewtest");
    expect(verifyGame(record.memos).ok).toBe(true);
    host.ws.close();
  });

  test("kurucunun soketi kapanınca oda bunu bilir; geri gelince devralma kapanır", async () => {
    const host = await client("giden-kurucu");
    host.send({ t: "create", name: "Giden" });
    const j = await host.until((f) => f.t === "joined");
    const room = app.rooms.get(j.code)!;
    const guest = await client("kalan");
    guest.send({ t: "join", code: j.code, name: "Kalan" });
    await guest.until((f) => f.t === "joined");
    host.ws.close();
    await sleep(50);
    (room as unknown as { awaySince: Map<string, number> }).awaySince.set(j.pid, Date.now() - 121_000);
    expect(publicView(room, app.seals, "mock").hostAway).toBe(true);
    const back = await client("giden-kurucu");
    back.send({ t: "hello", device: "giden-kurucu", code: j.code, token: j.token });
    await back.until((f) => f.t === "me");
    expect(room.hostAway()).toBe(false);
    guest.send({ t: "cmd", c: "claimHost" });
    const err = await guest.until((f) => f.t === "error");
    expect(err.e).toContain("kurucu masada");
    for (const x of [guest, back]) x.ws.close();
  });
});
