// Shared progress model (menu, end screen, lore window gating).
//
// Internal LEVELS = [Spawn(0), Labyrinth(1), Escape(2), Forest(3), Endgame(4)]
// grouped into 3 visible CHAPTERS. level_reached = levelIndex + 1 (1..5).
// The percent/badges derivation mirrors server/progress.js - keep both in sync.

// getPlayerId returns the address when a Phantom wallet is connected (otherwise an anonymous id).
import { getWallet } from './wallet.js';

export const TOTAL_CHAPTERS = 3;

// Per-chapter metadata (source of lore windows + badge labels).
// `levelIndex` = entry point into LEVELS to play this chapter (passed to Game).
export const CHAPTERS = [
  {
    n: 1,
    levelIndex: 0,
    // Deliberately mysterious: the very first chapter doesn't announce itself as "level 1".
    title: 'The Yellow Room',
    tagline: 'buy the dip',
    lore:
      "You come to on a filthy mattress, neons buzzing, a dead screen frozen on “BUY THE DIP.” " +
      "You don't remember signing anything. The walls remember for you: they're scratched from the inside. " +
      "Scattered in the maze are the PEPE keys: collect them all to unseal the pit in the floor, then drop " +
      "through it, before ANSEM finishes waking up too.",
    badge: { icon: 'chart-down', label: 'Dip Survivor', color: '#e11d2b' },
  },
  {
    n: 2,
    levelIndex: 3,
    title: 'The Night Forest',
    tagline: 'fire to fire',
    lore:
      "The pit spat you into the woods. You wake in a cold chalet that still smells of the dog that lived here: " +
      "BONK, Ansem's pet, before the rot took him. Now he's the size of the dark between the trees. " +
      "Run campfire to campfire; the light is the only thing that slows him.",
    badge: { icon: 'flame', label: 'Woodsman', color: '#39ff88' },
  },
  {
    n: 3,
    levelIndex: 4,
    title: 'Liquidation',
    tagline: 'the machine eats',
    lore:
      "Under the forest hums the mine that started all of it: a collapsing data-center bleeding heat and debt. " +
      "Crawl the ducts, jump the gaps, climb while it folds in on itself. Ansem is in here with you now, " +
      "and there is exactly one way out. Escape and you're finally free of the bag.",
    badge: { icon: 'skull', label: 'Liquidated the Nightmare', color: '#ff2f2f' },
  },
];

// Furthest chapter REACHED (player's position).
export function chapterReached(levelReached) {
  const lr = clampLevel(levelReached);
  if (lr <= 3) return 1;
  if (lr === 4) return 2;
  return 3;
}

// Progress in % (33 / 66 / 100).
export function percentOf(levelReached) {
  return Math.round((chapterReached(levelReached) / TOTAL_CHAPTERS) * 100);
}

// Chapters CLEARED -> numbers of badges earned.
export function badgesOf(levelReached, won) {
  const lr = clampLevel(levelReached);
  const out = [];
  if (lr >= 4) out.push(1); // reached the forest = finished chapter 1
  if (lr >= 5) out.push(2); // reached the liquidation = finished chapter 2
  if (won && lr >= 5) out.push(3); // final victory
  return out;
}

function clampLevel(lr) {
  return Math.max(1, Math.min(5, Math.round(Number(lr) || 1)));
}

// ---------- Local player identity (no account: UUID + nickname in localStorage) ----------

const ID_KEY = 'escape-ansem-player-id';
const NAME_KEY = 'escape-ansem-player-name';
const MAXCH_KEY = 'escape-ansem-max-chapter';

export function getPlayerId() {
  // Wallet connected: identity = verified address (scores are tied to the wallet).
  const wallet = getWallet();
  if (wallet) return wallet;
  // Otherwise, local anonymous identifier (backward-compatible, no account).
  let id = safeGet(ID_KEY);
  if (!id) {
    id = uuid();
    safeSet(ID_KEY, id);
  }
  return id;
}

export function getPlayerName() {
  return safeGet(NAME_KEY) || '';
}

export function setPlayerName(name) {
  const clean = String(name || '').trim().slice(0, 24);
  if (clean) safeSet(NAME_KEY, clean);
  return clean;
}

// Furthest chapter reached on THIS device (lore window gating).
export function getLocalMaxChapter() {
  const n = Number(safeGet(MAXCH_KEY));
  return Number.isFinite(n) ? Math.max(1, Math.min(TOTAL_CHAPTERS, n)) : 1;
}

export function bumpLocalMaxChapter(chapter) {
  const c = Math.max(1, Math.min(TOTAL_CHAPTERS, Math.round(Number(chapter) || 1)));
  if (c > getLocalMaxChapter()) safeSet(MAXCH_KEY, String(c));
  return getLocalMaxChapter();
}

function uuid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
