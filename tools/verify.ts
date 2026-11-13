// Verify a finished game yourself.
//
//   bun tools/verify.ts https://zkoy.fun/g/<ROOM>.json      the server's record
//   bun tools/verify.ts memos.json                           memos you read from chain
//   zingo-cli … --waitsync messages | bun tools/verify.ts -  straight from a wallet
//
// The input is reduced to a list of memo strings; nothing else in it is
// trusted. Accepted shapes: a ZKöy game record ({ memos: [...] }), a plain JSON
// array of memo strings, or zingo-cli's `messages` output. For a check that
// does not rely on the server at all, read the memos from chain with the
// room's viewing key (README, "Verify a game yourself").

import { verifyGame } from "../src/verify/verify";
import { extractLastJson } from "../src/zcash/zingo";

const source = process.argv[2];
if (!source) {
  console.error("usage: bun tools/verify.ts <game.json | https://…/g/ROOM.json | ->  [ROOM]");
  process.exit(2);
}

async function read(src: string): Promise<string> {
  if (src === "-") return await Bun.stdin.text();
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`${src} → HTTP ${res.status}`);
    return await res.text();
  }
  return await Bun.file(src).text();
}

function memosOf(text: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = extractLastJson(text); // a wallet prints log lines around its JSON
  }
  if (Array.isArray(data)) return data.filter((x): x is string => typeof x === "string");
  const obj = (data ?? {}) as { memos?: unknown; value_transfers?: Array<{ memos?: unknown }> };
  if (Array.isArray(obj.memos)) return obj.memos.filter((x): x is string => typeof x === "string");
  if (Array.isArray(obj.value_transfers))
    return obj.value_transfers.flatMap((t) => (Array.isArray(t.memos) ? t.memos : [])).filter((x): x is string => typeof x === "string");
  return [];
}

const memos = memosOf(await read(source));
const report = verifyGame(memos, { code: process.argv[3]?.toUpperCase() });

console.log(`ZKöy game ${report.code ?? "?"} — ${memos.length} memos read\n`);
for (const c of report.checks) console.log(`${c.ok ? "  ok  " : " FAIL "} ${c.name}: ${c.detail}`);
if (report.summary) {
  const s = report.summary;
  console.log(`\n${s.players.length} players, ${s.rounds} round(s), ${s.memos} memos in the full log (${s.roomMemos} in the room wallet)`);
  console.log(`winner: ${s.winner === "koy" ? "village" : "vampires"}`);
  for (const p of s.players) console.log(`  ${p.id.padEnd(4)} ${p.name.padEnd(18)} ${p.role}`);
}
console.log(report.ok ? "\nVERIFIED: the sealed record is complete and every outcome follows from the rules." : "\nNOT VERIFIED.");
process.exit(report.ok ? 0 : 1);
