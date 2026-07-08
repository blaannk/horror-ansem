// Modèle d'avancement partagé (menu, écran de fin, gating des fenêtres de lore).
//
// LEVELS internes = [Spawn(0), Labyrinth(1), Escape(2), Forest(3), Endgame(4)]
// regroupés en 3 CHAPITRES visibles. level_reached = levelIndex + 1 (1..5).
// La dérivation percent/badges est le miroir de server/progress.js — garder les deux alignés.

export const TOTAL_CHAPTERS = 3;

// Métadonnées par chapitre (source des fenêtres de lore + libellés de badges).
// `levelIndex` = point d'entrée dans LEVELS pour jouer ce chapitre (passé à Game).
export const CHAPTERS = [
  {
    n: 1,
    levelIndex: 0,
    // Volontairement mystérieux : le tout premier chapitre ne s'annonce pas comme « niveau 1 ».
    title: 'The Yellow Room',
    tagline: 'buy the dip',
    lore:
      "You come to on a filthy mattress, neons buzzing, a dead screen frozen on “BUY THE DIP.” " +
      "You don't remember signing anything. The walls remember for you — they're scratched from the inside. " +
      "Scattered in the maze are the PEPE keys: collect them all to unseal the pit in the floor, then drop " +
      "through it — before ANSEM finishes waking up too.",
    badge: { icon: 'chart-down', label: 'Dip Survivor', color: '#e11d2b' },
  },
  {
    n: 2,
    levelIndex: 3,
    title: 'The Night Forest',
    tagline: 'fire to fire',
    lore:
      "The pit spat you into the woods. You wake in a cold chalet that still smells of the dog that lived here — " +
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
      "Under the forest hums the mine that started all of it — a collapsing data-center bleeding heat and debt. " +
      "Crawl the ducts, jump the gaps, climb while it folds in on itself. Ansem is in here with you now, " +
      "and there is exactly one way out. Escape and you're finally free of the bag.",
    badge: { icon: 'skull', label: 'Liquidated the Nightmare', color: '#ff2f2f' },
  },
];

// Chapitre le plus loin ATTEINT (position du joueur).
export function chapterReached(levelReached) {
  const lr = clampLevel(levelReached);
  if (lr <= 3) return 1;
  if (lr === 4) return 2;
  return 3;
}

// Avancement en % (33 / 66 / 100).
export function percentOf(levelReached) {
  return Math.round((chapterReached(levelReached) / TOTAL_CHAPTERS) * 100);
}

// Chapitres FRANCHIS -> numéros de badges gagnés.
export function badgesOf(levelReached, won) {
  const lr = clampLevel(levelReached);
  const out = [];
  if (lr >= 4) out.push(1); // atteint la forêt = a fini le chapitre 1
  if (lr >= 5) out.push(2); // atteint la liquidation = a fini le chapitre 2
  if (won && lr >= 5) out.push(3); // victoire finale
  return out;
}

function clampLevel(lr) {
  return Math.max(1, Math.min(5, Math.round(Number(lr) || 1)));
}

// ---------- Identité joueur locale (pas de compte : UUID + pseudo dans localStorage) ----------

const ID_KEY = 'escape-bonk-player-id';
const NAME_KEY = 'escape-bonk-player-name';
const MAXCH_KEY = 'escape-bonk-max-chapter';

export function getPlayerId() {
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

// Chapitre le plus loin atteint sur CET appareil (gating des fenêtres de lore).
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
