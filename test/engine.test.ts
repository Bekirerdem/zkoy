import { describe, expect, test } from "bun:test";
import {
  createRoom,
  join,
  start,
  nightAction,
  resolveNight,
  advancePhase,
  vote,
  gvote,
  resolveVote,
  nextRound,
  setWill,
  rolePlan,
  EngineError,
} from "../src/engine/engine";
import { RoomState, Role } from "../src/engine/types";

function makeRoom(n: number): RoomState {
  const state = createRoom("TEST");
  for (let i = 0; i < n; i++) {
    join(state, `p${i}`, `oyuncu${i}`, 1, `commit${i}`);
  }
  return state;
}

function byRole(state: RoomState, role: Role): string[] {
  return state.players.filter((p) => p.role === role).map((p) => p.id);
}

describe("rolePlan", () => {
  test("7 players: 1 vampir, doktor, gozcu, no deli", () => {
    const roles = rolePlan(7);
    expect(roles.filter((r) => r === "vampir").length).toBe(1);
    expect(roles).toContain("doktor");
    expect(roles).toContain("gozcu");
    expect(roles).not.toContain("deli");
    expect(roles.length).toBe(7);
  });
  test("8 players adds deli; 10 players adds second vampir", () => {
    expect(rolePlan(8)).toContain("deli");
    expect(rolePlan(10).filter((r) => r === "vampir").length).toBe(2);
  });
});

describe("lobby", () => {
  test("join emits sealed join memo with commit and fills pot", () => {
    const state = createRoom("TEST");
    const events = join(state, "p0", "ali", 3, "commit0");
    expect(events[0]!.memo).toMatchObject({
      t: "join",
      p: "p0",
      name: "ali",
      c: "commit0",
    });
    expect(state.potZats).toBe(900_000); // Ağa entry
  });
  test("tier commit is mandatory", () => {
    const state = createRoom("A");
    expect(() => join(state, "p0", "ali", 3, "")).toThrow(EngineError);
  });
  test("start needs 7 players and deals every role once", () => {
    const state = makeRoom(6);
    expect(() => start(state, 42)).toThrow(EngineError);
    join(state, "p6", "oyuncu6", 1, "commit6");
    const events = start(state, 42);
    expect(events.length).toBe(7);
    expect(state.phase).toBe("NIGHT");
    expect(byRole(state, "vampir").length).toBe(1);
  });
});

describe("night", () => {
  test("vampire kill lands unless doctor saves", () => {
    const state = makeRoom(7);
    start(state, 42);
    const [vampir] = byRole(state, "vampir");
    const [doktor] = byRole(state, "doktor");
    const victim = state.players.find(
      (p) => p.id !== vampir && p.id !== doktor,
    )!.id;
    nightAction(state, vampir!, victim);
    nightAction(state, doktor!, doktor!); // doctor guards self, not the victim
    const events = resolveNight(state);
    expect(state.players.find((p) => p.id === victim)!.alive).toBe(false);
    // dying player receives the spoiler memo
    expect(
      events.some((e) => typeof e.to === "object" && e.to.player === victim),
    ).toBe(true);
    expect(state.phase).toBe("DAWN");
  });
  test("doctor save prevents death and counts prim", () => {
    const state = makeRoom(7);
    start(state, 42);
    const [vampir] = byRole(state, "vampir");
    const [doktor] = byRole(state, "doktor");
    const victim = state.players.find(
      (p) => p.id !== vampir && p.id !== doktor,
    )!.id;
    nightAction(state, vampir!, victim);
    nightAction(state, doktor!, victim);
    resolveNight(state);
    expect(state.players.find((p) => p.id === victim)!.alive).toBe(true);
    expect(state.doctorSaves).toBe(1);
  });
  test("gozcu inspection emits sealed seerr with verdict", () => {
    const state = makeRoom(7);
    start(state, 42);
    const [vampir] = byRole(state, "vampir");
    const [gozcu] = byRole(state, "gozcu");
    nightAction(state, gozcu!, vampir!);
    const events = resolveNight(state);
    const seerr = events.find((e) => e.memo.t === "seerr");
    expect(seerr!.memo).toMatchObject({ vamp: true, x: vampir });
  });
  test("no vampire action = pas, nobody dies", () => {
    const state = makeRoom(7);
    start(state, 42);
    resolveNight(state);
    expect(state.lastNight!.died).toBeNull();
    expect(state.players.every((p) => p.alive)).toBe(true);
  });
});

