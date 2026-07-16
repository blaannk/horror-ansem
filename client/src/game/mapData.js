// Library of fixed (deterministic) LAYOUTS. Each layout is a "spec" consumed
// by Maze: a wall grid carved out by `areas` (rooms/corridors), then `pillars`/`blocks`
// placed back in, and `doors` (door cells, closed at the start = removable walls).
// Procedural levels (maze, final map) use { generate: {...} }.

export const CEIL_DEFAULT = 5.2;
export const MAX_WALL_H = 11; // actual wall height; lower ceilings hide the excess

// --- Level 1: small wake-up room (door to the north) ---
export const SPAWN_LAYOUT = {
  id: 'spawn',
  cols: 9,
  rows: 9,
  areas: [
    { x0: 2, y0: 2, x1: 6, y1: 6, ceil: 4.2 }, // room (low, oppressive)
    { x0: 4, y0: 1, x1: 4, y1: 1, ceil: 4.2 }, // north doorway (same height -> continuous ceiling)
  ],
  pillars: [],
  blocks: [],
  lights: [], // lighting handled by the neons (animated props)
  controlsWall: { col: 2, row: 4, facing: 'west' },
  playerStart: { col: 4, row: 5 },
  monsterStart: null,
  exitCell: { col: 4, row: 1 },
  startFacing: 'north',
};

// --- Level 1b: winding tutorial corridor (no maze, just turns).
// A 1-cell-wide corridor that snakes upward in an S shape from the bottom-left corner to
// the top-right: used to get used to the controls (reminder: left/right are inverted)
// before the big map. ---
const PATH_CEIL = 4.6;
export const PATH_LAYOUT = {
  id: 'path',
  cols: 13,
  rows: 13,
  areas: [
    { x0: 2, y0: 10, x1: 10, y1: 10, ceil: PATH_CEIL }, // bottom: goes right
    { x0: 10, y0: 7, x1: 10, y1: 10, ceil: PATH_CEIL }, // climbs on the right
    { x0: 2, y0: 7, x1: 10, y1: 7, ceil: PATH_CEIL }, // goes back left
    { x0: 2, y0: 4, x1: 2, y1: 7, ceil: PATH_CEIL }, // climbs on the left
    { x0: 2, y0: 4, x1: 10, y1: 4, ceil: PATH_CEIL }, // heads right again
    { x0: 10, y0: 2, x1: 10, y1: 4, ceil: PATH_CEIL }, // climbs toward the exit
  ],
  pillars: [],
  blocks: [],
  lights: [],
  playerStart: { col: 2, row: 10 },
  monsterStart: null,
  exitCell: { col: 10, row: 2 },
  startFacing: 'east',
};

// --- FIXED crypto maze (memorable): deterministic ASCII map, smaller than
// the old 41x41 procedural map. Terror room at the bottom (S = spawn, A = Ansem's dead end,
// D = closed door), maze above (3 fixed P + X = exit hole). The room and the
// maze only connect through door D. (Connectivity verified: all P and X
// reachable once the door is open.) ---
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

// --- Level 3 "Liquidation": a tangle of tight corridors, with vertical terrain.
// Symbols: '#' wall, '.' floor, 'c' low ceiling (CROUCH), '_' gap (JUMP), '^' ledge
// (jump onto) 'S' spawn, 'X' exit, 'A' Ansem. Generated + verified (the player can reach X
// with jump/crouch/climb; Ansem floats and passes through everything). ---
export const ENDGAME_LAYOUT = {
  id: 'endgame',
  ceil: 5,
  startFacing: 'north',
  // NARROW (1-wide) WINDING corridor: longer straights (fewer turns), IRREGULAR
  // directions (no mechanical boustrophedon, with a small hook), obstacles placed in a
  // VARIED way - some straights carry two, others none, mixed types, and
  // plenty of JUMPS ('_') plus a few SLIDES ('c'). S->X connectivity verified by BFS
  // (gen-endgame8.mjs). 'A' = Ansem spawn (released after a short grace period, see EndgameLevel).
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

// --- Final room: small open room (dressed as a sphere by VictoryLevel) with the trophy
// at the center. Wall border to contain the player; spawn to the south facing the center. ---
export const VICTORY_LAYOUT = {
  id: 'victory',
  ceil: 8,
  startFacing: 'north',
  // The center cell (4,4) is a WALL: it blocks the player around the trophy/pedestal
  // (collision), without being rendered (VictoryLevel draws the base + trophy on top).
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

// --- Level (old): terror room (two corridors; left one closed off by a door) ---
export const TERROR_LAYOUT = {
  id: 'terror',
  cols: 17,
  rows: 13,
  areas: [
    { x0: 6, y0: 5, x1: 10, y1: 9, ceil: 7 }, // central room (tall)
    { x0: 11, y0: 7, x1: 15, y1: 7, ceil: 4 }, // RIGHT corridor (Ansem at the end)
    { x0: 1, y0: 7, x1: 4, y1: 7, ceil: 4 }, // LEFT corridor (behind the door)
  ],
  pillars: [],
  blocks: [],
  lights: [
    { col: 8, row: 7, y: 6, color: 0x6a3030, intensity: 6, dist: 40, decay: 1.4 },
  ],
  doors: [{ col: 5, row: 7 }], // left door, closed at the start
  playerStart: { col: 8, row: 9 },
  monsterStart: { col: 15, row: 7 }, // Ansem hidden at the end of the right corridor
  exitCell: { col: 1, row: 7 }, // exit at the end of the left corridor
  startFacing: 'north',
  // Scripted trigger zones (in cells):
  rightTriggerCol: 11, // entering the right corridor (col >= 11) triggers Ansem
};
