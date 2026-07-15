import { Router } from 'express';
import { issueChallenge, verifyWalletSignature, issueSession } from '../auth.js';

// Authentification wallet Phantom (Solana). Voir auth.js pour le détail du flux.
const router = Router();

// POST /api/auth/nonce  { publicKey } → { nonce, message } à faire signer par le wallet.
router.post('/auth/nonce', (req, res) => {
  const { publicKey } = req.body ?? {};
  const challenge = issueChallenge(publicKey);
  if (!challenge) return res.status(400).json({ error: 'invalid publicKey' });
  res.json(challenge);
});

// POST /api/auth/verify  { publicKey, signature, nonce } → { token, wallet } si la signature est valide.
router.post('/auth/verify', (req, res) => {
  const { publicKey, signature, nonce } = req.body ?? {};
  const result = verifyWalletSignature({ publicKey, signature, nonce });
  if (!result.ok) return res.status(401).json({ error: 'invalid signature', reason: result.reason });
  res.json({ token: issueSession(result.wallet), wallet: result.wallet });
});

export default router;
