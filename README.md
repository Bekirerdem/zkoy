# ZKöy

**A social deduction party game on Zcash.** Seven to fifteen people sit at one table, each with a phone. The app runs the game as the narrator; every night move and every vote is sealed into a Zcash shielded memo, so when the game ends anyone can check that nothing was changed behind their back.

Play it at **[zkoy.fun](https://zkoy.fun)** (Zcash testnet). No install, no wallet, no sign-up: open the link or scan the QR at the table.

---

## Why Zcash

In the classic Vampire Village game, one person, the narrator, knows every secret. Players have to trust that the narrator dealt the roles fairly, counted the night honestly and did not change a vote. ZKöy replaces that trust with a record nobody can rewrite, and it does it with Zcash's own primitives: no smart contract, no custom circuit.

| At the table | On Zcash |
|---|---|
| Your role card | an encrypted memo to a card wallet the server keeps for your seat |
| Night moves, accusations, votes, last words | memos to the room wallet, sealed during play |
| A fair shuffle | the server commits to a secret before anyone sits down; every phone adds its own random number; the roles are drawn from both |
| The whole game | a `gameroot` memo: one hash over every memo of the game, written at the end |
| "Who did what?" | the room's viewing key is revealed at the end; anyone can read the full log |
| "Was it counted honestly?" | one command replays the sealed moves through the game's rules and checks every result |

Seals use zero-value shielded outputs, so a game costs only network fees: about **0.003 TAZ for an 8-player game** on testnet (measured September 2026). Players never see the words wallet, ZEC or memo; they see a seal counter and, at the end, the reveal party.

## How a game goes

1. **Lobby.** The host creates a room and shows the QR. Everyone joins from their phone. The lobby shows the role mix for the current table size.
2. **Election.** The village picks a Muhtar (headman) by open vote. A tie or no candidate is settled by a seeded draw, and the table is told why. The Muhtar's vote counts double (triple with 13+ players) and they run the day.
3. **Night.** Everyone closes their eyes. Vampires pick a victim together, the doctor protects someone, the seer (13+ players, or when the host enables it) learns whether one player is a vampire. Phones without a night role only show "the village sleeps".
4. **Dawn.** The victim and their role are announced, with their last words.
5. **Day.** Anyone can accuse. A trial opens only when support reaches the threshold: at least 3, scaled to the living players (4-9 alive: 3, 10-12: 4, 13-15: 5), with the Muhtar's support counting double. The accused defends, then the table votes openly. More than half hangs; the role is revealed.
6. **End.** The village wins when every vampire is hanged; the vampires win when they equal the rest. The Fool (8+ players) also wins if the village hangs them. Then the **reveal party**: night by night, who chose whom, who protected whom and how everyone voted, each line marked as sealed.

First-time players get five short rule cards. A narrator screen introduces each phase so the table always knows what happens next.

## Verify a game yourself

At the end of every game the app reveals the server's secret, the shuffle seed and the room's viewing key (**Seal details**). With them, one command checks the whole game:

```bash
bun tools/verify.ts https://zkoy.fun/g/<ROOM>.json
```

That reads the game's record from the server. To take the server out of the picture, read the same memos from chain with the room's viewing key and pipe them in:

```bash
zingo-cli --chain testnet --server https://testnet.zec.rocks:443 \
  --data-dir <empty-dir> --viewkey "<room-viewing-key>" \
  --birthday <a height before the game> --waitsync messages \
  | bun tools/verify.ts -
```

The verifier trusts nothing but the memos. It checks three things:

1. **The draw.** `sha256(secret)` equals the commitment that was fixed when the room was created and sealed before any role was dealt, and the shuffle seed follows from that secret plus every phone's own nonce. The server could not choose the roles; neither could a player.
2. **The play.** The sealed moves are replayed through the same rule engine the server runs. Every result on chain, from who became Muhtar and who died each night to who was hanged and who won, must be exactly what the rules produce from those moves.
3. **The whole log.** The replay also regenerates the memos the room key cannot read (role cards, ghost spoilers, badges). The SHA-256 over all of them must equal the sealed `gameroot`, so nothing was added, dropped or reordered.

The memo format is specified in [docs/MEMOS.md](docs/MEMOS.md), enough to write an independent verifier.

**What this does not prove.** Phones do not sign their moves, so the chain cannot show that a sealed move is the one the player tapped. Votes are open and appear on every phone as they are cast; night moves are checked by their authors at the reveal party. The server also knows every role while the game runs, as a human narrator would. See [SECURITY.md](SECURITY.md).

## Architecture

```
 phones (web client)                     big screen (spectator view)
            │  WebSocket                       │
            ▼                                  ▼
 ┌──────────────────────── Bun server (single process) ─────────────────────────┐
 │ game engine   pure state machine; every move returns the memos to seal       │
 │ room layer    phases, host and Muhtar authority, public vs private views     │
 │ SQLite        games, unique devices, event log with txids, snapshots         │
 │ seal queue    durable, one tx per round, a failing room never blocks others  │
 └──────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
 zingo-cli (fork on Zakura Common crates) ──gRPC──▶ lightwalletd ──▶ Zcash testnet
```

- **Tempo from the server, proof from the chain.** The game never waits for a block; seals catch up within a minute or two, one transaction per round.
- **Nothing secret leaves the server early.** The public view never contains a living player's role or a night choice; each phone receives only its own card.
- **Restart-safe.** Room state and the seal queue live in SQLite; a server restart resumes games where they stopped. The database is copied once a day to `data/backups/`.
- **A table cannot get stuck or be flooded.** A vote someone walked away from can be closed after a minute, a table whose host dropped can be taken over, and nothing is sealed for a table that never starts. Moves are rate-limited and every memo is checked against the 512-byte limit before it is queued.
- The zingo-cli fork and the reason for its testnet `network clearnet` patch are documented in [docs/zingo-patch.md](docs/zingo-patch.md).

## Run it locally

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
bun run dev                         # mock chain: the full game, no Zcash needed
bun test                            # engine, rules, rooms, storage, WebSocket, verifier
bun tools/bots.ts <ROOM> 6          # seat six bots in a room for a solo run-through
bun tools/verify.ts http://localhost:3131/g/<ROOM>.json   # check the finished game
```

Open `http://localhost:3131/?test=1`, create a room, add bots, start. A table created with `?test=1` is labelled as a test: it is played and sealed like any other, but never counted. The spectator view is `/?perde=<ROOM>`; live counters are at `/stats`, finished games at `/games`.

To seal on testnet, build the zingo-cli fork (see [docs/zingo-patch.md](docs/zingo-patch.md)) and run with `ZKOY_CHAIN=zingo`.

| Variable | Default | Purpose |
|---|---|---|
| `ZKOY_CHAIN` | `mock` | `zingo` seals on chain |
| `ZKOY_PORT` | `3131` | HTTP and WebSocket port |
| `ZKOY_DB` | `data/zkoy.sqlite` | SQLite file |
| `ZINGO_BIN` | fork build path | zingo-cli binary |
| `ZKOY_LWD` | `https://testnet.zec.rocks:443` | lightwalletd endpoint |
| `ZKOY_OPS_DIR` | `~/.zingo-testnet` | wallet that pays the seals |
| `ZKOY_OPS_ADDRESS` | none | enables the automatic testnet faucet top-up |
| `ZKOY_WALLETS_ROOT` | `~/.zkoy-wallets` | per-room and per-player wallets |

## Repository

```
src/engine/    game rules as a pure state machine
src/server/    WebSocket server, rooms, views, SQLite, seal queue, reveal story
src/zcash/     chain service (zingo-cli and mock), faucet top-up
src/verify/    independent verifier: replays a game from its memos
web/           the web client
mobile/        Flutter app (in progress)
tools/         verify.ts (check a game), bots.ts (rehearsal bots), mark-test.ts
test/          bun test suites
```

| Document | Contents |
|---|---|
| [SPEC.md](SPEC.md) | Product spec and rules (Turkish) |
| [docs/MEMOS.md](docs/MEMOS.md) | Memo format v4 and how a game is verified |
| [docs/API.md](docs/API.md) | WebSocket contract shared by the web client and the Flutter app |
| [docs/zingo-patch.md](docs/zingo-patch.md) | zingo-cli fork, testnet clearnet patch, Zakura Common wiring |

## Status

- **Live on testnet** at [zkoy.fun](https://zkoy.fun). The prototype was played at two in-person events in Türkiye in August 2026. The counters at [zkoy.fun/stats](https://zkoy.fun/stats) cover the current version only: real games, unique devices and sealed moves, with labelled test tables left out. Finished games are listed at [zkoy.fun/games](https://zkoy.fun/games) with their seal transactions.
- **Next:** the big-screen mode (narration and the village square on a projector, phones as controllers), the Flutter app for iOS and Android, and sponsored event rooms that seal on mainnet.
- ZKöy began at the ZcashTR 48-hour challenge during Rlay Blockchain Week in Şirince (August 2026), where it took first place. The current version is a full rewrite of that prototype.

## License and security

MIT, see [LICENSE](LICENSE). Found a way to peek at hidden information or act for someone else? Please report it privately, see [SECURITY.md](SECURITY.md).

## Team

- **Bekir Erdem**: server, Zcash integration, game engine, web client
- **Selinay Tiftikçi**: Flutter app, game screens

---

### Türkçe

ZKöy, Zcash üzerinde oynanan bir Vampir Köylü parti oyunudur. Aynı masadaki 7-15 kişi telefonlarıyla oynar. Ebe uygulamanın kendisidir: her gece hamlesi ve her oy Zcash'in gizli notlarıyla mühürlenir, oyun sonunda herkes kimin ne yaptığını görür ve kimse sonradan bir şey değiştiremez. Oynamak için [zkoy.fun](https://zkoy.fun), kurallar ve ürün kararları için [SPEC.md](SPEC.md).
