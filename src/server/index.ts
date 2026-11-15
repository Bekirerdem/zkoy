// ZKöy sunucusu: tek Bun süreci. WebSocket oda katmanı + statik web istemcisi
// + herkese açık kayıtlar (/stats, /games, /g/<KOD>.json). Sözleşme: docs/API.md.

import type { Server, ServerWebSocket } from "bun";
import { existsSync } from "node:fs";
import { join as joinPath, normalize, sep } from "node:path";
import { EngineError } from "../engine/engine";
import { startFaucetLoop } from "../zcash/faucet";
import { MockZcashService } from "../zcash/mock";
import { ZcashService } from "../zcash/service";
import { ZingoService } from "../zcash/zingo";
import { Db, openDb } from "./db";
import { Lang, errorText } from "./i18n";
import { ClientMsg, MAX_MSG_BYTES, ProtocolError, parseClientMsg } from "./protocol";
import { Room } from "./room";
import { SealQueue } from "./seal-queue";
import { privateView, publicView } from "./views";

const CODE_ALPHABET = "ACDEFHJKLMNPRSTUVYZ234679";
const SNAPSHOT_MAX_AGE_MS = 6 * 3600_000;
/** Bellekten düşme eşikleri: başlamayan lobi, biten oyun, yarıda bırakılan oyun. */
const LOBBY_IDLE_MS = 2 * 3600_000;
const END_IDLE_MS = 6 * 3600_000;
const GAME_IDLE_MS = 24 * 3600_000;
/** Bir soket 10 saniyede en çok bu kadar mesaj yollar. */
const SOCKET_BURST = Number(process.env.ZKOY_SOCKET_BURST ?? 40);

/**
 * İstemci yalnız kendi dosyalarını, Google Fonts'u ve kendi soketini kullanır;
 * başka hiçbir kaynağa izin yok. `style-src 'unsafe-inline'`: arayüz renkleri
 * öğe üstünde `style` ile veriyor (kullanıcı metni hiçbir zaman HTML olarak basılmaz).
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; "),
};

interface WsData {
  ip: string;
  /** Son mesajların zamanı (soket başına hız sınırı). */
  hits: number[];
  device?: string;
  code?: string;
  pid?: string;
  /** Hata mesajlarının dili (`hello`). */
  lang?: Lang;
}

type Ws = ServerWebSocket<WsData>;

export interface ServerOptions {
  port?: number;
  db?: Db;
  zcash?: ZcashService;
  webDir?: string;
  /** Günlük veritabanı yedeği (yalnız gerçek sunucuda). */
  backups?: boolean;
}

/** Sliding one-minute window per IP and action. */
class RateLimit {
  private hits = new Map<string, number[]>();
  allow(key: string, perMinute: number): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (list.length >= perMinute) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
  /** Bir dakikadır ses vermeyen anahtarları at. */
  prune(): void {
    const now = Date.now();
    for (const [k, list] of this.hits) if (!list.some((t) => now - t < 60_000)) this.hits.delete(k);
  }
}

