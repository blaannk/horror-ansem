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
    this.rushMult = 1; // multiplicateur de vitesse (charge de BONK dans la forêt)
    this.walkPhase = 0; // cycle de marche de BONK (animation des membres)
    this.faceDir = 0;
    this.sees = false;
    this.detectRadius = 9999; // réglé par Game selon la santé mentale
    this.lastKnown = null; // dernière position connue du joueur (mode chase)
    this.wanderTarget = null; // cible d'errance quand le joueur est perdu
    this.hunting = false; // true tant qu'il te traque activement (pas en errance)
    this.hidden = false; // true quand le joueur est tapi dans le noir (piloté par Game)
    this.lit = false; // true quand la lampe du joueur est allumée → il se trahit (piloté par Game)
    this.fleeing = false; // true quand le joueur est à un feu de camp → BONK fuit (piloté par Game)
    this._wasFleeing = false; // état de fuite au tick précédent (pour réagir au changement)
    this.fleeTarget = null; // cible de fuite (cellule éloignée, dans la forêt)

    this.mesh = this.#buildMesh();
    this.position = this.mesh.position;
    if (maze?.spawn) this.placeAt(maze.spawn);
    this.setVisible(false);
  }

  #buildMesh() {
    const g = new THREE.Group();

    // Skin ANSEM (billboard photo) — niveaux crypto.
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

    // Skin BONK (créature 3D) — niveau forêt ; caché par défaut.
    this.bonkGroup = this.#buildBonk();
    this.bonkGroup.visible = false;
    g.add(this.bonkGroup);

    this.skin = 'ansem';
    return g;
  }

  // Créature BONK : le shiba d'Ansem CORROMPU — carcasse QUADRUPÈDE émaciée, poils orange
  // sale, côtes saillantes, tête basse à gueule décrochée + grands crocs, orbites creuses
  // luminescentes, collier + médaillon, sang. Démarche saccadée (animée dans update).
  #buildBonk() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xa8531a, emissive: 0x1e0c00, emissiveIntensity: 0.35, roughness: 0.95 });
    const bone = new THREE.MeshStandardMaterial({ color: 0x8f6236, roughness: 0.9 });
    const tooth = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.6 });
    this.bonkLegs = [];
    const cyl = (rt, rb, h, mat = skin) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 7), mat);
    const backY = 1.55; // hauteur du dos (chien)

    // --- Torse émacié + masses épaule/hanche ---
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 2.1), skin);
    torso.position.set(0, backY, 0);
    g.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.8), skin);
    chest.position.set(0, backY - 0.02, 0.8);
    g.add(chest);
    const rump = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.74, 0.7), skin);
    rump.position.set(0, backY, -0.85);
    g.add(rump);
    // Côtes saillantes (demi-arcs).
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 12, Math.PI), bone);
      rib.rotation.z = Math.PI / 2;
      rib.rotation.y = Math.PI / 2;
      rib.position.set(0, backY + 0.02, 0.45 - i * 0.3);
      g.add(rib);
    }

    // --- 4 pattes articulées (hanche → genou → patte), décharnées et digitigrades. ---
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

    // --- Cou + TÊTE basse en avant (dans un groupe animé : tremblements). ---
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
    // Gueule décrochée (mâchoire pendante) + grands crocs haut/bas.
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
    // Orbites creuses luminescentes (pâles) enfoncées.
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

    // Sang à la gueule.
    const blood = new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: 0x7a0000, emissiveIntensity: 0.6, roughness: 0.5 });
    for (const [x, y, z, h] of [[0, backY - 0.72, 2.0, 0.4], [-0.12, backY - 0.78, 1.95, 0.3]]) {
      const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.01, h, 5), blood);
      drip.position.set(x, y, z);
      g.add(drip);
    }
    // Collier + médaillon BONK.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 16), new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 0.7 }));
    collar.rotation.x = 1.1;
    collar.position.set(0, backY - 0.08, 1.3);
    g.add(collar);
    const tag = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), new THREE.MeshStandardMaterial({ color: 0xd88a2a, emissive: 0x3a2000, emissiveIntensity: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
    tag.position.set(0, backY - 0.42, 1.5);
    g.add(tag);
    // Queue basse pendante.
    const tail = cyl(0.055, 0.02, 1.0);
    tail.position.set(0, backY - 0.05, -1.35);
    tail.rotation.x = -0.5;
    g.add(tail);

    g.scale.set(1.25, 1.25, 1.25);
    return g;
  }

  // Choisit l'apparence du monstre : 'ansem' (billboard) ou 'bonk' (créature 3D).
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

  // Le monstre te voit-il ? (ligne de vue libre + à portée visuelle)
  #senses(playerCell, dist) {
    return dist <= SEE_DIST && this.maze.hasLineOfSight(this.cell, playerCell);
  }

  // Cellule de fuite : loin du joueur (BONK bat en retraite dans la forêt près d'un feu).
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

  // Choisit la cible de déplacement (fuite / traque directe / dernière position connue / errance).
  #chooseTarget(playerCell, detected) {
    if (this.fleeing) return this.#chooseFlee(playerCell); // joueur à un feu → on s'éloigne
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
      if (this.skin === 'bonk') {
        this.mesh.rotation.y = this.faceDir; // la créature s'oriente vers son déplacement
        const f = 0.72 + 0.28 * Math.sin(elapsed * 7);
        if (this.bonkEyeMat) this.bonkEyeMat.color.setRGB(f, f * 0.95, f * 0.82); // lueur pâle « vide »
        if (this.bonkEyeLight) this.bonkEyeLight.intensity = 1.5 + Math.sin(elapsed * 6) * 0.6 + (this.sees ? 1.8 : 0);
        // Démarche QUADRUPÈDE en trot diagonal + à-coups (saccadé) + tremblements de la tête.
        const moving = this.moving;
        this.walkPhase += dt * (moving ? 8 + this.rushMult * 3 : 1.5);
        const swing = moving ? 0.6 : 0.05;
        for (const l of this.bonkLegs || []) {
          // Paires diagonales : (avant-droite + arrière-gauche) opposées à (avant-gauche + arrière-droite).
          const diag = l.front === l.side > 0 ? 0 : Math.PI;
          const s = Math.sin(this.walkPhase + diag);
          l.root.rotation.x = s * swing;
          l.joint.rotation.x = -Math.abs(s) * swing * 0.8; // le genou plie
        }
        // Secousses saccadées du corps + tremblements/à-coups de la tête (inquiétant).
        this.mesh.rotation.z = Math.sin(this.walkPhase * 3.3) * (moving ? 0.03 : 0.012) + Math.sin(elapsed * 17) * 0.008;
        if (this.bonkHead) {
          this.bonkHead.rotation.set(Math.sin(elapsed * 13) * 0.06, Math.sin(elapsed * 9) * 0.09, Math.sin(elapsed * 23) * 0.05);
        }
      } else {
        this.mesh.rotation.y = 0; // le sprite billboard s'oriente seul
        if (this.glow) this.glow.intensity = 2.0 + Math.sin(elapsed * 5) * 0.9;
      }
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
    // Joueur tapi dans le noir (lampe éteinte + immobile dans un coin) : Ansem ne le
    // perçoit plus → il « passe devant » lui (aucune vue, aucune détection).
    // 'creep' (approche scriptée) ignore la furtivité.
    this.sees = this.mode === 'chase' && !this.hidden && this.#senses(playerCell, dist);
    // Détection (sait où tu es) : dans le rayon (santé mentale) OU vue directe.
    let detected = this.mode === 'chase' ? dist <= this.detectRadius || this.sees : true;
    // Lampe allumée = tu te TRAHIS : il te repère toujours (à portée) et vient te chercher,
    // même tapi dans un coin. Seule la lampe ÉTEINTE dans un coin te cache.
    if (this.lit && this.mode === 'chase' && dist <= SEE_DIST) detected = true;
    if (this.hidden && this.mode === 'chase') detected = false;
    this.hunting = detected && !this.fleeing; // false s'il fuit (feu) ou t'a perdu → coupe le bruit de chasse

    // Réaction IMMÉDIATE au changement d'état (le joueur atteint OU quitte un feu) : on jette le
    // chemin courant et on recalcule tout de suite → il fait aussitôt demi-tour pour se cacher
    // (ou repart à ta poursuite dès que tu quittes le feu).
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
      if (this.mode === 'creep') return MONSTER_CREEP_SPEED; // lent
      // Vitesse = base × santé mentale × charge (rush) × boost de ligne de vue.
      let sp = cfg.monsterSpeed * this.speedMult * this.rushMult;
      if (this.sees) sp *= LOS_BOOST;
      return sp;
    };

    let isMoving = false;
    // APPROCHE FINALE : quand il te traque et a une ligne de vue directe à faible distance, il
    // fonce DROIT sur ta position réelle (les chemins visent le centre des cellules → sans ça il
    // s'arrête au milieu et ne t'atteint jamais dans un coin). Ignoré s'il fuit ou si tu es caché.
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

    // La lueur d'Ansem s'intensifie quand il te voit (skin ansem uniquement).
    if (this.skin === 'ansem' && this.glow) this.glow.intensity = (this.sees ? 3.4 : 2.0) + Math.sin(elapsed * 6) * 0.8;
  }
}
