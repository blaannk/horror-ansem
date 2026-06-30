# 🐕 Escape BONK

A narrative first-person 3D horror game in **3 chained levels**, hunted by **Ansem**.

1. **Wake up**: you come to (wake-up animation) in a small room with dirty yellow walls,
   buzzing neons, the sound of a distant mechanical keyboard, a broken screen showing only
   "**Buy the dip.**", and on the walls: your **controls** + **photos of Ansem**.
2. **Short maze**: **crypto charts crash** on the walls while a scary echoing voice repeats
   "**You should have sold…**".
3. **Escape**: you reach a terror room that is **already part of the big map** (no loading).
   Two closed doors. Venturing **right** triggers **Ansem's screamer** — then **RUN**, the
   **left door opens**, and Ansem chases you **permanently** across a large maze,
   **speeding up whenever he sees you** (line of sight). Reach the green exit.

A **sanity bar** controls Ansem's speed: the lower it is, the faster he runs. It does not
change on its own in-game — it is driven from the outside (see below). Voices are
synthesized by the browser (SpeechSynthesis API, no files required).

> First milestone of a crypto-themed project (BONK / Solana). The backend already exposes a
> persistent leaderboard and stub routes to wire up BONK / wallet later.

## Stack

- **Frontend**: Vite + Three.js (3D/FPS rendering), Web Audio API (100% synthesized sound)
- **Backend**: Node + Express + SQLite (`node:sqlite`, built into Node ≥ 22)

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
| Sanity ±          | `[` / `]` (testing)             |

## Sanity (external control)

Sanity is a `[0..1]` value that does not change through gameplay: it is exposed so it can be
driven from the outside (script, WebSocket, device…). The lower it is, the faster the
monster: `speed = monsterSpeed × (1 + sanityFear × (1 − sanity))`. On the final map, Ansem
also gets an extra ×1.8 boost whenever he has line of sight to you.

```js
window.escapeBonk.setSanity(0.2); // 20% → he speeds up a lot
window.escapeBonk.setSanity(1);   // 100% → base speed
window.escapeBonk.getSanity();    // read the current value
```

Starting value (`sanityStart`) and effect strength (`sanityFear`) are set in the menu. The
`[` / `]` keys nudge the bar by ±5% for testing.

## API

| Method  | Route                        | Purpose                                |
| ------- | ---------------------------- | -------------------------------------- |
| `POST`  | `/api/scores`                | Submit an escape time                  |
| `GET`   | `/api/leaderboard`           | Top 10 (optional `?difficulty=`)       |
| `GET`   | `/api/crypto/status`         | Stub BONK integration status           |
| `POST`  | `/api/crypto/connect-wallet` | Stub wallet connection                 |
| `GET`   | `/api/health`                | Healthcheck                            |
