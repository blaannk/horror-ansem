import * as THREE from 'three';
import { CELL } from '../config.js';
import { Maze } from './Maze.js';
import { Level } from './Level.js';
import { makeRadialGlowTexture, makeCeilingTexture, makeMachinePanelTexture } from './textures.js';
import { brokenScreen, chartPanel } from './props.js';

// =============================================================
// Level 3 - LIQUIDATION: Ansem's crypto-mine data center (the "machine" driving the
// mental-health curve) is collapsing. A tangle of cramped corridors where you must JUMP
// pits, CRAWL through ducts and climb ledges, chased by Ansem.
// Vertical terrain exposed to the Player via `this.terrain`.
// =============================================================
const LEDGE_H = 1.3; // height of a ledge (^)
const PIT_FLOOR = -8; // bottom of a pit (_)
const LOW_CEIL = 1.5; // ceiling of a duct (c) -> must crawl (crouched eye height = 1.0)
const CEIL_H = 3.6; // normal ceiling (low -> tight tunnels)
const WALL_INSET = 0.9; // "thickness" added to walls -> narrower corridors (+ matching liners)

export class EndgameLevel extends Level {
  build() {
    // Generated long corridor: spawn at the "back" side (Ansem behind), a long run to the
    // button, with jumps (_) and crawl ducts (c). Scripted sequence (see enter/update).
    const gen = this.#buildCorridorMap();
    this.map = gen.map;
    this.rows = this.map.length;
    this.cols = this.map[0].length;
    this.buttonCell = gen.button;
    this.maze = new Maze({ id: 'endgame', ceil: 5, startFacing: 'south', map: this.map });
    this.monsterMode = 'none'; // the appearance + chase are driven by the level
    this.portal = false; // custom portal (#buildPortal), revealed after the cutscene
    this.feasibleSanity = 0.5; // drives Ansem's SPEED (tunable)
    this.relentless = true; // relentless chase: Ansem always tracks you (winding corridor)
    this.objective = '';
    this.ambientScreams = ['scream4'];
    this.musicTrack = 'level3Music';

    const map = this.map;
    // --- Terrain (heights / ducts / pits / narrow corridors) exposed to the Player ---
    this.terrain = {
      wallInset: WALL_INSET,
      floorAt: (c, r) => {
        const ch = map[r]?.[c];
        if (ch === '^') return LEDGE_H;
        if (ch === '_') return PIT_FLOOR;
        return 0;
      },
      ceilLow: (c, r) => map[r]?.[c] === 'c',
      isPit: (c, r) => map[r]?.[c] === '_',
    };

    this.#buildGeometry();
    this.#buildWallDetail();
    this.#buildDecor();
    this.#buildButton();
    this.#buildPortal();

    this.t = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.debris = [];
  }

