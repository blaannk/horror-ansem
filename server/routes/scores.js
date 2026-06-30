import { Router } from 'express';
import { addScore, topScores } from '../db.js';

const router = Router();

const DIFFICULTIES = new Set(['facile', 'normal', 'cauchemar', 'custom']);

// POST /api/scores  — soumettre un temps d'évasion
router.post('/scores', (req, res) => {
  const { name, time_ms, maze_size, difficulty } = req.body ?? {};

  const cleanName = String(name ?? 'Anonyme').trim().slice(0, 24) || 'Anonyme';
  const ms = Number(time_ms);
  const size = Number(maze_size);
  const diff = DIFFICULTIES.has(difficulty) ? difficulty : 'normal';

  if (!Number.isFinite(ms) || ms <= 0 || ms > 1000 * 60 * 60) {
    return res.status(400).json({ error: 'time_ms invalide' });
  }
  if (!Number.isFinite(size) || size < 5 || size > 101) {
    return res.status(400).json({ error: 'maze_size invalide' });
  }

  const id = addScore({
    name: cleanName,
    time_ms: Math.round(ms),
    maze_size: Math.round(size),
    difficulty: diff,
  });

  res.status(201).json({ id, name: cleanName, time_ms: Math.round(ms), difficulty: diff });
});

// GET /api/leaderboard?difficulty=normal&limit=10
router.get('/leaderboard', (req, res) => {
  const { difficulty } = req.query;
  const diff = DIFFICULTIES.has(difficulty) ? difficulty : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  res.json({ difficulty: diff, scores: topScores(diff, limit) });
});

export default router;