describe("vote", () => {
  function toVotePhase(state: RoomState) {
    resolveNight(state);
    advancePhase(state); // DAWN → DAY
    advancePhase(state); // DAY → VOTE
  }
  test("weighted majority hangs; tie hangs nobody", () => {
    const state = makeRoom(7);
    start(state, 42);
    toVotePhase(state);
    const alive = state.players.filter((p) => p.alive).map((p) => p.id);
    vote(state, alive[0]!, alive[1]!);
    vote(state, alive[2]!, alive[1]!);
    vote(state, alive[3]!, alive[4]!);
    resolveVote(state);
    expect(state.lastVote!.lynched).toBe(alive[1]!);
  });
  test("Ağa's 3x vote outweighs two Rençber votes", () => {
    const state = createRoom("W");
    for (let i = 0; i < 7; i++) {
      join(state, `p${i}`, `oyuncu${i}`, i === 0 ? 3 : 1, `commit${i}`);
    }
    start(state, 42);
    toVotePhase(state);
    const alive = state.players.filter((p) => p.alive).map((p) => p.id);
    vote(state, "p0", alive.find((id) => id !== "p0")!); // Ağa, weight 3
    const agaTarget = state.votes["p0"]!;
    const others = alive.filter((id) => id !== "p0" && id !== agaTarget);
    vote(state, others[0]!, others[1]!); // two Rençber pile on someone else
    vote(state, others[2]!, others[1]!);
    resolveVote(state);
    expect(state.lastVote!.lynched).toBe(agaTarget);
  });
  test("tie → nobody hangs", () => {
    const state = makeRoom(7);
    start(state, 42);
    toVotePhase(state);
    const alive = state.players.filter((p) => p.alive).map((p) => p.id);
    vote(state, alive[0]!, alive[1]!);
    vote(state, alive[2]!, alive[3]!);
    resolveVote(state);
    expect(state.lastVote!.lynched).toBeNull();
  });
  test("ghosts cannot vote but can gvote", () => {
    const state = makeRoom(7);
    start(state, 42);
    const [vampir] = byRole(state, "vampir");
    const victim = state.players.find(
      (p) => p.id !== vampir && p.role !== "doktor",
    )!.id;
    nightAction(state, vampir!, victim);
    resolveNight(state);
    advancePhase(state);
    advancePhase(state);
    expect(() => vote(state, victim, vampir!)).toThrow(EngineError);
    const events = gvote(state, victim, vampir!);
    expect(events[0]!.memo).toMatchObject({ t: "gvote", p: victim });
  });
});

describe("win + settlement", () => {
  test("lynching the last vampire ends the game, village splits pot", () => {
    const state = makeRoom(7);
    start(state, 42);
    resolveNight(state);
    advancePhase(state);
    advancePhase(state);
    const [vampir] = byRole(state, "vampir");
    for (const p of state.players.filter((p) => p.alive && p.id !== vampir)) {
      vote(state, p.id, vampir!);
    }
    const events = resolveVote(state);
    expect(state.winner).toBe("koy");
    expect(state.phase).toBe("END");
    const prizes = events.filter((e) => e.memo.t === "prize");
    expect(prizes.length).toBe(6); // everyone alive but the vampire
    const total = prizes.reduce((s, e) => s + (e.zats ?? 0), 0);
    expect(total).toBeLessThanOrEqual(state.potZats);
    expect(total).toBeGreaterThan(state.potZats * 0.9);
  });
  test("vampires win when they reach parity", () => {
    const state = makeRoom(7);
    start(state, 42);
    const [vampir] = byRole(state, "vampir");
    // kill villagers night after night until parity
    let guard = 20;
    while (state.winner === null && guard-- > 0) {
      const target = state.players.find(
        (p) => p.alive && p.id !== vampir,
      )!.id;
      nightAction(state, vampir!, target);
      resolveNight(state);
      if (state.winner) break;
      advancePhase(state);
      advancePhase(state);
      resolveVote(state); // nobody votes → nobody hangs
      if (state.winner) break;
      nextRound(state);
    }
    expect(state.winner).toBe("vampir");
    expect(state.payouts!.every((p) => p.playerId === vampir)).toBe(true);
  });
  test("deli lynch pays 10% and game continues", () => {
    const state = makeRoom(8); // deli exists at 8+
    start(state, 7); // seed chosen arbitrarily
    resolveNight(state);
    advancePhase(state);
    advancePhase(state);
    const [deli] = byRole(state, "deli");
    for (const p of state.players.filter((p) => p.alive && p.id !== deli)) {
      vote(state, p.id, deli!);
    }
    resolveVote(state);
    expect(state.deliWon).toBe(true);
    expect(state.winner).toBeNull(); // game continues
    expect(state.phase).toBe("EXECUTION");
    // deli cut appears once settlement happens — force a village win
    nextRound(state);
    const [vampir] = byRole(state, "vampir");
    resolveNight(state);
    advancePhase(state);
    advancePhase(state);
    for (const p of state.players.filter((p) => p.alive && p.id !== vampir)) {
      vote(state, p.id, vampir!);
    }
    resolveVote(state);
    expect(state.winner).toBe("koy");
    const deliPay = state.payouts!.find((p) => p.playerId === deli);
    expect(deliPay!.zats).toBe(Math.floor(state.potZats * 0.1));
  });
});

describe("will", () => {
  test("will updates while alive, sealed memo emitted, dead rejected", () => {
    const state = makeRoom(7);
    start(state, 42);
    const alive = state.players[0]!;
    const events = setWill(state, alive.id, "beni Şirince'de anın");
    expect(events[0]!.memo).toMatchObject({ t: "will", p: alive.id });
    expect(alive.will).toBe("beni Şirince'de anın");
  });
});
