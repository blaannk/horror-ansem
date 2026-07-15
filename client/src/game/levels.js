import * as THREE from 'three';
import { CELL, EYE_HEIGHT, KEY_PICKUP_DIST } from '../config.js';
import { Maze } from './Maze.js';
import { Level } from './Level.js';
import { SPAWN_LAYOUT, PATH_LAYOUT, ESCAPE_LAYOUT } from './mapData.js';
import { neonFixture, brokenScreen, chartPanel, ansemPoster, photoFrame, door, pepeCoin, exitSign, hideHintPanel, clawMarks, deskProp, chairProp, mattressProp, crtMonitor, filingCabinet, trashClutter } from './props.js';
import { ForestLevel } from './ForestLevel.js';
import { EndgameLevel } from './EndgameLevel.js';
import { VictoryLevel } from './VictoryLevel.js';

// =============================================================
// Level 1 - WAKE UP: small dirty-yellow room, buzzing neons, broken screen,
// controls + Ansem photos on the walls. Wake-up animation on start.
// =============================================================
export class SpawnLevel extends Level {
  build() {
    this.maze = new Maze(SPAWN_LAYOUT);
    this.monsterMode = 'none';
    this.objective = 'Wake up…';
    this.ambientScreams = ['scream1', 'scream2']; // cris d'ambiance aléatoires (niveau 1)
    this.screamEvery = [5, 11]; // niveau 1 : cris fréquents (toutes les ~5-11 s)
    this.musicTrack = 'level1Music'; // musique du niveau 1 (continue à travers ses sous-niveaux)
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

    // Panneau « SE CACHER » : explique la planque (coin + lampe éteinte) dès la salle de départ.
    const hide = hideHintPanel();
    this.placeWallDecal(hide.mesh, 6, 5, 'east', { y: 2.0 });
    this.track(hide.mat, hide.tex);

    // Mobilier : matelas crasseux (là où l'on se réveille), bureau sous l'écran, chaise renversée.
    const mattress = mattressProp();
    const mw = this.maze.cellToWorld(3, 5);
    mattress.position.set(mw.x, 0, mw.z);
    mattress.rotation.y = 0.35;
    this.group.add(mattress);

    const desk = deskProp();
    const dw = this.maze.cellToWorld(5, 2);
    desk.position.set(dw.x, 0, dw.z - 2.4); // plaqué contre le mur nord, sous l'écran
    this.group.add(desk);

    const chair = chairProp();
    const cw = this.maze.cellToWorld(5, 3);
    chair.position.set(cw.x - 0.4, 0.34, cw.z);
    chair.rotation.z = Math.PI / 2; // renversée sur le flanc
    chair.rotation.y = 0.6;
    this.group.add(chair);

    // Griffures sur les murs (l'occupant précédent a essayé de sortir…).
    for (const [c, r, side, seed] of [[6, 3, 'east', 1], [4, 6, 'south', 2], [2, 6, 'west', 3]]) {
      const claw = clawMarks(3.0, 3.0, seed);
      this.placeWallDecal(claw.mesh, c, r, side, { y: 2.1, offset: 0.08 });
      this.track(claw.tex, claw.mat);
    }

    // Détails supplémentaires : classeur, CRT mort renversé, détritus, cadres, graphique qui crashe.
    const cabinet = filingCabinet();
    const cab = this.maze.cellToWorld(6, 3);
    cabinet.position.set(cab.x + 2.6, 0, cab.z); // contre le mur est
    this.group.add(cabinet);

    const crt = crtMonitor();
    const crtW = this.maze.cellToWorld(4, 5);
    crt.position.set(crtW.x - 1.6, 0, crtW.z - 0.6);
    crt.rotation.z = Math.PI / 2; // renversé sur le flanc
    crt.rotation.y = 0.5;
    this.group.add(crt);

    for (const [c, r] of [[3, 3], [5, 5]]) {
      const trash = trashClutter();
      const tw = this.maze.cellToWorld(c, r);
      trash.position.set(tw.x, 0, tw.z);
      this.group.add(trash);
    }

    // Cadres photo encadrant le panneau de contrôles (mur ouest) + graphique crypto en chute.
    this.placeWallDecal(photoFrame(0.9), 2, 3, 'west', { y: 2.3 });
    this.placeWallDecal(photoFrame(0.9), 2, 5, 'west', { y: 2.3 });
    const chart = chartPanel();
    this.placeWallDecal(chart.mesh, 6, 2, 'east', { y: 2.2 });
    this.track(chart.mat, chart.tex);

    this.flickerT = 0;
  }

