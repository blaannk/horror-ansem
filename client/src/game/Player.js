import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CELL, EYE_HEIGHT, PLAYER_RADIUS } from '../config.js';

// Joueur première personne : PointerLockControls pour la vue, WASD pour le déplacement,
// sprint (avec stamina optionnelle) et collisions glissantes contre les murs du labyrinthe.

export class Player {
  constructor(camera, domElement, maze, config) {
    this.camera = camera;
    this.maze = maze;
    this.config = config;
    this.controls = new PointerLockControls(camera, domElement);

    this.velocity = new THREE.Vector3();
    this.sprinting = false;
    this.moving = false;
    this.speedMult = 1; // réglé par Game selon la santé mentale (haute santé → plus rapide)

    this.keys = { forward: false, back: false, left: false, right: false, sprint: false };

    if (maze) this.setMaze(maze);
    this.#bindKeys();
  }

  // Change de labyrinthe (transition de niveau) et replace le joueur à son point de départ.
  setMaze(maze) {
    this.maze = maze;
    const start = maze.playerSpawn || maze.spawn;
    const s = maze.cellToWorld(start.col, start.row);
    this.camera.position.set(s.x, EYE_HEIGHT, s.z);
    this.camera.rotation.set(0, maze.startYaw || 0, 0);
  }

  #bindKeys() {
    this._onKeyDown = (e) => this.#setKey(e, true);
    this._onKeyUp = (e) => this.#setKey(e, false);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  // On se base sur la LETTRE tapée (e.key) → indépendant de la disposition AZERTY/QWERTY.
  // Avancer : W ou Z · Gauche : Q ou A · Reculer : S · Droite : D · + flèches.
  #setKey(e, down) {
    const k = (e.key || '').toLowerCase();
    const c = e.code;
    if (k === 'z' || k === 'w' || c === 'ArrowUp') this.keys.forward = down;
    else if (k === 's' || c === 'ArrowDown') this.keys.back = down;
    // Gauche/droite VOLONTAIREMENT inversées (cf. panneau de contrôles mural).
    else if (k === 'q' || k === 'a' || c === 'ArrowLeft') this.keys.right = down;
    else if (k === 'd' || c === 'ArrowRight') this.keys.left = down;
    else if (k === 'shift') this.keys.sprint = down;
  }

  get cell() {
    return this.maze.worldToCell(this.camera.position.x, this.camera.position.z);
  }

  // Collision : le joueur est un cercle de rayon PLAYER_RADIUS ; on teste les murs voisins.
  #collides(x, z) {
    if (!this.maze) return false;
    const { col, row } = this.maze.worldToCell(x, z);
    const r = PLAYER_RADIUS;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        const rr = row + dr;
        if (!this.maze.isWall(c, rr)) continue;
        const { x: cx, z: cz } = this.maze.cellToWorld(c, rr);
        const half = CELL / 2;
        const nx = Math.max(cx - half, Math.min(x, cx + half));
        const nz = Math.max(cz - half, Math.min(z, cz + half));
        const dx = x - nx;
        const dz = z - nz;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  update(dt) {
    if (!this.controls.isLocked) {
      this.moving = false;
      return;
    }

    const cfg = this.config;

    // Direction d'entrée (repère caméra horizontal).
    const inputF = (this.keys.forward ? 1 : 0) - (this.keys.back ? 1 : 0);
    const inputR = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    this.moving = inputF !== 0 || inputR !== 0;

    // Sprint illimité (pas de stamina). Vitesse modulée par la santé mentale.
    this.sprinting = this.keys.sprint && this.moving;
    const speed = (this.sprinting ? cfg.playerSprint : cfg.playerWalk) * this.speedMult;

    // Vecteur direction monde.
    const cam = this.camera;
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x); // perpendiculaire horizontale

    const dir = new THREE.Vector3();
    dir.addScaledVector(forward, inputF);
    dir.addScaledVector(right, inputR);
    if (dir.lengthSq() > 0) dir.normalize();

    const step = speed * dt;
    const pos = cam.position;

    // Collision glissante : on bouge axe par axe.
    const nextX = pos.x + dir.x * step;
    if (!this.#collides(nextX, pos.z)) pos.x = nextX;
    const nextZ = pos.z + dir.z * step;
    if (!this.#collides(pos.x, nextZ)) pos.z = nextZ;

    pos.y = EYE_HEIGHT;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.controls.dispose();
  }
}
