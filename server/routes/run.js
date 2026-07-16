import { Router } from 'express';
import { issueRunToken } from '../runToken.js';

// Starts a run and returns a signed token to present when submitting the score.
// Should be called right when the game actually starts (so startedAt ≈ timer start).
const router = Router();

router.post('/run/start', (_req, res) => {
  const { runId, token, startedAt } = issueRunToken();
  res.status(201).json({ runId, token, startedAt });
});

export default router;
