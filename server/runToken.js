// Jetons de run signés (anti-triche léger sur le leaderboard).
//
// Idée : le serveur émet, au DÉBUT d'une run (POST /api/run/start), un jeton signé (HMAC) qui
// horodate le départ côté serveur. À la soumission du score, on vérifie :
//   1. la signature (le client ne peut pas fabriquer un jeton) ;
//   2. la fraîcheur (non expiré, pas dans le futur) ;
//   3. la cohérence temporelle : le temps de jeu annoncé ne peut pas dépasser le temps réel
//      écoulé depuis le départ (on ne finit pas un run « avant » de l'avoir joué) ;
//   4. l'usage unique (anti-rejeu) - géré via la base (consumeRunNonce).
//
// Ce n'est PAS une preuve absolue (un jeu 100 % client reste falsifiable en théorie), mais ça
// élimine la fabrication triviale de scores (POST direct) et le rejeu du même run.

import crypto from 'node:crypto';

// Secret de signature. Idéalement fixé via RUN_TOKEN_SECRET (stable entre redémarrages).
// À défaut : secret aléatoire par démarrage → les jetons ne survivent pas à un restart serveur.
const ENV_SECRET = process.env.RUN_TOKEN_SECRET || null;
let bootSecret = null;
function secret() {
  if (ENV_SECRET) return ENV_SECRET;
  if (!bootSecret) {
    bootSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[runToken] RUN_TOKEN_SECRET absent → secret aléatoire par démarrage ' +
        '(les jetons de run ne survivent pas à un redémarrage).'
    );
  }
  return bootSecret;
}

// Vérification exigée uniquement si un secret stable est configuré (rétro-compatible sinon).
export const requireRunToken = () => !!ENV_SECRET;

const MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 h : au-delà, jeton périmé
const FUTURE_SKEW_MS = 60_000; // tolérance si l'horloge du serveur a bougé

function sign(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

// Émet un nouveau jeton de run. runId = nonce (usage unique). startedAt = départ serveur (ms).
export function issueRunToken() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = { n: nonce, t: Date.now() };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { runId: nonce, token: `${b64}.${sign(b64)}`, startedAt: payload.t };
}

// Vérifie un jeton. Renvoie { ok, reason?, nonce?, startedAt? }.
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
