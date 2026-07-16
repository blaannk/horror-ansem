// Game configuration: default values + difficulty presets.
// Speeds are in units/second. 1 maze cell = CELL units.

export const CELL = 6; // cell size (world units), wider corridors, better viewing angles
export const WALL_HEIGHT = 5.2; // tall corridors: the creature can stand up and loom over
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.45; // for collisions

// Vertical mechanics (mainly used in level 3: jumping over pits, crawling under ducts).
export const GRAVITY = 26; // gravity (units/s²)
export const JUMP_VEL = 8.5; // initial jump velocity (apex ≈ 1.4 u)
export const CROUCH_EYE = 1.0; // eye height while crouched
export const PLAYER_CROUCH_SPEED = 3.2; // crouch movement speed
export const MONSTER_CATCH_DIST = 2.5; // capture distance (game over), close to you = caught

// Final map & chase:
export const FINAL_MAZE_SIZE = 41; // side length of the final maze (procedural, branching + rooms)
export const LOS_BOOST = 1.8; // ×monster speed when it sees you (line of sight)
export const MONSTER_CREEP_SPEED = 2.2; // slow approach speed (before the real chase)

// Detection linked to sanity (in world units):
//  - sanity < 0.5  → radius = DETECT_MAX (spots you almost all the time)
//  - sanity 0.5→1  → radius shrinks from DETECT_MAX to DETECT_MIN
export const DETECT_MAX = 400; // ≈ covers the whole map
export const DETECT_MIN = 9; // ≈ 1.5 cell (very stealthy at full sanity)

// High sanity = easy: above this threshold, the PLAYER becomes faster.
export const PLAYER_FAST_FROM = 0.8; // above 80%
export const PLAYER_BOOST_MAX = 0.6; // up to +60% speed at 100%

// Level 1 objective: PEPE keys to collect before the exit (the hole) activates.
export const KEYS_TO_COLLECT = 3;
export const KEY_PICKUP_DIST = 2.4; // pickup radius (world units)

// Aids available AUTOMATICALLY as long as sanity stays above the threshold
// (from X% up to 100%); they disappear once sanity drops below it:
// - Compass (direction to the exit) while sanity ≥ COMPASS_SANITY.
// - PEPE minimap while sanity ≥ MINIMAP_SANITY.
export const COMPASS_SANITY = 0.2; // ≥ 20% → compass available
export const MINIMAP_SANITY = 0.3; // ≥ 30% → PEPE map available

// DEV: show all 3 lore/level windows from the start (so each level can be tested).
// Set to false for release behavior: only the 1st window is visible, the next
// ones appear as the player reaches the corresponding chapter.
export const DEV_SHOW_ALL_LEVELS = false;

// Settings exposed in the menu (kept to the essentials).
// Sanity is NO LONGER adjustable here: it's driven server-side (on-chain token
// market cap) and read continuously by the game. No player control is exposed.
export const SETTINGS_SCHEMA = [
  { key: 'playerWalk', label: 'Player speed', min: 3, max: 9, step: 0.5, unit: '' },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, unit: '' },
];

export const DEFAULT_CONFIG = {
  // Exposed in the menu:
  playerWalk: 5.5,
  volume: 0.8,
  // Fixed values, not exposed (map/monster designed around them):
  playerSprint: 10,
  monsterSpeed: 6,
  sanityFear: 1.5, // monster speed boost at 0 sanity (+150%)
  monsterRepath: 0.35, // pathfinding recompute interval (s)
  monsterWakeDist: 9999, // 9999 = hunts from the start
  sensitivity: 1,
  fov: 80,
  stamina: false, // no stamina: unlimited sprint, bar hidden
  minimap: false,
  fog: true,
  difficulty: 'normal', // used by the leaderboard
};

const STORAGE_KEY = 'escape-ansem-config';

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
