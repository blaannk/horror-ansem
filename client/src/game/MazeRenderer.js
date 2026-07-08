import * as THREE from 'three';
import { CELL } from '../config.js';
import { MAX_WALL_H } from './mapData.js';
import { makeCryptoWallTexture, makeControlsTexture, makeCeilingTexture } from './textures.js';

// Construit la géométrie Three.js de la carte FIXE : sol, murs hauts (instanciés),
// plafonds par cellule à hauteurs variées + « risers » comblant les transitions,
// plateformes basses, lumières (salle de spawn éclairée), panneau de contrôles mural
// et portail de sortie. Les plafonds bas masquent le haut des murs → impression de
// hauteurs très différentes selon les zones.

export class MazeRenderer {
  constructor(maze, opts = {}) {
    this.maze = maze;
    this.opts = opts; // { portal: bool }
    this.group = new THREE.Group();
    this.disposables = [];
    this.exitLight = null;
    this.#build();
  }

  // « Ouvert » = praticable OU porte (rendue séparément) OU plateforme basse :
  // ces cellules reçoivent un plafond et ne sont PAS instanciées comme murs pleins.
  #isOpen(col, row) {
    return !this.maze.isWall(col, row) || this.maze.isLowBlock(col, row) || this.maze.isDoor(col, row);
  }

  #build() {
    const maze = this.maze;
    const spanX = maze.cols * CELL;
    const spanZ = maze.rows * CELL;

    // --- Sol ---
    const floorGeo = new THREE.PlaneGeometry(spanX, spanZ);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d0d12, roughness: 0.95 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.disposables.push(floorGeo, floorMat);

    // --- Comptage des cellules ---
    let wallCount = 0;
    let openCount = 0;
    for (let row = 0; row < maze.rows; row++) {
      for (let col = 0; col < maze.cols; col++) {
        if (this.#isOpen(col, row)) openCount++;
        else if (maze.isWall(col, row)) wallCount++; // mur plein (hors plateforme)
      }
    }

    // --- Murs hauts (InstancedMesh) ---
    const wallGeo = new THREE.BoxGeometry(CELL, MAX_WALL_H, CELL);
    this.wallTexture = makeCryptoWallTexture();
    const wallMat = new THREE.MeshStandardMaterial({ map: this.wallTexture, roughness: 0.92 });
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
    walls.castShadow = true;
    walls.receiveShadow = true;
    this.disposables.push(wallGeo, wallMat, this.wallTexture);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let wi = 0;
    for (let row = 0; row < maze.rows; row++) {
      for (let col = 0; col < maze.cols; col++) {
        if (this.#isOpen(col, row) || !maze.isWall(col, row)) continue;
        const { x, z } = maze.cellToWorld(col, row);
        dummy.position.set(x, MAX_WALL_H / 2, z);
        dummy.updateMatrix();
        walls.setMatrixAt(wi, dummy.matrix);
        const v = 0.82 + Math.sin(col * 1.7 + row * 0.9) * 0.14;
        color.setRGB(v, v * 0.98, v * 0.92);
        walls.setColorAt(wi, color);
        wi++;
      }
    }
    walls.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    this.group.add(walls);

    // --- Plafonds par cellule (hauteur de zone) ---
    const ceilTileGeo = new THREE.PlaneGeometry(CELL, CELL);
    this.ceilTexture = makeCeilingTexture();
    const ceilMat = new THREE.MeshStandardMaterial({ map: this.ceilTexture, color: 0xffffff, roughness: 1 });
    this.disposables.push(this.ceilTexture);
    const ceil = new THREE.InstancedMesh(ceilTileGeo, ceilMat, openCount);
    this.disposables.push(ceilTileGeo, ceilMat);
    let ci = 0;
    for (let row = 0; row < maze.rows; row++) {
      for (let col = 0; col < maze.cols; col++) {
        if (!this.#isOpen(col, row)) continue;
        const { x, z } = maze.cellToWorld(col, row);
        dummy.position.set(x, maze.ceilingAt(col, row), z);
        dummy.rotation.set(Math.PI / 2, 0, 0); // normale vers le bas
        dummy.updateMatrix();
        ceil.setMatrixAt(ci++, dummy.matrix);
      }
    }
    dummy.rotation.set(0, 0, 0);
    ceil.instanceMatrix.needsUpdate = true;
    this.group.add(ceil);

    // --- Risers : comblent les marches de plafond entre cellules ouvertes ---
    this.#buildRisers();

    // --- Plateformes basses ---
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.9 });
    this.disposables.push(blockMat);
    for (const [key, h] of maze.lowBlocks) {
      const [col, row] = key.split(',').map(Number);
      const geo = new THREE.BoxGeometry(CELL, h, CELL);
      const m = new THREE.Mesh(geo, blockMat);
      const { x, z } = maze.cellToWorld(col, row);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      this.disposables.push(geo);
    }

    // --- Lumières (salle de spawn éclairée, lueur de la cathédrale) ---
    for (const L of maze.lights) {
      const { x, z } = maze.cellToWorld(L.col, L.row);
      const light = new THREE.PointLight(L.color, L.intensity, L.dist, L.decay ?? 1.5);
      light.position.set(x, L.y, z);
      this.group.add(light);
    }

    // --- Panneau de contrôles peint sur le mur (si défini) ---
    if (maze.controlsWall) this.#buildControlsWall();

    // --- Sortie (uniquement les niveaux de fin) : portail OU trou dans le sol ---
    if (this.opts.portal) {
      if (this.opts.exitKind === 'hole') this.#buildHole();
      else this.#buildPortal();
    }
  }

  #buildRisers() {
    const maze = this.maze;
    const mat = new THREE.MeshStandardMaterial({ color: 0x070709, roughness: 1, side: THREE.DoubleSide });
    this.disposables.push(mat);
    const half = CELL / 2;
    const addRiser = (col, row, ncol, nrow, axis) => {
      if (!this.#isOpen(col, row) || !this.#isOpen(ncol, nrow)) return;
      const hA = maze.ceilingAt(col, row);
      const hB = maze.ceilingAt(ncol, nrow);
      if (Math.abs(hA - hB) < 0.01) return;
      const lo = Math.min(hA, hB);
      const hi = Math.max(hA, hB);
      const a = maze.cellToWorld(col, row);
      const b = maze.cellToWorld(ncol, nrow);
      const geo = new THREE.PlaneGeometry(CELL, hi - lo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set((a.x + b.x) / 2, (lo + hi) / 2, (a.z + b.z) / 2);
      if (axis === 'x') m.rotation.y = Math.PI / 2; // marche le long de l'axe X
      this.group.add(m);
      this.disposables.push(geo);
      void half;
    };
    for (let row = 0; row < maze.rows; row++) {
      for (let col = 0; col < maze.cols; col++) {
        addRiser(col, row, col + 1, row, 'x');
        addRiser(col, row, col, row + 1, 'z');
      }
    }
  }

  #buildControlsWall() {
    const maze = this.maze;
    const cw = maze.controlsWall;
    if (!cw) return;
    const tex = makeControlsTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.85,
      roughness: 0.9,
    });
    const geo = new THREE.PlaneGeometry(7, 3.4);
    const panel = new THREE.Mesh(geo, mat);
    const { x, z } = maze.cellToWorld(cw.col, cw.row);
    panel.position.set(x - CELL / 2 + 0.06, 2.5, z);
    panel.rotation.y = Math.PI / 2; // normale vers +X (intérieur de la salle, côté est)
    this.group.add(panel);
    this.disposables.push(tex, mat, geo);
  }

  // Portail magique à la sortie. Deux états :
  //  - VERROUILLÉ (rouge, tournoiement lent, cœur sombre) tant que toutes les clés PEPE
  //    ne sont pas ramassées ;
  //  - ACTIF (vert éclatant, disque de vortex, halo intense) une fois débloqué.
  #buildPortal() {
    const maze = this.maze;
    const exitPos = maze.cellToWorld(maze.exit.col, maze.exit.row);
    const portalGroup = new THREE.Group();
    portalGroup.position.set(exitPos.x, 0, exitPos.z);
    const y = maze.ceilingAt(maze.exit.col, maze.exit.row) * 0.45;
    this.portalY = y;

    this.LOCKED_COLOR = new THREE.Color(0xff2a2a);
    this.ACTIVE_COLOR = new THREE.Color(0x39ff88);

    // Deux anneaux concentriques qui tournent en sens inverse.
    const ringMat = new THREE.MeshStandardMaterial({
      color: this.LOCKED_COLOR.clone(),
      emissive: this.LOCKED_COLOR.clone(),
      emissiveIntensity: 1.6,
      roughness: 0.35,
    });
    this.portalMat = ringMat;
    const ringGeo = new THREE.TorusGeometry(1.25, 0.16, 14, 40);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = y;
    portalGroup.add(ring);

    const ring2Geo = new THREE.TorusGeometry(0.85, 0.09, 12, 32);
    const ring2 = new THREE.Mesh(ring2Geo, ringMat);
    ring2.position.y = y;
    portalGroup.add(ring2);

    // Disque de « vortex » au centre (transparent, additif), face au joueur via lookAt.
    const vortexMat = new THREE.MeshBasicMaterial({
      color: this.LOCKED_COLOR.clone(),
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.vortexMat = vortexMat;
    const vortexGeo = new THREE.CircleGeometry(1.15, 32);
    const vortex = new THREE.Mesh(vortexGeo, vortexMat);
    vortex.position.y = y;
    portalGroup.add(vortex);
    this.vortex = vortex;

    const exitLight = new THREE.PointLight(this.LOCKED_COLOR.clone(), 4, CELL * 5, 1.8);
    exitLight.position.set(0, y, 0);
    portalGroup.add(exitLight);

    this.group.add(portalGroup);
    this.exitLight = exitLight;
    this.ring = ring;
    this.ring2 = ring2;
    this.portalActive = false;
    this.disposables.push(ringGeo, ring2Geo, vortexGeo, ringMat, vortexMat);
  }

  // Trou dans le sol = sortie du niveau 1 (transition « chute » vers la forêt). Ouverture
  // noire encastrée, puits sombre descendant + lueur au fond qui s'allume une fois les clés
  // réunies. Réutilise l'API setPortalActive/update via des refs holeXxx.
  #buildHole() {
    const maze = this.maze;
    const exitPos = maze.cellToWorld(maze.exit.col, maze.exit.row);
    const group = new THREE.Group();
    group.position.set(exitPos.x, 0, exitPos.z);

    const R = CELL * 0.42;
    const depth = 14;

    // Ouverture noire pure au ras du sol (lue comme un trou dans le noir).
    const openingMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const opening = new THREE.Mesh(new THREE.CircleGeometry(R, 40), openingMat);
    opening.rotation.x = -Math.PI / 2;
    opening.position.y = 0.04;
    group.add(opening);

    // Paroi intérieure du puits (visible quand on s'approche du bord).
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x090a0d, roughness: 1, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.7, depth, 32, 1, true), wallMat);
    wall.position.y = 0.04 - depth / 2;
    group.add(wall);

    // Fond + lueur qui s'allume à l'activation.
    this.holeColorLocked = new THREE.Color(0x220000);
    this.holeColorActive = new THREE.Color(0x39ff88);
    this.holeGlowMat = new THREE.MeshBasicMaterial({ color: this.holeColorLocked.clone(), transparent: true, opacity: 0.9 });
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(R * 0.7, 32), this.holeGlowMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.04 - depth;
    group.add(bottom);

    // Rebord (anneau) autour de l'ouverture.
    this.holeRimMat = new THREE.MeshStandardMaterial({ color: 0x14141a, emissive: this.holeColorLocked.clone(), emissiveIntensity: 0.4, roughness: 0.7 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 10, 44), this.holeRimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    group.add(rim);

    // Lumière montant du puits.
    this.holeLight = new THREE.PointLight(this.holeColorLocked.clone(), 0.6, CELL * 5, 1.8);
    this.holeLight.position.set(0, 0.5, 0);
    group.add(this.holeLight);

    this.group.add(group);
    this.holeGroup = group;
    // Les matériaux sont suivis ici ; les géométries sont libérées par le traverse de dispose().
    this.disposables.push(openingMat, wallMat, this.holeGlowMat, this.holeRimMat);
  }

  // Bascule verrouillé ↔ actif (appelé quand toutes les clés PEPE sont récupérées).
  setPortalActive(active) {
    // Cas « trou » (niveau 1) : allume la lueur du puits.
    if (this.holeGroup) {
      const c = active ? this.holeColorActive : this.holeColorLocked;
      this.holeGlowMat.color.copy(c);
      this.holeGlowMat.opacity = active ? 1 : 0.9;
      this.holeRimMat.emissive.copy(c);
      this.holeRimMat.emissiveIntensity = active ? 1.4 : 0.4;
      this.holeLight.color.copy(c);
      this.holeLight.intensity = active ? 3.5 : 0.6;
      this.portalActive = active;
      return;
    }
    this.#setPortalActiveRing(active);
  }

  #setPortalActiveRing(active) {
    this.portalActive = active;
    const c = active ? this.ACTIVE_COLOR : this.LOCKED_COLOR;
    if (this.portalMat) {
      this.portalMat.color.copy(c);
      this.portalMat.emissive.copy(c);
      this.portalMat.emissiveIntensity = active ? 2.6 : 1.6;
    }
    if (this.vortexMat) {
      this.vortexMat.color.copy(c);
      this.vortexMat.opacity = active ? 0.6 : 0.3;
    }
    if (this.exitLight) this.exitLight.color.copy(c);
  }

  update(dt, elapsed) {
    if (this.ring) this.ring.rotation.z += dt * (this.portalActive ? 2.2 : 0.8);
    if (this.ring2) this.ring2.rotation.z -= dt * (this.portalActive ? 3.0 : 1.1);
    if (this.vortex) this.vortex.rotation.z += dt * (this.portalActive ? 4 : 1.5);
    if (this.exitLight) {
      const base = this.portalActive ? 7 : 3;
      this.exitLight.intensity = base + Math.sin(elapsed * 4) * 1.5;
    }
    if (this.holeLight) {
      const base = this.portalActive ? 3.5 : 0.6;
      this.holeLight.intensity = base + Math.sin(elapsed * 3) * (this.portalActive ? 1.2 : 0.2);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
    });
  }
}
