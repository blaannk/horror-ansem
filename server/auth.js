// Authentification par wallet Phantom (Solana), sans mot de passe ni base de comptes.
//
// Flux « Sign-In With Solana » :
//   1. le client demande un défi (nonce) pour sa clé publique ;
//   2. il signe le message du défi avec Phantom (signMessage) ;
//   3. le serveur vérifie la signature ed25519 → prouve la possession du wallet ;
//   4. le serveur émet un JETON DE SESSION signé (HMAC) qui identifie le wallet.
//
// Le jeton de session sert ensuite d'identité vérifiée pour lier les scores au wallet.
// Tout est sans état côté serveur (défi et session sont des jetons HMAC auto-portés).

import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nacl = require('tweetnacl');
const { PublicKey } = require('@solana/web3.js');

// Secret de signature (stable de préférence). Réutilise RUN_TOKEN_SECRET à défaut d'AUTH_SECRET.
const ENV_SECRET = process.env.AUTH_SECRET || process.env.RUN_TOKEN_SECRET || null;
let bootSecret = null;
function secret() {
  if (ENV_SECRET) return ENV_SECRET;
  if (!bootSecret) {
    bootSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[auth] AUTH_SECRET/RUN_TOKEN_SECRET absents → secret aléatoire par démarrage ' +
        '(les sessions wallet ne survivent pas à un redémarrage).'
    );
  }
  return bootSecret;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // le défi doit être signé sous 5 min
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // session valable 7 jours

function sign(b64) {
  return crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
}
function encode(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${b64}.${sign(b64)}`;
}
function decode(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  const expected = sign(b64);
  const a = Buffer.from(sig || '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Valide le format d'une adresse Solana (base58, 32 bytes).
function isValidPubkey(pk) {
  try {
    return typeof pk === 'string' && new PublicKey(pk).toBytes().length === 32;
  } catch {
    return false;
  }
}

// Message humain montré dans Phantom. DOIT être reconstructible à l'identique côté serveur.
export function buildMessage(pubkey, nonce) {
  return (
    'Escape ANSEM: sign in to link your scores.\n\n' +
    `Wallet: ${pubkey}\n` +
    `Nonce: ${nonce}`
  );
}

// Émet un défi pour une clé publique donnée.
export function issueChallenge(publicKey) {
  if (!isValidPubkey(publicKey)) return null;
  const nonce = encode({ w: publicKey, t: Date.now(), r: crypto.randomBytes(12).toString('hex') });
  return { nonce, message: buildMessage(publicKey, nonce) };
}

// Vérifie le défi (nonce) + la signature ed25519 du message par le wallet.
export function verifyWalletSignature({ publicKey, signature, nonce }) {
  if (!isValidPubkey(publicKey)) return { ok: false, reason: 'publicKey' };
  const payload = decode(nonce);
  if (!payload) return { ok: false, reason: 'nonce' };
  if (payload.w !== publicKey) return { ok: false, reason: 'wallet_mismatch' };
  if (Date.now() - Number(payload.t) > CHALLENGE_TTL_MS) return { ok: false, reason: 'expired' };

  let sigBytes;
  try {
    sigBytes = Buffer.from(String(signature), 'hex');
  } catch {
    return { ok: false, reason: 'signature_format' };
  }
  if (sigBytes.length !== 64) return { ok: false, reason: 'signature_format' };

  const message = buildMessage(publicKey, nonce);
  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    new Uint8Array(sigBytes),
    new PublicKey(publicKey).toBytes()
  );
  return ok ? { ok: true, wallet: publicKey } : { ok: false, reason: 'signature' };
}

// Émet un jeton de session pour un wallet vérifié.
export function issueSession(wallet) {
  return encode({ w: wallet, exp: Date.now() + SESSION_TTL_MS });
}

// Vérifie un jeton de session → { ok, wallet }.
export function verifySession(token) {
  const payload = decode(token);
  if (!payload || !payload.w) return { ok: false };
  if (Date.now() > Number(payload.exp)) return { ok: false };
  return { ok: true, wallet: payload.w };
}
