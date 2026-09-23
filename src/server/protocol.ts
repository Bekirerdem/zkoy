// WebSocket sözleşmesi (SPEC v3 §8). Web istemcisi ve Flutter uygulaması aynı
// mesajları konuşur; tam tablo docs/API.md'de.

import { RoomRules } from "../engine/types";

export const MAX_MSG_BYTES = 4096;

export type ActKind =
  | "nominate"
  | "mvote"
  | "night"
  | "accuse"
  | "second"
  | "done"
  | "verdict"
  | "gvote"
  | "will"
  | "heir";

export type CmdKind =
  | "start"
  | "closeElection"
  | "closeNight"
  | "startDay"
  | "toVerdict"
  | "closeDay"
  | "nextRound"
  | "kick";

export type ActMsg = { t: "act"; a: ActKind; x?: string; y?: boolean; txt?: string };
export type CmdMsg = { t: "cmd"; c: CmdKind; x?: string };

export type ClientMsg =
  | { t: "hello"; device: string; code?: string; token?: string }
  | { t: "create"; name: string; rules?: Partial<RoomRules> }
  | { t: "join"; code: string; name: string }
  | { t: "watch"; code: string }
  | ActMsg
  | CmdMsg;

const ACTS: ActKind[] = ["nominate", "mvote", "night", "accuse", "second", "done", "verdict", "gvote", "will", "heir"];
const CMDS: CmdKind[] = ["start", "closeElection", "closeNight", "startDay", "toVerdict", "closeDay", "nextRound", "kick"];

export class ProtocolError extends Error {}

const str = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v: unknown, max: number) => v === undefined || str(v, max);

/** Parse and validate one client frame; throws ProtocolError with a Turkish message. */
export function parseClientMsg(raw: string): ClientMsg {
  if (raw.length > MAX_MSG_BYTES) throw new ProtocolError("mesaj çok büyük");
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    throw new ProtocolError("geçersiz mesaj");
  }
  if (!m || typeof m !== "object") throw new ProtocolError("geçersiz mesaj");
  switch (m.t) {
    case "hello":
      if (!str(m.device, 64) || !optStr(m.code, 8) || !optStr(m.token, 64))
        throw new ProtocolError("geçersiz hello");
      return m as ClientMsg;
    case "create": {
      if (!str(m.name, 16)) throw new ProtocolError("ad 1-16 karakter olmalı");
      const r = (m.rules ?? {}) as Record<string, unknown>;
      const rules: Partial<RoomRules> = {};
      if (r.gozcu === true || r.gozcu === false || r.gozcu === null) rules.gozcu = r.gozcu;
      if (r.accusedVotes === true || r.accusedVotes === false) rules.accusedVotes = r.accusedVotes;
      return { t: "create", name: m.name.trim(), rules };
    }
    case "join":
      if (!str(m.code, 8)) throw new ProtocolError("oda kodu eksik");
      if (!str(m.name, 16)) throw new ProtocolError("ad 1-16 karakter olmalı");
      return { t: "join", code: m.code.toUpperCase(), name: m.name.trim() };
    case "watch":
      if (!str(m.code, 8)) throw new ProtocolError("oda kodu eksik");
      return { t: "watch", code: m.code.toUpperCase() };
    case "act":
      if (!ACTS.includes(m.a as ActKind) || !optStr(m.x, 32) || !optStr(m.txt, 200))
        throw new ProtocolError("geçersiz hamle");
      if (m.y !== undefined && typeof m.y !== "boolean") throw new ProtocolError("geçersiz oy");
      return m as ActMsg;
    case "cmd":
      if (!CMDS.includes(m.c as CmdKind) || !optStr(m.x, 32))
        throw new ProtocolError("geçersiz komut");
      return m as CmdMsg;
    default:
      throw new ProtocolError("bilinmeyen mesaj");
  }
}
