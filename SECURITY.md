# Security Policy

## Supported versions

Only the `main` branch is supported. It is what runs at [zkoy.fun](https://zkoy.fun). The `v1` branch and the `v1-hackathon` tag are the August 2026 prototype and receive no fixes.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue for anything that could let someone cheat or read hidden information during a live game.

Include what you did, what you saw, and which room or commit it concerns if you know. We aim to acknowledge within 3 days and to fix issues that affect live games before the next event.

## What matters most

ZKöy is a hidden-information game, so the most serious issues are the ones that break the secrecy or the fairness of a table:

- reading another player's role, a night choice, a seer result or a ghost prophecy before the game ends;
- acting as another player, or performing a host or Muhtar action without that authority;
- changing a move, a vote or the shuffle after it was made, or making the reveal party disagree with what was sealed;
- anything that stops seals from reaching the chain without the table noticing;
- denial of service against a running room.

## Current scope and known limits

- ZKöy runs on **Zcash testnet**. The server's seal wallet holds testnet coins (TAZ) only; there is no real money in play.
- Room and player wallets are created and held by the server. The game server is trusted to deliver each player's own view; the chain makes its record tamper-evident, not secret-proof against the operator. Players never provide keys or funds.
- Tokens are sent over the WebSocket handshake, never in URLs, and are stored only as hashes.