  enter(game) {
    game.setFade(1); // black: eyes closed
    game.inputLocked = true;
    this.wakeT = 0;
    this.wakeDone = false;
    this.reveilPlayed = false; // son de réveil (fichier fourni) joué une fois, dès qu'il est prêt
    game.audio.neonBuzz(true);
    game.audio.keyboardAmbience(true);
    game.audio.startMusic('level1Music', 0.42); // musique du niveau 1
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
      // Joue le son de réveil dès que l'échantillon est décodé (réessaie jusqu'à ~1,5 s).
      // On coupe la fin (« who are you people ») : lecture des ~14 premières secondes + fondu.
      if (!this.reveilPlayed && T > 0.2) {
        const r = game.audio.playSample('wakeup', { gain: 0.9, duration: 8, fadeOut: 0.7 });
        if (r) this._wake = r;
        if (r || T > 1.5) this.reveilPlayed = true;
      }
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

  dispose() {
    // Coupe le son de réveil s'il joue encore, pour qu'il ne déborde pas sur le niveau suivant.
    try {
      this._wake?.src.stop();
    } catch {
      /* ignore */
    }
    super.dispose();
  }
}

// =============================================================
// Level 1b - TUTORIAL PATH: a single winding corridor (no maze, just a few turns) to get
// used to the (inverted) controls. Crashing crypto charts on the walls, a scary echoing
// voice repeating "You should have sold…".
// =============================================================
export class LabyrinthLevel extends Level {
  build() {
    this.maze = new Maze(PATH_LAYOUT);
    this.monsterMode = 'none';
    this.objective = 'Follow the corridor';
    this.ambientScreams = ['scream1', 'scream2']; // cris d'ambiance aléatoires (niveau 1)
    this.screamEvery = [5, 11]; // niveau 1 : cris fréquents (toutes les ~5-11 s)
    this.musicTrack = 'level1Music'; // musique du niveau 1 (continue à travers ses sous-niveaux)
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
    for (const c of candidates.slice(0, 7)) {
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
    game.audio.startMusic('level1Music', 0.42); // musique du niveau 1 (continue)
    game.setObjective('Follow the corridor to the exit');
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
// Level 3 - ESCAPE: terror room embedded INSIDE the big map (no loading once
// the door opens). Going RIGHT triggers Ansem's screamer; then "RUN", the LEFT
// door opens, and the permanent chase begins across the large maze.
// =============================================================
export class EscapeLevel extends Level {
  build() {
    // Carte FIXE (toujours la même → mémorisable), plus petite que l'ancienne map procédurale.
    this.maze = new Maze(ESCAPE_LAYOUT);
    this.monsterMode = 'none'; // Ansem reste invisible jusqu'au déclenchement
    this.portal = true;
    this.exitKind = 'hole'; // la sortie est un trou dans le sol (transition « chute » → forêt)
    this.feasibleSanity = 0.3; // jouable ~30 % de santé mentale (cf. Game)
    this.objective = ''; // niveau muet : rien ne s'affiche quand les éléments apparaissent
    this.ambientScreams = ['scream1', 'scream2']; // cris d'ambiance aléatoires (niveau 1)
    this.screamEvery = [5, 11]; // niveau 1 : cris fréquents (toutes les ~5-11 s)
    this.musicTrack = 'level1Music'; // musique du niveau 1 (continue à travers ses sous-niveaux)
    this.buildMazeRenderer();

    // Panneau « EXIT ↓ » au mur, face à l'arrivée du joueur sur le trou.
    this.#placeExitSign();

    // Porte blindée coulissante, orientée selon l'axe du mur qui la porte : mur horizontal
    // (murs à gauche/droite) → la porte fait face au nord/sud (yaw 0) ; sinon face est/ouest.
    this.doorH = 4;
    const dc = this.maze.escapeDoor;
    const horizontalWall = this.maze.isWall(dc.col - 1, dc.row) && this.maze.isWall(dc.col + 1, dc.row);
    const doorYaw = horizontalWall ? 0 : Math.PI / 2;
    const d = door(CELL, this.doorH);
    this.doorW = this.maze.cellToWorld(dc.col, dc.row);
    d.group.position.set(this.doorW.x, this.doorH / 2, this.doorW.z);
    d.group.rotation.y = doorYaw;
    this.group.add(d.group);
    this.doorGroup = d.group;
    this.lockMat = d.lockMat;

    // Lumière rouge d'avertissement au-dessus de la porte (tant qu'elle est fermée).
    this.redLampMat = new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: 0xff1010, emissiveIntensity: 2 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.5), this.redLampMat);
    lamp.position.set(this.doorW.x, this.doorH + 0.7, this.doorW.z);
    lamp.rotation.y = doorYaw;
    this.group.add(lamp);
    this.redLight = new THREE.PointLight(0xff1212, 5, 16, 1.6);
    this.redLight.position.set(this.doorW.x, this.doorH + 0.5, this.doorW.z);
    this.group.add(this.redLight);
    this.redPulse = 0;

    // --- Clés PEPE à récupérer dans le labyrinthe (avant d'activer le portail) ---
    this.coins = this.#placeCoins();
    this.coinSpin = 0;

    this.phase = 'explore'; // explore → approach → screamer → chase
    this.appT = 0;
    this.opening = false;
  }

  // Pose les PEPE aux cellules FIXES définies par la carte (maze.pepeCells) → mêmes positions
  // à chaque partie (mémorisables).
  #placeCoins() {
    const m = this.maze;
    const coins = [];
    for (const cell of m.pepeCells) {
      const coin = pepeCoin();
      const w = m.cellToWorld(cell.col, cell.row);
      const baseY = 1.6;
      coin.group.position.set(w.x, baseY, w.z);
      this.group.add(coin.group);
      this.track(coin.tex, coin.mat, coin.haloMat, coin.glowMat, coin.ringMat, coin.ringGeo);
      coins.push({
        col: cell.col,
        row: cell.row,
        group: coin.group,
        baseY,
        collected: false,
        ring: coin.ring,
        light: coin.light,
        glowMat: coin.glowMat,
        haloMat: coin.haloMat,
      });
    }
    return coins;
  }

