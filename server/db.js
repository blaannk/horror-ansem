// Persistance des scores.
//
// On utilise le module SQLite intégré à Node (`node:sqlite`, dispo dès Node 22.5,
// sans flag depuis Node 23.4). Aucune dépendance native à compiler.
// Si jamais `node:sqlite` est indisponible (Node trop ancien), on retombe
// proprement sur un petit stockage JSON sur disque — l'API publique est identique.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'scores.db');
const JSON_PATH = path.join(__dirname, 'data', 'scores.json');

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

/** @typedef {{ name:string, time_ms:number, maze_size:number, difficulty:string }} ScoreInput */

let impl;

try {
  // ---- Backend SQLite ----
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      time_ms    INTEGER NOT NULL,
      maze_size  INTEGER NOT NULL,
      difficulty TEXT    NOT NULL DEFAULT 'normal',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_time ON scores(time_ms ASC);
  `);

  const insertStmt = db.prepare(
    `INSERT INTO scores (name, time_ms, maze_size, difficulty)
     VALUES (?, ?, ?, ?)`
  );

  impl = {
    backend: 'sqlite',
    /** @param {ScoreInput} s */
    addScore(s) {
      const info = insertStmt.run(s.name, s.time_ms, s.maze_size, s.difficulty);
      return Number(info.lastInsertRowid);
    },
    topScores(difficulty, limit) {
      const where = difficulty ? 'WHERE difficulty = ?' : '';
      const stmt = db.prepare(
        `SELECT id, name, time_ms, maze_size, difficulty, created_at
         FROM scores ${where}
         ORDER BY time_ms ASC
         LIMIT ?`
      );
      return difficulty ? stmt.all(difficulty, limit) : stmt.all(limit);
    },
  };
} catch (err) {
  // ---- Fallback JSON ----
  console.warn(
    `[db] node:sqlite indisponible (${err.message}). Bascule sur le stockage JSON.`
  );

  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    } catch {
      return { seq: 0, rows: [] };
    }
  };
  const write = (data) => fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));

  impl = {
    backend: 'json',
    /** @param {ScoreInput} s */
    addScore(s) {
      const data = read();
      const id = ++data.seq;
      data.rows.push({
        id,
        name: s.name,
        time_ms: s.time_ms,
        maze_size: s.maze_size,
        difficulty: s.difficulty,
        created_at: new Date().toISOString(),
      });
      write(data);
      return id;
    },
    topScores(difficulty, limit) {
      const data = read();
      return data.rows
        .filter((r) => !difficulty || r.difficulty === difficulty)
        .sort((a, b) => a.time_ms - b.time_ms)
        .slice(0, limit);
    },
  };
}

console.log(`[db] backend de persistance : ${impl.backend}`);

export const addScore = (s) => impl.addScore(s);
export const topScores = (difficulty, limit = 10) => impl.topScores(difficulty, limit);
export const backend = impl.backend;
