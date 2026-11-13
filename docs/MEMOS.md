# ZKöy memo format v4

Everything a game seals is a small JSON object in a Zcash shielded memo (at most 512 bytes). This page is the reference for anyone who wants to read a game from chain or write their own verifier. The reference verifier is [`src/verify/verify.ts`](../src/verify/verify.ts); run it with `bun tools/verify.ts`.

## Envelope

```json
{ "v": 4, "g": "ACDE23", "t": "night", "r": 2, "p": "p3", "x": "p6", "i": 41 }
```

| Field | Meaning |
|---|---|
| `v` | format version, `4` |
| `g` | room code; a room hosts exactly one game |
| `t` | memo type, see below |
| `i` | position of the memo in the game's log, starting at 0. Outputs inside one transaction have no reliable order on chain; `i` gives it back |
| `r` | round, where it applies (`0` = the election) |
| `p`, `x` | acting seat and target seat (`p0` … `p14`) |

Memos go to one of two places:

- the **room wallet**: its viewing key is revealed when the game ends, so anyone holding it reads every room memo;
- a **player card wallet** (one per seat, held by the server): role cards, ghost spoilers and badges. Their viewing keys are not published. A verifier does not need them: these memos follow from the rules and are regenerated during the replay.

Nothing is sealed while a table is still in the lobby. The roster is sealed when the game starts.

## Types

**Moves** — sealed inputs. Each one is something a player or a table leader did.

| `t` | Fields | Meaning |
|---|---|---|
| `seat` | `p`, `name`, `n` | one per player at the start, in seat order. `n` is the phone's own random nonce (hex, may be empty) |
| `seed` | `c`, `k`, `rules` | follows the seats. `c` = `sha256(secret)`, `k` = number of seats, `rules` = the table's rule switches |
| `nom` | `p` | stands for Muhtar |
| `mvote` | `r:0`, `p`, `x` | election vote |
| `night` | `r`, `p`, `x` | night choice of a vampire, the doctor or the seer; a later memo by the same seat in the same round replaces it |
| `phase` | `r`, `ph`, `by` | `DAY`, `NIGHT` or `VERDICT` opened by `muhtar`, `host` or `accused` |
| `accuse`, `second` | `r`, `p`, `x` | accusation and support |
| `verdict` | `r`, `p`, `x`, `y` | open vote: `y:1` hang, `y:0` spare |
| `gvote` | `r`, `p`, `x` | a ghost's prophecy for the day |
| `will` | `p`, `txt` | last words |
| `heir` | `p`, `x` | a dead Muhtar names a successor |
| `force` | `r`, `what`, `by` | a leader closed a step that was waiting on someone: `election`, `night` or `verdict`. A vote not cast when a verdict is closed counts as "spare" |

**Outcomes** — what the rules produce from the moves. A verifier recomputes each of them and compares.

| `t` | Fields | Meaning |
|---|---|---|
| `role` | `role` | role card, to the player's card wallet |
| `muhtar` | `p`, `w` | elected Muhtar and the weight of their vote |
| `seerr` | `r`, `p`, `x`, `vamp` | what the seer learned |
| `result` | `r`, `died`, `saved`, `lynched`, `role`, `acq` | end of a night or of a trial |
| `trial` | `r`, `x`, `by`, `n` | a trial opened: accused, supporters, support weight |
| `spoiler` | `roles` | all roles, to a dead player's card wallet |
| `phase` | `ph:"END"`, `winner` | the game ended |
| `badge` | `kind` | end-of-game badge, to the player's card wallet |
| `seedr` | `seed`, `salt` | the reveal: `salt` is the server's secret, `seed` the shuffle seed |
| `gameroot` | `h`, `n`, `w` | `h` = SHA-256 over the `n` memos of the log (positions 0 … n-1, joined by `\n`), `w` = winner. Carries no `i` |

## The draw

1. When a room is created the server picks a random secret and publishes `c = sha256(secret)`. Every phone shows it from the lobby on and keeps what it saw.
2. Each phone sends its own random nonce when it takes a seat.
3. At the start: `seed = first 4 bytes of sha256(secret + "|" + nonces joined by "|")`, shifted right by one bit. Roles are a Fisher–Yates shuffle of the role list driven by `mulberry32(seed)`, dealt in seat order.
4. A tied or empty Muhtar election is settled with `sha256(secret + "|muhtar")` in the same way.
5. At the end `seedr` reveals the secret.

The server cannot pick the roles: it is bound by `c` before it sees the nonces. The players cannot either: they never see the secret.

## Verifying a game

Read the room wallet's memos with the revealed viewing key, in any order, and:

1. check `sha256(salt) == c` and recompute `seed` from the secret and the seat nonces;
2. seat the players, deal the roles, then apply the moves in `i` order through the rule engine. Every outcome memo on chain must be byte for byte what the engine produces at that position. A gap in `i` is where the engine produced a card for a player's wallet;
3. hash the full regenerated log and compare it with `gameroot`.

If all three hold, the record is complete (nothing withheld or added), the roles came from the committed draw, and every announced result, from the Muhtar to the winner, follows from the sealed moves.

What this does not prove: that a sealed move is the one the player tapped. Phones do not sign their moves. Votes are open and shown on every phone as they are cast; night moves are checked by their authors at the reveal party.
