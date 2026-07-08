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

// --- Niveau 1b : couloir serpentin d'apprentissage (pas de labyrinthe, juste des virages).
// Corridor d'1 cellule de large qui remonte en S du coin bas-gauche vers le haut-droit :
// sert à se faire aux touches (rappel : gauche/droite inversées) avant la grande map. ---
const PATH_CEIL = 4.6;
export const PATH_LAYOUT = {
  id: 'path',
  cols: 13,
  rows: 13,
  areas: [
    { x0: 2, y0: 10, x1: 10, y1: 10, ceil: PATH_CEIL }, // bas : va vers la droite
    { x0: 10, y0: 7, x1: 10, y1: 10, ceil: PATH_CEIL }, // monte à droite
    { x0: 2, y0: 7, x1: 10, y1: 7, ceil: PATH_CEIL }, // revient vers la gauche
    { x0: 2, y0: 4, x1: 2, y1: 7, ceil: PATH_CEIL }, // monte à gauche
    { x0: 2, y0: 4, x1: 10, y1: 4, ceil: PATH_CEIL }, // repart vers la droite
    { x0: 10, y0: 2, x1: 10, y1: 4, ceil: PATH_CEIL }, // monte vers la sortie
  ],
  pillars: [],
  blocks: [],
  lights: [],
  playerStart: { col: 2, row: 10 },
  monsterStart: null,
  exitCell: { col: 10, row: 2 },
  startFacing: 'east',
};

// --- Labyrinthe crypto FIXE (mémorisable) : carte ASCII déterministe, plus petite que
// l'ancienne map procédurale 41×41. Salle de terreur en bas (S = spawn, A = recoin d'Ansem,
// D = porte fermée), labyrinthe au-dessus (3 P fixes + X = trou de sortie). La salle et le
// labyrinthe ne communiquent que par la porte D. (Connexité vérifiée : tous les P et X
// atteignables une fois la porte ouverte.) ---
export const ESCAPE_LAYOUT = {
  id: 'escape',
  ceil: 6,
  startFacing: 'north',
  map: [
    '###################',
    '#X..#.........#...#',
    '###.#.#.#####.###.#',
    '#...#.......#...#.#',
    '#.###.#.###.###.#P#',
    '#...#.#.#.....#...#',
    '#.#.#.#P..#######.#',
    '#...#.#.#...#.....#',
    '#.###.#.#.#.#...#.#',
    '#.#.....#.#.#.....#',
    '#.###.#####.#.#####',
    '#P..#.#.....#.#...#',
    '###.#.#.#####.#...#',
    '#...#.#.....#...#.#',
    '#.###.#.###.###.#.#',
    '#.....#...#.......#',
    '#########D#########',
    '######......A######',
    '######.......######',
    '######.S.....######',
    '###################',
  ],
};

// --- Niveau 3 « Liquidation » : enchevêtrement de couloirs exigus, avec du terrain vertical.
// Symboles : '#' mur · '.' sol · 'c' plafond bas (RAMPER) · '_' trou (SAUTER) · '^' rebord
// (sauter dessus) · 'S' spawn · 'X' sortie · 'A' Ansem. Généré + vérifié (le joueur atteint X
// avec saut/accroupi/montée ; Ansem flotte et traverse tout). ---
export const ENDGAME_LAYOUT = {
  id: 'endgame',
  ceil: 5,
  startFacing: 'north',
  // Couloir ÉTROIT (1 de large) SINUEUX : droites plus longues (moins de virages), directions
  // IRRÉGULIÈRES (pas de boustrophedon mécanique, avec un petit crochet), obstacles placés de
  // façon VARIÉE — certaines droites en portent deux, d'autres aucune, types mélangés, et
  // beaucoup de SAUTS ('_') + quelques GLISSADES ('c'). Connexité S->X vérifiée par BFS
  // (gen-endgame8.mjs). 'A' = spawn Ansem (relâché après une courte grâce, cf. EndgameLevel).
  map: [
    '#############',
    '##.c.X#######',
    '##.##########',
    '##._...######',
    '######.######',
    '######.....##',
    '##########_##',
    '####._..c..##',
    '####.########',
    '##._.########',
    '##.##########',
    '##._.....####',
    '########.####',
    '########....#',
    '###########c#',
    '######.._...#',
    '######_######',
    '#SA....######',
    '#############',
  ],
};

// --- Salle finale : petite pièce ouverte (habillée en sphère par VictoryLevel) avec le trophée
// au centre. Bordure de murs pour borner le joueur ; spawn au sud face au centre. ---
export const VICTORY_LAYOUT = {
  id: 'victory',
  ceil: 8,
  startFacing: 'north',
  // La case centrale (4,4) est un MUR : elle bloque le joueur autour du trophée/piédestal
  // (collision), sans être rendue (VictoryLevel dessine le socle + le trophée par-dessus).
  map: [
    '#########',
    '#.......#',
    '#.......#',
    '#.......#',
    '#...#...#',
    '#.......#',
    '#.......#',
    '#...S...#',
    '#########',
  ],
};

// --- Niveau (ancien) : salle de terreur (deux couloirs ; gauche fermé par une porte) ---
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
