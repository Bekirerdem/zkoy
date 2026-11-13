// Provable draw (memo v4). The server commits to a secret when the room is
// created, before any guest has joined; each phone adds its own random nonce
// at join. The shuffle seed is derived from both, so neither side can steer
// the roles: the server is bound by its commitment, the players never see the
// secret. Everything here is recomputed by the verifier (src/verify).

import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Sealed in the `seed` memo and shown to every phone from the lobby on. */
export function commitOf(secret: string): string {
  return sha256Hex(secret);
}

function intOf(input: string): number {
  return parseInt(sha256Hex(input).slice(0, 8), 16) >>> 1;
}

/** Shuffle seed: the secret plus every seat's nonce, in seat order. */
export function seedFrom(secret: string, nonces: string[]): number {
  return intOf(`${secret}|${nonces.join("|")}`);
}

/** Tie-break draw for the Muhtar election, bound by the same commitment. */
export function tieSeedFrom(secret: string): number {
  return intOf(`${secret}|muhtar`);
}

/** UTF-8 size; a Zcash memo holds 512 bytes, not 512 characters. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
