// Tournaments: an evening of games with one leaderboard (/e/<CODE>.json).
// Only a host who holds the key can open a table that counts for one, and only
// while it runs; the key itself is never in the repository, only its hash.
// A rehearsal tournament (`test: true`) labels its tables as tests, so its
// games never reach /stats or /games.

import { sha256Hex } from "../engine/fair";
import { ProtocolError } from "./protocol";

export interface Tournament {
  code: string;
  title: string;
  titleEn: string;
  /** sha256 of the host key. */
  keyHash: string;
  from: number;
  to: number;
  test?: boolean;
}

export const TOURNAMENTS: Tournament[] = [
  {
    code: "BTU23",
    title: "BTÜ oyun gecesi",
    titleEn: "BTÜ game night",
    keyHash: "82432b39dea984d4e0797df03ca93815e7c4856b854277607313a5eb9c59f138",
    from: Date.parse("2026-11-23T00:00:00+03:00"),
    to: Date.parse("2026-11-24T06:00:00+03:00"),
  },
  {
    code: "PROVA",
    title: "Turnuva provası",
    titleEn: "Tournament rehearsal",
    keyHash: "5a7c8f8f5086f4f23d82fcd6c5ba3d91155350e1880a1f1f7d89612d28b31f77",
    from: Date.parse("2026-11-17T00:00:00+03:00"),
    to: Date.parse("2026-11-23T00:00:00+03:00"),
    test: true,
  },
];

export function findTournament(code: string, list = TOURNAMENTS): Tournament | null {
  return list.find((t) => t.code === code.toUpperCase()) ?? null;
}

/** The tournament a host may open a table for, or a refusal they can read. */
export function admit(code: string, key: string, now = Date.now(), list = TOURNAMENTS): Tournament {
  const t = findTournament(code, list);
  if (!t || sha256Hex(key) !== t.keyHash) throw new ProtocolError("turnuva anahtarı geçersiz");
  if (now < t.from || now > t.to) throw new ProtocolError("turnuva şu an açık değil");
  return t;
}
