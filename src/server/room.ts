// Oda katmanı (SPEC v3 §7): saf v2 motorunu sürer. Salon modu sayaçsızdır;
// faz geçişi iki tetikle olur: aktörler tamamladı ya da Muhtar/kurucu komutu.
// Yetki burada denetlenir (§10), her olay SQLite'a ve mühür kuyruğuna gider.

import * as engine from "../engine/engine";
import { EngineError } from "../engine/engine";
import { MemoEvent, Role, RoomRules, RoomState } from "../engine/types";
import { ZcashService } from "../zcash/service";
import { Db } from "./db";
import { ActMsg, CmdMsg } from "./protocol";
import { SealQueue } from "./seal-queue";

export const MIN_PLAYERS = Number(process.env.ZKOY_MIN_PLAYERS ?? engine.MIN_PLAYERS);
/** Salon sigortası: kurucu geceyi ancak bu kadar sonra zorla kapatabilir. */
export const NIGHT_FORCE_MS = Number(process.env.ZKOY_NIGHT_FORCE_MS ?? 90_000);

export interface Announcement {
  at: number;
  kind: "info" | "dawn" | "verdict" | "end";
  text: string;
  will?: string | null;
}

export interface GozcuEntry {
  round: number;
  target: string;
  vamp: boolean;
}

export function sha256Hex(input: string): string {
  const h = new Bun.CryptoHasher("sha256");
  h.update(input);
  return h.digest("hex");
}

function randomInt(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1;
}

const ROLE_TR: Record<Role, string> = {
  vampir: "vampir",
  koylu: "köylü",
  doktor: "doktor",
  gozcu: "gözcü",
  deli: "deli",
};

export interface RoomDeps {
  db: Db;
  zcash: ZcashService;
  seals: SealQueue;
}

interface Snapshot {
  state: RoomState;
  hostPid: string | null;
  devices: Record<string, string>;
  tokens: Record<string, string>;
  announcements: Announcement[];
  gameId: number | null;
  nightStartedAt: number | null;
  gameMemos: string[];
  gozcuLog: GozcuEntry[];
  address: string;
  ufvk: string;
}

