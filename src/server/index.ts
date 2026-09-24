// ZKöy v3 sunucusu: tek Bun süreci. WebSocket oda katmanı + statik web
// istemcisi + /stats (Q4 retro kanıtı). Sözleşme: docs/API.md.

import type { Server, ServerWebSocket } from "bun";
import { existsSync } from "node:fs";
import { join as joinPath, normalize } from "node:path";
import { EngineError } from "../engine/engine";
import { startFaucetLoop } from "../zcash/faucet";
import { MockZcashService } from "../zcash/mock";
import { ZcashService } from "../zcash/service";
import { ZingoService } from "../zcash/zingo";
import { Db, openDb } from "./db";
import { ClientMsg, MAX_MSG_BYTES, ProtocolError, parseClientMsg } from "./protocol";
import { Room } from "./room";
import { SealQueue } from "./seal-queue";
import { privateView, publicView } from "./views";

const CODE_ALPHABET = "ACDEFHJKLMNPRSTUVYZ234679";
const SNAPSHOT_MAX_AGE_MS = 6 * 3600_000;

interface WsData {
  ip: string;
  device?: string;
  code?: string;
  pid?: string;
}

type Ws = ServerWebSocket<WsData>;

export interface ServerOptions {
  port?: number;
  db?: Db;
  zcash?: ZcashService;
  webDir?: string;
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

  function attach(ws: Ws, room: Room, pid?: string) {
    if (ws.data.code && ws.data.code !== room.code) sockets.get(ws.data.code)?.delete(ws);
    ws.data.code = room.code;
    ws.data.pid = pid;
    ws.subscribe(`room:${room.code}`);
    if (pid) {
      const set = sockets.get(room.code) ?? new Set<Ws>();
      set.add(ws);
      sockets.set(room.code, set);
    }
    ws.send(JSON.stringify({ t: "state", s: publicView(room, seals, zcash.kind) }));
    sendMe(ws, room);
  }

  function newCode(): string {
    for (;;) {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      if (!rooms.has(code)) return code;
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
      if (msg.code && msg.token) {
        const room = roomOf(msg.code);
        attach(ws, room, room.auth(msg.token));
      }
      return;
    }
    if (msg.t === "watch") {
      attach(ws, roomOf(msg.code));
      return;
    }
    const device = ws.data.device;
    if (msg.t === "create" || msg.t === "join") {
      if (!device) throw new ProtocolError("önce hello gönder");
      let room: Room;
      if (msg.t === "create") {
        if (!limits.allow(`create:${ws.data.ip}`, 5)) throw new ProtocolError("çok hızlı oda kuruluyor, biraz bekle");
        room = new Room(newCode(), deps, msg.rules);
        await room.init();
        wire(room);
      } else {
        if (!limits.allow(`join:${ws.data.ip}`, 30)) throw new ProtocolError("çok fazla deneme, biraz bekle");
        room = roomOf(msg.code);
      }
      const { pid, token } = room.join(device, msg.name);
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

  function serveStatic(pathname: string): Response {
    const rel = pathname === "/" || pathname.startsWith("/j/") ? "index.html" : pathname.slice(1);
    const file = normalize(joinPath(webDir, rel));
    if (!file.startsWith(normalize(webDir)) || !existsSync(file))
      return new Response("bulunamadı", { status: 404 });
    return new Response(Bun.file(file), {
      headers: rel === "index.html" ? { "Cache-Control": "no-cache" } : {},
    });
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

  server = Bun.serve<WsData>({
    port: opts.port ?? Number(process.env.ZKOY_PORT ?? 3131),
    idleTimeout: 30,
    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const ip = req.headers.get("cf-connecting-ip") ?? srv.requestIP(req)?.address ?? "?";
        if (srv.upgrade(req, { data: { ip } })) return;
        return new Response("upgrade gerekli", { status: 400 });
      }
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
        });
      return serveStatic(url.pathname);
    },
    websocket: {
      maxPayloadLength: MAX_MSG_BYTES,
      idleTimeout: 120,
      async message(ws, raw) {
        try {
          await handle(ws, parseClientMsg(String(raw)));
        } catch (e) {
          const known = e instanceof EngineError || e instanceof ProtocolError;
          if (!known) console.error("[ws] beklenmeyen hata:", e);
          ws.send(JSON.stringify({ t: "error", e: known ? e.message : "sunucu hatası" }));
        }
      },
      close(ws) {
        if (ws.data.code) sockets.get(ws.data.code)?.delete(ws);
      },
    },
  });

  return { server, rooms, db, seals, zcash };
}

if (import.meta.main) {
  const { server, zcash } = startServer();
  console.log(`ZKöy http://localhost:${server.port} (zincir: ${zcash.kind})`);
  const ops = process.env.ZKOY_OPS_ADDRESS;
  if (zcash.kind === "zingo" && ops) startFaucetLoop(zcash, ops);
}
