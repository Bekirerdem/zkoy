import { describe, expect, test } from "bun:test";
import { mulberry32 } from "../src/engine/engine";
import { verifyGame } from "../src/verify/verify";
import { quicksendArg } from "../src/zcash/zingo";
import { playRandom, roomMemos, seat, shuffled } from "./play";

/** One finished game with every awkward path likely to have happened. */
async function finished(seed: number, n = 9) {
  const t = seat(n, "VERIFY", {}, mulberry32(seed));
  expect(await playRandom(t, seed)).toBe(true);
  return { t, memos: roomMemos(t) };
}

describe("bağımsız doğrulama", () => {
  test("rastgele oynanmış 60 oyun: zincirdeki oda memo'ları karışık sırada verilince hepsi doğrulanır", async () => {
    let forced = 0;
    for (let k = 0; k < 60; k++) {
      const rnd = mulberry32(1000 + k);
      const n = 7 + (k % 9);
      const rules = k % 4 === 0 ? { gozcu: true } : k % 4 === 1 ? { accusedVotes: true } : {};
      const t = seat(n, `G${String(k).padStart(5, "0")}`, rules, rnd);
      expect(await playRandom(t, k)).toBe(true);
      const memos = roomMemos(t);
      forced += memos.filter((m) => m.includes('"t":"force"')).length;
      const report = verifyGame(shuffled(memos, rnd));
      if (!report.ok) console.error(k, report.checks.filter((c) => !c.ok));
      expect(report.ok).toBe(true);
      expect(report.summary!.winner).toBe(t.room.state.winner);
      expect(report.summary!.players.map((p) => p.role)).toEqual(t.room.state.players.map((p) => p.role));
      // The same memos, as the server hands them out in /g/<CODE>.json.
      const exported = t.db.gameEvents(t.room.gameId!).filter((e) => e.dest === "room").map((e) => e.memo);
      expect([...exported].sort()).toEqual([...memos].sort());
      // Every memo fits a Zcash memo field.
      for (const b of t.zcash.sent)
        for (const e of b.events) expect(new TextEncoder().encode(JSON.stringify(e.memo)).length).toBeLessThanOrEqual(512);
    }
    expect(forced).toBeGreaterThan(10); // the forced closes really were exercised
  });

  test("tek bir kaydı değiştirmek, silmek ya da eklemek doğrulamayı düşürür", async () => {
    const { memos } = await finished(7);
    expect(verifyGame(memos).ok).toBe(true);
    expect(verifyGame([...memos, ...memos]).ok).toBe(true); // aynı tx iki kez okunmuş: zararsız

    const at = (pred: (m: Record<string, unknown>) => boolean) => memos.findIndex((raw) => pred(JSON.parse(raw)));
    const change = (i: number, patch: Record<string, unknown>) =>
      memos.map((raw, k) => (k === i ? JSON.stringify({ ...JSON.parse(raw), ...patch }) : raw));
    const failed = (ms: string[]) => {
      const r = verifyGame(ms);
      expect(r.ok).toBe(false);
      return r.checks.find((c) => !c.ok)!.name;
    };

    // A night choice rewritten after the fact. If the new choice leads to another
    // outcome the replay stops there; if it does not, the root still gives it away.
    const night = at((m) => m.t === "night");
    const other = (JSON.parse(memos[night]!) as { x: string }).x === "p0" ? "p1" : "p0";
    expect(["replay", "gameroot"]).toContain(failed(change(night, { x: other })));
    // an outcome rewritten: somebody else "died"
    const result = at((m) => m.t === "result" && m.died !== null);
    if (result >= 0) expect(failed(change(result, { died: "Başkası" }))).toBe("replay");
    // a memo withheld
    expect(failed(memos.filter((_, k) => k !== night))).toBe("replay");
    // a seat swapped for another name
    expect(["replay", "gameroot"]).toContain(failed(change(at((m) => m.t === "seat" && m.p === "p2"), { name: "Sahte" })));
    // a nonce changed: the seed no longer follows
    expect(failed(change(at((m) => m.t === "seat" && m.p === "p0"), { n: "ffff" }))).toBe("shuffle seed");
    // another secret revealed
    expect(failed(change(at((m) => m.t === "seedr"), { salt: "00" }))).toBe("commitment");
    // the winner flipped in the root
    expect(failed(change(at((m) => m.t === "gameroot"), { w: "vampir-koy" }))).toBe("gameroot");
    // a move added after the end
    const last = Math.max(...memos.map((raw) => Number((JSON.parse(raw) as { i?: number }).i ?? -1)));
    expect(failed([...memos, JSON.stringify({ v: 4, g: "VERIFY", t: "will", p: "p0", txt: "sonradan", i: last + 1 })])).toBe("replay");
  });

  test("bitmemiş oyun ve yabancı memo'lar: açık bir sebep döner", async () => {
    const { memos } = await finished(11, 8);
    const unfinished = verifyGame(memos.filter((raw) => !raw.includes('"seedr"') && !raw.includes('"gameroot"')));
    expect(unfinished.ok).toBe(false);
    expect(unfinished.checks.at(-1)!.name).toBe("reveal");
    expect(verifyGame(["merhaba", '{"v":3,"g":"ESKI","t":"join"}']).checks[0]!.detail).toContain("no v4");
    expect(verifyGame([...memos, "bağış için teşekkürler", '{"başka":"json"}']).ok).toBe(true);
  });

  test("kesme işareti zincire olduğu gibi gider: cüzdana verilen metin, özeti alınan metinle aynı", () => {
    const memo = JSON.stringify({ v: 4, g: "ABCDEF", t: "will", p: "p1", txt: "Vampir Ahmet'tir, Ali'ye \"güvenmeyin\"\\", i: 12 });
    const arg = quicksendArg([{ address: "utest1x", amount: 0, memo }]);
    expect(arg.includes("'")).toBe(false); // tek tırnaklı komut satırını bozmaz
    expect((JSON.parse(arg) as Array<{ memo: string }>)[0]!.memo).toBe(memo);
  });
});
