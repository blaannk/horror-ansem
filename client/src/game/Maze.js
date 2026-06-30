import { CELL } from '../config.js';
import { CEIL_DEFAULT } from './mapData.js';

// Labyrinthe sur grille (1 = mur, 0 = passage), rectangulaire cols × rows.
// Deux modes :
//  - FIXE : spec.areas/pillars/blocks/doors (layouts dessinés à la main).
//  - PROCÉDURAL : spec.generate = { cols, rows, ceil, withMonster, headStart }
//    (recursive backtracker ; spawn/exit = extrémités du diamètre via double BFS).

const DIRS = [
  [0, -2],
  [0, 2],
  [-2, 0],
  [2, 0],
];

const FACING_YAW = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };

export class Maze {
  constructor(spec = {}) {
    this.spec = spec;
    if (spec.escape) this.#initEscape(spec.escape);
    else if (spec.generate) this.#initProcedural(spec.generate);
    else this.#initFixed(spec);
  }

  // Grande map procédurale AVEC une salle de terreur scellée tamponnée en bas (un seul
  // maze → aucun chargement quand la porte ouest s'ouvre). Couloir DROIT en impasse
  // (Ansem du screamer) ; porte GAUCHE fermée donnant sur le labyrinthe.
  #initEscape(g) {
    const N = g.size % 2 === 0 ? g.size + 1 : g.size;
    this.cols = N;
    this.rows = N;
    this.size = N;
    this.uniformCeil = g.ceil ?? CEIL_DEFAULT;
    this.doors = new Set();
    this.lowBlocks = new Map();
    this.lights = [];
    this.controlsWall = null;
    this.areas = [];

    this.grid = this.#generate(); // labyrinthe parfait
    this.#braid(0.18); // ouvre des murs → BOUCLES (plusieurs routes, plus parfait)
    this.#carveEscapeRooms(N); // PIÈCES ouvertes (avec plafonds plus hauts)

    const cx = (N - 1) / 2;
    // --- Salle de terreur scellée (boîte) en bas-centre ---
    const bb = { r0: N - 7, r1: N - 1, c0: cx - 3, c1: cx + 6 };
    for (let r = bb.r0; r <= bb.r1; r++)
      for (let c = bb.c0; c <= bb.c1; c++) if (this.inBounds(c, r)) this.grid[r][c] = 1;
    for (let r = N - 6; r <= N - 2; r++) for (let c = cx - 2; c <= cx + 2; c++) this.grid[r][c] = 0; // salle
    for (let c = cx + 3; c <= cx + 5; c++) this.grid[N - 4][c] = 0; // impasse droite (Ansem)

    const doorCol = cx - 3;
    const doorRow = N - 4;
    this.grid[doorRow][doorCol] = 1; // porte gauche FERMÉE
    this.doors.add(`${doorCol},${doorRow}`);

    // --- Antichambre ouverte 5×3 juste à l'ouest de la porte (hors boîte) :
    //     elle recouvre des couloirs du labyrinthe → PLUSIEURS directions dès la porte. ---
    for (let r = N - 6; r <= N - 4; r++) for (let c = cx - 8; c <= cx - 4; c++) if (this.inBounds(c, r)) this.grid[r][c] = 0;
    this.areas.push({ x0: cx - 8, y0: N - 6, x1: cx - 4, y1: N - 2, ceil: g.roomCeil ?? 7 });
    // Connecteur vertical garanti vers le corps principal du labyrinthe (colonne impaire).
    let cc = cx - 6;
    if (cc % 2 === 0) cc -= 1;
    for (let r = N - 4; r >= N - 11 && r >= 1; r--) this.grid[r][cc] = 0;

    this.playerSpawn = { col: cx, row: N - 3 };
    this.#computeStartYaw('north');

    this.mazeEntry = { col: doorCol - 1, row: doorRow };
    this.escapeDoor = { col: doorCol, row: doorRow };
    this.deadEnd = { col: cx + 5, row: N - 4 };
    this.rightTriggerCol = cx + 3;

