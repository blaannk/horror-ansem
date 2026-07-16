import { Router } from 'express';
import { getGlobalSanity, setGlobalSanity, sanityHistory } from '../db.js';

// GLOBAL sanity, shared by all players and displayed on the home page.
// Drivable placeholder: the value is stored server-side (one row) with a history
// for the chart. It could later be driven by game results / crypto.

const router = Router();

// GET /api/global/sanity - current value + history (chart points).
router.get('/global/sanity', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 2), 200);
  try {
    const state = await getGlobalSanity();
    const history = await sanityHistory(limit);
    res.json({ sanity: state.sanity, updated_at: state.updated_at, history });
  } catch (err) {
    console.error('[global] sanity read failed:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

// POST /api/global/sanity  { sanity: 0..1 } - sets the global value (placeholder driver).
// ADMIN WRITE only: requires the `x-admin-token` header == process.env.ADMIN_TOKEN.
// Without a configured token, the write is refused (prevents public defacement of shared state).
router.post('/global/sanity', async (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.get('x-admin-token') !== token) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { sanity } = req.body ?? {};
  const v = Number(sanity);
  if (!Number.isFinite(v)) return res.status(400).json({ error: 'invalid sanity' });
  try {
    const applied = await setGlobalSanity(v);
    res.status(200).json({ sanity: applied });
  } catch (err) {
    console.error('[global] sanity write failed:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

export default router;
