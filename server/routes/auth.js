import { Router } from 'express';
import { issueChallenge, verifyWalletSignature, issueSession } from '../auth.js';

// Phantom wallet (Solana) authentication. See auth.js for flow details.
const router = Router();

// POST /api/auth/nonce  { publicKey } → { nonce, message } to be signed by the wallet.
router.post('/auth/nonce', (req, res) => {
  const { publicKey } = req.body ?? {};
  const challenge = issueChallenge(publicKey);
  if (!challenge) return res.status(400).json({ error: 'invalid publicKey' });
  res.json(challenge);
});

// POST /api/auth/verify  { publicKey, signature, nonce } → { token, wallet } if the signature is valid.
router.post('/auth/verify', (req, res) => {
  const { publicKey, signature, nonce } = req.body ?? {};
  const result = verifyWalletSignature({ publicKey, signature, nonce });
  if (!result.ok) return res.status(401).json({ error: 'invalid signature', reason: result.reason });
  res.json({ token: issueSession(result.wallet), wallet: result.wallet });
});

export default router;
