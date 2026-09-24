// İfşa partisi: oyun bitince olay günlüğünden "kim, ne zaman, ne yaptı"
// hikâyesi. Her satır, dayandığı memo'lar zincire oturduysa `sealed`.

import { Role } from "../engine/types";
import { Db } from "./db";

export interface StoryLine {
  text: string;
  sealed: boolean;
}

export interface StoryChapter {
  title: string; // "1. gece", "1. gün"
  kind: "night" | "day" | "start";
  lines: StoryLine[];
}

const WAS: Record<Role, string> = {
  vampir: "vampirdi",
  koylu: "köylüydü",
  doktor: "doktordu",
  gozcu: "gözcüydü",
  deli: "deliydi",
};

const BACK = new Set([..."aıou"]);
const FRONT = new Set([..."eiöü"]);
const VOWELS = new Set([..."aıoueiöüâîû"]);

/** İnce "l" ile biten, ünlü uyumuna uymayan yaygın isimler: Cemal'i, Kemal'i. */
const FRONT_L = new Set(["cemal", "kemal", "celal", "hilal", "bilal", "iclal", "vişal", "kamal", "nihal", "cemil", "kemâl", "celâl"]);

/** Belirtme hâli: Hasan'ı, Ali'yi, Rıza'yı, Kâzım'ı, Nuriye'yi, Gül'ü, Cemal'i. */
export function accusative(name: string): string {
  const lower = name.toLocaleLowerCase("tr");
  if (FRONT_L.has(lower)) return `${name}'i`;
  let last = "e";
  for (const ch of lower) if (VOWELS.has(ch)) last = ch;
  const norm = last === "â" ? "a" : last === "î" ? "i" : last === "û" ? "u" : last;
  const suffix = BACK.has(norm)
    ? norm === "a" || norm === "ı" ? "ı" : "u"
    : FRONT.has(norm)
      ? norm === "e" || norm === "i" ? "i" : "ü"
      : "i";
  const endsVowel = VOWELS.has(lower[lower.length - 1] ?? "");
  return `${name}'${endsVowel ? "y" : ""}${suffix}`;
}

interface Row {
  memo: string;
  txid: string | null;
}

export function buildStory(
  db: Db,
  gameId: number,
  players: Array<{ id: string; name: string; role: Role | null }>,
): StoryChapter[] {
  const rows = db.sql
    .query(`SELECT memo, txid FROM events WHERE game_id = ? ORDER BY id`)
    .all(gameId) as Row[];
  const name = (id: unknown) => players.find((p) => p.id === id)?.name ?? "?";
  const role = (id: unknown) => players.find((p) => p.id === id)?.role ?? null;

  const chapters: StoryChapter[] = [];
  const chapter = (title: string, kind: StoryChapter["kind"]) => {
    let c = chapters.find((x) => x.title === title);
    if (!c) {
      c = { title, kind, lines: [] };
      chapters.push(c);
    }
    return c;
  };
  // Karar oyları davaya toplanır, tek satırda anlatılır; fikir değiştiren
  // oyuncunun yalnız son oyu sayılır (motor da böyle sayar).
  let trial: { round: number; accused: string; votes: Map<string, boolean>; sealed: boolean } | null = null;
  // Gece hamlesi değiştirilebilir: aynı turda aynı oyuncunun satırı güncellenir.
  const nightLine = new Map<string, StoryLine>();

  for (const row of rows) {
    const m = JSON.parse(row.memo) as Record<string, unknown>;
    const sealed = !!row.txid;
    const r = Number(m.r ?? 0);
    const night = () => chapter(`${r}. gece`, "night");
    const day = () => chapter(`${r}. gün`, "day");
    switch (m.t) {
      case "muhtar":
        chapter("Seçim", "start").lines.push({ text: `Köy ${accusative(name(m.p))} Muhtar seçti.`, sealed });
        break;
      case "night": {
        const who = role(m.p);
        const text =
          who === "vampir"
            ? `${name(m.p)} (vampir) ${accusative(name(m.x))} seçti.`
            : who === "doktor"
              ? m.p === m.x
                ? `${name(m.p)} (doktor) kendini korudu.`
                : `${name(m.p)} (doktor) ${accusative(name(m.x))} korudu.`
              : who === "gozcu"
                ? `${name(m.p)} (gözcü) ${accusative(name(m.x))} sorguladı.`
                : `${name(m.p)} bir hamle yaptı.`;
        const key = `${r}:${String(m.p)}`;
        const prev = nightLine.get(key);
        if (prev) {
          prev.text = text;
          prev.sealed = prev.sealed && sealed;
        } else {
          const line = { text, sealed };
          nightLine.set(key, line);
          night().lines.push(line);
        }
        break;
      }
      case "seerr":
        night().lines.push({
          text: `Gözcü öğrendi: ${name(m.x)} ${m.vamp ? "vampir" : "vampir değil"}.`,
          sealed,
        });
        break;
      case "accuse":
        day().lines.push({ text: `${name(m.p)}, ${accusative(name(m.x))} suçladı.`, sealed });
        break;
      case "second":
        day().lines.push({ text: `${name(m.p)} destekledi: ${name(m.x)} yargılandı.`, sealed });
        trial = { round: r, accused: String(m.x), votes: new Map(), sealed: true };
        break;
      case "verdict":
        if (trial) {
          trial.votes.set(String(m.p), !!m.y);
          trial.sealed &&= sealed;
        }
        break;
      case "result": {
        if (m.lynched || m.acq) {
          let votes = "";
          if (trial) {
            const who = (y: boolean) =>
              [...trial!.votes].filter(([, v]) => v === y).map(([p]) => name(p)).join(", ") || "kimse";
            votes = ` Assın: ${who(true)}. Asmasın: ${who(false)}.`;
          }
          const who = String(m.lynched ?? m.acq);
          const was = typeof m.role === "string" ? WAS[m.role as Role] : null;
          day().lines.push({
            text: m.lynched
              ? `${who} asıldı${was ? `: ${was}` : ""}.${votes}`
              : `${who} beraat etti.${votes}`,
            sealed: sealed && (trial?.sealed ?? true),
          });
          trial = null;
        } else {
          night().lines.push({
            text: m.died
              ? `Sabah ${String(m.died)} ölü bulundu.`
              : m.saved
                ? "Doktor yetişti, kimse ölmedi."
                : "Sessiz bir gece geçti.",
            sealed,
          });
        }
        break;
      }
      case "heir":
        chapter(`${r || 1}. gün`, "day").lines.push({
          text: `${name(m.p)} makamı bıraktı: yeni Muhtar ${name(m.x)}.`,
          sealed,
        });
        break;
    }
  }
  return chapters.filter((c) => c.lines.length > 0);
}
