import { Router } from 'express';

// Scaffold pour la future intégration BONK / wallet (Solana).
// Tout est désactivé pour l'instant — ces routes servent de points d'ancrage.

const router = Router();

// GET /api/crypto/status — état de l'intégration
router.get('/crypto/status', (_req, res) => {
  res.json({
    enabled: false,
    chain: 'solana',
    token: 'BONK',
    // Adresse du contrat / wallet affichée sur la page d'accueil.
    // Renseigner BONK_ADDRESS dans l'environnement quand elle est connue.
    address: process.env.BONK_ADDRESS || 'TBA',
    features: {
      walletConnect: false,
      rewards: false,
      skins: false,
    },
    todo: 'Brancher la connexion wallet et les récompenses BONK.',
  });
});

// POST /api/crypto/connect-wallet — stub
router.post('/crypto/connect-wallet', (req, res) => {
  const { address } = req.body ?? {};
  res.status(501).json({
    enabled: false,
    received: address ?? null,
    message: 'Connexion wallet pas encore implémentée (scaffold BONK).',
  });
});

export default router;