  // Panneau EXIT sur un mur de la cellule de sortie, de préférence face à l'arrivée du joueur.
  #placeExitSign() {
    const m = this.maze;
    const ex = m.exit;
    const sides = [
      ['north', 0, -1],
      ['south', 0, 1],
      ['east', 1, 0],
      ['west', -1, 0],
    ];
    const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' };
    let openSide = null;
    for (const [side, dc, dr] of sides) {
      if (!m.isWall(ex.col + dc, ex.row + dr)) {
        openSide = side;
        break;
      }
    }
    const wallSides = sides.filter(([, dc, dr]) => m.isWall(ex.col + dc, ex.row + dr)).map(([s]) => s);
    let side = openSide ? opposite[openSide] : wallSides[0] || 'north';
    if (!wallSides.includes(side)) side = wallSides[0] || side;
    const sign = exitSign();
    this.placeWallDecal(sign.mesh, ex.col, ex.row, side, { y: 2.6 });
    this.track(sign.mat, sign.tex);
  }

  enter(game) {
    // Ansem est posté au recoin mais INVISIBLE (on ne le voit pas avant le screamer).
    game.monster.placeAt(this.maze.deadEnd);
    game.monster.setVisible(false);
    game.monster.setMode('none');
    game.audio.startMusic('level1Music', 0.42); // musique du niveau 1 (continue)
    // Niveau muet : pas d'objectif affiché.
  }

  update(dt, game) {
    // --- Clés PEPE : flottement/rotation + ramassage à proximité ---
    this.coinSpin += dt;
    const cam = game.camera.position;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      coin.group.position.y = coin.baseY + Math.sin(this.coinSpin * 2 + coin.col) * 0.18;
      coin.group.rotation.y += dt * 1.5;
      // Pouls néon : anneau qui tourne, lueur et lumière qui respirent.
      const pulse = 0.75 + Math.sin(this.coinSpin * 3.5 + coin.col) * 0.25;
      if (coin.ring) coin.ring.rotation.z += dt * 2.6;
      if (coin.light) coin.light.intensity = 2.2 + pulse * 1.6;
      if (coin.glowMat) coin.glowMat.opacity = 0.35 + pulse * 0.3;
      if (coin.haloMat) coin.haloMat.opacity = 0.55 + pulse * 0.3;
      if (Math.hypot(coin.group.position.x - cam.x, coin.group.position.z - cam.z) < KEY_PICKUP_DIST) {
        coin.collected = true;
        coin.group.visible = false;
        game.collectKey();
      }
    }

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

    const cell = this.maze.worldToCell(cam.x, cam.z);

    if (this.phase === 'explore') {
      const dEndCell = this.maze.deadEnd;
      const nearDeadEnd = Math.abs(cell.col - dEndCell.col) + Math.abs(cell.row - dEndCell.row) <= 2;
      if (nearDeadEnd) {
        // On le VOIT ARRIVER : il apparaît au recoin et fonce vers nous.
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
          this.phase = 'creep';
        });
      }
      return;
    }

    // Approche lente : dès que le joueur FRANCHIT la porte vers le labyrinthe (rangée au-dessus
    // de la porte), un décompte silencieux de 5 s démarre avec une tension sonore qui monte.
    if (this.phase === 'creep' && cell.row < this.maze.escapeDoor.row) {
      this.phase = 'countdown';
      this.countT = 5;
    }

    if (this.phase === 'countdown') {
      this.countT -= dt;
      // (Sons de tension « dread » ET « crash » retirés à la demande - transition silencieuse.)
      if (this.countT <= 0) {
        game.monster.setMode('chase'); // la vraie poursuite commence (sans texte)
        this.phase = 'chase';
      }
    }

    // Arrivée sur le trou (une fois les 3 clés réunies) → chute cinématique vers la forêt.
    if (this.portalActive && !this._falling) {
      const e = this.maze.cellToWorld(this.maze.exit.col, this.maze.exit.row);
      if (Math.hypot(e.x - cam.x, e.z - cam.z) < CELL * 0.7) {
        this._falling = true;
        game.fallThrough(() => game.advance());
      }
    }
    // Capture gérée par Game.
  }
}

export const LEVELS = [SpawnLevel, LabyrinthLevel, EscapeLevel, ForestLevel, EndgameLevel, VictoryLevel];

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
