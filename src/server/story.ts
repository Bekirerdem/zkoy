// İfşa partisi: oyun bitince olay günlüğünden "kim, ne zaman, ne yaptı"
// hikâyesi. Her satır, dayandığı memo'lar zincire oturduysa `sealed`.

import { Role } from "../engine/types";
import { Db } from "./db";
import { Lang, ROLE_EN } from "./i18n";

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
  lang: Lang = "tr",
): StoryChapter[] {
  const rows = db.sql
    .query(`SELECT memo, txid FROM events WHERE game_id = ? ORDER BY id`)
    .all(gameId) as Row[];
  const name = (id: unknown) => players.find((p) => p.id === id)?.name ?? "?";
  const role = (id: unknown) => players.find((p) => p.id === id)?.role ?? null;
  const en = lang === "en";
  /** Belirtme hâli yalnız Türkçede: İngilizcede ad olduğu gibi kalır. */
  const acc = (n: string) => (en ? n : accusative(n));

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
  // Muhtar seçimi: her seçmenin son oyu (eşitlik anlatımı için).
  const electionVotes = new Map<string, string>();
  let electionSealed = true;

  for (const row of rows) {
    const m = JSON.parse(row.memo) as Record<string, unknown>;
    const sealed = !!row.txid;
    const r = Number(m.r ?? 0);
    const night = () => chapter(en ? `Night ${r}` : `${r}. gece`, "night");
    const day = () => chapter(en ? `Day ${r}` : `${r}. gün`, "day");
    switch (m.t) {
      case "mvote":
        electionVotes.set(String(m.p), String(m.x));
        electionSealed &&= sealed;
        break;
      case "muhtar": {
        const tally = new Map<string, number>();
        for (const c of electionVotes.values()) tally.set(c, (tally.get(c) ?? 0) + 1);
        const top = Math.max(0, ...tally.values());
        const tied = [...tally].filter(([, n]) => n === top).map(([c]) => name(c));
        const muhtar = acc(name(m.p));
        const text = en
          ? tally.size === 0
            ? `Nobody stood; the narrator drew lots and made ${muhtar} Muhtar.`
            : tied.length > 1
              ? `${tied.join(" and ")} tied ${top}-${top}; the narrator drew lots and made ${muhtar} Muhtar.`
              : `The village elected ${muhtar} Muhtar with ${top} vote${top === 1 ? "" : "s"}.`
          : tally.size === 0
            ? `Aday çıkmadı; ebe kurayla ${muhtar} Muhtar yaptı.`
            : tied.length > 1
              ? `${tied.join(" ile ")} ${top}-${top} berabere kaldı; ebe kurayla ${muhtar} Muhtar yaptı.`
              : `Köy ${top} oyla ${muhtar} Muhtar seçti.`;
        chapter(en ? "Election" : "Seçim", "start").lines.push({ text, sealed: sealed && electionSealed });
        break;
      }
      case "night": {
        const who = role(m.p);
        const actor = name(m.p);
        const target = acc(name(m.x));
        const text = en
          ? who === "vampir"
            ? `${actor} (vampire) chose ${target}.`
            : who === "doktor"
              ? m.p === m.x
                ? `${actor} (doctor) protected themselves.`
                : `${actor} (doctor) protected ${target}.`
              : who === "gozcu"
                ? `${actor} (seer) checked ${target}.`
                : `${actor} made a move.`
          : who === "vampir"
            ? `${actor} (vampir) ${target} seçti.`
            : who === "doktor"
              ? m.p === m.x
                ? `${actor} (doktor) kendini korudu.`
                : `${actor} (doktor) ${target} korudu.`
              : who === "gozcu"
                ? `${actor} (gözcü) ${target} sorguladı.`
                : `${actor} bir hamle yaptı.`;
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
          text: en
            ? `The seer learned: ${name(m.x)} ${m.vamp ? "is a vampire" : "is not a vampire"}.`
            : `Gözcü öğrendi: ${name(m.x)} ${m.vamp ? "vampir" : "vampir değil"}.`,
          sealed,
        });
        break;
      case "accuse":
        day().lines.push({
          text: en ? `${name(m.p)} accused ${name(m.x)}.` : `${name(m.p)}, ${accusative(name(m.x))} suçladı.`,
          sealed,
        });
        break;
      case "second":
        day().lines.push({
          text: en
            ? `${name(m.p)} backed the accusation (${name(m.x)}).`
            : `${name(m.p)} suçlamayı destekledi (${name(m.x)}).`,
          sealed,
        });
        break;
      case "trial": {
        const by = Array.isArray(m.by) ? (m.by as unknown[]).map(name).join(", ") : "";
        day().lines.push({
          text: en
            ? `Trial opened: ${name(m.x)} was tried${by ? ` (backed by ${by})` : ""}.`
            : `Dava açıldı: ${name(m.x)} yargılandı${by ? ` (destek: ${by})` : ""}.`,
          sealed,
        });
        trial = { round: r, accused: String(m.x), votes: new Map(), sealed: true };
        break;
      }
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
              [...trial!.votes].filter(([, v]) => v === y).map(([p]) => name(p)).join(", ") || (en ? "nobody" : "kimse");
            votes = en ? ` Hang: ${who(true)}. Spare: ${who(false)}.` : ` Assın: ${who(true)}. Asmasın: ${who(false)}.`;
          }
          const who = String(m.lynched ?? m.acq);
          const r0 = typeof m.role === "string" ? (m.role as Role) : null;
          const was = r0 ? (en ? `a ${ROLE_EN[r0]}` : WAS[r0]) : null;
          day().lines.push({
            text: m.lynched
              ? en
                ? `${who} was hanged${was ? `: ${was}` : ""}.${votes}`
                : `${who} asıldı${was ? `: ${was}` : ""}.${votes}`
              : en
                ? `${who} was acquitted.${votes}`
                : `${who} beraat etti.${votes}`,
            sealed: sealed && (trial?.sealed ?? true),
          });
          trial = null;
        } else {
          night().lines.push({
            text: m.died
              ? en
                ? `In the morning ${String(m.died)} was found dead.`
                : `Sabah ${String(m.died)} ölü bulundu.`
              : m.saved
                ? en
                  ? "The doctor got there in time; nobody died."
                  : "Doktor yetişti, kimse ölmedi."
                : en
                  ? "A quiet night passed."
                  : "Sessiz bir gece geçti.",
            sealed,
          });
        }
        break;
      }
      case "heir":
        chapter(en ? `Day ${r || 1}` : `${r || 1}. gün`, "day").lines.push({
          text: en
            ? `${name(m.p)} handed on the office: the new Muhtar is ${name(m.x)}.`
            : `${name(m.p)} makamı bıraktı: yeni Muhtar ${name(m.x)}.`,
          sealed,
        });
        break;
    }
  }
  return chapters.filter((c) => c.lines.length > 0);
}
