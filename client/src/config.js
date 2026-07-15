// Configuration du jeu : valeurs par défaut + presets de difficulté.
// Les vitesses sont en unités/seconde. 1 cellule de labyrinthe = CELL unités.

export const CELL = 6; // taille d'une cellule (unités monde) - couloirs plus larges, meilleurs angles de vue
export const WALL_HEIGHT = 5.2; // couloirs hauts → la créature peut se dresser et surplomber
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.45; // pour les collisions

// Mécaniques verticales (utilisées surtout au niveau 3 : sauter les trous, ramper sous les conduits).
export const GRAVITY = 26; // gravité (unités/s²)
export const JUMP_VEL = 8.5; // vitesse initiale de saut (apex ≈ 1.4 u)
export const CROUCH_EYE = 1.0; // hauteur des yeux accroupi
export const PLAYER_CROUCH_SPEED = 3.2; // vitesse de déplacement accroupi
export const MONSTER_CATCH_DIST = 2.5; // distance de capture (game over) - près de toi = attrapé

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

// Objectif du niveau 1 : clés PEPE à ramasser avant que la sortie (le trou) s'active.
export const KEYS_TO_COLLECT = 3;
export const KEY_PICKUP_DIST = 2.4; // rayon de ramassage (unités monde)

// Aides disponibles AUTOMATIQUEMENT tant que la santé mentale reste au-dessus du seuil
// (de X % jusqu'à 100 %) ; elles disparaissent quand la santé chute en dessous :
// - Boussole (direction de la sortie) tant que santé ≥ COMPASS_SANITY.
// - Mini-carte des PEPE tant que santé ≥ MINIMAP_SANITY.
export const COMPASS_SANITY = 0.2; // ≥ 20 % → boussole disponible
export const MINIMAP_SANITY = 0.3; // ≥ 30 % → carte des PEPE disponible

// DEV : afficher les 3 fenêtres de lore/niveaux dès le départ (pour pouvoir tester chaque
// niveau). Passer à false pour le comportement de sortie : seule la 1ère fenêtre est visible,
// les suivantes apparaissent au fur et à mesure que le joueur atteint le chapitre correspondant.
export const DEV_SHOW_ALL_LEVELS = false;

// Réglages exposés dans le menu (réduits à l'essentiel).
// La santé mentale n'est PLUS réglable ici : elle est pilotée côté serveur (market cap
// on-chain du token) et lue en continu par le jeu. Aucun contrôle joueur exposé.
export const SETTINGS_SCHEMA = [
  { key: 'playerWalk', label: 'Player speed', min: 3, max: 9, step: 0.5, unit: '' },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, unit: '' },
];

export const DEFAULT_CONFIG = {
  // Exposés dans le menu :
  playerWalk: 5.5,
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
