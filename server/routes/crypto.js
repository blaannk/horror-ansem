import { Router } from 'express';

// Scaffold for the future BONK / wallet (Solana) integration.
// Everything is disabled for now, these routes serve as anchor points.

const router = Router();

// GET /api/crypto/status - integration status
router.get('/crypto/status', (_req, res) => {
  // Ticker shown on the landing page ("$<ticker>"). Configurable via env, default "BONK".
  const ticker = (process.env.TOKEN_TICKER || 'BONK').trim() || 'BONK';
  res.json({
    enabled: false,
    chain: 'solana',
    token: ticker,
    ticker,
    // Contract address shown on the home page. Defaults to the mint that drives
    // sanity (TOKEN_MINT); BONK_ADDRESS can override it if needed.
    address: process.env.BONK_ADDRESS || process.env.TOKEN_MINT || 'TBA',
    features: {
      walletConnect: false,
      rewards: false,
      skins: false,
    },
    todo: 'Wire up wallet connection and BONK rewards.',
  });
});

// POST /api/crypto/connect-wallet - stub
router.post('/crypto/connect-wallet', (req, res) => {
  const { address } = req.body ?? {};
  res.status(501).json({
    enabled: false,
    received: address ?? null,
    message: 'Wallet connection not implemented yet (BONK scaffold).',
  });
});

export default router;
