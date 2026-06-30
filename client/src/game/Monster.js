import * as THREE from 'three';
import { CELL, EYE_HEIGHT, LOS_BOOST, MONSTER_CREEP_SPEED } from '../config.js';

// Ansem — antagoniste affiché en billboard (THREE.Sprite, photo /ansem.png) qui fait
// toujours face au joueur et reste lumineux dans le noir.
// Modes :
//  - 'none'   : caché, inerte (niveaux sans monstre).
//  - 'reveal' : visible mais immobile (révélation scriptée ; position pilotée par le niveau).
//  - 'chase'  : poursuite BFS ; accélère quand il a le joueur dans sa LIGNE DE VUE + cône avant.

const FACE_Y = EYE_HEIGHT + 0.15;
const FACE_H = 3.0;
const FACE_RATIO = 0.8;
const SEE_DIST = CELL * 14;

export class Monster {
  constructor(maze, config) {
    this.maze = maze;
    this.config = config;
    this.path = [];
    this.repathTimer = 0;
    this.awake = false;
    this.moving = false;
    this.mode = 'none';
    this.speedMult = 1;
    this.faceDir = 0;
    this.sees = false;
    this.detectRadius = 9999; // réglé par Game selon la santé mentale
    this.lastKnown = null; // dernière position connue du joueur (mode chase)
    this.wanderTarget = null; // cible d'errance quand le joueur est perdu
    this.hunting = false; // true tant qu'il te traque activement (pas en errance)

    this.mesh = this.#buildMesh();
    this.position = this.mesh.position;
    if (maze?.spawn) this.placeAt(maze.spawn);
    this.setVisible(false);
  }

  #buildMesh() {
    const g = new THREE.Group();
    const tex = new THREE.TextureLoader().load('/monster.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, fog: true, depthTest: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(FACE_H * FACE_RATIO, FACE_H, 1);
    sprite.position.y = FACE_Y;
    g.add(sprite);
    this.sprite = sprite;

    this.glow = new THREE.PointLight(0xffe2d0, 2.2, CELL * 4, 1.6);
    this.glow.position.set(0, FACE_Y, 0);
    g.add(this.glow);
    return g;
  }

  setMaze(maze) {
    this.maze = maze;
    this.path = [];
    this.repathTimer = 0;
  }

  setMode(mode) {
    this.mode = mode;
    this.setVisible(mode !== 'none');
  }

  setVisible(b) {
    this.mesh.visible = b;
  }

  placeAt(cell) {
    const w = this.maze.cellToWorld(cell.col, cell.row);
    this.mesh.position.set(w.x, 0, w.z);
  }

  get cell() {
    return this.maze.worldToCell(this.position.x, this.position.z);
  }

  distanceTo(point) {
    return Math.hypot(point.x - this.position.x, point.z - this.position.z);
  }

  // Le monstre te voit-il ? (ligne de vue libre + à portée visuelle)
  #senses(playerCell, dist) {
    return dist <= SEE_DIST && this.maze.hasLineOfSight(this.cell, playerCell);
  }

  // Choisit la cible de déplacement (traque directe / dernière position connue / errance).
  #chooseTarget(playerCell, detected) {
    if (this.mode === 'creep') return playerCell; // approche directe lente
    if (detected) {
      this.lastKnown = playerCell;
      this.wanderTarget = null;
      return playerCell;
    }
    if (this.lastKnown) {
      if (this.cell.col === this.lastKnown.col && this.cell.row === this.lastKnown.row) this.lastKnown = null;
      else return this.lastKnown;
    }
    if (!this.wanderTarget || (this.cell.col === this.wanderTarget.col && this.cell.row === this.wanderTarget.row)) {
      this.wanderTarget = this.maze.randomOpenCell();
    }
    return this.wanderTarget;
  }

  update(dt, playerPos, elapsed) {
    // Animations passives (toujours, tant que visible).
    if (this.mesh.visible) {
      this.position.y = Math.sin(elapsed * 2.2) * 0.12;
      if (this.glow) this.glow.intensity = 2.0 + Math.sin(elapsed * 5) * 0.9;
    }

    // 'creep' = approche lente (pré-poursuite) ; 'chase' = vraie poursuite.
    if (this.mode !== 'chase' && this.mode !== 'creep') {
      this.moving = false;
      this.sees = false;
      this.hunting = false;
      return;
    }

    const cfg = this.config;
    this.awake = true;
    const playerCell = this.maze.worldToCell(playerPos.x, playerPos.z);
    const dist = this.distanceTo(playerPos);
    // Vue directe (boost de vitesse) — chaque frame pour la réactivité.
    this.sees = this.mode === 'chase' && this.#senses(playerCell, dist);
    // Détection (sait où tu es) : dans le rayon (santé mentale) OU vue directe.
    const detected = this.mode === 'chase' ? dist <= this.detectRadius || this.sees : true;
    this.hunting = detected; // false quand il t'a perdu (errance) → coupe le bruit de chasse

    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = cfg.monsterRepath;
      this.path = this.maze.findPath(this.cell, this.#chooseTarget(playerCell, detected));
    }

    let isMoving = false;
    if (this.path.length) {
      const next = this.path[0];
      const tw = this.maze.cellToWorld(next.col, next.row);
      const dx = tw.x - this.position.x;
      const dz = tw.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        this.path.shift();
      } else {
        let speed;
        if (this.mode === 'creep') {
          speed = MONSTER_CREEP_SPEED; // lent
        } else {
          // Vitesse = base × santé mentale × boost de ligne de vue.
          speed = cfg.monsterSpeed * this.speedMult;
          if (this.sees) speed *= LOS_BOOST;
        }
        const step = Math.min(speed * dt, d);
        this.position.x += (dx / d) * step;
        this.position.z += (dz / d) * step;
        this.faceDir = Math.atan2(dx, dz);
        isMoving = true;
      }
    }
    this.moving = isMoving;

    // La lueur s'intensifie quand il te voit.
    if (this.glow) this.glow.intensity = (this.sees ? 3.4 : 2.0) + Math.sin(elapsed * 6) * 0.8;
  }
}
