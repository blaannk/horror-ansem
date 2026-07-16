import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CELL, EYE_HEIGHT, PLAYER_RADIUS, GRAVITY, JUMP_VEL, CROUCH_EYE, PLAYER_CROUCH_SPEED } from '../config.js';

// First-person player: PointerLockControls for the view, WASD for movement,
// sprint, JUMP (Space) + CROUCH (Ctrl/C) with gravity, and sliding collisions.
// The "terrain" (optional, provided by a level) gives floor height, low ceilings
// (to crawl under) and pits (to jump over); without terrain, flat floor (levels 1-2 unchanged).

const STEP_UP = 0.4; // max step height crossed without jumping
const PIT_RESET_Y = -2.5; // below this level we've fallen into a pit, reset

export class Player {
  constructor(camera, domElement, maze, config) {
    this.camera = camera;
    this.maze = maze;
    this.config = config;
    this.controls = new PointerLockControls(camera, domElement);

    this.velocity = new THREE.Vector3();
    this.sprinting = false;
    this.moving = false;
    this.speedMult = 1; // set by Game based on sanity (high sanity, faster)

    this.terrain = null; // interface { floorAt, ceilLow, isPit } provided by a level (otherwise flat)
    this.feetY = 0; // feet level (gravity)
    this.vy = 0;
    this.onGround = true;
    this.crouching = false;
    this.eyeHeight = EYE_HEIGHT;
    this.lastSafe = null; // last safe ground position (reset after a fall)
    this._jump = false;
    this._spaceDown = false;

    this.keys = { forward: false, back: false, left: false, right: false, sprint: false, crouch: false };

    // --- Touch input (mobile) ---
    // touchMode: when true, update() runs without pointer-lock (driven by TouchControls).
    // analog: { strafe, forward } in [-1..1] (strafe +1 = right, forward +1 = forward).
    this.touchMode = false;
    this.analog = null;
    this.analogSprint = false;

    if (maze) this.setMaze(maze);
    this.#bindKeys();
  }

  // Analog movement vector (joystick). strafe/forward in [-1..1].
  setMove(strafe, forward) {
    this.analog = { strafe, forward };
    this.analogSprint = Math.hypot(strafe, forward) > 0.92; // full push = sprint
  }
  clearMove() {
    this.analog = null;
    this.analogSprint = false;
  }
  // Jump triggered by a touch button (consumed on the next update, like the Space key).
  jump() {
    this._jump = true;
  }
  // Crouch toggle (touch button).
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

  // Changes maze (level transition) and puts the player back at their starting point.
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

  // We key off the typed LETTER (e.key), independent of AZERTY/QWERTY layout.
  // Forward: W or Z, Left: Q or A, Back: S, Right: D, Jump: Space, Crouch: Ctrl/C.
  #setKey(e, down) {
    const k = (e.key || '').toLowerCase();
    const c = e.code;
    if (k === 'z' || k === 'w' || c === 'ArrowUp') this.keys.forward = down;
    else if (k === 's' || c === 'ArrowDown') this.keys.back = down;
    // Left/right DELIBERATELY swapped (see wall controls panel).
    else if (k === 'q' || k === 'a' || c === 'ArrowLeft') this.keys.right = down;
    else if (k === 'd' || c === 'ArrowRight') this.keys.left = down;
    else if (k === 'shift') this.keys.sprint = down;
    else if (k === 'control' || k === 'c') this.keys.crouch = down;
    else if (c === 'Space' || k === ' ') {
      if (down && !this._spaceDown) this._jump = true; // rising edge, one jump per press
      this._spaceDown = down;
    }
  }

  get cell() {
    return this.maze.worldToCell(this.camera.position.x, this.camera.position.z);
  }

  // Basic collision: the player is a circle of radius PLAYER_RADIUS vs. neighboring walls.
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
        // wallInset (level 3 terrain): "thickens" the walls, making corridors narrower.
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

  // Extended collision: walls + low ceiling (if standing) + ledge too high (if not yet jumped).
  #blocked(x, z) {
    if (this.#collides(x, z)) return true;
    const { col, row } = this.maze.worldToCell(x, z);
    if (this.#ceilLow(col, row) && !this.crouching) return true; // low duct, must crawl
    const floor = this.#floorAt(col, row);
    if (!this.#isPit(col, row) && floor > this.feetY + STEP_UP) return true; // ledge, must jump
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
    // Desktop: driven by pointer-lock. Mobile: by TouchControls (touchMode).
    if (!this.controls.isLocked && !this.touchMode) {
      this.moving = false;
      this._jump = false;
      return;
    }

    const cfg = this.config;
    const pos = this.camera.position;
    const cell = this.maze.worldToCell(pos.x, pos.z);

    // Crouch: forced under a low ceiling; otherwise follows the key. Eye height is smoothed.
    this.crouching = this.keys.crouch || this.#ceilLow(cell.col, cell.row);
    const targetEye = this.crouching ? CROUCH_EYE : EYE_HEIGHT;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    // Input direction (horizontal camera frame). On touch: analog joystick;
    // on keyboard: boolean keys. Positive inputR is the internal "right" vector (cf. desktop),
    // so a joystick strafe to the right corresponds to inputR = -strafe.
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

    // Sliding horizontal movement (axis by axis).
    const step = speed * dt;
    const nextX = pos.x + dir.x * step;
    if (!this.#blocked(nextX, pos.z)) pos.x = nextX;
    const nextZ = pos.z + dir.z * step;
    if (!this.#blocked(pos.x, nextZ)) pos.z = nextZ;

    // Vertical: jump + gravity + landing on the current cell's floor.
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

    // Falling into a pit resets to the last safe ground; otherwise remember this safe ground.
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
