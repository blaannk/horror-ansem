import * as THREE from 'three';
import { CELL, EYE_HEIGHT, FINAL_MAZE_SIZE } from '../config.js';
import { Maze } from './Maze.js';
import { Level } from './Level.js';
import { SPAWN_LAYOUT } from './mapData.js';
import { neonFixture, brokenScreen, chartPanel, ansemPoster, photoFrame, door } from './props.js';

// =============================================================
// Level 1 — WAKE UP: small dirty-yellow room, buzzing neons, broken screen,
// controls + Ansem photos on the walls. Wake-up animation on start.
// =============================================================
export class SpawnLevel extends Level {
  build() {
    this.maze = new Maze(SPAWN_LAYOUT);
    this.monsterMode = 'none';
    this.objective = 'Wake up…';
    this.buildMazeRenderer();

    // Ceiling neons (flicker).
    this.neons = [];
    for (const [c, r] of [[4, 4], [4, 3]]) {
      const n = neonFixture(0xdfe8ff);
      const w = this.maze.cellToWorld(c, r);
      n.group.position.set(w.x, 3.95, w.z);
      this.group.add(n.group);
      this.neons.push(n);
    }

    // Broken screen "Buy the dip." on the north wall, right of the door.
    const screen = brokenScreen('Buy the dip.');
    this.placeWallDecal(screen.group, 5, 2, 'north', { y: 2.0 });
    this.track(screen.mat, screen.tex);

    // Ansem "WANTED" poster centered on the east wall + framed photos around the room.
    const poster = ansemPoster();
    this.placeWallDecal(poster.group, 6, 4, 'east', { y: 2.0 });
    this.track(poster.posterTex);
    this.placeWallDecal(photoFrame(1.0), 3, 2, 'north', { y: 2.0 });
    this.placeWallDecal(photoFrame(1.0), 3, 6, 'south', { y: 2.0 });
    this.placeWallDecal(photoFrame(1.0), 5, 6, 'south', { y: 2.0 });

    this.flickerT = 0;
  }

  enter(game) {
    game.setFade(1); // black: eyes closed
    game.inputLocked = true;
    this.wakeT = 0;
    this.wakeDone = false;
    game.audio.neonBuzz(true);
    game.audio.keyboardAmbience(true);
    game.setObjective('Wake up…');
  }

  update(dt, game) {
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      this.flickerT = 0.04 + Math.random() * 0.22;
      const on = Math.random() > 0.18;
      for (const n of this.neons) {
        n.light.intensity = on ? 12 + Math.random() * 4 : 1.5;
        n.barMat.emissiveIntensity = on ? 1.6 : 0.2;
      }
    }

    if (!this.wakeDone) {
      const T = (this.wakeT += dt);
      const cam = game.camera;
      const k = smooth(clamp01((T - 0.3) / 2.6));
      cam.position.y = lerp(0.55, EYE_HEIGHT, k);
      cam.rotation.set(lerp(-0.5, 0, k), this.maze.startYaw, Math.sin(T * 3) * 0.02 * (1 - k));
      game.setFade(eyelid(T));
      if (T >= 3.2) {
        this.wakeDone = true;
        game.inputLocked = false;
        game.setFade(0);
        game.setObjective('Find the door and get out');
      }
      return;
    }

    if (nearCell(game.camera.position, this.maze, this.maze.exit, CELL * 0.9)) game.advance();
  }
}

// =============================================================
// Level 2 — SHORT MAZE: crashing crypto charts on the walls, a scary echoing
// voice repeating "You should have sold…".
// =============================================================
export class LabyrinthLevel extends Level {
  build() {
    this.maze = new Maze({ generate: { cols: 9, rows: 9, ceil: 5.0, withMonster: false } });
    this.monsterMode = 'none';
    this.objective = 'Find the exit';
    this.buildMazeRenderer();

    this.charts = [];
    const m = this.maze;
    const candidates = [];
    for (let row = 1; row < m.rows - 1; row++) {
      for (let col = 1; col < m.cols - 1; col++) {
        if (m.isWall(col, row)) continue;
        for (const side of ['north', 'south', 'east', 'west']) {
          const d = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[side];
          if (m.isWall(col + d[0], row + d[1])) candidates.push({ col, row, side });
        }
      }
    }
    shuffle(candidates);
    for (const c of candidates.slice(0, 12)) {
      const panel = chartPanel();
      this.placeWallDecal(panel.mesh, c.col, c.row, c.side, { y: 2.2 + Math.random() * 0.4 });
      this.charts.push(panel.mat);
      this.track(panel.tex);
    }

    this.t = 0;
    this.crashT = 1.5;
    this.voiceT = 1.0;
    this._flash = 0;
  }

