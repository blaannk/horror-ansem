// Phantom wallet (Solana) authentication, no password or account database.
//
// "Sign-In With Solana" flow:
//   1. the client requests a challenge (nonce) for its public key;
//   2. it signs the challenge message with Phantom (signMessage);
//   3. the server verifies the ed25519 signature, proving possession of the wallet;
//   4. the server issues a signed (HMAC) SESSION TOKEN that identifies the wallet.
//
// The session token then serves as verified identity to link scores to the wallet.
// Everything is stateless server-side (challenge and session are self-contained HMAC tokens).

import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nacl = require('tweetnacl');
const { PublicKey } = require('@solana/web3.js');

// Signing secret (stable preferred). Falls back to RUN_TOKEN_SECRET if AUTH_SECRET is unset.
const ENV_SECRET = process.env.AUTH_SECRET || process.env.RUN_TOKEN_SECRET || null;
let bootSecret = null;
function secret() {
  if (ENV_SECRET) return ENV_SECRET;
  if (!bootSecret) {
    bootSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[auth] AUTH_SECRET/RUN_TOKEN_SECRET missing, using a random per-boot secret ' +
        '(wallet sessions will not survive a restart).'
    );
  }
  return bootSecret;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // the challenge must be signed within 5 min
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // session valid for 7 days

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

// Validates the format of a Solana address (base58, 32 bytes).
function isValidPubkey(pk) {
  try {
    return typeof pk === 'string' && new PublicKey(pk).toBytes().length === 32;
  } catch {
    return false;
  }
}

// Human-readable message shown in Phantom. MUST be reconstructible identically server-side.
export function buildMessage(pubkey, nonce) {
  return (
    'Escape ANSEM: sign in to link your scores.\n\n' +
    `Wallet: ${pubkey}\n` +
    `Nonce: ${nonce}`
  );
}

// Issues a challenge for a given public key.
export function issueChallenge(publicKey) {
  if (!isValidPubkey(publicKey)) return null;
  const nonce = encode({ w: publicKey, t: Date.now(), r: crypto.randomBytes(12).toString('hex') });
  return { nonce, message: buildMessage(publicKey, nonce) };
}

// Verifies the challenge (nonce) + the wallet's ed25519 signature of the message.
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

// Issues a session token for a verified wallet.
export function issueSession(wallet) {
  return encode({ w: wallet, exp: Date.now() + SESSION_TTL_MS });
}

// Verifies a session token → { ok, wallet }.
export function verifySession(token) {
  const payload = decode(token);
  if (!payload || !payload.w) return { ok: false };
  if (Date.now() > Number(payload.exp)) return { ok: false };
  return { ok: true, wallet: payload.w };
}
