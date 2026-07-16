// Signed run tokens (lightweight anti-cheat for the leaderboard).
//
// Idea: at the START of a run (POST /api/run/start), the server issues a signed (HMAC) token
// that timestamps the start server-side. When the score is submitted, we check:
//   1. the signature (the client can't forge a token);
//   2. freshness (not expired, not in the future);
//   3. temporal consistency: the reported play time can't exceed the real elapsed time
//      since the start (you can't finish a run "before" having played it);
//   4. single use (anti-replay), handled via the database (consumeRunNonce).
//
// This is NOT absolute proof (a 100% client-side game remains theoretically forgeable), but it
// eliminates trivial score fabrication (direct POST) and replaying the same run.

import crypto from 'node:crypto';

// Signing secret. Ideally set via RUN_TOKEN_SECRET (stable across restarts).
// Otherwise: a random secret per boot, meaning tokens don't survive a server restart.
const ENV_SECRET = process.env.RUN_TOKEN_SECRET || null;
let bootSecret = null;
function secret() {
  if (ENV_SECRET) return ENV_SECRET;
  if (!bootSecret) {
    bootSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[runToken] RUN_TOKEN_SECRET missing, using a random per-boot secret ' +
        '(run tokens will not survive a restart).'
    );
  }
  return bootSecret;
}

// Verification is only enforced if a stable secret is configured (backward-compatible otherwise).
export const requireRunToken = () => !!ENV_SECRET;

const MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3h: beyond this, token is stale
const FUTURE_SKEW_MS = 60_000; // tolerance in case the server clock drifted

function sign(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

// Issues a new run token. runId = nonce (single use). startedAt = server start time (ms).
export function issueRunToken() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = { n: nonce, t: Date.now() };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { runId: nonce, token: `${b64}.${sign(b64)}`, startedAt: payload.t };
}

// Verifies a token. Returns { ok, reason?, nonce?, startedAt? }.
export function verifyRunToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'absent' };
  const [b64, sig] = token.split('.');
  const expected = sign(b64);
  const a = Buffer.from(sig || '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'payload' };
  }
  const t = Number(payload.t);
  if (!Number.isFinite(t) || typeof payload.n !== 'string') return { ok: false, reason: 'payload' };
  const age = Date.now() - t;
  if (age < -FUTURE_SKEW_MS) return { ok: false, reason: 'future' };
  if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true, nonce: payload.n, startedAt: t };
}