export class Room {
  state: RoomState;
  hostPid: string | null = null;
  /** pid → device key (tekil kullanıcı sayacı). */
  devices = new Map<string, string>();
  /** sha256(token) → pid. */
  private tokens = new Map<string, string>();
  announcements: Announcement[] = [];
  gameId: number | null = null;
  nightStartedAt: number | null = null;
  gozcuLog: GozcuEntry[] = [];
  address = "";
  ufvk = "";
  /** Memo JSON of this game, in order — hashed into the END `gameroot`. */
  private gameMemos: string[] = [];
  onChange: () => void = () => {};

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
    rules: Partial<RoomRules> = {},
  ) {
    this.state = engine.createRoom(code, rules);
  }

  /** Room wallet (offline, instant); UFVK is revealed at END. */
  async init(): Promise<void> {
    const w = await this.deps.zcash.createRoomWallet(this.code);
    this.address = w.address;
    this.ufvk = w.ufvk;
  }

  static restore(json: string, deps: RoomDeps): Room {
    const s = JSON.parse(json) as Snapshot;
    const room = new Room(s.state.code, deps);
    room.state = s.state;
    room.hostPid = s.hostPid;
    room.devices = new Map(Object.entries(s.devices));
    room.tokens = new Map(Object.entries(s.tokens));
    room.announcements = s.announcements;
    room.gameId = s.gameId;
    room.nightStartedAt = s.nightStartedAt;
    room.gameMemos = s.gameMemos;
    room.gozcuLog = s.gozcuLog;
    room.address = s.address;
    room.ufvk = s.ufvk;
    return room;
  }

  private snapshot(): string {
    const s: Snapshot = {
      state: this.state,
      hostPid: this.hostPid,
      devices: Object.fromEntries(this.devices),
      tokens: Object.fromEntries(this.tokens),
      announcements: this.announcements,
      gameId: this.gameId,
      nightStartedAt: this.nightStartedAt,
      gameMemos: this.gameMemos,
      gozcuLog: this.gozcuLog,
      address: this.address,
      ufvk: this.ufvk,
    };
    return JSON.stringify(s);
  }

  /* ── kimlik ── */

  join(deviceKey: string, name: string): { pid: string; token: string } {
    const clean = name.trim().slice(0, 16);
    if (!clean) throw new EngineError("ad boş olamaz");
    // Aynı cihaz lobiye yeniden girerse aynı koltuğu alır.
    for (const [pid, dev] of this.devices)
      if (dev === deviceKey) return { pid, token: this.issueToken(pid) };
    const pid = `p${this.nextSeat()}`;
    const events = engine.join(this.state, pid, clean);
    this.devices.set(pid, deviceKey);
    this.hostPid ??= pid;
    this.deps.db.touchDevice(deviceKey, clean);
    const token = this.issueToken(pid);
    this.commit(events);
    return { pid, token };
  }

  private nextSeat(): number {
    const used = new Set(this.state.players.map((p) => Number(p.id.slice(1))));
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }

  private issueToken(pid: string): string {
    const token = crypto.randomUUID();
    this.tokens.set(sha256Hex(token), pid);
    return token;
  }

  auth(token: string): string {
    const pid = this.tokens.get(sha256Hex(token));
    if (!pid) throw new EngineError("oturum geçersiz, odaya yeniden katıl");
    return pid;
  }

  isHost(pid: string): boolean {
    return pid === this.hostPid;
  }

  isMuhtar(pid: string): boolean {
    return pid === this.state.muhtar;
  }

  /** Muhtar yoksa (ölü, halefsiz) kurucu yürütür. */
  private requireLeader(pid: string) {
    if (!this.isMuhtar(pid) && !this.isHost(pid))
      throw new EngineError("bunu yalnız Muhtar ya da kurucu yapar");
  }

  private requireHost(pid: string) {
    if (!this.isHost(pid)) throw new EngineError("bunu yalnız kurucu yapar");
  }

  private name(pid: string | null): string {
    return this.state.players.find((p) => p.id === pid)?.name ?? "?";
  }

  /* ── oyuncu hamleleri ── */

  act(pid: string, m: ActMsg): void {
    const s = this.state;
    const need = (v: string | undefined): string => {
      if (!v) throw new EngineError("hedef seçilmedi");
      return v;
    };
    let events: MemoEvent[] = [];
    switch (m.a) {
      case "nominate":
        events = engine.nominate(s, pid);
        break;
      case "mvote":
        events = engine.electionVote(s, pid, need(m.x));
        if (engine.electionComplete(s)) events.push(...this.resolveElection());
        break;
      case "night":
        events = engine.nightAction(s, pid, need(m.x));
        if (engine.nightComplete(s)) events.push(...this.resolveNight());
        break;
      case "accuse":
        events = engine.accuse(s, pid, need(m.x));
        break;
      case "second":
        events = engine.second(s, pid, need(m.x));
        this.announce("verdict", `${this.name(s.day.trial!.accused)} yargılanıyor. Savunma başladı.`);
        break;
      case "done":
        events = engine.openVerdict(s, pid);
        break;
      case "verdict":
        if (m.y === undefined) throw new EngineError("oy seçilmedi");
        events = engine.castVerdict(s, pid, m.y);
        if (s.lastVerdict && s.day.stage === "free") this.afterVerdict(events);
        break;
      case "gvote":
        events = engine.gvote(s, pid, need(m.x));
        break;
      case "will":
        events = engine.setWill(s, pid, m.txt ?? "");
        break;
      case "heir":
        events = engine.nameHeir(s, pid, need(m.x));
        this.announce("info", `Yeni Muhtar: ${this.name(s.muhtar)}.`);
        break;
    }
    this.commit(events);
  }

  /* ── kurucu / Muhtar komutları ── */

  cmd(pid: string, m: CmdMsg): void {
    const s = this.state;
    let events: MemoEvent[] = [];
    switch (m.c) {
      case "start":
        this.requireHost(pid);
        events = this.start();
        break;
      case "closeElection":
        this.requireHost(pid);
        events = this.resolveElection();
        break;
      case "closeNight":
        this.requireHost(pid);
        if (s.phase !== "NIGHT") throw new EngineError("gece değil");
        if (Date.now() - (this.nightStartedAt ?? 0) < NIGHT_FORCE_MS)
          throw new EngineError("gece henüz zorla kapatılamaz, biraz bekleyin");
        events = this.resolveNight();
        break;
      case "startDay":
        this.requireLeader(pid);
        events = engine.startDay(s, this.isMuhtar(pid) ? "muhtar" : "host");
        break;
      case "toVerdict":
        this.requireLeader(pid);
        events = this.isMuhtar(pid)
          ? engine.openVerdict(s, pid)
          : engine.openVerdict(s, null, { force: true, by: "host" });
        break;
      case "closeDay":
        this.requireLeader(pid);
        events = engine.closeDay(s, this.isMuhtar(pid) ? "muhtar" : "host");
        break;
      case "nextRound":
        this.requireLeader(pid);
        events = engine.nextRound(s, this.isMuhtar(pid) ? "muhtar" : "host");
        break;
      case "kick": {
        this.requireHost(pid);
        if (s.phase !== "LOBBY") throw new EngineError("oyun başladıktan sonra atılmaz");
        const target = m.x;
        if (!target || target === pid) throw new EngineError("geçersiz hedef");
        s.players = s.players.filter((p) => p.id !== target);
        this.devices.delete(target);
        for (const [h, p] of this.tokens) if (p === target) this.tokens.delete(h);
        break;
      }
    }
    this.commit(events);
  }

  private start(): MemoEvent[] {
    const seed = randomInt();
    const salt = crypto.randomUUID();
    const commit = sha256Hex(`${seed}|${salt}`);
    const events = engine.start(this.state, seed, commit, MIN_PLAYERS);
    this.state.seedSalt = salt;
    this.gameMemos = [];
    this.gameId = this.deps.db.createGame(
      this.code,
      this.state.players.map((p) => ({
        pid: p.id,
        deviceKey: this.devices.get(p.id) ?? "",
        name: p.name,
        role: p.role,
      })),
      commit,
    );
    // Rol kompozisyonu herkese açık (17 Ağu salon dersi).
    const n = (r: Role) => this.state.players.filter((p) => p.role === r).length;
    const parts = [`${n("vampir")} vampir`, "1 doktor"];
    if (n("gozcu")) parts.push("1 gözcü");
    if (n("deli")) parts.push("1 deli");
    this.announce("info", `Köyde ${parts.join(", ")} var. Önce Muhtar'ı seçin.`);
    return events;
  }

  private resolveElection(): MemoEvent[] {
    const events = engine.resolveElection(this.state, randomInt());
    this.announce("info", `Köyün Muhtarı ${this.name(this.state.muhtar)}. Gece çöküyor.`);
    return events;
  }

  private resolveNight(): MemoEvent[] {
    const s = this.state;
    const gozcu = s.players.find((p) => p.role === "gozcu" && p.alive);
    const events = engine.resolveNight(s);
    const ln = s.lastNight!;
    if (ln.gozcuResult && gozcu) this.gozcuLog.push({ round: ln.round, ...ln.gozcuResult });
    if (ln.died) {
      const dead = s.players.find((p) => p.id === ln.died)!;
      this.announce("dawn", `Sabah ${dead.name} ölü bulundu. O bir ${ROLE_TR[dead.role!]}ydı.`, dead.will);
    } else {
      this.announce("dawn", ln.saved ? "Gece saldırı oldu ama doktor yetişti. Kimse ölmedi." : "Sessiz bir gece. Kimse ölmedi.");
    }
    if (s.phase === "END") this.announceEnd();
    return events;
  }

  private afterVerdict(_events: MemoEvent[]) {
    const v = this.state.lastVerdict!;
    const accused = this.state.players.find((p) => p.id === v.accused)!;
    if (v.lynched)
      this.announce(
        "verdict",
        `${accused.name} asıldı (${v.guilty}-${v.notGuilty}). O bir ${ROLE_TR[accused.role!]}ydı.`,
        accused.will,
      );
    else this.announce("verdict", `${accused.name} beraat etti (${v.guilty}-${v.notGuilty}).`);
    if (this.state.phase === "END") this.announceEnd();
  }

  private announceEnd() {
    const w = this.state.winner === "koy" ? "Köy kazandı!" : "Vampirler kazandı!";
    this.announce("end", this.state.deliWon ? `${w} Deli de asılarak kendi zaferini aldı.` : w);
  }

  private announce(kind: Announcement["kind"], text: string, will?: string | null) {
    this.announcements.push({ at: Date.now(), kind, text, will: will ?? undefined });
    if (this.announcements.length > 50) this.announcements.shift();
  }

  /** Olayları günlüğe + mühür kuyruğuna yaz; faz saatlerini, END'i işle; yayınla. */
  private commit(events: MemoEvent[]) {
    const s = this.state;
    if (events.length > 0) {
      const ids = this.deps.db.logEvents(this.gameId, this.code, s.round, s.phase, events);
      if (this.gameId !== null) for (const e of events) this.gameMemos.push(JSON.stringify(e.memo));
      this.deps.seals.enqueue(this.code, events, ids);
    }
    if (s.phase === "NIGHT" && events.some((e) => e.memo.t === "muhtar" || (e.memo.t === "phase" && e.memo.ph === "NIGHT")))
      this.nightStartedAt = Date.now();
    if (s.phase === "END" && this.gameId !== null && events.some((e) => e.memo.t === "phase" && e.memo.ph === "END"))
      this.finish();
    this.deps.db.saveSnapshot(this.code, this.snapshot());
    this.onChange();
  }

  /** SPEC v3 §9.3 gameroot: olay günlüğünün özet hash'i, oyun sonu mühür. */
  private finish() {
    const h = sha256Hex(this.gameMemos.join("\n"));
    const root: MemoEvent = {
      to: "room",
      memo: { v: 3, g: this.code, t: "gameroot", h, n: this.gameMemos.length, w: this.state.winner },
    };
    const ids = this.deps.db.logEvents(this.gameId, this.code, this.state.round, "END", [root]);
    this.deps.seals.enqueue(this.code, [root], ids);
    this.deps.db.endGame(this.gameId!, this.state.winner, h);
  }
}
