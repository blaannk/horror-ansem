import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CELL, EYE_HEIGHT, PLAYER_RADIUS, GRAVITY, JUMP_VEL, CROUCH_EYE, PLAYER_CROUCH_SPEED } from '../config.js';

// Joueur première personne : PointerLockControls pour la vue, WASD pour le déplacement,
// sprint, SAUT (Espace) + ACCROUPI (Ctrl/C) avec gravité, et collisions glissantes.
// Le « terrain » (optionnel, fourni par un niveau) donne la hauteur du sol, les plafonds bas
// (à ramper) et les trous (à sauter) ; sans terrain → sol plat (niveaux 1-2 inchangés).

const STEP_UP = 0.4; // marche max franchie sans sauter
const PIT_RESET_Y = -2.5; // sous ce niveau on est tombé dans un trou → réinit

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

    this.terrain = null; // interface { floorAt, ceilLow, isPit } fournie par un niveau (sinon plat)
    this.feetY = 0; // niveau des pieds (gravité)
    this.vy = 0;
    this.onGround = true;
    this.crouching = false;
    this.eyeHeight = EYE_HEIGHT;
    this.lastSafe = null; // dernière position au sol sûre (réinit après une chute)
    this._jump = false;
    this._spaceDown = false;

    this.keys = { forward: false, back: false, left: false, right: false, sprint: false, crouch: false };

    // --- Entrée tactile (mobile) ---
    // touchMode : quand vrai, update() tourne sans pointer-lock (piloté par TouchControls).
    // analog : { strafe, forward } dans [-1..1] (strafe +1 = droite, forward +1 = avant).
    this.touchMode = false;
    this.analog = null;
    this.analogSprint = false;

    if (maze) this.setMaze(maze);
    this.#bindKeys();
  }

  // Vecteur de déplacement analogique (joystick). strafe/forward ∈ [-1..1].
  setMove(strafe, forward) {
    this.analog = { strafe, forward };
    this.analogSprint = Math.hypot(strafe, forward) > 0.92; // poussée à fond = sprint
  }
  clearMove() {
    this.analog = null;
    this.analogSprint = false;
  }
  // Saut déclenché par un bouton tactile (consommé au prochain update, comme la touche Espace).
  jump() {
    this._jump = true;
  }
  // Accroupi en bascule (bouton tactile).
  setCrouch(on) {
    this.keys.crouch = !!on;
  }

  #floorAt(col, row) {
    return this.terrain?.floorAt ? this.terrain.floorAt(col, row) : 0;
  }
  #ceilLow(col, row) {
    return this.terrain?.ceilLow ? this.terrain.ceilLow(col, row) : false;
  }
  #isPit(col, row) {
    return this.terrain?.isPit ? this.terrain.isPit(col, row) : false;
  }

  // Change de labyrinthe (transition de niveau) et replace le joueur à son point de départ.
  setMaze(maze) {
    this.maze = maze;
    const start = maze.playerSpawn || maze.spawn;
    const s = maze.cellToWorld(start.col, start.row);
    this.feetY = this.#floorAt(start.col, start.row);
    this.vy = 0;
    this.onGround = true;
    this.crouching = false;
    this.eyeHeight = EYE_HEIGHT;
    this.lastSafe = { x: s.x, z: s.z, floor: this.feetY };
    this.camera.position.set(s.x, this.feetY + EYE_HEIGHT, s.z);
    this.camera.rotation.set(0, maze.startYaw || 0, 0);
  }

  #bindKeys() {
    this._onKeyDown = (e) => this.#setKey(e, true);
    this._onKeyUp = (e) => this.#setKey(e, false);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  // On se base sur la LETTRE tapée (e.key) → indépendant de la disposition AZERTY/QWERTY.
  // Avancer : W ou Z · Gauche : Q ou A · Reculer : S · Droite : D · Saut : Espace · Accroupi : Ctrl/C.
  #setKey(e, down) {
    const k = (e.key || '').toLowerCase();
    const c = e.code;
    if (k === 'z' || k === 'w' || c === 'ArrowUp') this.keys.forward = down;
    else if (k === 's' || c === 'ArrowDown') this.keys.back = down;
    // Gauche/droite VOLONTAIREMENT inversées (cf. panneau de contrôles mural).
    else if (k === 'q' || k === 'a' || c === 'ArrowLeft') this.keys.right = down;
    else if (k === 'd' || c === 'ArrowRight') this.keys.left = down;
    else if (k === 'shift') this.keys.sprint = down;
    else if (k === 'control' || k === 'c') this.keys.crouch = down;
    else if (c === 'Space' || k === ' ') {
      if (down && !this._spaceDown) this._jump = true; // front montant → un saut par appui
      this._spaceDown = down;
    }
  }

  get cell() {
    return this.maze.worldToCell(this.camera.position.x, this.camera.position.z);
  }

  // Collision de base : le joueur est un cercle de rayon PLAYER_RADIUS vs murs voisins.
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
        // wallInset (terrain niveau 3) : « épaissit » les murs → couloirs plus étroits.
        const half = CELL / 2 + (this.terrain?.wallInset || 0);
        const nx = Math.max(cx - half, Math.min(x, cx + half));
        const nz = Math.max(cz - half, Math.min(z, cz + half));
        const dx = x - nx;
        const dz = z - nz;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  // Collision étendue : murs + plafond bas (si debout) + rebord trop haut (si pas encore sauté).
  #blocked(x, z) {
    if (this.#collides(x, z)) return true;
    const { col, row } = this.maze.worldToCell(x, z);
    if (this.#ceilLow(col, row) && !this.crouching) return true; // conduit bas → il faut ramper
    const floor = this.#floorAt(col, row);
    if (!this.#isPit(col, row) && floor > this.feetY + STEP_UP) return true; // rebord → il faut sauter
    return false;
  }

  #respawnSafe() {
    const s = this.lastSafe;
    if (s) {
      this.camera.position.x = s.x;
      this.camera.position.z = s.z;
      this.feetY = s.floor;
    }
    this.vy = 0;
    this.onGround = true;
  }

  update(dt) {
    // Desktop : piloté par le pointer-lock. Mobile : par TouchControls (touchMode).
    if (!this.controls.isLocked && !this.touchMode) {
      this.moving = false;
      this._jump = false;
      return;
    }

    const cfg = this.config;
    const pos = this.camera.position;
    const cell = this.maze.worldToCell(pos.x, pos.z);

    // Accroupi : forcé sous un plafond bas ; sinon selon la touche. Hauteur des yeux lissée.
    this.crouching = this.keys.crouch || this.#ceilLow(cell.col, cell.row);
    const targetEye = this.crouching ? CROUCH_EYE : EYE_HEIGHT;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    // Direction d'entrée (repère caméra horizontal). Au tactile : joystick analogique ;
    // au clavier : touches booléennes. inputR positif = vecteur « right » interne (cf. desktop),
    // donc un strafe joystick vers la droite correspond à inputR = -strafe.
    let inputF, inputR;
    if (this.analog) {
      inputF = this.analog.forward;
      inputR = -this.analog.strafe;
    } else {
      inputF = (this.keys.forward ? 1 : 0) - (this.keys.back ? 1 : 0);
      inputR = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    }
    this.moving = Math.hypot(inputF, inputR) > 0.06;

    this.sprinting = (this.keys.sprint || this.analogSprint) && this.moving && !this.crouching;
    let speed = (this.sprinting ? cfg.playerSprint : cfg.playerWalk) * this.speedMult;
    if (this.crouching) speed = Math.min(speed, PLAYER_CROUCH_SPEED * this.speedMult);

    const cam = this.camera;
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const dir = new THREE.Vector3();
    dir.addScaledVector(forward, inputF);
    dir.addScaledVector(right, inputR);
    if (dir.lengthSq() > 0) dir.normalize();

    // Déplacement horizontal glissant (axe par axe).
    const step = speed * dt;
    const nextX = pos.x + dir.x * step;
    if (!this.#blocked(nextX, pos.z)) pos.x = nextX;
    const nextZ = pos.z + dir.z * step;
    if (!this.#blocked(pos.x, nextZ)) pos.z = nextZ;

    // Vertical : saut + gravité + atterrissage sur le sol de la cellule courante.
    const here = this.maze.worldToCell(pos.x, pos.z);
    const floor = this.#floorAt(here.col, here.row);
    if (this._jump) {
      this._jump = false;
      if (this.onGround) {
        this.vy = JUMP_VEL;
        this.onGround = false;
      }
    }
    this.vy -= GRAVITY * dt;
    this.feetY += this.vy * dt;
    if (this.feetY <= floor) {
      this.feetY = floor;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Chute dans un trou → réinit au dernier sol sûr ; sinon mémorise ce sol sûr.
    if (this.feetY < PIT_RESET_Y) {
      this.#respawnSafe();
    } else if (this.onGround && !this.#isPit(here.col, here.row)) {
      this.lastSafe = { x: pos.x, z: pos.z, floor };
    }

    pos.y = this.feetY + this.eyeHeight;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this.controls.dispose();
  }
}
