# 🐕 Escape ANSEM

A narrative first-person 3D horror game in **3 chained levels**, hunted by **Ansem**.

1. **Wake up**: you come to (wake-up animation) in a small room with dirty yellow walls,
   buzzing neons, the sound of a distant mechanical keyboard, a broken screen showing only
   "**Buy the dip.**", and on the walls: your **controls** + **photos of Ansem**.
2. **Short maze**: **crypto charts crash** on the walls while a scary echoing voice repeats
   "**You should have sold…**".
3. **Escape**: you reach a terror room that is **already part of the big map** (no loading).
   Two closed doors. Venturing **right** triggers **Ansem's screamer** - then **RUN**, the
   **left door opens**, and Ansem chases you **permanently** across a large maze,
   **speeding up whenever he sees you** (line of sight). Reach the green exit.

A **sanity bar** controls Ansem's speed: the lower it is, the faster he runs. It does not
change on its own in-game - it is driven from the outside (see below). Voices are
synthesized by the browser (SpeechSynthesis API, no files required).

> First milestone of a crypto-themed project (BONK / Solana). The backend already exposes a
> persistent leaderboard and stub routes to wire up BONK / wallet later.

## Stack

- **Frontend**: Vite + Three.js (3D/FPS rendering), Web Audio API (100% synthesized sound)
- **Backend**: Node + Express + PostgreSQL (`pg`), on-chain market cap via `@pump-fun/pump-sdk`

## Requirements

- Node.js **≥ 22** (tested on Node 24). npm ≥ 9.

## Install

```bash
npm install        # installs client + server via npm workspaces
```

## Development

```bash
npm run dev        # backend (:3000) + Vite (:5173) in parallel
```

Open **http://localhost:5173**. Vite proxies `/api` to the backend on `:3000`.

## Build & production

```bash
npm run build      # builds the client into client/dist
npm start          # Express serves the build + API on :3000  → http://localhost:3000
```

## Controls

> ⚠ **Left and right are intentionally swapped** (also written on the wall of the start room).

| Action            | Key                             |
| ----------------- | ------------------------------- |
| Move forward/back | `Z`·`W` / `S` (or ↑ / ↓)        |
| Go left           | `D` / → (swapped)               |
| Go right          | `Q`·`A` / ← (swapped)           |
| Sprint            | `Shift`                         |
| Look              | Mouse (click = lock)            |
| Pause / menu      | `Esc`                           |

## Sanity (server-driven from the token market cap)

Sanity is a `[0..1]` value shared by everyone. It is **not** controllable by the player: it is
computed **server-side** from the on-chain market cap of the project's pump.fun / PumpSwap
token, every ~10 s, and mapped `sanity = clamp(marketCapUsd / SANITY_MC_TARGET_USD, 0, 1)`
(so `0 $ = 0 %` and `SANITY_MC_TARGET_USD` - default `$1,000,000` - `= 100 %`). The lower it
is, the faster the monster: `speed = monsterSpeed × (1 + sanityFear × (1 − sanity))`. On the
final map, Ansem also gets an extra ×1.8 boost whenever he has line of sight to you.

The client only **reads** the value (it polls `GET /api/global/sanity` every 10 s); the Solana
RPC endpoint stays strictly server-side and is never exposed to the browser. Configure it via
`server/.env` - see `.env.example` (`SOLANA_RPC_URL`, `TOKEN_MINT`, `SANITY_MC_TARGET_USD`,
`SANITY_POLL_MS`). Without `SOLANA_RPC_URL`/`TOKEN_MINT`, the poller is disabled and sanity
stays at its last stored value.

```js
window.escapeAnsem.getSanity(); // read-only: current sanity in-game (debug)
```

The bonding-curve phase and a post-migration PumpSwap pool are both handled automatically.

## API

| Method  | Route                        | Purpose                                |
| ------- | ---------------------------- | -------------------------------------- |
| `POST`  | `/api/auth/nonce`            | Phantom auth: get a challenge to sign  |
| `POST`  | `/api/auth/verify`           | Phantom auth: verify sig, get session  |
| `POST`  | `/api/run/start`             | Start a run → signed anti-cheat token  |
| `POST`  | `/api/scores`                | Submit a run (run token + optional auth)|
| `GET`   | `/api/leaderboard`           | Top 10 (optional `?difficulty=`)       |
| `GET`   | `/api/global/sanity`         | Shared sanity (live) + history points  |
| `GET`   | `/api/crypto/status`         | Stub BONK integration status           |
| `POST`  | `/api/crypto/connect-wallet` | Stub wallet connection                 |
| `GET`   | `/api/health`                | Healthcheck                            |