    this.exit = this.#farthestFrom(this.mazeEntry);
    this.spawn = this.#spawnBehind(this.mazeEntry, this.exit);
  }

  // Ouvre une fraction des murs intérieurs séparant deux couloirs parallèles → boucles.
  #braid(prob) {
    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        if (this.grid[r][c] !== 1) continue;
        const ns = this.grid[r - 1][c] === 0 && this.grid[r + 1][c] === 0;
        const ew = this.grid[r][c - 1] === 0 && this.grid[r][c + 1] === 0;
        if ((ns || ew) && Math.random() < prob) this.grid[r][c] = 0;
      }
    }
  }

  // Quelques pièces ouvertes dans la zone du labyrinthe (au-dessus de la salle de terreur).
  #carveEscapeRooms(N) {
    const count = 5;
    const maxRow = N - 9; // garde une marge au-dessus de la boîte de terreur
    for (let i = 0; i < count; i++) {
      const rw = 3 + 2 * ((Math.random() * 2) | 0);
      const rh = 3 + 2 * ((Math.random() * 2) | 0);
      const c0 = 1 + ((Math.random() * (this.cols - 2 - rw)) | 0);
      const r0 = 1 + ((Math.random() * (maxRow - 1 - rh)) | 0);
      if (r0 < 1 || c0 < 1) continue;
      for (let r = r0; r <= r0 + rh - 1 && r < this.rows - 1; r++) {
        for (let c = c0; c <= c0 + rw - 1 && c < this.cols - 1; c++) this.grid[r][c] = 0;
      }
      this.areas.push({ x0: c0, y0: r0, x1: c0 + rw - 1, y1: r0 + rh - 1, ceil: 8 + ((Math.random() * 2) | 0) });
    }
  }

  // Cellule praticable aléatoire (utilisée par l'IA d'errance du monstre).
  randomOpenCell() {
    for (let i = 0; i < 200; i++) {
      const col = 1 + ((Math.random() * (this.cols - 2)) | 0);
      const row = 1 + ((Math.random() * (this.rows - 2)) | 0);
      if (!this.isWall(col, row)) return { col, row };
    }
    return { ...this.exit };
  }

  // ---------- Construction fixe ----------
  #initFixed(spec) {
    this.cols = spec.cols;
    this.rows = spec.rows;
    this.size = Math.max(this.cols, this.rows);
    this.uniformCeil = null;
    this.areas = spec.areas ?? [];

    const grid = Array.from({ length: this.rows }, () => new Array(this.cols).fill(1));
    for (const a of this.areas) {
      for (let row = a.y0; row <= a.y1; row++) {
        for (let col = a.x0; col <= a.x1; col++) {
          if (this.inBounds(col, row)) grid[row][col] = 0;
        }
      }
    }
    for (const [col, row] of spec.pillars ?? []) if (this.inBounds(col, row)) grid[row][col] = 1;
    for (const b of spec.blocks ?? []) if (this.inBounds(b.col, b.row)) grid[b.row][b.col] = 1;
    this.doors = new Set();
    for (const d of spec.doors ?? []) {
      if (this.inBounds(d.col, d.row)) {
        grid[d.row][d.col] = 1; // fermée = mur au départ
        this.doors.add(`${d.col},${d.row}`);
      }
    }
    this.grid = grid;

    this.lowBlocks = new Map();
    for (const b of spec.blocks ?? []) this.lowBlocks.set(`${b.col},${b.row}`, b.h);

    this.lights = spec.lights ?? [];
    this.controlsWall = spec.controlsWall ?? null;

    this.spawn = spec.monsterStart ? { ...spec.monsterStart } : null;
    this.exit = { ...spec.exitCell };
    this.playerSpawn = { ...spec.playerStart };
    this.#computeStartYaw(spec.startFacing);
  }

  // ---------- Construction procédurale ----------
  #initProcedural(g) {
    this.cols = g.cols % 2 === 0 ? g.cols + 1 : g.cols;
    this.rows = g.rows % 2 === 0 ? g.rows + 1 : g.rows;
    this.size = Math.max(this.cols, this.rows);
    this.uniformCeil = g.ceil ?? CEIL_DEFAULT;
    this.areas = [];
    this.doors = new Set();
    this.lowBlocks = new Map();
    this.lights = [];
    this.controlsWall = null;

    this.grid = this.#generate();

    const a = this.#farthestFrom({ col: 1, row: 1 });
    const b = this.#farthestFrom(a);
    this.exit = b;

    if (g.withMonster) {
      this.spawn = a; // le monstre démarre au fond
      const path = this.findPath(a, b);
      const idx = Math.min(g.headStart ?? 4, Math.max(0, path.length - 2));
      this.playerSpawn = path.length ? path[idx] : a;
      const ahead = path[Math.min(idx + 1, path.length - 1)] || b;
      this.#yawTowards(this.playerSpawn, ahead);
    } else {
      this.spawn = null;
      this.playerSpawn = a;
      const path = this.findPath(a, b);
      this.#yawTowards(this.playerSpawn, path[0] || b);
    }
  }

  #generate() {
    const n = this.cols;
    const m = this.rows;
    const grid = Array.from({ length: m }, () => new Array(n).fill(1));
    const stack = [[1, 1]];
    grid[1][1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const candidates = [];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx > 0 && ny > 0 && nx < n - 1 && ny < m - 1 && grid[ny][nx] === 1) {
          candidates.push([nx, ny, dx, dy]);
        }
      }
      if (candidates.length) {
        const [nx, ny, dx, dy] = candidates[(Math.random() * candidates.length) | 0];
        grid[y + dy / 2][x + dx / 2] = 0;
        grid[ny][nx] = 0;
        stack.push([nx, ny]);
      } else {
        stack.pop();
      }
    }
    return grid;
  }

  #computeStartYaw(facing) {
    if (facing && facing in FACING_YAW) {
      this.startYaw = FACING_YAW[facing];
      return;
    }
    const path = this.findPath(this.playerSpawn, this.exit);
    this.#yawTowards(this.playerSpawn, path[0] || this.exit);
  }

  #yawTowards(from, to) {
    const a = this.cellToWorld(from.col, from.row);
    const b = this.cellToWorld(to.col, to.row);
    this.startYaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  }

  // ---------- Requêtes ----------
  ceilingAt(col, row) {
    for (const a of this.areas) {
      if (col >= a.x0 && col <= a.x1 && row >= a.y0 && row <= a.y1) return a.ceil;
    }
    if (this.uniformCeil != null) return this.uniformCeil;
    return CEIL_DEFAULT;
  }

  inBounds(col, row) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  isWall(col, row) {
    if (!this.inBounds(col, row)) return true;
    return this.grid[row][col] === 1;
  }

  isLowBlock(col, row) {
    return this.lowBlocks.has(`${col},${row}`);
  }

  isDoor(col, row) {
    return this.doors.has(`${col},${row}`);
  }

  // Ouvre une porte (devient praticable). Renvoie true si l'état a changé.
  openDoor(col, row) {
    if (!this.isDoor(col, row) || this.grid[row][col] === 0) return false;
    this.grid[row][col] = 0;
    return true;
  }

  cellToWorld(col, row) {
    const halfW = (this.cols - 1) / 2;
    const halfH = (this.rows - 1) / 2;
    return { x: (col - halfW) * CELL, z: (row - halfH) * CELL };
  }

  worldToCell(x, z) {
    const halfW = (this.cols - 1) / 2;
    const halfH = (this.rows - 1) / 2;
    return { col: Math.round(x / CELL + halfW), row: Math.round(z / CELL + halfH) };
  }

  // Ligne de vue libre entre deux cellules (échantillonnage sur la grille).
  hasLineOfSight(a, b) {
    const x0 = a.col;
    const y0 = a.row;
    const x1 = b.col;
    const y1 = b.row;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist * 3));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const c = Math.round(x0 + (x1 - x0) * t);
      const r = Math.round(y0 + (y1 - y0) * t);
      if (this.isWall(c, r)) return false;
    }
    return true;
  }

  // Spawn du monstre « derrière » le joueur : à distance moyenne de l'entrée du labyrinthe
  // ET le plus loin possible de la sortie (donc à l'opposé du chemin de fuite).
  #spawnBehind(entry, exit) {
    const de = this.#bfs(entry).dist;
    const dx = this.#bfs(exit).dist;
    let best = null;
    let bestScore = -1;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const d = de[row][col];
        if (d < 6 || d > 14) continue; // gap raisonnable derrière le joueur
        const score = dx[row][col]; // loin de la sortie = bien derrière
        if (score > bestScore) {
          bestScore = score;
          best = { col, row };
        }
      }
    }
    return best || this.#farthestFrom(exit);
  }

  #farthestFrom(start) {
    const { dist } = this.#bfs(start);
    let best = start;
    let bestD = -1;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (dist[row][col] > bestD) {
          bestD = dist[row][col];
          best = { col, row };
        }
      }
    }
    return best;
  }

  #bfs(start) {
    const dist = Array.from({ length: this.rows }, () => new Array(this.cols).fill(-1));
    const prev = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    if (this.isWall(start.col, start.row)) return { dist, prev };
    const queue = [start];
    dist[start.row][start.col] = 0;
    let head = 0;
    const steps = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    while (head < queue.length) {
      const { col, row } = queue[head++];
      for (const [dx, dy] of steps) {
        const nc = col + dx;
        const nr = row + dy;
        if (this.inBounds(nc, nr) && !this.isWall(nc, nr) && dist[nr][nc] === -1) {
          dist[nr][nc] = dist[row][col] + 1;
          prev[nr][nc] = { col, row };
          queue.push({ col: nc, row: nr });
        }
      }
    }
    return { dist, prev };
  }

  findPath(from, to) {
    const { dist, prev } = this.#bfs(from);
    if (!this.inBounds(to.col, to.row) || dist[to.row][to.col] === -1) return [];
    const path = [];
    let cur = to;
    while (cur && !(cur.col === from.col && cur.row === from.row)) {
      path.push(cur);
      cur = prev[cur.row][cur.col];
    }
    path.reverse();
    return path;
  }
}
