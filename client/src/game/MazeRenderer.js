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

    // --- Portail de sortie (uniquement les niveaux de fin) ---
    if (this.opts.portal) this.#buildPortal();
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

  #buildPortal() {
    const maze = this.maze;
    const exitPos = maze.cellToWorld(maze.exit.col, maze.exit.row);
    const portalGroup = new THREE.Group();
    portalGroup.position.set(exitPos.x, 0, exitPos.z);
    const y = maze.ceilingAt(maze.exit.col, maze.exit.row) * 0.45;

    const portalMat = new THREE.MeshStandardMaterial({
      color: 0x39ff88,
      emissive: 0x39ff88,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    });
    const ringGeo = new THREE.TorusGeometry(1.1, 0.16, 12, 32);
    const ring = new THREE.Mesh(ringGeo, portalMat);
    ring.position.y = y;
    portalGroup.add(ring);

    const coreGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const core = new THREE.Mesh(coreGeo, portalMat);
    core.position.y = y;
    portalGroup.add(core);

    const exitLight = new THREE.PointLight(0x39ff88, 6, CELL * 5, 1.8);
    exitLight.position.set(0, y, 0);
    portalGroup.add(exitLight);

    this.group.add(portalGroup);
    this.exitLight = exitLight;
    this.ring = ring;
    this.disposables.push(ringGeo, coreGeo, portalMat);
  }

  update(dt, elapsed) {
    if (this.ring) this.ring.rotation.z += dt * 1.5;
    if (this.exitLight) this.exitLight.intensity = 5 + Math.sin(elapsed * 4) * 1.5;
  }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
    });
  }
}
