// Oda katmanı (SPEC v3 §7): saf motoru sürer. Salon modu sayaçsızdır; faz
// geçişi iki tetikle olur: aktörler tamamladı ya da Muhtar/kurucu komutu.
// Yetki burada denetlenir (§10), her olay SQLite'a ve mühür kuyruğuna gider.

import * as engine from "../engine/engine";
import { EngineError } from "../engine/engine";
import { commitOf, seedFrom, sha256Hex, tieSeedFrom } from "../engine/fair";
import { MemoEvent, Role, RoomRules, RoomState } from "../engine/types";
import { ZcashService } from "../zcash/service";
import { Db } from "./db";
import { Lang, aRole } from "./i18n";
import { ActMsg, CmdMsg } from "./protocol";
import { SealQueue } from "./seal-queue";
import { StoryChapter, buildStory } from "./story";

export { sha256Hex };

export const MIN_PLAYERS = Number(process.env.ZKOY_MIN_PLAYERS ?? engine.MIN_PLAYERS);
/** Salon sigortası: kurucu geceyi ancak bu kadar sonra zorla kapatabilir. */
export const NIGHT_FORCE_MS = Number(process.env.ZKOY_NIGHT_FORCE_MS ?? 90_000);
/** Oy vermeyen biri oyunu kilitlemesin: karar oyu bu kadar sonra kapatılabilir. */
export const VERDICT_FORCE_MS = Number(process.env.ZKOY_VERDICT_FORCE_MS ?? 60_000);
/**
 * Kurucunun bağlantısı bu kadar süre yoksa masadaki biri odayı devralabilir.
 * İki dakika: kurucu linki paylaşmak için başka uygulamaya geçtiğinde masa elinden gitmesin.
 */
export const HOST_AWAY_MS = Number(process.env.ZKOY_HOST_AWAY_MS ?? 120_000);
/** Bir oyuncunun bir turda yapabileceği hamle sayısı (her biri bir memo olabilir). */
const ROUND_ACT_LIMIT = Number(process.env.ZKOY_ROUND_ACT_LIMIT ?? 80);

export interface Announcement {
  at: number;
  kind: "info" | "dawn" | "verdict" | "end";
  text: string;
  /** The same announcement in English. */
  en?: string;
  will?: string | null;
}

export interface GozcuEntry {
  round: number;
  target: string;
  vamp: boolean;
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "O bir ___" — ünlü uyumu elle, ek üretimi yok. */
const ROLE_WAS: Record<Role, string> = {
  vampir: "vampirdi",
  koylu: "köylüydü",
  doktor: "doktordu",
  gozcu: "gözcüydü",
  deli: "deliydi",
};

export interface RoomDeps {
  db: Db;
  zcash: ZcashService;
  seals: SealQueue;
}

export interface RoomOptions {
  /** A labelled test table: it is played and sealed like any other, but never counted. */
  test?: boolean;
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
  // Added with memo v4; absent in older snapshots.
  secret?: string;
  seq?: number;
  verdictStartedAt?: number | null;
  test?: boolean;
  lastActivity?: number;
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
  verdictStartedAt: number | null = null;
  /** Son commit'teki faz: faz değişimi mühür paketini kapatır. */
  private lastPhase: RoomState["phase"] = "LOBBY";
  gozcuLog: GozcuEntry[] = [];
  address = "";
  ufvk = "";
  test = false;
  lastActivity = Date.now();
  /** Kuranın sunucu payı; taahhüdü oda kurulurken sabitlenir, END'de açılır. */
  private secret: string;
  /** Memo JSON of this game, in order — hashed into the END `gameroot`. */
  private gameMemos: string[] = [];
  /** Sıradaki memo'nun oyun içi sıra numarası (`i`). */
  private seq = 0;
  /** pid → bu turdaki hamle sayısı. */
  private acts = new Map<string, number>();
  /** pid → açık soket sayısı; pid → bağlantısının koptuğu an. */
  private online = new Map<string, number>();
  private awaySince = new Map<string, number>();
  private readonly bootedAt = Date.now();
  onChange: () => void = () => {};

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
    rules: Partial<RoomRules> = {},
    opts: RoomOptions = {},
  ) {
    this.state = engine.createRoom(code, rules);
    this.secret = randomHex(32);
    // Taahhüt lobiden itibaren herkesin telefonunda: sunucu kurayı, oyuncuların
    // katkısını gördükten sonra seçemez.
    this.state.seedCommit = commitOf(this.secret);
    this.test = opts.test ?? false;
  }