  // Generates the corridor: a single NARROW path (1 cell), WINDING (straight runs linked by
   // left/right turns). Obstacles = isolated cells, only on straight segments.
  #buildCorridorMap() {
    // Segments: 'up' = advancing toward the exit; 'left'/'right' = turns. ≈ 1m30 run.
    const segs = [
      ['up', 16], ['left', 4], ['up', 14], ['right', 6], ['up', 12], ['left', 5],
      ['up', 14], ['right', 4], ['up', 12], ['left', 4], ['up', 10], ['right', 5], ['up', 9],
    ];
    const dirs = { up: [0, -1], left: [-1, 0], right: [1, 0] };
    let c = 0;
    let r = 0;
    const raw = [{ c, r }];
    for (const [dir, n] of segs) {
      const [dc, dr] = dirs[dir];
      for (let i = 0; i < n; i++) {
        c += dc;
        r += dr;
        raw.push({ c, r });
      }
    }
    // Recenter into positive indices (margin of 1 for the walls).
    let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
    for (const p of raw) {
      minC = Math.min(minC, p.c); minR = Math.min(minR, p.r);
      maxC = Math.max(maxC, p.c); maxR = Math.max(maxR, p.r);
    }
    const cols = maxC - minC + 3;
    const rows = maxR - minR + 3;
    const path = raw.map((p) => ({ c: p.c - minC + 1, r: p.r - minR + 1 }));
    const N = path.length;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill('#'));
    for (const p of path) grid[p.r][p.c] = '.';

    // An obstacle is placed on the nearest VERTICAL STRAIGHT cell (never in a turn).
    const straightV = (i) => i > 0 && i < N - 1 && path[i - 1].c === path[i].c && path[i + 1].c === path[i].c;
    const place = (frac, ch) => {
      let i = Math.round(N * frac);
      for (let d = 0; d < 10; d++) {
        if (straightV(i - d)) { i -= d; break; }
        if (straightV(i + d)) { i += d; break; }
      }
      const p = path[i];
      if (grid[p.r][p.c] === '.') grid[p.r][p.c] = ch;
    };
    // Several spread-out JUMPS + 1 short duct; all on isolated cells, on straight segments.
    for (const f of [0.16, 0.28, 0.52, 0.64, 0.76, 0.88]) place(f, '_');
    place(0.4, 'c'); // a single duct (brief crawl)
    // Last jump just before the button (on a straight cell near the end).
    let jf = N - 4;
    for (let d = 0; d < 8 && !straightV(jf); d++) jf = N - 4 - d;
    if (grid[path[jf].r][path[jf].c] === '.') grid[path[jf].r][path[jf].c] = '_';

    // Landmarks: A/S at the start (bottom), button + portal at the end (top).
    const A = path[0];
    const S = path[5];
    const BTN = path[N - 2];
    const X = path[N - 1];
    grid[A.r][A.c] = 'A';
    grid[S.r][S.c] = 'S';
    grid[X.r][X.c] = 'X';
    return { map: grid.map((row) => row.join('')), button: { col: BTN.c, row: BTN.r } };
  }

  // Big red button on a pedestal, placed after the last jump.
  #buildButton() {
    const w = this.maze.cellToWorld(this.buttonCell.col, this.buttonCell.row);
    const g = new THREE.Group();
    g.position.set(w.x, 0, w.z);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7, metalness: 0.6 });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 1.1, 16), baseMat);
    pedestal.position.y = 0.55;
    g.add(pedestal);
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2a2a, emissiveIntensity: 1.4, roughness: 0.4 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.y = 1.16;
    g.add(dome);
    const light = new THREE.PointLight(0xff5030, 2.2, 10, 1.6);
    light.position.y = 1.7;
    g.add(light);
    this.group.add(g);
    this.track(baseMat, domeMat, pedestal.geometry, dome.geometry);
    this.button3d = { pos: { x: w.x, z: w.z }, domeMat, light };
  }

  #cellChar(c, r) {
    return this.map[r]?.[c] ?? '#';
  }
  #open(c, r) {
    return this.#cellChar(c, r) !== '#';
  }

  #buildGeometry() {
    const m = this.maze;
    const g = this.group;

    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.6, metalness: 0.5 });
    const grate = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.85, metalness: 0.4 });
    const ceilTex = makeCeilingTexture();
    const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, color: 0x3a3238, roughness: 1 });
    const ductMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5, metalness: 0.6 });
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const pitWallMat = new THREE.MeshStandardMaterial({ color: 0x090a0d, roughness: 1, side: THREE.DoubleSide });
    const pitGlowMat = new THREE.MeshBasicMaterial({ color: 0x330400, transparent: true, opacity: 0.9 });
    this.track(metal, grate, ceilTex, ceilMat, ductMat, voidMat, pitWallMat, pitGlowMat);

    // Counting.
    let walls = 0;
    let opens = 0;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) (this.#open(c, r) ? (opens++, opens) : (walls++, walls));

    // --- Walls (InstancedMesh) ---
    // Inflated by WALL_INSET: the wall FACE lands exactly on the collision boundary (and under
    // the liner) -> no more panel floating in front of the wall.
    const wallGeo = new THREE.BoxGeometry(CELL + 2 * WALL_INSET, CEIL_H + 1, CELL + 2 * WALL_INSET);
    const wallMesh = new THREE.InstancedMesh(wallGeo, metal, walls);
    const dummy = new THREE.Object3D();
    let wi = 0;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        if (this.#open(c, r)) continue;
        const w = m.cellToWorld(c, r);
        dummy.position.set(w.x, (CEIL_H + 1) / 2, w.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        wallMesh.setMatrixAt(wi++, dummy.matrix);
      }
    wallMesh.instanceMatrix.needsUpdate = true;
    g.add(wallMesh);
    this.track(wallGeo);

    // --- Floors + ceilings + ledges + ducts + pits (per open cell) ---
    const floorGeo = new THREE.PlaneGeometry(CELL, CELL);
    const ledgeGeo = new THREE.BoxGeometry(CELL, LEDGE_H, CELL);
    this.track(floorGeo, ledgeGeo);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const ch = this.#cellChar(c, r);
        if (ch === '#') continue;
        const w = m.cellToWorld(c, r);

        if (ch === '_') {
          // Pit: dark shaft (black opening + walls + red glow at the bottom).
          const opening = new THREE.Mesh(floorGeo, voidMat);
          opening.rotation.x = -Math.PI / 2;
          opening.position.set(w.x, 0.04, w.z);
          g.add(opening);
          const shaft = new THREE.Mesh(new THREE.BoxGeometry(CELL, 4, CELL), pitWallMat);
          shaft.position.set(w.x, -2, w.z);
          g.add(shaft);
          const bottom = new THREE.Mesh(floorGeo, pitGlowMat);
          bottom.rotation.x = -Math.PI / 2;
          bottom.position.set(w.x, -3.9, w.z);
          g.add(bottom);
        } else if (ch === '^') {
          // Raised ledge: solid block up to LEDGE_H, walkable on top.
          const block = new THREE.Mesh(ledgeGeo, grate);
          block.position.set(w.x, LEDGE_H / 2, w.z);
          g.add(block);
        } else {
          // Normal floor.
          const floor = new THREE.Mesh(floorGeo, grate);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(w.x, 0.02, w.z);
          g.add(floor);
        }

        // Ceiling: low (duct) on 'c', normal otherwise.
        const cy = ch === 'c' ? LOW_CEIL : CEIL_H;
        const ceil = new THREE.Mesh(floorGeo, ch === 'c' ? ductMat : ceilMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(w.x, cy, w.z);
        g.add(ceil);
      }

    // Lintels at the entrance of low ducts: a "machine" panel BEAM (blended into the walls)
    // + a thin glowing warning STRIP on the low edge -> makes it clear you must crawl.
    const lintelTex = makeMachinePanelTexture();
    const lintelMat = new THREE.MeshStandardMaterial({ map: lintelTex, roughness: 0.7, metalness: 0.5 });
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: 0xffb020, emissiveIntensity: 0.9 });
    this.track(lintelMat, stripMat);
    const lintelH = CEIL_H - LOW_CEIL;
    const midY = (LOW_CEIL + CEIL_H) / 2;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        if (this.#cellChar(c, r) !== 'c') continue;
        const w = m.cellToWorld(c, r);
        for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          // Lintel only at the entrance from a HIGH corridor (not between two ducts).
          if (!this.#open(c + dc, r + dr) || this.#cellChar(c + dc, r + dr) === 'c') continue;
          const beamGeo = dc !== 0 ? new THREE.BoxGeometry(0.34, lintelH, CELL) : new THREE.BoxGeometry(CELL, lintelH, 0.34);
          const beam = new THREE.Mesh(beamGeo, lintelMat);
          beam.position.set(w.x + dc * (CELL / 2), midY, w.z + dr * (CELL / 2));
          g.add(beam);
          const stripGeo = dc !== 0 ? new THREE.BoxGeometry(0.42, 0.16, CELL) : new THREE.BoxGeometry(CELL, 0.16, 0.42);
          const strip = new THREE.Mesh(stripGeo, stripMat);
          strip.position.set(w.x + dc * (CELL / 2), LOW_CEIL + 0.1, w.z + dr * (CELL / 2));
          g.add(strip);
          this.track(beamGeo, stripGeo);
        }
      }

  }

  // Wall dressing: riveted "machine" panels (matched to the inset -> narrow corridor) +
  // vertical pipes, instanced. Gives tight, highly detailed corridors.
  #buildWallDetail() {
    const m = this.maze;
    const g = this.group;
    const panelTex = makeMachinePanelTexture();
    const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.45, metalness: 0.75 });
    this.track(panelMat, pipeMat);

    const faceZ = CELL / 2 - WALL_INSET - 0.03; // liner placed just in front of the face (inflated walls) -> no z-fighting
    const sides = [
      [0, -1, 0],
      [0, 1, Math.PI],
      [1, 0, -Math.PI / 2],
      [-1, 0, Math.PI / 2],
    ];
    const faces = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const ch = this.#cellChar(c, r);
        if (ch === '#' || ch === '_') continue;
        const w = m.cellToWorld(c, r);
        for (const [dc, dr, yaw] of sides) {
          if (this.#open(c + dc, r + dr)) continue; // only facing a wall
          faces.push({ x: w.x + dc * faceZ, z: w.z + dr * faceZ, yaw });
        }
      }

    const dummy = new THREE.Object3D();
    const panelGeo = new THREE.PlaneGeometry(CELL, CEIL_H);
    const liners = new THREE.InstancedMesh(panelGeo, panelMat, faces.length);
    faces.forEach((f, i) => {
      dummy.position.set(f.x, CEIL_H / 2, f.z);
      dummy.rotation.set(0, f.yaw, 0);
      dummy.updateMatrix();
      liners.setMatrixAt(i, dummy.matrix);
    });
    liners.instanceMatrix.needsUpdate = true;
    g.add(liners);
    this.track(panelGeo);

    // Vertical pipes (on ~1/3 of the faces), slightly in front of the liner.
    const pipeFaces = faces.filter((_, i) => i % 3 === 0);
    const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, CEIL_H, 8);
    const pipes = new THREE.InstancedMesh(pipeGeo, pipeMat, pipeFaces.length);
    pipeFaces.forEach((f, i) => {
      const nx = Math.sin(f.yaw);
      const nz = Math.cos(f.yaw);
      dummy.position.set(f.x + nx * 0.16, CEIL_H / 2, f.z + nz * 0.16);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      pipes.setMatrixAt(i, dummy.matrix);
    });
    pipes.instanceMatrix.needsUpdate = true;
    g.add(pipes);
    this.track(pipeGeo);
  }

  #buildDecor() {
    const m = this.maze;
    const g = this.group;
    this.leds = [];
    this.strobes = [];
    this.sparks = [];
    this.screens = [];

    // Dying server racks (emissive LED strips) attached to walls, facing the corridor.
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.7, metalness: 0.5 });
    const ledMat = () => new THREE.MeshBasicMaterial({ color: 0x1a3a1a, toneMapped: false });
    this.track(rackMat);
    const rackSpots = this.#wallDecalSpots(10);
    for (const s of rackSpots.slice(0, 6)) {
      const rack = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, 0.5), rackMat);
      rack.add(body);
      for (let i = 0; i < 8; i++) {
        const mat = ledMat();
        const led = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.06), mat);
        led.position.set(0, 1.4 - i * 0.36, 0.28);
        rack.add(led);
        this.leds.push({ mat, phase: (i + s.col) * 1.3 });
        this.track(mat);
      }
      this.#placeWall(rack, s, 1.8);
      g.add(rack);
    }

    // "LIQUIDATION / SYSTEM FAILURE" screens + collapsing charts.
    const texts = ['LIQUIDATION', 'SYSTEM FAILURE', 'MARGIN CALL', 'HE NEVER LEFT'];
    const scrSpots = this.#wallDecalSpots(14).filter((s) => !rackSpots.slice(0, 6).includes(s));
    let ti = 0;
    for (const s of scrSpots.slice(0, 5)) {
      if (ti % 2 === 0) {
        const scr = brokenScreen(texts[(ti / 2) % texts.length | 0] || 'LIQUIDATION');
        this.#placeWall(scr.group, s, 2.1);
        this.track(scr.mat, scr.tex);
      } else {
        const panel = chartPanel();
        this.#placeWall(panel.mesh, s, 2.1);
        this.screens.push(panel.mat);
        this.track(panel.tex, panel.mat);
      }
      ti++;
    }

    // Red warning beacon lights (pulsing PointLights) scattered through the corridors.
    const lightCells = this.#openCells().filter((_, i) => i % 9 === 0);
    for (const cell of lightCells.slice(0, 8)) {
      const w = m.cellToWorld(cell.col, cell.row);
      const light = new THREE.PointLight(0xff2a1a, 3, CELL * 3.2, 1.7);
      light.position.set(w.x, 3.6, w.z);
      g.add(light);
      this.strobes.push({ light, phase: (cell.col + cell.row) * 0.7 });
    }

    // Sparks (flickering additive sprites) at the edge of a few pits.
    const glow = makeRadialGlowTexture();
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        if (this.#cellChar(c, r) !== '_') continue;
        const w = m.cellToWorld(c, r);
        const mat = new THREE.SpriteMaterial({ map: glow, color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        const sp = new THREE.Sprite(mat);
        sp.scale.set(1.4, 1.4, 1);
        sp.position.set(w.x, 0.6, w.z);
        g.add(sp);
        this.sparks.push({ mat, phase: (c + r) * 2.1, next: 0 });
        this.track(mat);
      }

    // Faint overall red ambient light + a glow near the spawn.
    const amb = new THREE.PointLight(0x551008, 3, 60, 1.2);
    const sp = m.cellToWorld(m.playerSpawn.col, m.playerSpawn.row);
    amb.position.set(sp.x, 4, sp.z);
    g.add(amb);
  }

  // Wall spots (open cell + a neighboring wall) for attaching decor.
  #wallDecalSpots(limit) {
    const spots = [];
    const sides = [
      ['north', 0, -1],
      ['south', 0, 1],
      ['east', 1, 0],
      ['west', -1, 0],
    ];
    for (let r = 1; r < this.rows - 1 && spots.length < limit * 3; r++)
      for (let c = 1; c < this.cols - 1 && spots.length < limit * 3; c++) {
        if (!this.#open(c, r) || this.#cellChar(c, r) === 'c') continue;
        for (const [side, dc, dr] of sides) {
          if (!this.#open(c + dc, r + dr)) {
            spots.push({ col: c, row: r, side });
            break;
          }
        }
      }
    // shuffle
    for (let i = spots.length - 1; i > 0; i--) {
      const j = ((i * 2654435761) >>> 0) % (i + 1);
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    return spots;
  }

  #placeWall(obj, spot, y) {
    const { x, z } = this.maze.cellToWorld(spot.col, spot.row);
    const h = CELL / 2 - WALL_INSET - 0.12; // in front of the liner (narrowed wall)
    if (spot.side === 'west') {
      obj.position.set(x - h, y, z);
      obj.rotation.y = Math.PI / 2;
    } else if (spot.side === 'east') {
      obj.position.set(x + h, y, z);
      obj.rotation.y = -Math.PI / 2;
    } else if (spot.side === 'north') {
      obj.position.set(x, y, z - h);
      obj.rotation.y = 0;
    } else {
      obj.position.set(x, y, z + h);
      obj.rotation.y = Math.PI;
    }
    this.group.add(obj);
  }

  #openCells() {
    const cells = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.#open(c, r)) cells.push({ col: c, row: r });
    return cells;
  }

  // Exit portal: spinning rings + vortex + halo, standing on cell X, facing the
  // arrival corridor. Reaching it (update) triggers victory.
  #buildPortal() {
    const e = this.maze.cellToWorld(this.maze.exit.col, this.maze.exit.row);
    const grp = new THREE.Group();
    grp.position.set(e.x, 1.9, e.z);
    grp.visible = false; // revealed after the collapse cutscene (in #updateEnding)
    // Orients the portal to face the arrival cell (the open neighbor of X).
    for (const [dc, dr, yaw] of [[-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2], [0, -1, 0], [0, 1, Math.PI]])
      if (this.#open(this.maze.exit.col + dc, this.maze.exit.row + dr)) { grp.rotation.y = yaw; break; }

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x9b5cff, toneMapped: false });
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0x35e0ff, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.14, 16, 48), ringMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 16, 48), ringMat2);
    const vortMat = new THREE.MeshBasicMaterial({ map: makeRadialGlowTexture(), color: 0x6a3cff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const vortex = new THREE.Mesh(new THREE.CircleGeometry(1.55, 48), vortMat);
    vortex.position.z = -0.05;
    const light = new THREE.PointLight(0x8a5cff, 5, CELL * 4, 1.5);
    grp.add(ring, ring2, vortex, light);
    this.group.add(grp);
    this.track(ringMat, ringMat2, vortMat, ring.geometry, ring2.geometry, vortex.geometry);
    this.portal3d = { grp, ring, ring2, vortex, vortMat, light };
  }

  enter(game) {
    game.monster.setSkin('ansem');
    game.audio.setMonsterVoice('ansem');
    // Collapsing machine room: dark, reddish fog.
    game.scene.background = new THREE.Color(0x0a0406);
    game.scene.fog = new THREE.FogExp2(0x120608, 0.05);
    game.scene.traverse((o) => {
      if (o.isAmbientLight) o.intensity = 0.1;
      if (o.isHemisphereLight) o.intensity = 0.08;
    });
    game.audio.startMusic('level3Music', 0.46);
    // Scripted intro: the player is frozen and the camera is driven (waking up -> looking around -> turning around).
    game.inputLocked = true;
    if (game.player.controls) game.player.controls.enabled = false;
    game.monster.setMode('none');
    this.phase = 'intro';
    this.phaseT = 0;
    this._introScared = false;
    game.setObjective('');
  }

  update(dt, game) {
    this.t += dt;
    this.#animateDecor(dt);
    if (this.button3d) this.button3d.light.intensity = 1.6 + Math.abs(Math.sin(this.t * 4)) * 1.2;

    if (this.phase === 'intro') return this.#updateIntro(dt, game);
    if (this.phase === 'ending') return this.#updateEnding(dt, game);
    if (this.phase === 'portal') {
      const p = this.portal3d.grp.position;
      const cam = game.camera.position;
      if (Math.hypot(p.x - cam.x, p.z - cam.z) < CELL * 0.8) game.advance();
      return;
    }
    // phase 'run': chase + capture handled by the Game loop; nothing to do here.
  }

  // Intro (long, phased): WAKING UP (eyes opening, getting up) -> LOOKING AROUND ->
  // Ansem BURSTS from the far end -> turns around -> flees.
  #updateIntro(dt, game) {
    const T = (this.phaseT += dt);
    const cam = game.camera;
    const sp = this.maze.cellToWorld(this.maze.playerSpawn.col, this.maze.playerSpawn.row);
    const YS = this.maze.startYaw; // south (Ansem's side)
    const EYE = 1.7;
    let yaw = 0;
    let pitch = 0;
    let roll = 0;
    let y = EYE;

    if (T < 2.2) {
      // 1) WAKING UP: eyelids opening (fade) + getting up from the ground, head straightening.
      const k = smooth(clamp01((T - 0.3) / 1.7));
      y = lerp(0.5, EYE, k);
      pitch = lerp(-0.55, 0, k);
      roll = Math.sin(T * 3.2) * 0.03 * (1 - k);
      yaw = 0;
      game.setFade(eyelid(T));
    } else if (T < 3.9) {
      // 2) LOOKING AROUND: slowly sweeps toward the south (the other end of the corridor).
      game.setFade(0);
      yaw = lerp(0, YS, smooth(clamp01((T - 2.2) / 1.7)));
      pitch = Math.sin((T - 2.2) * 2) * 0.05;
    } else if (T < 4.9) {
      // 3) Searching with the eyes (small anxious head movements) toward the south end.
      yaw = YS + Math.sin((T - 3.9) * 4) * 0.13;
      pitch = Math.sin((T - 3.9) * 3) * 0.05;
    } else if (T < 6.1) {
      // 4) ANSEM BURSTS into view at the far end and starts his rush.
      yaw = YS;
      if (!this._introScared) {
        this._introScared = true;
        game.monster.setVisible(true);
        game.monster.setMode('reveal');
        game.monster.placeAt(this.maze.spawn); // A (south end)
        this._ansemA = { x: game.monster.position.x, z: game.monster.position.z };
        game.audio.ansemScream();
        game.flash();
      }
      const k = clamp01((T - 4.9) / 1.2);
      game.monster.position.x = lerp(this._ansemA.x, sp.x, k * 0.4);
      game.monster.position.z = lerp(this._ansemA.z, sp.z, k * 0.4);
    } else if (T < 7.0) {
      // 5) Quick TURNAROUND toward the NORTH (fleeing) - extended rotation (-> 2π ≡ north).
      yaw = lerp(YS, 2 * Math.PI, smooth(clamp01((T - 6.1) / 0.9)));
    } else {
      // End of the intro -> the run begins.
      this.phase = 'run';
      game.setFade(0);
      cam.rotation.set(0, 0, 0); // facing north (fleeing)
      game.inputLocked = false;
      if (game.player.controls) game.player.controls.enabled = true;
      game.monster.placeAt(this.maze.spawn); // Ansem starts again from the far end (with a head start)
      game.monster.setMode('chase');
      game.setObjective('RUN! Reach the button, press E');
      return;
    }
    cam.position.set(sp.x, y, sp.z);
    cam.rotation.set(pitch, yaw, roll);
  }

  // "E" interaction: on the button (end of the run) -> triggers the collapse cutscene.
  onInteract(game) {
    if (this.phase !== 'run' || !this.button3d) return;
    const cam = game.camera.position;
    const b = this.button3d.pos;
    if (Math.hypot(b.x - cam.x, b.z - cam.z) > CELL * 0.9) return;
    this.phase = 'ending';
    this.phaseT = 0;
    game.inputLocked = true;
    if (game.player.controls) game.player.controls.enabled = false;
    game.monster.setMode('reveal'); // freezes the AI + disables capture (mode ≠ chase)
    game.monster.setSkin('ansem');
    game.monster.setVisible(true);
    // Ansem BURSTS in right behind, on the final straight (toward the south): guarantees he
    // is in frame for the final rush, wherever he was during the run (winding corridor).
    const behind = this.maze.cellToWorld(this.buttonCell.col, this.buttonCell.row + 3);
    game.monster.position.set(behind.x, 0, behind.z);
    this.button3d.domeMat.emissive.setHex(0x39ff88); // button pressed -> green
    this._camBase = { x: cam.x, y: cam.y, z: cam.z };
    this._camYaw0 = game.camera.rotation.y;
    this._ansemFrom = { x: behind.x, z: behind.z };
    this._collapsed = false;
    this._portalShown = false;
    this.#spawnDebris(game);
    game.audio.crash();
  }

  // Spawns a few pieces of debris above the impact point (on Ansem), animated falling.
  #spawnDebris(game) {
    const cam = game.camera.position;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 });
    this.track(mat);
    // Impact point ≈ between the player and Ansem (just behind the player, south side).
    const ix = (cam.x + this._ansemFrom.x) / 2;
    const iz = (cam.z + this._ansemFrom.z) / 2;
    for (let i = 0; i < 9; i++) {
      const s = 0.6 + Math.random() * 1.4;
      const geo = new THREE.BoxGeometry(s, s, s);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(ix + (Math.random() - 0.5) * 4, 7 + Math.random() * 4, iz + (Math.random() - 0.5) * 4);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.visible = false;
      this.group.add(m);
      this.track(geo);
      this.debris.push({ mesh: m, delay: 0.05 + Math.random() * 0.5, vy: 0, groundY: s / 2 });
    }
  }

  // Ending cutscene: you turn around, Ansem lunges, the ceiling collapses on him, he falls;
  // then a portal appears behind the player.
  #updateEnding(dt, game) {
    const T = (this.phaseT += dt);
    const cam = game.camera;
    const YS = this.maze.startYaw; // south: looking at Ansem behind
    const base = this._camBase;

    // 1) Turn to face Ansem (0-0.6 s).
    let yaw;
    if (T < 0.6) yaw = lerp(this._camYaw0, YS, smooth(clamp01(T / 0.6)));
    else yaw = YS;

    // 2) Ansem lunges toward the player (0.6-1.5 s): closing in + jump arc.
    if (T > 0.6 && T < 1.6) {
      const k = clamp01((T - 0.6) / 1.0);
      game.monster.position.x = lerp(this._ansemFrom.x, cam.position.x, k * 0.7);
      game.monster.position.z = lerp(this._ansemFrom.z, cam.position.z, k * 0.7);
      game.monster.position.y = Math.sin(k * Math.PI) * 1.6; // jump
    }

    // 3) Collapse at ~1.5 s: flash + falling debris.
    if (T >= 1.5 && !this._collapsed) {
      this._collapsed = true;
      game.flash();
      game.audio.sting('catch');
      game.audio.fallWhoosh();
    }
    let shake = 0;
    if (this._collapsed && T < 2.8) {
      for (const d of this.debris) {
        d.delay -= dt;
        if (d.delay > 0) continue;
        d.mesh.visible = true;
        d.vy -= 26 * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.rotation.x += dt * 2;
        if (d.mesh.position.y < d.groundY) {
          d.mesh.position.y = d.groundY;
          d.vy = 0;
        }
      }
      shake = 0.12 * Math.max(0, 1 - (T - 1.5) / 1.3);
    }

    // 4) Ansem sinks into the pit with the debris (1.8-2.6 s), then disappears.
    if (T > 1.8) game.monster.position.y = Math.max(-8, 1.2 - (T - 1.8) * 6);
    if (T > 2.4) game.monster.setVisible(false);

    // 5) Reveals the portal (behind you = to the north).
    if (T > 2.6 && !this._portalShown) {
      this._portalShown = true;
      this.portal3d.grp.visible = true;
    }

    // 6) Hands control back (≥3.3 s): the player faces south (the collapse), portal behind.
    if (T >= 3.3) {
      this.phase = 'portal';
      game.inputLocked = false;
      if (game.player.controls) game.player.controls.enabled = true;
      cam.position.set(base.x, base.y, base.z);
      cam.rotation.set(0, YS, 0);
      game.setObjective('A portal opened behind you, step through it');
      return;
    }

    cam.position.set(base.x + (Math.random() - 0.5) * shake, base.y + (Math.random() - 0.5) * shake, base.z + (Math.random() - 0.5) * shake);
    cam.rotation.set(0, yaw, 0);
  }

  // Ambient animations (portal, LEDs, beacon lights, screens, sparks) - every frame.
  #animateDecor(dt) {
    if (this.portal3d) {
      this.portal3d.ring.rotation.z += dt * 1.3;
      this.portal3d.ring2.rotation.z -= dt * 2.0;
      this.portal3d.vortex.rotation.z += dt * 0.8;
      const pulse = 0.7 + Math.abs(Math.sin(this.t * 2)) * 0.3;
      this.portal3d.vortMat.opacity = pulse;
      this.portal3d.light.intensity = 4 + Math.abs(Math.sin(this.t * 2)) * 3;
    }
    for (const l of this.leds) {
      const on = Math.sin(this.t * 6 + l.phase) > (Math.sin(this.t * 0.7 + l.phase) > 0 ? 0.2 : 0.9);
      l.mat.color.setRGB(on ? 0.1 : 0.02, on ? 0.9 : 0.06, on ? 0.2 : 0.05);
    }
    for (const s of this.strobes) s.light.intensity = 1 + Math.max(0, Math.sin(this.t * 3 + s.phase)) * 4;
    for (const mat of this.screens) mat.emissiveIntensity = 0.4 + Math.abs(Math.sin(this.t * 1.5)) * 0.5;
    for (const sp of this.sparks) {
      sp.next -= dt;
      if (sp.next <= 0) {
        sp.next = 0.4 + ((Math.sin(sp.phase + this.t) + 1) % 1) * 1.5;
        sp.mat.opacity = 0.9;
      } else {
        sp.mat.opacity = Math.max(0, sp.mat.opacity - dt * 4);
      }
    }
  }
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function lerp(a, b, k) {
  return a + (b - a) * k;
}
function smooth(k) {
  return k * k * (3 - 2 * k);
}
// Eyelids waking up: black -> half-open -> blink -> open (fade). Returns the fade alpha.
function eyelid(T) {
  if (T < 0.4) return 1; // eyes closed
  if (T < 0.7) return lerp(1, 0.15, (T - 0.4) / 0.3); // opening
  if (T < 0.95) return lerp(0.15, 0.7, (T - 0.7) / 0.25); // blink
  if (T < 1.8) return Math.max(0, lerp(0.7, 0, (T - 0.95) / 0.85)); // final opening
  return 0;
}
