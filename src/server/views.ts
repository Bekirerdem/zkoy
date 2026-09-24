// Görünümler: herkese açık meydan (perde dahil) ve oyuncuya özel kart.
// Kural: roller yalnız ölüye, END'de herkese ve vampire takım arkadaşı olarak
// açılır; gözcü sonucu yalnız gözcüye; hayalet kehanetleri gizli.

import { supportWeight, trialNeed, weightOf } from "../engine/engine";
import { Role } from "../engine/types";
import { CmdKind } from "./protocol";
import { NIGHT_FORCE_MS, Room, sha256Hex } from "./room";
import { SealQueue } from "./seal-queue";

export interface PublicPlayer {
  id: string;
  name: string;
  alive: boolean;
  isHost: boolean;
  isMuhtar: boolean;
  /** Ölünce ya da END'de açıklanan rol. */
  role: Role | null;
}

export function publicView(room: Room, seals: SealQueue, chain: string) {
  const s = room.state;
  const end = s.phase === "END";
  const sealed = seals.sealed(room.code);
  const tally: Record<string, number> = {};
  for (const c of Object.values(s.election.votes)) tally[c] = (tally[c] ?? 0) + 1;
  return {
    code: s.code,
    phase: s.phase,
    round: s.round,
    rules: s.rules,
    hostPid: room.hostPid,
    muhtar: s.muhtar,
    muhtarWeight: s.muhtarWeight,
    heirPending: s.heirPending,
    players: s.players.map(
      (p): PublicPlayer => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        isHost: p.id === room.hostPid,
        isMuhtar: p.id === s.muhtar,
        role: end || !p.alive ? p.role : null,
      }),
    ),
    election: { candidates: s.election.candidates, votes: s.election.votes, tally },
    day: {
      stage: s.day.stage,
      accusations: s.day.accusations,
      /** suçlanan → destekleyenler (ilki suçlayan) ve toplam ağırlık; eşik `need`. */
      backers: s.day.backers,
      support: Object.fromEntries(Object.keys(s.day.backers).map((x) => [x, supportWeight(s, x)])),
      need: trialNeed(s),
      trial: s.day.trial,
      triedToday: s.day.triedToday,
      weights: s.day.trial
        ? Object.fromEntries(s.players.filter((p) => p.alive).map((p) => [p.id, weightOf(s, p.id)]))
        : null,
    },
    lastNight: s.lastNight ? { round: s.lastNight.round, died: s.lastNight.died, saved: s.lastNight.saved } : null,
    lastVerdict: s.lastVerdict,
    winner: s.winner,
    deliWon: s.deliWon,
    badges: end ? s.badges : null,
    kahinScore: end ? s.kahinScore : null,
    reveal: end
      ? {
          seed: s.seed,
          salt: s.seedSalt,
          commit: s.seedCommit,
          // Kura doğrulaması: sha256(seed|salt) oyun başında mühürlenen taahhüde eşit mi.
          seedOk: s.seed !== null && !!s.seedSalt && sha256Hex(`${s.seed}|${s.seedSalt}`) === s.seedCommit,
          ufvk: room.ufvk,
          roomAddress: room.address,
        }
      : null,
    story: end ? room.story() : null,
    nightStartedAt: room.nightStartedAt,
    announcements: room.announcements.slice(-12),
    seals: {
      chain,
      txCount: sealed.length,
      memoCount: sealed.reduce((n, x) => n + x.n, 0),
      pending: seals.pendingCount(room.code),
      recent: sealed.slice(-5).map((x) => x.txid),
    },
  };
}

export function privateView(room: Room, pid: string) {
  const s = room.state;
  const me = s.players.find((p) => p.id === pid);
  if (!me) return null;
  const vampire = me.role === "vampir";
  const ghost = !me.alive;
  return {
    pid,
    name: me.name,
    role: me.role,
    alive: me.alive,
    isHost: room.isHost(pid),
    isMuhtar: room.isMuhtar(pid),
    will: me.will,
    team: vampire ? s.players.filter((p) => p.role === "vampir" && p.id !== pid).map((p) => p.id) : [],
    /** Bu gecenin seçimleri: vampire takım hedefleri, doktora/gözcüye kendi seçimi. */
    night:
      s.phase !== "NIGHT"
        ? null
        : vampire
          ? { targets: s.night.vampireTargets }
          : me.role === "doktor"
            ? { save: s.night.doctorSave }
            : me.role === "gozcu"
              ? { query: s.night.gozcuTarget }
              : null,
    gozcuLog: me.role === "gozcu" ? room.gozcuLog : [],
    /** Hayaletler herkesin rolünü görür (spoiler memo'sunun ekran karşılığı). */
    roles: ghost ? Object.fromEntries(s.players.map((p) => [p.id, p.role])) : null,
    myProphecy: ghost ? (s.gvotes[pid] ?? null) : null,
    heirRight: s.heirPending === pid,
    can: allowed(room, pid),
  };
}

type Can = "nominate" | "mvote" | "night" | "accuse" | "second" | "done" | "verdict" | "gvote" | "will" | "heir" | CmdKind;

/** İstemcinin düğme göstermesi için; asıl yetki denetimi motorda ve Room'da. */
function allowed(room: Room, pid: string): Can[] {
  const s = room.state;
  const me = s.players.find((p) => p.id === pid)!;
  const host = room.isHost(pid);
  const leader = host || room.isMuhtar(pid);
  const can: Can[] = [];
  const trial = s.day.trial;
  switch (s.phase) {
    case "LOBBY":
      if (host) can.push("start", "kick");
      break;
    case "ELECTION":
      if (me.alive && !s.election.candidates.includes(pid)) can.push("nominate");
      if (me.alive && s.election.candidates.length > 0) can.push("mvote");
      if (host) can.push("closeElection");
      break;
    case "NIGHT":
      if (me.alive && (me.role === "vampir" || me.role === "doktor" || me.role === "gozcu")) can.push("night");
      if (host && Date.now() - (room.nightStartedAt ?? 0) >= NIGHT_FORCE_MS) can.push("closeNight");
      break;
    case "DAWN":
      if (leader) can.push("startDay");
      break;
    case "DAY":
      if (!me.alive) can.push("gvote");
      if (s.day.stage === "free" && me.alive) {
        can.push("accuse");
        if (Object.entries(s.day.backers).some(([x, list]) => x !== pid && !list.includes(pid))) can.push("second");
      }
      if (s.day.stage === "free" && leader) can.push("closeDay");
      if (s.day.stage === "trial" && trial?.accused === pid) can.push("done");
      if (s.day.stage === "trial" && leader) can.push("toVerdict");
      if (
        s.day.stage === "verdict" &&
        me.alive &&
        (s.rules.accusedVotes || trial?.accused !== pid)
      )
        can.push("verdict");
      break;
    case "EXECUTION":
      if (leader) can.push("nextRound");
      break;
  }
  if (s.heirPending === pid && (s.phase === "DAWN" || s.phase === "EXECUTION")) can.push("heir");
  if (me.alive && s.phase !== "END") can.push("will");
  return can;
}