  /** Room wallet (offline, instant); UFVK is revealed at END. */
  async init(): Promise<void> {
    const w = await this.deps.zcash.createRoomWallet(this.code);
    this.address = w.address;
    this.ufvk = w.ufvk;
  }

  /** Cüzdan oyun başlayınca açılır: başlamayan oda diskte ve zincirde iz bırakmaz. */
  private ensureWallet(): void {
    if (this.ufvk || this.walletOpening) return;
    this.walletOpening = true;
    void this.init()
      .then(() => {
        this.deps.db.saveSnapshot(this.code, this.snapshot());
        this.onChange();
      })
      .catch((e) => console.error(`[room] ${this.code} cüzdanı açılamadı:`, String(e).slice(0, 300)))
      .finally(() => (this.walletOpening = false));
  }
  private walletOpening = false;

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
    room.verdictStartedAt = s.verdictStartedAt ?? null;
    room.lastPhase = s.state.phase;
    room.gameMemos = s.gameMemos;
    room.seq = s.seq ?? s.gameMemos.length;
    room.gozcuLog = s.gozcuLog;
    room.address = s.address;
    room.ufvk = s.ufvk;
    room.secret = s.secret ?? s.state.seedSalt ?? room.secret;
    room.test = s.test ?? false;
    room.lastActivity = s.lastActivity ?? Date.now();
    if (room.gameId !== null) room.ensureWallet();
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
      verdictStartedAt: this.verdictStartedAt,
      gameMemos: this.gameMemos,
      seq: this.seq,
      gozcuLog: this.gozcuLog,
      address: this.address,
      ufvk: this.ufvk,
      secret: this.secret,
      test: this.test,
      lastActivity: this.lastActivity,
    };
    return JSON.stringify(s);
  }

  /* ── kimlik ── */

  join(deviceKey: string, name: string, nonce = ""): { pid: string; token: string } {
    this.markAction();
    const clean = name.trim().slice(0, 16);
    if (!clean) throw new EngineError("ad boş olamaz");
    // Aynı cihaz yeniden girerse aynı koltuğu alır.
    for (const [pid, dev] of this.devices)
      if (dev === deviceKey) return { pid, token: this.issueToken(pid) };
    const pid = `p${this.nextSeat()}`;
    engine.join(this.state, pid, clean, nonce);
    this.devices.set(pid, deviceKey);
    this.hostPid ??= pid;
    this.deps.db.touchDevice(deviceKey, clean);
    const token = this.issueToken(pid);
    this.commit([]);
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

  /** İfşa partisi hikâyesi (yalnız END'de anlamlı). */
  story(lang: Lang = "tr"): StoryChapter[] {
    if (this.gameId === null) return [];
    return buildStory(this.deps.db, this.gameId, this.state.players, lang);
  }

  isHost(pid: string): boolean {
    return pid === this.hostPid;
  }

  isMuhtar(pid: string): boolean {
    return pid === this.state.muhtar;
  }

  /* ── bağlantı durumu: kurucu koparsa masa sahipsiz kalmasın ── */

  /** Sunucu, oyuncunun bir soketi açılınca +1, kapanınca -1 bildirir. */
  presence(pid: string, delta: 1 | -1): void {
    const n = Math.max(0, (this.online.get(pid) ?? 0) + delta);
    this.online.set(pid, n);
    if (n === 0) this.awaySince.set(pid, Date.now());
    else this.awaySince.delete(pid);
    if (pid !== this.hostPid) return;
    // Devralma düğmesi süre dolunca belirsin, kurucu dönünce kaybolsun.
    if (n === 0) this.pokeIn(HOST_AWAY_MS + 100);
    else this.onChange();
  }

  /** Kurucunun hiçbir bağlantısı yok ve bu yeterince uzun sürdü. */
  hostAway(): boolean {
    const host = this.hostPid;
    if (!host || (this.online.get(host) ?? 0) > 0) return false;
    return Date.now() - (this.awaySince.get(host) ?? this.bootedAt) >= HOST_AWAY_MS;
  }

  /** Süreye bağlı bir düğme (zorla kapat, devral) hamle beklemeden görünsün. */
  private pokeIn(ms: number): void {
    const t = setTimeout(() => this.onChange(), ms);
    t.unref?.();
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
    this.markAction();
    const used = (this.acts.get(pid) ?? 0) + 1;
    if (used > ROUND_ACT_LIMIT) throw new EngineError("bu tur çok fazla hamle yaptın, biraz bekle");
    this.acts.set(pid, used);
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
      case "second":
        events = m.a === "accuse" ? engine.accuse(s, pid, need(m.x)) : engine.second(s, pid, need(m.x));
        if (s.day.trial)
          this.announce(
            "verdict",
            `${this.name(s.day.trial.accused)} yargılanıyor (${s.day.trial.backers.map((b) => this.name(b)).join(", ")}). Savunma başladı.`,
            `${this.name(s.day.trial.accused)} is on trial (${s.day.trial.backers.map((b) => this.name(b)).join(", ")}). The defence begins.`,
          );
        break;
      case "done":
        events = engine.openVerdict(s, pid);
        break;
      case "verdict":
        if (m.y === undefined) throw new EngineError("oy seçilmedi");
        events = engine.castVerdict(s, pid, m.y);
        if (s.lastVerdict && s.day.stage === "free") this.afterVerdict();
        break;
      case "gvote":
        events = engine.gvote(s, pid, need(m.x));
        break;
      case "will":
        events = engine.setWill(s, pid, m.txt ?? "");
        break;
      case "heir":
        events = engine.nameHeir(s, pid, need(m.x));
        this.announce("info", `Yeni Muhtar: ${this.name(s.muhtar)}.`, `New Muhtar: ${this.name(s.muhtar)}.`);
        break;
    }
    this.commit(events);
  }

  /* ── kurucu / Muhtar komutları ── */

  cmd(pid: string, m: CmdMsg): void {
    const s = this.state;
    this.markAction();
    let events: MemoEvent[] = [];
    switch (m.c) {
      case "start":
        this.requireHost(pid);
        events = this.start();
        break;
      case "closeElection":
        this.requireHost(pid);
        events = this.resolveElection("host");
        break;
      case "closeNight":
        this.requireHost(pid);
        if (s.phase !== "NIGHT") throw new EngineError("gece değil");
        if (Date.now() - (this.nightStartedAt ?? 0) < NIGHT_FORCE_MS)
          throw new EngineError("gece henüz zorla kapatılamaz, biraz bekleyin");
        events = [engine.forceMemo(s, "night", "host"), ...this.resolveNight()];
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
      case "closeVerdict": {
        // Biri oy vermeden masadan kalktıysa oylama sonsuza kadar açık kalmasın.
        // Verilmeyen oy "asmasın" sayılır; sanık kendi davasını kapatamaz.
        this.requireLeader(pid);
        const trial = s.day.trial;
        if (s.phase !== "DAY" || s.day.stage !== "verdict" || !trial)
          throw new EngineError("karar oyu açık değil");
        if (trial.accused === pid) throw new EngineError("sanık kendi davasını kapatamaz");
        if (Date.now() - (this.verdictStartedAt ?? 0) < VERDICT_FORCE_MS)
          throw new EngineError("oylama henüz kapatılamaz, biraz bekleyin");
        const by = this.isMuhtar(pid) ? "muhtar" : "host";
        events = [engine.forceMemo(s, "verdict", by), ...engine.resolveVerdict(s)];
        this.afterVerdict();
        break;
      }
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
        this.online.delete(target);
        this.awaySince.delete(target);
        for (const [h, p] of this.tokens) if (p === target) this.tokens.delete(h);
        break;
      }
      case "claimHost": {
        if (!s.players.some((p) => p.id === pid)) throw new EngineError("masada değilsin");
        if (this.isHost(pid)) throw new EngineError("zaten kurucusun");
        if (!this.hostAway()) throw new EngineError("kurucu masada, devralamazsın");
        const old = this.name(this.hostPid);
        this.hostPid = pid;
        this.announce(
          "info",
          `Kurucu ${old} koptu; masayı ${this.name(pid)} devraldı.`,
          `The host ${old} dropped out; ${this.name(pid)} took over the table.`,
        );
        break;
      }
    }
    this.commit(events);
  }

  private start(): MemoEvent[] {
    // Kura: sunucunun taahhütlü sırrı + her telefonun kendi katkısı.
    const seed = seedFrom(this.secret, this.state.players.map((p) => p.nonce ?? ""));
    const commit = this.state.seedCommit ?? commitOf(this.secret);
    const events = engine.start(this.state, seed, commit, MIN_PLAYERS);
    this.state.seedSalt = this.secret;
    this.gameMemos = [];
    this.seq = 0;
    this.acts.clear();
    this.gameId = this.deps.db.createGame(
      this.code,
      this.state.players.map((p) => ({
        pid: p.id,
        deviceKey: this.devices.get(p.id) ?? "",
        name: p.name,
        role: p.role,
      })),
      commit,
      this.test,
    );
    this.ensureWallet();
    // Rol kompozisyonu herkese açık (17 Ağu salon dersi).
    const n = (r: Role) => this.state.players.filter((p) => p.role === r).length;
    const parts = [`${n("vampir")} vampir`, "1 doktor"];
    const partsEn = [`${n("vampir")} vampire${n("vampir") > 1 ? "s" : ""}`, "1 doctor"];
    if (n("gozcu")) parts.push("1 gözcü"), partsEn.push("1 seer");
    if (n("deli")) parts.push("1 deli"), partsEn.push("1 fool");
    this.announce(
      "info",
      `Köyde ${parts.join(", ")} var. Önce Muhtar'ı seçin.`,
      `The village has ${partsEn.join(", ")}. First, elect the Muhtar.`,
    );
    return events;
  }

  /** `forcedBy`: kurucu, herkes oy vermeden seçimi kapattı. */
  private resolveElection(forcedBy?: string): MemoEvent[] {
    if (this.state.phase !== "ELECTION") throw new EngineError("seçim açık değil");
    const pre = forcedBy ? [engine.forceMemo(this.state, "election", forcedBy)] : [];
    // Eşitlik ya da adaysızlık kurayla çözülür (motor); masaya nedenini söyle.
    const { candidates, votes } = this.state.election;
    const tally = new Map<string, number>();
    for (const c of candidates) tally.set(c, 0);
    for (const c of Object.values(votes)) tally.set(c, (tally.get(c) ?? 0) + 1);
    const top = Math.max(0, ...tally.values());
    const tied = [...tally].filter(([, n]) => n === top).map(([c]) => c);
    // Kuranın tohumu da taahhütlü sırdan türer: sonradan seçilemez, sonunda doğrulanır.
    const events = engine.resolveElection(this.state, tieSeedFrom(this.secret));
    const muhtar = this.name(this.state.muhtar);
    if (candidates.length === 0)
      this.announce(
        "info",
        `Aday çıkmadı, ebe kura çekti: Muhtar ${muhtar}. Gece çöküyor.`,
        `Nobody stood, so the narrator drew lots: ${muhtar} is Muhtar. Night falls.`,
      );
    else if (tied.length > 1)
      this.announce(
        "info",
        `${tied.map((c) => this.name(c)).join(" ile ")} ${top}-${top} berabere kaldı. Ebe kura çekti: Muhtar ${muhtar}. Gece çöküyor.`,
        `${tied.map((c) => this.name(c)).join(" and ")} tied ${top}-${top}. The narrator drew lots: ${muhtar} is Muhtar. Night falls.`,
      );
    else
      this.announce(
        "info",
        `Köyün Muhtarı ${muhtar} (${top} oy). Gece çöküyor.`,
        `${muhtar} is the village's Muhtar (${top} vote${top === 1 ? "" : "s"}). Night falls.`,
      );
    return [...pre, ...events];
  }

  private resolveNight(): MemoEvent[] {
    const s = this.state;
    const gozcu = s.players.find((p) => p.role === "gozcu" && p.alive);
    const events = engine.resolveNight(s);
    const ln = s.lastNight!;
    if (ln.gozcuResult && gozcu) this.gozcuLog.push({ round: ln.round, ...ln.gozcuResult });
    if (ln.died) {
      const dead = s.players.find((p) => p.id === ln.died)!;
      this.announce(
        "dawn",
        `Sabah ${dead.name} ölü bulundu. O bir ${ROLE_WAS[dead.role!]}.`,
        `In the morning ${dead.name} was found dead. They were ${aRole(dead.role!)}.`,
        dead.will,
      );
    } else if (ln.saved) {
      this.announce("dawn", "Gece saldırı oldu ama doktor yetişti. Kimse ölmedi.", "There was an attack, but the doctor got there in time. Nobody died.");
    } else {
      this.announce("dawn", "Sessiz bir gece. Kimse ölmedi.", "A quiet night. Nobody died.");
    }
    if (s.phase === "END") this.announceEnd();
    return events;
  }

  private afterVerdict() {
    const v = this.state.lastVerdict!;
    const accused = this.state.players.find((p) => p.id === v.accused)!;
    if (v.lynched)
      this.announce(
        "verdict",
        `${accused.name} asıldı (${v.guilty}-${v.notGuilty}). O bir ${ROLE_WAS[accused.role!]}.`,
        `${accused.name} was hanged (${v.guilty}-${v.notGuilty}). They were ${aRole(accused.role!)}.`,
        accused.will,
      );
    else
      this.announce(
        "verdict",
        `${accused.name} beraat etti (${v.guilty}-${v.notGuilty}).`,
        `${accused.name} was acquitted (${v.guilty}-${v.notGuilty}).`,
      );
    if (this.state.phase === "END") this.announceEnd();
  }

  private announceEnd() {
    const village = this.state.winner === "koy";
    const w = village ? "Köy kazandı!" : "Vampirler kazandı!";
    const wEn = village ? "The village wins!" : "The vampires win!";
    this.announce(
      "end",
      this.state.deliWon ? `${w} Deli de asılarak kendi zaferini aldı.` : w,
      this.state.deliWon ? `${wEn} The fool was hanged and wins too.` : wEn,
    );
  }

  private announce(kind: Announcement["kind"], text: string, en: string, will?: string | null) {
    this.announcements.push({ at: Date.now(), kind, text, en, will: will ?? undefined });
    if (this.announcements.length > 50) this.announcements.shift();
  }

  /** Olay günlüğü hamlenin YAPILDIĞI fazı yazar (çözümün geçtiği fazı değil). */
  private actionAt = { round: 0, phase: "LOBBY" };
  private markAction() {
    this.actionAt = { round: this.state.round, phase: this.state.phase };
  }

  /** Olayları günlüğe + mühür kuyruğuna yaz; faz saatlerini, END'i işle; yayınla. */
  private commit(events: MemoEvent[]) {
    const s = this.state;
    this.lastActivity = Date.now();
    const opensNight =
      s.phase === "NIGHT" && events.some((e) => e.memo.t === "muhtar" || (e.memo.t === "phase" && e.memo.ph === "NIGHT"));
    const entered = s.phase !== this.lastPhase ? s.phase : null;
    this.lastPhase = s.phase;
    // Mühür paketleri oyunun kararlarını izler: dağıtım (kadro, kilit, kartlar),
    // seçim, her gece, her gündüz. Gece açılınca önceki paket (seçim ya da
    // gündüz) gider; dağıtım ve gece paketi aşağıda, kapanıştan hemen sonra.
    if (opensNight) {
      this.deps.seals.release(this.code);
      this.acts.clear();
    }
    // Lobide hiçbir şey mühürlenmez: başlamayan masa ne kasaya ne kuyruğa yük olur.
    if (events.length > 0 && this.gameId !== null) {
      // Oyun içi sıra numarası: bir tx içindeki çıkışların sırası zincirde
      // korunmaz; doğrulayan kayıtları `i` ile dizer.
      for (const e of events) e.memo.i = this.seq++;
      const at = this.actionAt;
      const ids = this.deps.db.logEvents(this.gameId, this.code, at.round, at.phase, events);
      for (const e of events) this.gameMemos.push(JSON.stringify(e.memo));
      this.deps.seals.enqueue(this.code, events, ids);
      // Oyun başlar başlamaz dağıtım, sabah olur olmaz gecenin hamleleri ve
      // sonucu zincire gider: sunucunun mühürsüz tuttuğu süre kısalır.
      if (entered === "ELECTION" || entered === "DAWN") this.deps.seals.release(this.code);
    }
    if (opensNight) {
      this.nightStartedAt = Date.now();
      this.pokeIn(NIGHT_FORCE_MS + 100);
    }
    if (s.phase === "DAY" && s.day.stage === "verdict") {
      if (this.verdictStartedAt === null) {
        this.verdictStartedAt = Date.now();
        this.pokeIn(VERDICT_FORCE_MS + 100);
      }
    } else this.verdictStartedAt = null;
    // Cüzdan ilk denemede açılamadıysa (ifşa için görüntüleme anahtarı gerek) yeniden dene.
    if (this.gameId !== null) this.ensureWallet();
    if (s.phase === "END" && this.gameId !== null && events.some((e) => e.memo.t === "phase" && e.memo.ph === "END"))
      this.finish();
    this.deps.db.saveSnapshot(this.code, this.snapshot());
    this.onChange();
  }

  /**
   * `gameroot`: oyunun bütün memo'larının (rol kartları dahil) sıralı özet
   * hash'i, oyun sonu mühür. Doğrulayan, oyunu kurallarla yeniden oynatıp aynı
   * özeti bulmalıdır (src/verify).
   */
  private finish() {
    const h = sha256Hex(this.gameMemos.join("\n"));
    const root: MemoEvent = {
      to: "room",
      memo: { v: engine.MEMO_VERSION, g: this.code, t: "gameroot", h, n: this.gameMemos.length, w: this.state.winner },
    };
    const ids = this.deps.db.logEvents(this.gameId, this.code, this.state.round, "END", [root]);
    this.deps.seals.enqueue(this.code, [root], ids);
    this.deps.seals.release(this.code);
    this.deps.db.endGame(this.gameId!, this.state.winner, h);
  }
}
