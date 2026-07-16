import * as THREE from 'three';
import { CELL, EYE_HEIGHT, LOS_BOOST, MONSTER_CREEP_SPEED } from '../config.js';

// Ansem - antagonist displayed as a billboard (THREE.Sprite, photo /ansem.png) that always
// faces the player and stays glowing in the dark.
// Modes:
//  - 'none'   : hidden, inert (levels without a monster).
//  - 'reveal' : visible but motionless (scripted reveal, position driven by the level).
//  - 'chase'  : BFS pursuit, speeds up when it has the player in its LINE OF SIGHT plus forward cone.

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
    this.rushMult = 1; // speed multiplier (BONK's charge in the forest)
    this.walkPhase = 0; // BONK's walk cycle (limb animation)
    this.faceDir = 0;
    this.sees = false;
    this.detectRadius = 9999; // set by Game based on sanity
    this.lastKnown = null; // last known player position (chase mode)
    this.wanderTarget = null; // wander target when the player is lost
    this.hunting = false; // true while it's actively hunting you (not wandering)
    this.hidden = false; // true when the player is crouched in the dark (driven by Game)
    this.lit = false; // true when the player's flashlight is on -> gives them away (driven by Game)
    this.fleeing = false; // true when the player is at a campfire -> BONK flees (driven by Game)
    this._wasFleeing = false; // fleeing state on the previous tick (to react to changes)
    this.fleeTarget = null; // flee target (a distant cell, in the forest)

    this.mesh = this.#buildMesh();
    this.position = this.mesh.position;
    if (maze?.spawn) this.placeAt(maze.spawn);
    this.setVisible(false);
  }

  #buildMesh() {
    const g = new THREE.Group();

    // ANSEM skin (photo billboard) - crypto levels.
    this.ansemGroup = new THREE.Group();
    const tex = new THREE.TextureLoader().load('/monster.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, fog: true, depthTest: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(FACE_H * FACE_RATIO, FACE_H, 1);
    sprite.position.y = FACE_Y;
    this.ansemGroup.add(sprite);
    this.sprite = sprite;
    this.glow = new THREE.PointLight(0xffe2d0, 2.2, CELL * 4, 1.6);
    this.glow.position.set(0, FACE_Y, 0);
    this.ansemGroup.add(this.glow);
    g.add(this.ansemGroup);

    // BONK skin (3D creature) - forest level; hidden by default.
    this.bonkGroup = this.#buildBonk();
    this.bonkGroup.visible = false;
    g.add(this.bonkGroup);

    this.skin = 'ansem';
    return g;
  }

  // BONK creature: Ansem's CORRUPTED shiba - emaciated QUADRUPED carcass, dirty orange
  // fur, jutting ribs, low head with an unhinged jaw + large fangs, hollow glowing
  // eye sockets, collar + tag, blood. Jerky gait (animated in update).
  #buildBonk() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xa8531a, emissive: 0x1e0c00, emissiveIntensity: 0.35, roughness: 0.95 });
    const bone = new THREE.MeshStandardMaterial({ color: 0x8f6236, roughness: 0.9 });
    const tooth = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.6 });
    this.bonkLegs = [];
    const cyl = (rt, rb, h, mat = skin) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 7), mat);
    const backY = 1.55; // back height (dog)

    // --- Emaciated torso + shoulder/hip masses ---
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 2.1), skin);
    torso.position.set(0, backY, 0);
    g.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.8), skin);
    chest.position.set(0, backY - 0.02, 0.8);
    g.add(chest);
    const rump = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.74, 0.7), skin);
    rump.position.set(0, backY, -0.85);
    g.add(rump);
    // Jutting ribs (half-arcs).
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 12, Math.PI), bone);
      rib.rotation.z = Math.PI / 2;
      rib.rotation.y = Math.PI / 2;
      rib.position.set(0, backY + 0.02, 0.45 - i * 0.3);
      g.add(rib);
    }

    // --- 4 jointed legs (hip -> knee -> paw), gaunt and digitigrade. ---
    const legAt = (sx, sz, front) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.3, backY - 0.2, sz);
      const thigh = cyl(0.1, 0.08, 0.8);
      thigh.position.set(0, -0.35, front ? 0.1 : -0.1);
      thigh.rotation.x = front ? 0.4 : -0.4;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.set(0, -0.66, front ? 0.18 : -0.18);
      const shin = cyl(0.08, 0.05, 0.82);
      shin.position.set(0, -0.35, front ? -0.06 : 0.06);
      shin.rotation.x = front ? -0.55 : 0.55;
      knee.add(shin);
      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.32), skin);
      paw.position.set(0, -0.68, front ? 0.04 : -0.04);
      knee.add(paw);
      hip.add(knee);
      g.add(hip);
      this.bonkLegs.push({ root: hip, joint: knee, side: sx, front });
    };
    legAt(-1, 0.7, true);
    legAt(1, 0.7, true);
    legAt(-1, -0.8, false);
    legAt(1, -0.8, false);

    // --- Neck + HEAD low and forward (in an animated group: tremors). ---
    const neck = cyl(0.15, 0.19, 0.7);
    neck.position.set(0, backY - 0.05, 1.3);
    neck.rotation.x = 1.1;
    g.add(neck);
    this.bonkHead = new THREE.Group();
    this.bonkHead.position.set(0, backY - 0.32, 1.75);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.72), skin);
    this.bonkHead.add(skull);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.5), skin);
    snout.position.set(0, -0.02, 0.52);
    this.bonkHead.add(snout);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 4), skin);
      ear.position.set(sx * 0.18, 0.32, -0.06);
      ear.rotation.x = -0.2;
      this.bonkHead.add(ear);
    }
    // Unhinged mouth (dangling jaw) + large upper/lower fangs.
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.5), skin);
    jaw.position.set(0, -0.34, 0.48);
    jaw.rotation.x = 0.55;
    this.bonkHead.add(jaw);
    for (let k = 0; k < 5; k++) {
      const x = -0.13 + k * 0.065;
      const up = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.22, 4), tooth);
      up.position.set(x, -0.1, 0.74);
      up.rotation.x = Math.PI;
      this.bonkHead.add(up);
      const dn = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.2, 4), tooth);
      dn.position.set(x, -0.28, 0.7);
      this.bonkHead.add(dn);
    }
    // Hollow, sunken glowing (pale) eye sockets.
    this.bonkEyeMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, toneMapped: false });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), this.bonkEyeMat);
      eye.position.set(sx * 0.14, 0.08, 0.28);
      this.bonkHead.add(eye);
    }
    g.add(this.bonkHead);
    this.bonkEyeLight = new THREE.PointLight(0xfff0d0, 1.6, CELL * 4.5, 2);
    this.bonkEyeLight.position.set(0, backY - 0.22, 2.0);
    g.add(this.bonkEyeLight);

    // Blood at the mouth.
    const blood = new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: 0x7a0000, emissiveIntensity: 0.6, roughness: 0.5 });
    for (const [x, y, z, h] of [[0, backY - 0.72, 2.0, 0.4], [-0.12, backY - 0.78, 1.95, 0.3]]) {
      const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.01, h, 5), blood);
      drip.position.set(x, y, z);
      g.add(drip);
    }
    // BONK collar + tag.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 16), new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 0.7 }));
    collar.rotation.x = 1.1;
    collar.position.set(0, backY - 0.08, 1.3);
    g.add(collar);
    const tag = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), new THREE.MeshStandardMaterial({ color: 0xd88a2a, emissive: 0x3a2000, emissiveIntensity: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
    tag.position.set(0, backY - 0.42, 1.5);
    g.add(tag);
    // Low, dangling tail.
    const tail = cyl(0.055, 0.02, 1.0);
    tail.position.set(0, backY - 0.05, -1.35);
    tail.rotation.x = -0.5;
    g.add(tail);

    g.scale.set(1.25, 1.25, 1.25);
    return g;
  }

  // Chooses the monster's appearance: 'ansem' (billboard) or 'bonk' (3D creature).
  setSkin(skin) {
    this.skin = skin;
    if (this.ansemGroup) this.ansemGroup.visible = skin === 'ansem';
    if (this.bonkGroup) this.bonkGroup.visible = skin === 'bonk';
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

  // Does the monster see you? (clear line of sight + within visual range)
  #senses(playerCell, dist) {
    return dist <= SEE_DIST && this.maze.hasLineOfSight(this.cell, playerCell);
  }

  // Flee cell: far from the player (BONK retreats into the forest near a fire).
  #chooseFlee(playerCell) {
    const far = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    const reached = this.fleeTarget && this.cell.col === this.fleeTarget.col && this.cell.row === this.fleeTarget.row;
    if (!this.fleeTarget || reached || far(this.fleeTarget, playerCell) < 6) {
      let best = null;
      let bestD = -1;
      for (let i = 0; i < 14; i++) {
        const c = this.maze.randomOpenCell();
        const d = far(c, playerCell);
        if (d > bestD) {
          bestD = d;
          best = c;
        }
      }
      this.fleeTarget = best || this.maze.randomOpenCell();
    }
    return this.fleeTarget;
  }

  // Chooses the movement target (flee / direct hunt / last known position / wander).
  #chooseTarget(playerCell, detected) {
    if (this.fleeing) return this.#chooseFlee(playerCell); // player at a fire -> move away
    if (this.mode === 'creep') return playerCell; // slow direct approach
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
    // Passive animations (always, as long as visible).
    if (this.mesh.visible) {
      this.position.y = Math.sin(elapsed * 2.2) * 0.12;
      if (this.skin === 'bonk') {
        this.mesh.rotation.y = this.faceDir; // the creature faces its movement direction
        const f = 0.72 + 0.28 * Math.sin(elapsed * 7);
        if (this.bonkEyeMat) this.bonkEyeMat.color.setRGB(f, f * 0.95, f * 0.82); // pale "empty" glow
        if (this.bonkEyeLight) this.bonkEyeLight.intensity = 1.5 + Math.sin(elapsed * 6) * 0.6 + (this.sees ? 1.8 : 0);
        // QUADRUPED gait: diagonal trot + jerky motion + head tremors.
        const moving = this.moving;
        this.walkPhase += dt * (moving ? 8 + this.rushMult * 3 : 1.5);
        const swing = moving ? 0.6 : 0.05;
        for (const l of this.bonkLegs || []) {
          // Diagonal pairs: (front-right + back-left) opposite (front-left + back-right).
          const diag = l.front === l.side > 0 ? 0 : Math.PI;
          const s = Math.sin(this.walkPhase + diag);
          l.root.rotation.x = s * swing;
          l.joint.rotation.x = -Math.abs(s) * swing * 0.8; // the knee bends
        }
        // Jerky body shudders + head tremors/twitches (unsettling).
        this.mesh.rotation.z = Math.sin(this.walkPhase * 3.3) * (moving ? 0.03 : 0.012) + Math.sin(elapsed * 17) * 0.008;
        if (this.bonkHead) {
          this.bonkHead.rotation.set(Math.sin(elapsed * 13) * 0.06, Math.sin(elapsed * 9) * 0.09, Math.sin(elapsed * 23) * 0.05);
        }
      } else {
        this.mesh.rotation.y = 0; // the billboard sprite orients itself
        if (this.glow) this.glow.intensity = 2.0 + Math.sin(elapsed * 5) * 0.9;
      }
    }

    // 'creep' = slow approach (pre-chase); 'chase' = actual pursuit.
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
    // Player crouched in the dark (flashlight off + motionless in a corner): Ansem no longer
    // perceives them -> he "walks right past" (no sight, no detection).
    // 'creep' (scripted approach) ignores stealth.
    this.sees = this.mode === 'chase' && !this.hidden && this.#senses(playerCell, dist);
    // Detection (knows where you are): within radius (sanity) OR direct sight.
    let detected = this.mode === 'chase' ? dist <= this.detectRadius || this.sees : true;
    // Flashlight on = you GIVE YOURSELF AWAY: he always spots you (in range) and comes after you,
    // even crouched in a corner. Only an OFF flashlight in a corner hides you.
    if (this.lit && this.mode === 'chase' && dist <= SEE_DIST) detected = true;
    if (this.hidden && this.mode === 'chase') detected = false;
    this.hunting = detected && !this.fleeing; // false if fleeing (fire) or lost you -> cuts the hunt sound

    // IMMEDIATE reaction to a state change (the player reaches OR leaves a fire): drop the
    // current path and recompute right away -> he instantly turns back to hide
    // (or resumes the chase as soon as you leave the fire).
    if (this.fleeing !== this._wasFleeing) {
      this._wasFleeing = this.fleeing;
      this.repathTimer = 0;
      this.path = [];
      this.fleeTarget = null;
    }

    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = cfg.monsterRepath;
      this.path = this.maze.findPath(this.cell, this.#chooseTarget(playerCell, detected));
    }

    const speedNow = () => {
      if (this.mode === 'creep') return MONSTER_CREEP_SPEED; // slow
      // Speed = base x sanity x charge (rush) x line-of-sight boost.
      let sp = cfg.monsterSpeed * this.speedMult * this.rushMult;
      if (this.sees) sp *= LOS_BOOST;
      return sp;
    };

    let isMoving = false;
    // FINAL APPROACH: when it's hunting you and has a direct line of sight at close range, it
    // charges STRAIGHT at your actual position (paths target cell centers -> without this it
    // would stop mid-cell and never catch you in a corner). Ignored if fleeing or if you're hidden.
    const closingIn =
      !this.fleeing &&
      !this.hidden &&
      (detected || this.mode === 'creep') &&
      dist < CELL * 1.6 &&
      this.maze.hasLineOfSight(this.cell, playerCell);
    if (closingIn) {
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.02) {
        const step = Math.min(speedNow() * dt, d);
        this.position.x += (dx / d) * step;
        this.position.z += (dz / d) * step;
        this.faceDir = Math.atan2(dx, dz);
        isMoving = true;
      }
    } else if (this.path.length) {
      const next = this.path[0];
      const tw = this.maze.cellToWorld(next.col, next.row);
      const dx = tw.x - this.position.x;
      const dz = tw.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        this.path.shift();
      } else {
        const step = Math.min(speedNow() * dt, d);
        this.position.x += (dx / d) * step;
        this.position.z += (dz / d) * step;
        this.faceDir = Math.atan2(dx, dz);
        isMoving = true;
      }
    }
    this.moving = isMoving;

    // Ansem's glow intensifies when he sees you (ansem skin only).
    if (this.skin === 'ansem' && this.glow) this.glow.intensity = (this.sees ? 3.4 : 2.0) + Math.sin(elapsed * 6) * 0.8;
  }
}
