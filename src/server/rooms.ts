// Room orchestration: owns timers and the engine↔zcash seam.
// Tempo lives here (SPEC §3: "oyun temposu sunucudan, kanıt zincirden").

import * as engine from "../engine/engine";
import { MemoEvent, RoomState, Tier } from "../engine/types";
import { ZcashService } from "../zcash/service";

export interface PhaseDurations {
  NIGHT: number;
  DAWN: number;
  DAY: number;
  VOTE: number;
  EXECUTION: number;
}

function envMs(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v * 1000 : fallback;
}

const DEFAULT_DURATIONS: PhaseDurations = {
  // Sınıf provası dersi (17 Ağu): tur = 30sn tartışma + 30sn oylama.
  NIGHT: envMs("ZKOY_T_NIGHT", 60_000),
  DAWN: envMs("ZKOY_T_DAWN", 10_000),
  DAY: envMs("ZKOY_T_DAY", 30_000),
  VOTE: envMs("ZKOY_T_VOTE", 30_000),
  EXECUTION: envMs("ZKOY_T_EXECUTION", 10_000),
};

const MIN_PLAYERS = Number(process.env.ZKOY_MIN_PLAYERS ?? engine.MIN_PLAYERS);

function sha256Hex(input: string): string {
  const h = new Bun.CryptoHasher("sha256");
  h.update(input);
  return h.digest("hex");
}