export function startServer(opts: ServerOptions = {}) {
  const db = opts.db ?? openDb();
  const zcash =
    opts.zcash ?? (process.env.ZKOY_CHAIN === "zingo" ? new ZingoService() : new MockZcashService());
  const seals = new SealQueue(db, zcash);
  const webDir = opts.webDir ?? process.env.ZKOY_WEB_DIR ?? "web";
  const rooms = new Map<string, Room>();
  const sockets = new Map<string, Set<Ws>>(); // code → bağlı oyuncu soketleri
  const limits = new RateLimit();
  let server: Server<WsData>;

  const deps = { db, zcash, seals };

  function wire(room: Room) {
    room.onChange = () => broadcast(room);
    rooms.set(room.code, room);
  }

  // Açılış: yarım kalan odalar ve mühür kuyruğu geri gelir.
  for (const row of db.loadSnapshots(SNAPSHOT_MAX_AGE_MS)) {
    try {
      wire(Room.restore(row.json, deps));
    } catch (e) {
      console.error(`[boot] ${row.code} geri yüklenemedi:`, e);
    }
  }
  seals.onSealed = (code) => {
    const room = rooms.get(code);
    if (room) broadcast(room);
  };
  seals.resume();

  function broadcast(room: Room) {
    if (!server) return;
    server.publish(
      `room:${room.code}`,
      JSON.stringify({ t: "state", s: publicView(room, seals, zcash.kind) }),
    );
    for (const ws of sockets.get(room.code) ?? []) sendMe(ws, room);
  }

  function sendMe(ws: Ws, room: Room) {
    if (!ws.data.pid) return;
    const m = privateView(room, ws.data.pid);
    if (m) ws.send(JSON.stringify({ t: "me", m }));
  }

  /** Soketi odasından ayır; oyuncuysa odaya bağlantısının gittiğini bildir. */
  function detach(ws: Ws) {
    const { code, pid } = ws.data;
    if (!code) return;
    if (sockets.get(code)?.delete(ws) && pid) rooms.get(code)?.presence(pid, -1);
    ws.data.code = undefined;
    ws.data.pid = undefined;
  }

  function attach(ws: Ws, room: Room, pid?: string) {
    if (ws.data.code !== room.code || ws.data.pid !== pid) {
      const old = ws.data.code;
      detach(ws);
      if (old && old !== room.code) ws.unsubscribe(`room:${old}`);
    }
    ws.data.code = room.code;
    ws.data.pid = pid;
    ws.subscribe(`room:${room.code}`);
    if (pid) {
      const set = sockets.get(room.code) ?? new Set<Ws>();
      sockets.set(room.code, set);
      if (!set.has(ws)) {
        set.add(ws);
        room.presence(pid, 1);
      }
    }
    ws.send(JSON.stringify({ t: "state", s: publicView(room, seals, zcash.kind) }));
    sendMe(ws, room);
  }

  function newCode(): string {
    for (;;) {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      if (!rooms.has(code) && !db.gameByCode(code)) return code;
    }
  }

  function roomOf(code: string): Room {
    const room = rooms.get(code);
    if (!room) throw new EngineError("böyle bir oda yok");
    return room;
  }

  async function handle(ws: Ws, msg: ClientMsg) {
    if (msg.t === "hello") {
      ws.data.device = msg.device;
      ws.data.lang = msg.lang ?? "tr";
      if (msg.code && msg.token) {
        const room = roomOf(msg.code);
        attach(ws, room, room.auth(msg.token));
      }
      return;
    }
    if (msg.t === "watch") {
      if (!limits.allow(`watch:${ws.data.ip}`, 30)) throw new ProtocolError("çok fazla deneme, biraz bekle");
      attach(ws, roomOf(msg.code));
      return;
    }
    const device = ws.data.device;
    if (msg.t === "create" || msg.t === "join") {
      if (!device) throw new ProtocolError("önce hello gönder");
      let room: Room;
      if (msg.t === "create") {
        if (!limits.allow(`create:${ws.data.ip}`, 5)) throw new ProtocolError("çok hızlı oda kuruluyor, biraz bekle");
        room = new Room(newCode(), deps, msg.rules, { test: msg.test });
        wire(room);
      } else {
        if (!limits.allow(`join:${ws.data.ip}`, 30)) throw new ProtocolError("çok fazla deneme, biraz bekle");
        room = roomOf(msg.code);
      }
      const { pid, token } = room.join(device, msg.name, msg.n);
      ws.send(JSON.stringify({ t: "joined", code: room.code, pid, token }));
      attach(ws, room, pid);
      broadcast(room);
      return;
    }
    const { code, pid } = ws.data;
    if (!code || !pid) throw new ProtocolError("önce odaya katıl");
    const room = roomOf(code);
    if (msg.t === "act") room.act(pid, msg);
    else room.cmd(pid, msg);
  }

  // Bellek temizliği: başlamayan lobi iz bırakmadan gider; biten oyun kaydıyla
  // (veritabanı + /g/<KOD>.json) kalır, yalnız bellekten düşer.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const idle = now - room.lastActivity;
      const phase = room.state.phase;
      if (phase === "LOBBY" ? idle < LOBBY_IDLE_MS : phase === "END" ? idle < END_IDLE_MS : idle < GAME_IDLE_MS)
        continue;
      rooms.delete(code);
      sockets.delete(code);
      if (phase === "LOBBY") db.deleteSnapshot(code);
    }
    limits.prune();
  }, 10 * 60_000);
  sweep.unref?.();

  if (opts.backups) {
    const run = () => {
      try {
        const file = db.backup();
        if (file) console.log(`[yedek] ${file}`);
      } catch (e) {
        console.error("[yedek] alınamadı:", String(e).slice(0, 300));
      }
    };
    run();
    setInterval(run, 24 * 3600_000).unref?.();
  }

  /**
   * Cloudflare statik dosyalara 4 saatlik tarayıcı önbelleği basıyor; düzeltme
   * telefonlara saatler sonra ulaşıyordu. Sayfa her istekte dosyaların içerik
   * damgasıyla verilir (`app.js?v=…`): dosya değişince adres de değişir.
   */
  function assetVersion(rel: string): string {
    const f = Bun.file(joinPath(webDir, rel));
    return String(Math.floor(f.lastModified / 1000));
  }

  async function serveIndex(): Promise<Response> {
    const html = (await Bun.file(joinPath(webDir, "index.html")).text())
      .replace('src="/app.js"', `src="/app.js?v=${assetVersion("app.js")}"`)
      .replace('href="/style.css"', `href="/style.css?v=${assetVersion("style.css")}"`);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  const webRoot = normalize(webDir) + sep;
  function serveStatic(pathname: string): Response | Promise<Response> {
    const rel = pathname === "/" || pathname.startsWith("/j/") ? "index.html" : pathname.slice(1);
    if (rel === "index.html" && existsSync(joinPath(webDir, rel))) return serveIndex();
    const file = normalize(joinPath(webDir, rel));
    if (!file.startsWith(webRoot) || !existsSync(file))
      return new Response("bulunamadı", { status: 404 });
    // Etkinlik süresince düzeltmeler anında telefonlara ulaşsın: her istekte doğrula.
    return new Response(Bun.file(file), { headers: { "Cache-Control": "no-cache" } });
  }

  /**
   * Biten bir oyunun herkese açık kaydı: oda cüzdanının memo'ları, mühür
   * tx'leri ve kura ifşası. `tools/verify.ts` bunu ya da aynı memo'ları zincirden
   * okuyup oyunu baştan doğrular. Oda kodunu bilen ulaşır; liste yayınlanmaz.
   */
  function gameRecord(code: string) {
    const g = db.gameByCode(code);
    if (!g || g.ended_at === null) return null;
    const events = db.gameEvents(g.id).filter((e) => e.dest === "room");
    if (events.length === 0) return null; // memo v4 öncesi oyun
    const live = rooms.get(code);
    let reveal: Record<string, unknown> | null = null;
    if (live) {
      reveal = { seed: live.state.seed, secret: live.state.seedSalt, commit: live.state.seedCommit, ufvk: live.ufvk, roomAddress: live.address };
    } else {
      const raw = db.getSnapshot(code);
      if (raw) {
        const s = JSON.parse(raw) as { state: { seed: number; seedSalt: string; seedCommit: string }; ufvk: string; address: string };
        reveal = { seed: s.state.seed, secret: s.state.seedSalt, commit: s.state.seedCommit, ufvk: s.ufvk, roomAddress: s.address };
      }
    }
    return {
      v: 4,
      code,
      chain: zcash.kind,
      test: g.test === 1,
      startedAt: g.started_at,
      endedAt: g.ended_at,
      players: g.players,
      winner: g.winner,
      gameroot: g.gameroot,
      reveal,
      txids: [...new Set(events.map((e) => e.txid).filter((t): t is string => !!t))],
      unsealed: events.filter((e) => !e.txid).length,
      memos: events.map((e) => e.memo),
    };
  }

  let qrLib: string | undefined;
  let balanceCache: { v: number | null; at: number } = { v: null, at: 0 };
  let balanceRefreshing = false;
  /** Never await the wallet here: a seal send holds the ops lock for a minute. */
  function opsBalance(): number | null {
    if (Date.now() - balanceCache.at > 60_000 && !balanceRefreshing) {
      balanceRefreshing = true;
      void zcash
        .balance()
        .then((v) => (balanceCache = { v, at: Date.now() }))
        .finally(() => (balanceRefreshing = false));
    }
    return balanceCache.v;
  }

  async function route(req: Request, srv: Server<WsData>, ip: string): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true, chain: zcash.kind });
    if (url.pathname === "/qr.js") {
      // qrcode-generator'ı tarayıcı globali olarak sar (bekleme ekranındaki QR).
      qrLib ??= `(function(){var exports={};var module={exports:exports};\n${await Bun.file(
        "node_modules/qrcode-generator/dist/qrcode.js",
      ).text()}\nwindow.qrcode=module.exports;})();`;
      return new Response(qrLib, { headers: { "Content-Type": "text/javascript" } });
    }
    if (url.pathname === "/stats")
      return Response.json({
        ...db.stats(),
        liveRooms: rooms.size,
        chain: zcash.kind,
        opsBalanceZat: opsBalance(),
        height: await zcash.height(),
        // Mühürü düşen oda sayısı: sıfır değilse zincir tarafında bir sorun var.
        sealsFailing: seals.failing().length,
      });
    if (url.pathname === "/games") return Response.json({ games: db.recentGames(100) });
    const g = url.pathname.match(/^\/g\/([A-Za-z0-9]{4,8})\.json$/);
    if (g) {
      if (!limits.allow(`g:${ip}`, 30)) return new Response("çok fazla deneme", { status: 429 });
      const record = gameRecord(g[1]!.toUpperCase());
      return record ? Response.json(record) : new Response("bulunamadı", { status: 404 });
    }
    return serveStatic(url.pathname);
  }

  server = Bun.serve<WsData>({
    port: opts.port ?? Number(process.env.ZKOY_PORT ?? 3131),
    idleTimeout: 30,
    async fetch(req, srv) {
      const ip = req.headers.get("cf-connecting-ip") ?? srv.requestIP(req)?.address ?? "?";
      if (new URL(req.url).pathname === "/ws") {
        if (srv.upgrade(req, { data: { ip, hits: [] } })) return;
        return new Response("upgrade gerekli", { status: 400 });
      }
      const res = await route(req, srv, ip);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
      return res;
    },
    websocket: {
      maxPayloadLength: MAX_MSG_BYTES,
      idleTimeout: 120,
      async message(ws, raw) {
        try {
          const now = Date.now();
          const recent = ws.data.hits.filter((t) => now - t < 10_000);
          ws.data.hits = recent;
          if (recent.length >= SOCKET_BURST) throw new ProtocolError("çok hızlı, biraz yavaşla");
          recent.push(now);
          await handle(ws, parseClientMsg(String(raw)));
        } catch (e) {
          const known = e instanceof EngineError || e instanceof ProtocolError;
          if (!known) console.error("[ws] beklenmeyen hata:", e);
          ws.send(JSON.stringify({ t: "error", e: errorText(known ? e.message : "sunucu hatası", ws.data.lang ?? "tr") }));
        }
      },
      close(ws) {
        detach(ws);
      },
    },
  });

  return { server, rooms, db, seals, zcash };
}

if (import.meta.main) {
  const { server, zcash } = startServer({ backups: process.env.ZKOY_BACKUP !== "0" });
  console.log(`ZKöy http://localhost:${server.port} (zincir: ${zcash.kind})`);
  const ops = process.env.ZKOY_OPS_ADDRESS;
  if (zcash.kind === "zingo" && ops) startFaucetLoop(zcash, ops);
}
