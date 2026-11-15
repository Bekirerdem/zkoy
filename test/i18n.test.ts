import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { errorText } from "../src/server/i18n";
import { playRandom, seat } from "./play";

const TURKISH = /[çğıöşüÇĞİÖŞÜ]|\b(ve|bir|oldu|gece|gün|kimse)\b/;

/** Every error message thrown anywhere in src, with `${…}` filled in. */
function errorLiterals(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (p.endsWith(".ts")) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/new (?:EngineError|ProtocolError)\(\s*(["`])((?:(?!\1).)*)\1/gs))
          out.push(m[2]!.replace(/\$\{[^}]*\}/g, "1"));
      }
    }
  };
  walk(join(import.meta.dir, "..", "src"));
  return out;
}

describe("English", () => {
  test("every error the server can send has an English version", () => {
    const msgs = errorLiterals();
    expect(msgs.length).toBeGreaterThan(50);
    const missing = msgs.filter((m) => errorText(m, "en") === m);
    expect(missing).toEqual([]);
    for (const m of msgs) expect(errorText(m, "en")).not.toMatch(TURKISH);
    expect(errorText("sunucu hatası", "en")).toBe("Server error.");
    expect(errorText("oda dolu", "tr")).toBe("oda dolu");
  });

  test("announcements and the reveal story come in English too", async () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const t = seat(9 + (seed % 5), "DILDIL");
      expect(await playRandom(t, seed)).toBe(true);
      const names = t.room.state.players.map((p) => p.name);
      const strip = (s: string) => names.reduce((x, n) => x.split(n).join("NAME"), s);
      for (const a of t.room.announcements) {
        expect(a.en).toBeTruthy();
        expect(strip(a.en!)).not.toMatch(TURKISH);
      }
      const story = t.room.story("en");
      expect(story.length).toBeGreaterThan(1);
      for (const c of story) {
        expect(c.title).not.toMatch(TURKISH);
        for (const l of c.lines) expect(strip(l.text)).not.toMatch(TURKISH);
      }
      // Same story, same shape, both languages.
      const tr = t.room.story("tr");
      expect(tr.map((c) => c.lines.length)).toEqual(story.map((c) => c.lines.length));
    }
  });
});
