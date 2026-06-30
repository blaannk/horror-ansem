// Configuration du jeu : valeurs par défaut + presets de difficulté.
// Les vitesses sont en unités/seconde. 1 cellule de labyrinthe = CELL unités.

export const CELL = 6; // taille d'une cellule (unités monde) — couloirs plus larges, meilleurs angles de vue
export const WALL_HEIGHT = 5.2; // couloirs hauts → la créature peut se dresser et surplomber
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.45; // pour les collisions
export const MONSTER_CATCH_DIST = 1.6; // distance de capture (game over)

// Map finale & poursuite :
export const FINAL_MAZE_SIZE = 41; // côté du labyrinthe final (procédural, ramifié + pièces)
export const LOS_BOOST = 1.8; // ×vitesse du monstre quand il te voit (ligne de vue)
export const MONSTER_CREEP_SPEED = 2.2; // vitesse de l'approche lente (avant la vraie poursuite)

// Détection liée à la santé mentale (en unités monde) :
//  - santé < 0.5  → rayon = DETECT_MAX (te repère quasiment tout le temps)
//  - santé 0.5→1  → rayon rétrécit de DETECT_MAX à DETECT_MIN
export const DETECT_MAX = 400; // ≈ couvre toute la map
export const DETECT_MIN = 9; // ≈ 1.5 cellule (très furtif à pleine santé)

// Haute santé mentale = facile : à partir de ce seuil, le JOUEUR devient plus rapide.
export const PLAYER_FAST_FROM = 0.8; // au-dessus de 80 %
export const PLAYER_BOOST_MAX = 0.6; // jusqu'à +60 % de vitesse à 100 %

// Réglages exposés dans le menu (réduits à l'essentiel).
export const SETTINGS_SCHEMA = [
  { key: 'playerWalk', label: 'Player speed', min: 3, max: 9, step: 0.5, unit: '' },
  { key: 'sanityStart', label: 'Starting sanity', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, unit: '' },
];

export const DEFAULT_CONFIG = {
  // Exposés dans le menu :
  playerWalk: 5.5,
  sanityStart: 1, // santé mentale initiale [0..1] — pilotée ensuite par une source externe
  volume: 0.8,
  // Valeurs fixes non exposées (carte/monstre conçus autour) :
  playerSprint: 10,
  monsterSpeed: 6,
  sanityFear: 1.5, // boost de vitesse du monstre à 0 de santé mentale (+150 %)
  monsterRepath: 0.35, // intervalle de recalcul du chemin (s)
  monsterWakeDist: 9999, // 9999 = traque dès le départ
  sensitivity: 1,
  fov: 80,
  stamina: false, // pas de stamina : sprint illimité, barre masquée
  minimap: false,
  fog: true,
  difficulty: 'normal', // utilisé par le leaderboard
};

const STORAGE_KEY = 'escape-bonk-config';

export function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') return { ...DEFAULT_CONFIG, ...saved };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}
