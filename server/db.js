// Score persistence, PostgreSQL backend.
//
// The connection is configured via the DATABASE_URL environment variable,
// e.g.: postgres://user:password@localhost:5432/escape_bonk
// Otherwise, falls back to a default local connection (see DEFAULT_URL).

import pg from 'pg';

const { Pool } = pg;

const DEFAULT_URL = 'postgres://postgres:postgres@localhost:5434/escape_ansem';
const connectionString = process.env.DATABASE_URL || DEFAULT_URL;

// SSL enabled if requested (managed services like Neon/Render/Heroku).
const ssl =
  process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined;

// Widened pool (pg default = 10) to handle more concurrent requests; tunable via env.
const pool = new Pool({ connectionString, ssl, max: Number(process.env.PG_POOL_MAX) || 20 });

pool.on('error', (err) => {
  console.error('[db] unexpected PostgreSQL pool error:', err.message);
});

/** @typedef {{ name:string, time_ms:number, maze_size:number, difficulty:string, level_reached?:number, player_id?:string|null, won?:boolean }} ScoreInput */

export const backend = 'postgres';

// Schema creation. Do NOT block startup if the database is unreachable: we log a warning
// and the server stays up (routes will then return a 500 error and the client falls back
// cleanly to "offline" mode). initDb() can be called again safely.
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id         SERIAL      PRIMARY KEY,
      name       TEXT        NOT NULL,
      time_ms    INTEGER     NOT NULL,
      maze_size  INTEGER     NOT NULL,
      difficulty TEXT        NOT NULL DEFAULT 'normal',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE scores ADD COLUMN IF NOT EXISTS level_reached INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE scores ADD COLUMN IF NOT EXISTS player_id TEXT;
    ALTER TABLE scores ADD COLUMN IF NOT EXISTS won BOOLEAN NOT NULL DEFAULT true;
    CREATE INDEX IF NOT EXISTS idx_scores_time ON scores(time_ms ASC);
    CREATE INDEX IF NOT EXISTS idx_scores_furthest ON scores(level_reached DESC, time_ms ASC);
    CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
    -- Functional index for the progress leaderboard (DISTINCT ON on the player key + sort):
    -- avoids a full-scan/full-sort on the hottest paths (progressBoard, playerRank).
    CREATE INDEX IF NOT EXISTS idx_scores_progress
      ON scores ((COALESCE(player_id, 'name:' || name)), level_reached DESC, won DESC, time_ms ASC);
    CREATE TABLE IF NOT EXISTS global_state (
      id         INTEGER     PRIMARY KEY DEFAULT 1,
      sanity     REAL        NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO global_state (id, sanity) VALUES (1, 1)
      ON CONFLICT (id) DO NOTHING;

    -- History (points for the chart shown on the home page).
    CREATE TABLE IF NOT EXISTS sanity_history (
      id     SERIAL      PRIMARY KEY,
      sanity REAL        NOT NULL,
      at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sanity_history_at ON sanity_history(at DESC);

    -- Anti-cheat: consumed run tokens (single use, anti-replay). See runToken.js.
    CREATE TABLE IF NOT EXISTS used_run_tokens (
      nonce   TEXT        PRIMARY KEY,
      used_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// Consumes a run nonce (single use). Returns true if it was new (thus valid), false
// if it was already used (replay, should be rejected). Prunes old nonces along the way (best-effort).
export async function consumeRunNonce(nonce) {
  const { rows } = await pool.query(
    `INSERT INTO used_run_tokens (nonce) VALUES ($1)
     ON CONFLICT (nonce) DO NOTHING
     RETURNING nonce`,
    [nonce]
  );
  pool
    .query(`DELETE FROM used_run_tokens WHERE used_at < now() - interval '6 hours'`)
    .catch(() => {});
  return rows.length > 0;
}
// initDb() is now AWAITED at startup by index.js (before app.listen), so the schema exists
// before serving any request. Remains callable again and non-blocking if the database is down.

/** @param {ScoreInput} s */
export async function addScore(s) {
  const { rows } = await pool.query(
    `INSERT INTO scores (name, time_ms, maze_size, difficulty, level_reached, player_id, won)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [s.name, s.time_ms, s.maze_size, s.difficulty, s.level_reached ?? 1, s.player_id ?? null, s.won ?? true]
  );
  return rows[0].id;
}

// sort: 'furthest' (furthest in the game, then fastest) otherwise 'time' (fastest).
export async function topScores(difficulty, limit = 10, sort = 'time') {
  const order = sort === 'furthest' ? 'level_reached DESC, time_ms ASC' : 'time_ms ASC';
  const cols = 'id, name, time_ms, maze_size, difficulty, level_reached, won, created_at';
  if (difficulty) {
    const { rows } = await pool.query(
      `SELECT ${cols} FROM scores WHERE difficulty = $1 ORDER BY ${order} LIMIT $2`,
      [difficulty, limit]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT ${cols} FROM scores ORDER BY ${order} LIMIT $1`,
    [limit]
  );
  return rows;
}

// Player grouping key: their stable player_id, or their name otherwise.
const PLAYER_KEY = `COALESCE(player_id, 'name:' || name)`;
// Progress order: furthest first, then win before death, then fastest.
const PROGRESS_ORDER = 'level_reached DESC, won DESC, time_ms ASC';

// PROGRESS leaderboard: a single row per player (their best run).
export async function progressBoard(limit = 10) {
  const { rows } = await pool.query(
    `WITH best AS (
       SELECT DISTINCT ON (${PLAYER_KEY})
         name, player_id, time_ms, level_reached, won
       FROM scores
       ORDER BY ${PLAYER_KEY}, ${PROGRESS_ORDER}
     )
     SELECT * FROM best ORDER BY ${PROGRESS_ORDER} LIMIT $1`,
    [limit]
  );
  return rows;
}

// Rank of a given player (by player_id) in the progress leaderboard.
export async function playerRank(playerId) {
  if (!playerId) return null;
  const { rows } = await pool.query(
    `WITH best AS (
       SELECT DISTINCT ON (${PLAYER_KEY})
         ${PLAYER_KEY} AS pkey, player_id, name, time_ms, level_reached, won
       FROM scores
       ORDER BY ${PLAYER_KEY}, ${PROGRESS_ORDER}
     ),
     ranked AS (
       SELECT player_id, name, time_ms, level_reached, won,
         RANK() OVER (ORDER BY ${PROGRESS_ORDER}) AS rank,
         COUNT(*) OVER () AS total
       FROM best
     )
     SELECT rank, total, level_reached, won, time_ms, name
     FROM ranked WHERE player_id = $1 LIMIT 1`,
    [playerId]
  );
  return rows[0] ?? null;
}

// ---------- Global sanity (drivable placeholder) ----------

export async function getGlobalSanity() {
  const { rows } = await pool.query('SELECT sanity, updated_at FROM global_state WHERE id = 1');
  return rows[0] ?? { sanity: 1, updated_at: null };
}

// Sets the global value [0..1] and pushes a history point.
export async function setGlobalSanity(v) {
  const sanity = Math.max(0, Math.min(1, Number(v)));
  await pool.query(
    `UPDATE global_state SET sanity = $1, updated_at = now() WHERE id = 1`,
    [sanity]
  );
  await pool.query('INSERT INTO sanity_history (sanity) VALUES ($1)', [sanity]);
  // Pruning: keep only the ~500 most recent points (bounded growth).
  await pool.query(
    `DELETE FROM sanity_history
     WHERE id NOT IN (SELECT id FROM sanity_history ORDER BY at DESC LIMIT 500)`
  );
  return sanity;
}

export async function sanityHistory(limit = 50) {
  const { rows } = await pool.query(
    `SELECT sanity, at FROM sanity_history ORDER BY at DESC LIMIT $1`,
    [limit]
  );
  return rows.reverse(); // ascending chronological order for the chart
}

console.log(`[db] persistence backend: ${backend}`);
