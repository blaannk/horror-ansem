// Bibliothèque de LAYOUTS fixes (déterministes). Chaque layout est une "spec" consommée
// par Maze : grille de murs creusée par `areas` (salles/couloirs), puis `pillars`/`blocks`
// reposés, et `doors` (cellules-portes, fermées au départ = murs amovibles).
// Les niveaux procéduraux (labyrinthe, map finale) utilisent { generate: {...} }.

export const CEIL_DEFAULT = 5.2;
export const MAX_WALL_H = 11; // hauteur réelle des murs ; les plafonds plus bas masquent le surplus

// --- Niveau 1 : petite salle de réveil (porte au nord) ---
export const SPAWN_LAYOUT = {
  id: 'spawn',
  cols: 9,
  rows: 9,
  areas: [
    { x0: 2, y0: 2, x1: 6, y1: 6, ceil: 4.2 }, // salle (basse, oppressante)
    { x0: 4, y0: 1, x1: 4, y1: 1, ceil: 4.2 }, // embrasure de la porte nord (même hauteur → plafond continu)
  ],
  pillars: [],
  blocks: [],
  lights: [], // éclairage géré par les néons (props animés)
  controlsWall: { col: 2, row: 4, facing: 'west' },
  playerStart: { col: 4, row: 5 },
  monsterStart: null,
  exitCell: { col: 4, row: 1 },
  startFacing: 'north',
};

// --- Niveau 3 : salle de terreur (deux couloirs ; gauche fermé par une porte) ---
export const TERROR_LAYOUT = {
  id: 'terror',
  cols: 17,
  rows: 13,
  areas: [
    { x0: 6, y0: 5, x1: 10, y1: 9, ceil: 7 }, // salle centrale (haute)
    { x0: 11, y0: 7, x1: 15, y1: 7, ceil: 4 }, // couloir DROIT (Ansem au bout)
    { x0: 1, y0: 7, x1: 4, y1: 7, ceil: 4 }, // couloir GAUCHE (derrière la porte)
  ],
  pillars: [],
  blocks: [],
  lights: [
    { col: 8, row: 7, y: 6, color: 0x6a3030, intensity: 6, dist: 40, decay: 1.4 },
  ],
  doors: [{ col: 5, row: 7 }], // porte gauche, fermée au départ
  playerStart: { col: 8, row: 9 },
  monsterStart: { col: 15, row: 7 }, // Ansem caché au bout du couloir droit
  exitCell: { col: 1, row: 7 }, // sortie au bout du couloir gauche
  startFacing: 'north',
  // Zones de scénario (en cellules) :
  rightTriggerCol: 11, // entrer dans le couloir droit (col ≥ 11) déclenche Ansem
};