  enter(game) {
    game.setObjective('Find the exit');
  }

  update(dt, game) {
    this.t += dt;
    const base = 0.35 + Math.abs(Math.sin(this.t * 1.2)) * 0.3;
    this.crashT -= dt;
    let spike = 0;
    if (this.crashT <= 0) {
      this.crashT = 3 + Math.random() * 3;
      spike = 1; // flash visuel uniquement (pas de bruitage)
      this._flash = 0.5;
    }
    if (this._flash > 0) this._flash = Math.max(0, this._flash - dt);
    for (const mat of this.charts) mat.emissiveIntensity = base + this._flash + spike;

    // Texte qui réapparaît (sans bruitage).
    this.voiceT -= dt;
    if (this.voiceT <= 0) {
      this.voiceT = 5 + Math.random() * 2;
      game.showLine('You should have sold…');
    }

    if (nearCell(game.camera.position, this.maze, this.maze.exit, CELL * 0.8)) game.advance();
  }
}

// =============================================================
// Level 3 — ESCAPE: terror room embedded INSIDE the big map (no loading once
// the door opens). Going RIGHT triggers Ansem's screamer; then "RUN", the LEFT
// door opens, and the permanent chase begins across the large maze.
// =============================================================
export class EscapeLevel extends Level {
  build() {
    this.maze = new Maze({ escape: { size: FINAL_MAZE_SIZE, ceil: 6, roomCeil: 7 } });
    this.monsterMode = 'none'; // Ansem reste invisible jusqu'au déclenchement
    this.portal = true;
    this.objective = 'Two doors… which one?';
    this.buildMazeRenderer();

    // Porte gauche blindée (groupe coulissant).
    this.doorH = 4;
    const d = door(CELL, this.doorH);
    this.doorW = this.maze.cellToWorld(this.maze.escapeDoor.col, this.maze.escapeDoor.row);
    d.group.position.set(this.doorW.x, this.doorH / 2, this.doorW.z);
    d.group.rotation.y = Math.PI / 2;
    this.group.add(d.group);
    this.doorGroup = d.group;
    this.lockMat = d.lockMat;

    // Lumière rouge d'avertissement au-dessus de la porte (tant qu'elle est fermée).
    this.redLampMat = new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: 0xff1010, emissiveIntensity: 2 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.5), this.redLampMat);
    lamp.position.set(this.doorW.x + 0.2, this.doorH + 0.7, this.doorW.z);
    lamp.rotation.y = Math.PI / 2;
    this.group.add(lamp);
    this.redLight = new THREE.PointLight(0xff1212, 5, 16, 1.6);
    this.redLight.position.set(this.doorW.x + 0.4, this.doorH + 0.5, this.doorW.z);
    this.group.add(this.redLight);
    this.redPulse = 0;

    this.phase = 'explore'; // explore → approach → screamer → chase
    this.appT = 0;
    this.opening = false;
  }

  enter(game) {
    // Ansem est posté au fond du couloir droit mais INVISIBLE (on ne le voit pas avant).
    game.monster.placeAt(this.maze.deadEnd);
    game.monster.setVisible(false);
    game.monster.setMode('none');
    game.setObjective('Two doors… which one?');
  }

  update(dt, game) {
    // Ouverture de la porte (glisse vers le haut), quelle que soit la phase.
    if (this.opening) {
      this.doorGroup.position.y += dt * 3.5;
      if (this.doorGroup.position.y > this.doorH * 1.4) {
        this.doorGroup.visible = false;
        this.opening = false;
      }
    }

    // Pulsation de la lumière rouge tant que la porte est fermée (avant le screamer).
    if (this.redLight && (this.phase === 'explore' || this.phase === 'approach' || this.phase === 'screamer')) {
      this.redPulse += dt * 4;
      this.redLight.intensity = 3.5 + Math.sin(this.redPulse) * 2.5;
      this.redLampMat.emissiveIntensity = 1.2 + Math.sin(this.redPulse) * 0.8;
    }

    const cam = game.camera.position;
    const cell = this.maze.worldToCell(cam.x, cam.z);

    if (this.phase === 'explore') {
      if (cell.col >= this.maze.rightTriggerCol && cell.row === this.maze.deadEnd.row) {
        // On le VOIT ARRIVER : il apparaît au fond et fonce vers nous.
        this.phase = 'approach';
        this.appT = 0;
        game.inputLocked = true;
        game.monster.setVisible(true);
        game.monster.setMode('reveal');
        game.monster.placeAt(this.maze.deadEnd);
        game.audio.whisper();
        const dEnd = this.maze.cellToWorld(this.maze.deadEnd.col, this.maze.deadEnd.row);
        let dx = cam.x - dEnd.x;
        let dz = cam.z - dEnd.z;
        const L = Math.hypot(dx, dz) || 1;
        dx /= L;
        dz /= L;
        this.appFrom = { x: dEnd.x, z: dEnd.z };
        this.appTo = { x: cam.x - dx * 1.4, z: cam.z - dz * 1.4 };
      }
      return;
    }

    if (this.phase === 'approach') {
      this.appT += dt;
      const k = clamp01(this.appT / 0.3); // fonce vite (rush)
      game.monster.position.x = lerp(this.appFrom.x, this.appTo.x, k);
      game.monster.position.z = lerp(this.appFrom.z, this.appTo.z, k);
      if (this.appT >= 0.3) {
        this.phase = 'screamer';
        game.screamer(() => {
          // Après le screamer : la porte s'ouvre et Ansem s'approche LENTEMENT (creep),
          // sans pouvoir attraper encore (l'approche lente n'est pas létale).
          game.monster.placeAt(this.maze.deadEnd);
          game.monster.setMode('creep');
          this.maze.openDoor(this.maze.escapeDoor.col, this.maze.escapeDoor.row);
          this.opening = true;
          this.lockMat.color.set(0x22ff55);
          this.lockMat.emissive.set(0x22ff55);
          this.redLight.intensity = 0;
          this.redLampMat.emissiveIntensity = 0;
          game.setObjective('Get out of the room…');
          this.phase = 'creep';
        });
      }
      return;
    }

    // Approche lente : dès que le joueur QUITTE la pièce (franchit la porte gauche),
    // un décompte de 5 s démarre avec un son qui monte.
    if (this.phase === 'creep' && cell.col <= this.maze.mazeEntry.col) {
      this.phase = 'countdown';
      this.countT = 5;
      this.lastN = 6;
      game.audio.startDread();
      game.setObjective('');
    }

    if (this.phase === 'countdown') {
      this.countT -= dt;
      game.audio.setDread(1 - Math.max(0, this.countT) / 5);
      const n = Math.ceil(this.countT);
      if (n !== this.lastN && n >= 1) {
        this.lastN = n;
        game.bigText(String(n), 950);
      }
      if (this.countT <= 0) {
        game.audio.stopDread();
        game.audio.crash();
        game.monster.setMode('chase');
        game.bigMessage('FIND THE EXIT\nBEFORE ANSEM FINDS YOU', 4500);
        game.setObjective('Find the exit before Ansem finds you');
        this.phase = 'chase';
      }
    }
    // Victoire (portail) et capture gérées par Game.
  }
}

export const LEVELS = [SpawnLevel, LabyrinthLevel, EscapeLevel];

// ---------- helpers ----------
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
function nearCell(pos, maze, cell, dist) {
  const w = maze.cellToWorld(cell.col, cell.row);
  return Math.hypot(w.x - pos.x, w.z - pos.z) < dist;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function eyelid(T) {
  if (T < 0.5) return 1;
  if (T < 0.8) return lerp(1, 0, (T - 0.5) / 0.3);
  if (T < 1.0) return 0;
  if (T < 1.15) return lerp(0, 0.85, (T - 1.0) / 0.15);
  if (T < 1.3) return lerp(0.85, 0, (T - 1.15) / 0.15);
  if (T < 2.0) return 0;
  if (T < 2.12) return lerp(0, 0.7, (T - 2.0) / 0.12);
  if (T < 2.28) return lerp(0.7, 0, (T - 2.12) / 0.16);
  return 0;
}
