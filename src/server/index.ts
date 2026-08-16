// ZKöy HTTP API — the contract Selinay's Flutter app builds against (SPEC §3).

import { EngineError } from "../engine/engine";
import { Tier } from "../engine/types";
import { MockZcashService } from "../zcash/mock";
import { ZingoService } from "../zcash/zingo";
import { Room, RoomRegistry } from "./rooms";
import { screenHtml } from "./screen";

const PORT = Number(process.env.ZKOY_PORT ?? 3131);
const WEB_DIR = process.env.ZKOY_WEB_DIR ?? "mobile/build/web";
const zcash =
  process.env.ZKOY_CHAIN === "zingo" ? new ZingoService() : new MockZcashService();
const registry = new RoomRegistry(zcash);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function statePayload(room: Room, token: string | null, height: number) {
  const s = room.state;
  const base: Record<string, unknown> = {
    code: s.code,
    phase: s.phase,
    round: s.round,
    endsAt: room.phaseEndsAt,
    potZats: s.potZats,
    height,
    players: s.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
    voteWeightCast:
      s.phase === "VOTE"
        ? Object.keys(s.votes).reduce(
            (sum, id) =>
              sum + (s.players.find((p) => p.id === id)?.tier ?? 0),
            0,
          )
        : null,
    announcements: room.announcements.slice(-12),
    winner: s.winner,
    roomAddress: room.address,
    chain: zcash.kind,
    sealedCount: zcash.sealed(s.code).length,
  };
  if (s.phase === "END") {
    base.end = {
      payouts: (s.payouts ?? []).map((p) => ({
        name: s.players.find((q) => q.id === p.playerId)?.name,
        zats: p.zats,
        reason: p.reason,
      })),
      ufvk: room.ufvk,
      reveals: s.players.map((p) => ({
        name: p.name,
        tier: p.tier,
        salt: p.tierSalt,
        commit: p.tierCommit,
        role: p.role,
      })),
    };
  }
  if (token) {
    const pid = room.playerId(token);
    const me = s.players.find((p) => p.id === pid)!;
    const aliveOthers = s.players
      .filter((p) => p.alive && p.id !== pid)
      .map((p) => ({ id: p.id, name: p.name }));
    base.me = {
      id: me.id,
      name: me.name,
      role: me.role,
      alive: me.alive,
      tier: me.tier,
      will: me.will,
      acted:
        s.phase === "NIGHT"
          ? me.role === "vampir"
            ? s.night.vampireTargets[pid] != null
            : me.role === "doktor"
              ? s.night.doctorSave != null
              : me.role === "gozcu"
                ? s.night.gozcuTarget != null
                : true
          : s.phase === "VOTE"
            ? (me.alive ? s.votes[pid] : s.gvotes[pid]) != null
            : true,
      targets:
        s.phase === "NIGHT" && me.alive
          ? me.role === "doktor"
            ? [{ id: me.id, name: me.name }, ...aliveOthers]
            : aliveOthers
          : s.phase === "VOTE"
            ? aliveOthers
            : [],
      gozcuResult:
        me.role === "gozcu" && s.lastNight?.gozcuResult
          ? {
              name: s.players.find(
                (p) => p.id === s.lastNight!.gozcuResult!.target,
              )?.name,
              vamp: s.lastNight.gozcuResult.vamp,
            }
          : null,
    };
    if (!me.alive) {
      // Ghost feed: the sealed room memos, exactly what the viewing key sees.
      base.ghost = {
        memos: zcash
          .sealed(s.code)
          .flatMap((batch) =>
            batch.events
              .filter((e) => e.to === "room")
              .map((e) => ({ txid: batch.txid, memo: e.memo })),
          ),
      };
    }
  }
  return base;
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // POST /room
    if (req.method === "POST" && url.pathname === "/room") {
      const room = await registry.create();
      return json({ code: room.state.code, roomAddress: room.address });
    }
    // /room/:code/...
    if (parts[0] === "room" && parts[1]) {
      const room = registry.get(parts[1]);
      const sub = parts[2];
      if (req.method === "POST" && sub === "join") {
        const body = (await req.json()) as { name?: string; tier?: number };
        const name = (body.name ?? "").trim().replaceAll("'", "").slice(0, 24);
        if (!name) throw new EngineError("isim gerekli");
        const tier = ([1, 2, 3].includes(body.tier ?? 0) ? body.tier : 1) as Tier;
        return json(await room.join(name, tier));
      }
      if (req.method === "POST" && sub === "start") {
        room.start();
        return json({ ok: true });
      }
      if (req.method === "GET" && sub === "state") {
        return json(
          statePayload(room, url.searchParams.get("token"), await zcash.height()),
        );
      }
      if (req.method === "POST" && sub === "action") {
        const body = (await req.json()) as {
          token?: string;
          type?: string;
          target?: string;
          txt?: string;
        };
        if (!body.token || !body.type) throw new EngineError("token ve type gerekli");
        if (!["night", "vote", "gvote", "will"].includes(body.type))
          throw new EngineError(`bilinmeyen aksiyon: ${body.type}`);
        room.action(
          body.token,
          body.type as "night" | "vote" | "gvote" | "will",
          body.target,
          body.txt,
        );
        return json({ ok: true });
      }
      if (req.method === "POST" && sub === "reveal") {
        return json({
          ufvk: room.ufvk,
          roomAddress: room.address,
          reveals: room.state.players.map((p) => ({
            name: p.name,
            tier: p.tier,
            salt: p.tierSalt,
            commit: p.tierCommit,
            role: p.role,
          })),
          timeline: zcash.sealed(room.state.code).map((b) => ({
            txid: b.txid,
            at: b.at,
            memos: b.events.map((e) => e.memo),
          })),
        });
      }
    }
    // GET /app/* — Flutter web build'i (PWA); telefonlar tarayıcıdan oynar.
    if (req.method === "GET" && parts[0] === "app") {
      const rel = parts.slice(1).join("/") || "index.html";
      const file = Bun.file(`${WEB_DIR}/${rel}`);
      if (await file.exists()) return new Response(file);
      // SPA fallback: bilinmeyen yollar index.html'e düşer
      const index = Bun.file(`${WEB_DIR}/index.html`);
      if (await index.exists()) return new Response(index);
      return json({ error: "web build yok — mobile/build/web bekleniyor" }, 404);
    }
    // GET /screen/:code
    if (req.method === "GET" && parts[0] === "screen" && parts[1]) {
      registry.get(parts[1]); // 404 if unknown
      return new Response(screenHtml(parts[1].toUpperCase()), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return json({ error: "yol yok" }, 404);
  } catch (e) {
    if (e instanceof EngineError) return json({ error: e.message }, 400);
    console.error("[server]", e);
    return json({ error: "sunucu hatası" }, 500);
  }
}

Bun.serve({ port: PORT, fetch: handle });
console.log(
  `ZKöy sunucu ayakta: http://localhost:${PORT} (zincir: ${zcash.kind})`,
);
