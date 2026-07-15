import { Router } from 'express';

// Scaffold pour la future intégration BONK / wallet (Solana).
// Tout est désactivé pour l'instant - ces routes servent de points d'ancrage.

const router = Router();

// GET /api/crypto/status - état de l'intégration
router.get('/crypto/status', (_req, res) => {
  // Ticker affiché sur la landing (« $<ticker> »). Paramétrable via l'env, défaut « BONK ».
  const ticker = (process.env.TOKEN_TICKER || 'BONK').trim() || 'BONK';
  res.json({
    enabled: false,
    chain: 'solana',
    token: ticker,
    ticker,
    // Adresse du contrat affichée sur la page d'accueil. Par défaut, le mint qui pilote la
    // santé mentale (TOKEN_MINT) ; BONK_ADDRESS peut le surcharger si besoin.
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