function roomCode(): string {
  const alphabet = "ACDEFHJKLMNPRSTUVYZ234679";
  let code = "";
  for (let i = 0; i < 4; i++)
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export interface Announcement {
  at: number;
  kind: "dawn" | "execution" | "info" | "end";
  text: string;
  will?: string | null;
}

export class Room {
  readonly state: RoomState;
  readonly tokens = new Map<string, string>(); // token → playerId
  readonly announcements: Announcement[] = [];
  phaseEndsAt: number | null = null;
  address = "";
  ufvk = "";
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    code: string,
    private readonly zcash: ZcashService,
  ) {
    this.state = engine.createRoom(code);
  }

  private seal(events: MemoEvent[]) {
    this.zcash.seal(this.state.code, events);
  }

  /** İlk katılan = ebe/kurucu (odayı kuran kişi kurup hemen katılır). */
  hostPlayerId: string | null = null;

  async join(name: string, tier: Tier) {
    const playerId = `p${this.state.players.length}-${crypto.randomUUID().slice(0, 8)}`;
    const salt = crypto.randomUUID();
    const commit = sha256Hex(`${tier}|${salt}`);
    const events = engine.join(this.state, playerId, name, tier, commit);
    const me = this.state.players.find((p) => p.id === playerId)!;
    me.tierSalt = salt; // server keeps the salt; revealed at END (cam ebe)
    const token = crypto.randomUUID();
    this.tokens.set(token, playerId);
    this.hostPlayerId ??= playerId;
    const playerAddress = await this.zcash.createPlayerWallet(
      this.state.code,
      playerId,
    );
    this.seal(events);
    return { playerId, token, playerAddress };
  }

  start() {
    const events = engine.start(this.state, Date.now() % 2 ** 31, MIN_PLAYERS);
    // Pot fonlaması: oda başına tek gerçek tx, toplam giriş tutarı (SPEC §3).
    events.push({
      to: "room",
      memo: { v: 1, t: "pot", zat: this.state.potZats },
      zats: this.state.potZats,
    });
    this.seal(events);
    this.announce("info", "Köy uykuya dalıyor… roller mühürlendi.");
    this.armTimer();
  }

  private announce(kind: Announcement["kind"], text: string, will?: string | null) {
    this.announcements.push({ at: Date.now(), kind, text, will });
  }

  playerId(token: string): string {
    const id = this.tokens.get(token);
    if (!id) throw new engine.EngineError("geçersiz token");
    return id;
  }

  action(
    token: string,
    type: "night" | "vote" | "gvote" | "will" | "skip",
    target?: string,
    txt?: string,
  ) {
    const pid = this.playerId(token);
    // Ebe-geçişi: kurucu, sayaç beklemeden bekleme fazlarını ilerletir
    // (salon temposu — tartışma erken bittiyse oylamaya geçilir).
    if (type === "skip") {
      if (pid !== this.hostPlayerId)
        throw new engine.EngineError("fazı yalnız kurucu geçirebilir");
      const p = this.state.phase;
      if (p !== "DAWN" && p !== "DAY" && p !== "EXECUTION")
        throw new engine.EngineError("bu faz elle geçilmez");
      this.resolvePhase();
      return;
    }
    let events: MemoEvent[] = [];
    switch (type) {
      case "night":
        events = engine.nightAction(this.state, pid, target!);
        break;
      case "vote":
        events = engine.vote(this.state, pid, target!);
        break;
      case "gvote":
        events = engine.gvote(this.state, pid, target!);
        break;
      case "will":
        events = engine.setWill(this.state, pid, txt ?? "");
        break;
    }
    this.seal(events);
    this.maybeResolveEarly();
  }

  /** All expected actors acted → don't wait for the clock. */
  private maybeResolveEarly() {
    const s = this.state;
    if (s.phase === "NIGHT") {
      const alive = s.players.filter((p) => p.alive);
      const vampires = alive.filter((p) => p.role === "vampir");
      const doctor = alive.find((p) => p.role === "doktor");
      const gozcu = alive.find((p) => p.role === "gozcu");
      const allVamps = vampires.every((v) => s.night.vampireTargets[v.id]);
      const doctorDone = !doctor || s.night.doctorSave !== null;
      const gozcuDone = !gozcu || s.night.gozcuTarget !== null;
      if (allVamps && doctorDone && gozcuDone) this.resolvePhase();
    } else if (s.phase === "VOTE") {
      const alive = s.players.filter((p) => p.alive);
      if (alive.every((p) => s.votes[p.id])) this.resolvePhase();
    }
  }

  private armTimer() {
    if (this.timer) clearTimeout(this.timer);
    const phase = this.state.phase;
    if (phase === "LOBBY" || phase === "END") {
      this.phaseEndsAt = null;
      return;
    }
    const ms = DEFAULT_DURATIONS[phase];
    this.phaseEndsAt = Date.now() + ms;
    this.timer = setTimeout(() => this.resolvePhase(), ms);
  }

  /** Advance out of the current phase (timer expiry or early resolution). */
  private resolvePhase() {
    const s = this.state;
    try {
      switch (s.phase) {
        case "NIGHT": {
          const events = engine.resolveNight(s);
          this.seal(events);
          const n = s.lastNight!;
          if (n.died) {
            const p = s.players.find((q) => q.id === n.died)!;
            this.announce(
              "dawn",
              `Şafak söktü. ${p.name} bu gece aramızdan alındı.`,
              p.will,
            );
          } else if (n.saved) {
            this.announce("dawn", "Şafak söktü. Doktor bu gece bir can kurtardı!");
          } else {
            this.announce("dawn", "Şafak söktü. Köy sakin bir gece geçirdi.");
          }
          break;
        }
        case "DAWN":
        case "DAY":
          engine.advancePhase(s);
          break;
        case "VOTE": {
          const events = engine.resolveVote(s);
          this.seal(events);
          const v = s.lastVote!;
          if (v.lynched) {
            const p = s.players.find((q) => q.id === v.lynched)!;
            this.announce(
              "execution",
              `Köy kararını verdi: ${p.name} asıldı. Rolü: ${v.role?.toUpperCase()}.`,
              p.will,
            );
            if (v.role === "deli")
              this.announce("info", "DELİ ASILDI — potun %10'u onun. Oyun sürüyor!");
          } else {
            this.announce("execution", "Oylar dengelendi — bugün kimse asılmadı.");
          }
          break;
        }
        case "EXECUTION":
          engine.nextRound(s);
          this.announce("info", `Gece ${s.round} çöküyor…`);
          break;
      }
    } catch (e) {
      console.error(`[room ${s.code}] phase resolution error:`, e);
    }
    if (s.phase === "END") {
      this.phaseEndsAt = null;
      if (this.timer) clearTimeout(this.timer);
      this.announce(
        "end",
        s.winner === "koy"
          ? "KÖY KAZANDI — vampirler temizlendi. İfşa partisi başlıyor!"
          : "VAMPİRLER KAZANDI — köy düştü. İfşa partisi başlıyor!",
      );
    } else {
      this.armTimer();
    }
  }
}

export class RoomRegistry {
  private rooms = new Map<string, Room>();

  constructor(private readonly zcash: ZcashService) {}

  async create(): Promise<Room> {
    let code = roomCode();
    while (this.rooms.has(code)) code = roomCode();
    const room = new Room(code, this.zcash);
    const wallet = await this.zcash.createRoomWallet(code);
    room.address = wallet.address;
    room.ufvk = wallet.ufvk;
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new engine.EngineError(`oda yok: ${code}`);
    return room;
  }
}
