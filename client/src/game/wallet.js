// Phantom wallet (Solana) authentication. Proves wallet ownership by signing a
// challenge issued by the server, then keeps the verified session (address + token) in localStorage.
// See server/auth.js for server-side verification.

const TOKEN_KEY = 'escape-ansem-wallet-token';
const ADDR_KEY = 'escape-ansem-wallet-addr';

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

// Shortened address for display: CV9d...5pump.
export function shortWallet(addr = getWallet()) {
  return addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '';
}

function store(addr, token) {
  try {
    localStorage.setItem(ADDR_KEY, addr);
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
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

// Connects Phantom, has the challenge signed, and stores the verified session. Returns the address.
export async function connectWallet() {
  const p = provider();
  if (!p) {
    // Phantom missing: sends the user to the install page.
    window.open('https://phantom.app/', '_blank', 'noopener');
    throw new Error('phantom-missing');
  }

  const res = await p.connect();
  const pubkey = (res?.publicKey ?? p.publicKey)?.toString();
  if (!pubkey) throw new Error('no-pubkey');

  // 1) challenge
  const nres = await fetch('/api/auth/nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: pubkey }),
  });
  if (!nres.ok) throw new Error('nonce-failed');
  const { nonce, message } = await nres.json();

  // 2) wallet signs the message
  const encoded = new TextEncoder().encode(message);
  const signed = await p.signMessage(encoded, 'utf8');
  const sigBytes = signed?.signature ?? signed; // depends on Phantom version
  const signature = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // 3) server verification -> session token
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
