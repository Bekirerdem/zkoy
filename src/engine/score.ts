// Tournament points of one finished game. Pure: the server computes them at
// END, and the verifier computes the same numbers from the sealed moves, so a
// leaderboard can be re-added by anyone from the games it lists.

import { RoomState } from "./types";

export const POINTS = {
  /** On the winning side (the `kazanan` badge). */
  win: 3,
  /** Alive when the game ends. */
  alive: 1,
  /** The Fool got themself hanged (the `deli` badge). */
  fool: 5,
  /** Each correct ghost prophecy. */
  prophecy: 1,
} as const;

/** Seats that won: the winning side, and the Fool when hanged. */
export function gameWinners(state: RoomState): string[] {
  return [
    ...new Set(
      (state.badges ?? []).filter((b) => b.kind === "kazanan" || b.kind === "deli").map((b) => b.playerId),
    ),
  ];
}

/** Points per seat id. Every seat appears, with 0 if it earned nothing. */
export function gamePoints(state: RoomState): Record<string, number> {
  const out: Record<string, number> = {};
  if (state.phase !== "END") return out;
  for (const p of state.players) {
    let n = 0;
    const badges = (state.badges ?? []).filter((b) => b.playerId === p.id);
    if (badges.some((b) => b.kind === "kazanan")) n += POINTS.win;
    if (badges.some((b) => b.kind === "deli")) n += POINTS.fool;
    if (p.alive) n += POINTS.alive;
    n += (state.kahinScore[p.id] ?? 0) * POINTS.prophecy;
    out[p.id] = n;
  }
  return out;
}
