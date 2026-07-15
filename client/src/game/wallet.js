// Authentification par wallet Phantom (Solana). Prouve la possession du wallet en signant un
// défi émis par le serveur, puis conserve la session vérifiée (adresse + jeton) en localStorage.
// Voir server/auth.js pour la vérification côté serveur.

const TOKEN_KEY = 'escape-bonk-wallet-token';
const ADDR_KEY = 'escape-bonk-wallet-addr';

function provider() {
  if (typeof window === 'undefined') return null;
  return window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
}

export function isPhantomAvailable() {
  return !!provider();
}

export function getWallet() {
  try {
    return localStorage.getItem(ADDR_KEY) || null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function isConnected() {
  return !!(getWallet() && getAuthToken());
}

// Adresse raccourcie pour l'affichage : CV9d…5pump.
export function shortWallet(addr = getWallet()) {
  return addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '';
}

function store(addr, token) {
  try {
    localStorage.setItem(ADDR_KEY, addr);
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* stockage indisponible */
  }
}

function clear() {
  try {
    localStorage.removeItem(ADDR_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// Connecte Phantom, fait signer le défi et enregistre la session vérifiée. Renvoie l'adresse.
export async function connectWallet() {
  const p = provider();
  if (!p) {
    // Phantom absent : renvoie l'utilisateur vers l'installation.
    window.open('https://phantom.app/', '_blank', 'noopener');
    throw new Error('phantom-missing');
  }

  const res = await p.connect();
  const pubkey = (res?.publicKey ?? p.publicKey)?.toString();
  if (!pubkey) throw new Error('no-pubkey');

  // 1) défi
  const nres = await fetch('/api/auth/nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: pubkey }),
  });
  if (!nres.ok) throw new Error('nonce-failed');
  const { nonce, message } = await nres.json();

  // 2) signature du message par le wallet
  const encoded = new TextEncoder().encode(message);
  const signed = await p.signMessage(encoded, 'utf8');
  const sigBytes = signed?.signature ?? signed; // selon la version de Phantom
  const signature = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // 3) vérification serveur → jeton de session
  const vres = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: pubkey, signature, nonce }),
  });
  if (!vres.ok) throw new Error('verify-failed');
  const { token, wallet } = await vres.json();

  store(wallet, token);
  return wallet;
}

export async function disconnectWallet() {
  try {
    await provider()?.disconnect?.();
  } catch {
    /* ignore */
  }
  clear();
}
