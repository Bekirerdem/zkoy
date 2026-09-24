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

/** Belirtme hâli: Hasan'ı, Ali'yi, Rıza'yı, Kâzım'ı, Nuriye'yi, Gül'ü. */
export function accusative(name: string): string {
  const lower = name.toLocaleLowerCase("tr");
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
  // Karar oyları davaya toplanır, tek satırda anlatılır.
  let trial: { round: number; accused: string; yes: string[]; no: string[]; sealed: boolean } | null = null;

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
        night().lines.push({ text, sealed });
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
        trial = { round: r, accused: String(m.x), yes: [], no: [], sealed: true };
        break;
      case "verdict":
        if (trial) {
          (m.y ? trial.yes : trial.no).push(name(m.p));
          trial.sealed &&= sealed;
        }
        break;
      case "result": {
        if (m.lynched || m.acq) {
          const votes = trial
            ? ` Assın: ${trial.yes.join(", ") || "kimse"}. Asmasın: ${trial.no.join(", ") || "kimse"}.`
            : "";
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
