import { Router } from 'express';
import { issueRunToken } from '../runToken.js';

// Démarre une run et renvoie un jeton signé à présenter lors de la soumission du score.
// À appeler au moment où la partie commence réellement (pour que startedAt ≈ départ du chrono).
const router = Router();

router.post('/run/start', (_req, res) => {
  const { runId, token, startedAt } = issueRunToken();
  res.status(201).json({ runId, token, startedAt });
});

export default router;
