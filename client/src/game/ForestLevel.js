import * as THREE from 'three';
import { CELL, EYE_HEIGHT } from '../config.js';
import { Maze } from './Maze.js';
import { Level } from './Level.js';
import { makeChaletBoardTexture, makeChaletLoreTexture, makeCaptionTexture, makeRadialGlowTexture, makeWoodTexture, makeRockTexture, makeExitSignTexture, makeFireHintTexture } from './textures.js';
import { campfire, lantern, fireplace, chaletTable, chaletChair, chaletBed, dogBowl, woodPile, shelf, rug, stool } from './forestProps.js';
import { clawMarks } from './props.js';

// =============================================================
// Level 2 — NIGHT FOREST: on tombe dans le trou du niveau 1 et on se réveille dans un
// chalet (tableau explicatif + loupiotes). En sortant, BONK surgit derrière avec un cri et
// nous poursuit dans une forêt très sombre. Seuls les FEUX DE CAMP éclairent : ils forment
// des zones sûres (BONK fuit tant qu'on y reste, reprend la chasse dès qu'on les quitte).
// La grille (Maze) sert aux collisions + à l'IA de BONK ; le décor est rendu à la main.
// =============================================================
const COLS = 21;
const ROWS = 31;
const SAFE_R = 4.5; // rayon de sécurité autour d'un feu (unités monde ≈ 3-4 m)
const WALL_H = 5.0; // hauteur sous plafond du chalet (plus haute, avec poutres apparentes)

export class ForestLevel extends Level {
  build() {
    this.monsterMode = 'none'; // BONK dort jusqu'à la sortie du chalet
    this.portal = false;
    this.feasibleSanity = 0.6; // jouable ~60 % de santé mentale (cf. Game)
    this.ambientScreams = ['scream3']; // cris d'ambiance aléatoires (niveau 2)
    this.musicTrack = 'forestTheme'; // musique de la forêt
    this.objective = 'Wake up…';

    const meta = this.#buildMaze();
    this.chalet = meta.chalet;
    this.door = meta.door;
    this.doorRow = meta.door.row;

    this.group.add(this.#buildGround());
    this.group.add(this.#buildTrees(meta));
    this.#buildChalet();
    this.campfires = this.#buildCampfires(meta.campfireCells);
    this.#buildMineExit();

    this.wakeT = 0;
    this.wakeDone = false;
    this.chaseTriggered = false; // le joueur a franchi la porte
    this.chasing = false; // BONK actif (après 1 s de répit)
    this.chaseDelay = 0;
    this.t = 0;
    // Poursuite de BONK : ruées rapides intermittentes pendant la traque.
    this.lunging = false;
    this.lungeT = 0;
    this.lungeGap = 3.5;
  }

  // ---- Grille : chalet en bas, chemin serpentin ouvert vers la sortie en haut, arbres
  // (murs) parsemés avec des trous pour que BONK puisse se faufiler et fuir dans la forêt.
  #buildMaze() {
    const cx = Math.floor(COLS / 2);
    const maze = new Maze({
      cols: COLS,
      rows: ROWS,
      areas: [{ x0: 1, y0: 1, x1: COLS - 2, y1: ROWS - 2, ceil: 40 }],
      playerStart: { col: cx, row: ROWS - 3 },
      exitCell: { col: cx, row: 1 },
      monsterStart: null,
      startFacing: 'north',
    });

    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(1));
    const open = (c, r) => {
      if (c >= 1 && r >= 1 && c < COLS - 1 && r < ROWS - 1) grid[r][c] = 0;
    };

    // Chalet (bas-centre) + porte au nord — petit (3×3 cellules) comme une vraie cabane.
    const chalet = { c0: cx - 1, c1: cx + 1, r0: ROWS - 4, r1: ROWS - 2 };
    for (let r = chalet.r0; r <= chalet.r1; r++) for (let c = chalet.c0; c <= chalet.c1; c++) open(c, r);
    const door = { col: cx, row: chalet.r0 - 1 };
    open(door.col, door.row);

    // Chemin serpentin (waypoints → segments droits élargis).
    const wps = [
      [cx, door.row],
      [cx, ROWS - 9],
      [cx - 5, ROWS - 9],
      [cx - 5, ROWS - 13],
      [cx + 5, ROWS - 13],
      [cx + 5, ROWS - 17],
      [cx - 3, ROWS - 17],
      [cx - 3, ROWS - 22],
      [cx + 3, ROWS - 22],
      [cx + 3, 5],
      [cx, 5],
      [cx, 1],
    ];
    const pathCells = [];
    const carveWide = (c, r) => {
      open(c, r);
      open(c - 1, r);
      open(c + 1, r);
      open(c, r - 1);
      open(c, r + 1);
    };
    for (let i = 0; i < wps.length - 1; i++) {
      const [c0, r0] = wps[i];
      const [c1, r1] = wps[i + 1];
      if (c0 === c1) {
        const s = Math.sign(r1 - r0) || 1;
        for (let r = r0; r !== r1 + s; r += s) {
          carveWide(c0, r);
          pathCells.push({ col: c0, row: r });
        }
      } else {
        const s = Math.sign(c1 - c0) || 1;
        for (let c = c0; c !== c1 + s; c += s) {
          carveWide(c, r0);
          pathCells.push({ col: c, row: r0 });
        }
      }
    }

    // Forêt PLUS DENSE : seulement ~40 % des murs restants s'ouvrent (→ plus d'arbres,
    // plus d'occlusion pour que BONK puisse se cacher), le reste = arbres.
    for (let r = 1; r < door.row; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (grid[r][c] === 0) continue;
        if (Math.random() < 0.4) grid[r][c] = 0;
      }
    }

    // Feux de camp ESPACÉS le long du chemin (moins nombreux → plus dur ; naturellement
    // décalés par le zigzag).
    const campfireCells = [];
    const N = 4;
    for (let i = 1; i <= N; i++) {
      const idx = Math.floor((pathCells.length * i) / (N + 1));
      const cell = pathCells[Math.min(idx, pathCells.length - 1)];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) open(cell.col + dc, cell.row + dr);
      campfireCells.push({ ...cell });
    }

    maze.grid = grid;
    this.maze = maze;
    return { chalet, door, campfireCells };
  }

  #buildGround() {
    const geo = new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a0f0a, roughness: 1 });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.track(geo, mat);
    return floor;
  }

  // Arbres : un conifère par cellule-mur de la zone forêt (trunk + cône), instanciés.
  #buildTrees(meta) {
    const cells = [];
    for (let r = 0; r < meta.door.row; r++) {
      for (let c = 0; c < COLS; c++) if (this.maze.isWall(c, r)) cells.push({ c, r });
    }
    const g = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 4.2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x241811, roughness: 1 });
    const coneGeo = new THREE.ConeGeometry(2.3, 5.6, 7);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x0b1a10, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, cells.length);
    const cones = new THREE.InstancedMesh(coneGeo, coneMat, cells.length);
    const dummy = new THREE.Object3D();
    cells.forEach((t, i) => {
      const w = this.maze.cellToWorld(t.c, t.r);
      const ox = (Math.random() - 0.5) * 1.6;
      const oz = (Math.random() - 0.5) * 1.6;
      const sc = 0.85 + Math.random() * 0.5;
      const yaw = Math.random() * Math.PI * 2;
      dummy.position.set(w.x + ox, 2.1 * sc, w.z + oz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 6.9 * sc;
      dummy.updateMatrix();
      cones.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    cones.instanceMatrix.needsUpdate = true;
    g.add(trunks, cones);
    this.track(trunkGeo, trunkMat, coneGeo, coneMat);
    return g;
  }

  // Intérieur du chalet : sol bois, murs (avec porte au nord), plafond, meubles, loupiotes,
  // et le TABLEAU explicatif sur un mur.
  #buildChalet() {
    const ch = this.chalet;
    const wc0 = this.maze.cellToWorld(ch.c0, ch.r0);
    const wc1 = this.maze.cellToWorld(ch.c1, ch.r1);
    const minX = wc0.x - CELL / 2;
    const maxX = wc1.x + CELL / 2;
    const minZ = wc0.z - CELL / 2; // côté nord (porte)
    const maxZ = wc1.z + CELL / 2; // côté sud
    const midX = (minX + maxX) / 2;
    const midZ = (minZ + maxZ) / 2;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const t = 0.35;
    const doorX = this.maze.cellToWorld(this.door.col, this.door.row).x;
    const doorW = CELL;

    const g = new THREE.Group();
    // Bois texturé (lattes + veinage) pour les murs/plafond et le sol.
    const wallTex = makeWoodTexture();
    wallTex.repeat.set(2, 1);
    const floorTex = makeWoodTexture();
    floorTex.repeat.set(3, 3);
    const wood = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, emissive: 0x201206, emissiveIntensity: 0.3 });
    const woodFloor = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 });
    this.track(wallTex, floorTex, wood, woodFloor);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), woodFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(midX, 0.03, midZ);
    g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), wood);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(midX, WALL_H, midZ);
    g.add(ceil);

    const wall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
      m.position.set(x, y, z);
      g.add(m);
    };
    // Poutres/chambranle en bois foncé (helper réutilisé pour les poutres ET l'encadrement).
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x241609, roughness: 0.95 });
    this.track(beamMat);
    const bt = 0.3;
    const beam = (bw, bh, bd, bx, by, bz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), beamMat);
      m.position.set(bx, by, bz);
      g.add(m);
    };

    wall(width, WALL_H, t, midX, WALL_H / 2, maxZ); // sud
    wall(t, WALL_H, depth, minX, WALL_H / 2, midZ); // ouest
    wall(t, WALL_H, depth, maxX, WALL_H / 2, midZ); // est
    // Mur nord : deux grands segments de part et d'autre de la cellule-porte.
    const leftW = doorX - doorW / 2 - minX;
    const rightW = maxX - (doorX + doorW / 2);
    if (leftW > 0.1) wall(leftW, WALL_H, t, (minX + doorX - doorW / 2) / 2, WALL_H / 2, minZ);
    if (rightW > 0.1) wall(rightW, WALL_H, t, (doorX + doorW / 2 + maxX) / 2, WALL_H / 2, minZ);
    // On réduit le trou de 6 de large en une VRAIE ouverture de porte encadrée (crédible).
    const openHalf = 1.6; // demi-largeur d'ouverture (~3,2 m)
    const openH = 3.4; // hauteur d'ouverture
    const sideFill = doorW / 2 - openHalf;
    wall(sideFill, WALL_H, t, doorX - openHalf - sideFill / 2, WALL_H / 2, minZ);
    wall(sideFill, WALL_H, t, doorX + openHalf + sideFill / 2, WALL_H / 2, minZ);
    wall(openHalf * 2, WALL_H - openH, t, doorX, WALL_H - (WALL_H - openH) / 2, minZ); // linteau
    // Chambranle bois : montants + linteau, côté intérieur.
    const jz = minZ + 0.14;
    beam(0.18, openH, 0.36, doorX - openHalf, openH / 2, jz);
    beam(0.18, openH, 0.36, doorX + openHalf, openH / 2, jz);
    beam(openHalf * 2 + 0.36, 0.22, 0.36, doorX, openH, jz);

    // Poutres apparentes : montants VERTICAUX aux coins + poutres HORIZONTALES (ceinture haute
    // + traverses de plafond).
    const ix = minX + bt / 2 + 0.05;
    const ax = maxX - bt / 2 - 0.05;
    const iz = minZ + bt / 2 + 0.05;
    const az = maxZ - bt / 2 - 0.05;
    // Montants verticaux aux 4 coins.
    for (const bx of [ix, ax]) for (const bz of [iz, az]) beam(bt, WALL_H, bt, bx, WALL_H / 2, bz);
    // Ceinture horizontale sous le plafond (le long des 4 murs).
    const topY = WALL_H - bt / 2 - 0.05;
    beam(width, bt, bt, midX, topY, iz);
    beam(width, bt, bt, midX, topY, az);
    beam(bt, bt, depth, ix, topY, midZ);
    beam(bt, bt, depth, ax, topY, midZ);
    // Traverses de plafond (le long de X), réparties en profondeur.
    for (let k = -1; k <= 1; k++) beam(width, bt, bt * 1.1, midX, topY, midZ + (k * depth) / 3);

    // Meubles (chalet minimaliste) : cheminée au fond, tournée vers l'intérieur.
    const fp = fireplace();
    fp.group.position.set(midX, 0, maxZ - 0.7);
    fp.group.rotation.y = Math.PI; // âtre vers −z (l'intérieur)
    g.add(fp.group);
    this.track(fp.logGeo, ...(fp.mats || []));
    this.fireplaceFire = { light: fp.light, flames: fp.flames }; // animé (vacillement) dans update
    const lamp = lantern();
    lamp.group.position.set(midX, WALL_H - 0.5, maxZ - 1.0);
    g.add(lamp.group);

    // Deuxième loupiote (murale) près de la porte.
    const lamp2 = lantern();
    lamp2.group.position.set(doorX + doorW / 2 + 0.6, 2.4, minZ + 0.3);
    g.add(lamp2.group);

    // Rules board on the west wall, facing inward.
    const boardTex = makeChaletBoardTexture();
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.85, roughness: 0.9 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.0), boardMat);
    board.position.set(minX + 0.12, 1.85, midZ);
    board.rotation.y = Math.PI / 2;
    g.add(board);
    const boardLight = new THREE.PointLight(0xffd8a0, 1.6, 7, 1.6);
    boardLight.position.set(minX + 1.4, 2.2, midZ);
    g.add(boardLight);
    this.track(boardTex, boardMat);

    // Panneau explicatif « STAY IN THE LIGHT » AU-DESSUS DE LA PORTE (bien visible en sortant) :
    // BONK craint le feu → il faut aller de feu de camp en feu de camp.
    const hintTex = makeFireHintTexture();
    const hintMat = new THREE.MeshStandardMaterial({ map: hintTex, emissive: 0xffffff, emissiveMap: hintTex, emissiveIntensity: 0.95, roughness: 0.9 });
    const rx = (doorX + doorW / 2 + maxX) / 2; // segment nord, à DROITE de la porte
    const hint = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.95), hintMat);
    hint.position.set(rx, 2.15, minZ + 0.16); // à HAUTEUR DES YEUX (dans le champ dès le spawn)
    g.add(hint);
    const hintLight = new THREE.PointLight(0xffca80, 2.2, 10, 1.5);
    hintLight.position.set(rx, 2.4, minZ + 1.8);
    g.add(hintLight);
    this.track(hintTex, hintMat);

    // Framed photo on the east wall: Ansem walking his dog BONK, before the rot.
    const photoTex = new THREE.TextureLoader().load('/ansem-bonk.png');
    photoTex.colorSpace = THREE.SRGBColorSpace;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.8 });
    const photoMat = new THREE.MeshStandardMaterial({ map: photoTex, emissive: 0xffffff, emissiveMap: photoTex, emissiveIntensity: 0.6, roughness: 0.9 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.7, 2.7, 0.12), frameMat);
    frame.position.set(maxX - 0.14, 2.2, midZ); // CENTRÉ sur le mur est (pièce maîtresse)
    frame.rotation.y = -Math.PI / 2;
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(3.35, 2.35), photoMat);
    photo.position.set(maxX - 0.2, 2.2, midZ);
    photo.rotation.y = -Math.PI / 2;
    g.add(frame, photo);
    const photoLight = new THREE.PointLight(0xffd8a0, 1.3, 7, 1.7);
    photoLight.position.set(maxX - 1.4, 2.5, midZ);
    g.add(photoLight);
    this.track(photoTex, frameMat, photoMat);

    // Scrawled LORE notes all around the walls (English) — BONK is Ansem's dog, he fears light…
    const addLore = (variant, x, y, z, yaw) => {
      const tex = makeChaletLoreTexture(variant);
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.95, transparent: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.3), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      g.add(mesh);
      this.track(tex, mat);
    };
    // Beside the photo (east wall): the story of BONK, Ansem's dog.
    addLore(0, maxX - 0.12, 1.85, midZ + 4.2, -Math.PI / 2);
    // North wall, left of the door: he fears the light.
    addLore(1, (minX + doorX - doorW / 2) / 2, 1.85, minZ + 0.12, 0);
    // (Le segment nord-droit est occupé par le panneau « STAY IN THE LIGHT ».)
    // South wall, flanking the fireplace.
    addLore(3, midX - 6.5, 2.0, maxZ - 0.12, Math.PI);
    addLore(4, midX + 6.5, 2.0, maxZ - 0.12, Math.PI);

    // Tableaux (portraits encadrés) d'Ansem et de BONK, avec une légende (lore).
    const addPortrait = (imgSrc, caption, x, y, z, yaw) => {
      const tex = new THREE.TextureLoader().load(imgSrc);
      tex.colorSpace = THREE.SRGBColorSpace;
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e1409, roughness: 0.85 });
      const imgMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.9 });
      const capTex = makeCaptionTexture(caption);
      const capMat = new THREE.MeshStandardMaterial({ map: capTex, emissive: 0xffffff, emissiveMap: capTex, emissiveIntensity: 0.7, roughness: 0.9 });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 0.12), frameMat);
      const img = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 2.15), imgMat);
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.46), capMat);
      const inset = 0.02;
      for (const m of [frame, img, cap]) m.rotation.y = yaw;
      // Décale image/légende « devant » le cadre selon l'orientation du mur.
      const nx = Math.sin(yaw), nz = Math.cos(yaw); // normale approx (yaw autour de Y)
      frame.position.set(x, y, z);
      img.position.set(x + nx * (0.07 + inset), y, z + nz * (0.07 + inset));
      cap.position.set(x + nx * (0.07 + inset), y - 1.55, z + nz * (0.07 + inset));
      g.add(frame, img, cap);
      this.track(tex, frameMat, imgMat, capTex, capMat);
    };
    // Portraits d'Ansem et de BONK : à HAUTEUR DES YEUX sur le mur ouest, symétriques de part et
    // d'autre du tableau central (le mur est est réservé à la grande photo encadrée, centrée).
    addPortrait('/monster.png', 'ANSEM — he bought the dip', minX + 0.14, 2.4, midZ - 4.5, Math.PI / 2);
    addPortrait('/bonk-face.png', 'BONK — his dog. now the hunter', minX + 0.14, 2.4, midZ + 4.5, Math.PI / 2);

    // MEUBLES : le chalet n'est plus vide. Lit (on s'y réveille) contre le mur ouest,
    // table + chaises au centre-est, décalés du chemin porte↔joueur.
    const bed = chaletBed();
    bed.position.set(minX + 1.4, 0, maxZ - 3.2);
    bed.rotation.y = Math.PI / 2; // tête de lit contre le mur ouest
    g.add(bed);

    const table = chaletTable();
    table.position.set(midX + 4.2, 0, midZ + 1.5);
    g.add(table);
    for (const [dx, dz, ry] of [
      [-1.4, 0, Math.PI / 2],
      [1.4, 0, -Math.PI / 2],
      [0, 1.3, Math.PI],
    ]) {
      const chair = chaletChair();
      chair.position.set(midX + 4.2 + dx, 0, midZ + 1.5 + dz);
      chair.rotation.y = ry;
      g.add(chair);
    }

    // Détails : tapis au centre, tas de bûches + gamelle de BONK près de la cheminée,
    // étagère à bocaux sur le mur nord, tabouret près du feu.
    const carpet = rug();
    carpet.position.set(midX - 1.5, 0.05, midZ + 0.5);
    g.add(carpet);

    const logs = woodPile();
    logs.position.set(midX + 2.6, 0, maxZ - 0.9);
    g.add(logs);

    const bowl = dogBowl();
    bowl.position.set(midX - 3.2, 0, maxZ - 1.6);
    g.add(bowl);

    const sh = shelf();
    sh.position.set(doorX - doorW / 2 - 2.2, 2.6, minZ + 0.3); // mur nord, à gauche de la porte
    g.add(sh);

    const st = stool();
    st.position.set(midX + 1.4, 0, maxZ - 2.4);
    g.add(st);

    // GRIFFURES sur les murs (quelqu'un a griffé le bois pour sortir).
    for (const [x, y, z, ry, seed] of [
      [maxX - 0.12, 2.3, midZ - 4.8, -Math.PI / 2, 4],
      [midX - 4.8, 2.4, maxZ - 0.12, Math.PI, 5],
      [minX + 0.12, 2.7, midZ - 2.0, Math.PI / 2, 6],
    ]) {
      const claw = clawMarks(3.2, 3.2, seed);
      claw.mesh.position.set(x, y, z);
      claw.mesh.rotation.y = ry;
      g.add(claw.mesh);
      this.track(claw.tex, claw.mat);
    }

    // Éclairage chaud de base du chalet.
    const warm = new THREE.PointLight(0xffb066, 2.6, 16, 1.5);
    warm.position.set(midX, WALL_H - 0.6, midZ);
    g.add(warm);

    this.group.add(g);
  }

  #buildCampfires(cells) {
    const list = [];
    for (const cell of cells) {
      const cf = campfire();
      const w = this.maze.cellToWorld(cell.col, cell.row);
      cf.group.position.set(w.x, 0, w.z);
      this.group.add(cf.group);
      this.track(...(cf.mats || []));
      list.push({ x: w.x, z: w.z, light: cf.light, flames: cf.flames, haloMat: cf.haloMat, phase: Math.random() * 10 });
    }
    return list;
  }

  // Sortie : ENTRÉE DE MINE au bout du chemin. On s'enfonce dans la roche (montagnes en fond),
  // un court tunnel rocheux, et au fond un cadre d'Ansem marqué « EXIT ». Le couloir final
  // (col cx, rangs 1→5) est déjà droit selon l'axe z (x constant) → géométrie alignée sur z.
  #buildMineExit() {
    const g = new THREE.Group();
    const eW = this.maze.cellToWorld(this.maze.exit.col, this.maze.exit.row); // case sortie (rang 1)
    const inW = this.maze.cellToWorld(this.maze.exit.col, this.maze.exit.row + 1); // rang 2 (vers forêt)
    const xC = eW.x;
    const zStep = eW.z - inW.z; // pas d'une cellule vers le NORD (dans la roche)
    const zExit = eW.z;
    const zMouth = zExit - zStep * 4; // bouche (côté forêt), ~4 cellules au sud de la sortie
    const zBack = zExit + zStep * 1; // fond du tunnel, une cellule au nord de la sortie
    const H = 5.4; // hauteur du tunnel
    const halfW = CELL * 1.5; // demi-largeur (couloir de 3 cases)

    // Matériaux roche : DEUX textures dédiées (répétition adaptée → pas d'étirement smearé)
    // et un sol avec polygonOffset (évite le z-fighting avec le sol de la forêt qui passe dessous).
    const wallTex = makeRockTexture();
    wallTex.repeat.set(4, 1.4);
    const rockCapTex = makeRockTexture();
    rockCapTex.repeat.set(3, 5);
    const rock = new THREE.MeshStandardMaterial({ map: wallTex, color: 0x6b6a66, roughness: 1 });
    const rockCap = new THREE.MeshStandardMaterial({ map: rockCapTex, color: 0x63625e, roughness: 1 });
    const rockFloor = new THREE.MeshStandardMaterial({ map: rockCapTex, color: 0x5c5b57, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.track(wallTex, rockCapTex, rock, rockCap, rockFloor);

    const zMid = (zMouth + zBack) / 2;
    const depth = Math.abs(zBack - zMouth) + CELL;

    // Parois latérales rocheuses + plafond + sol + fond.
    const sideGeo = new THREE.BoxGeometry(0.8, H, depth);
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(sideGeo, rock);
      wall.position.set(xC + sx * (halfW + 0.4), H / 2, zMid);
      g.add(wall);
    }
    const ceilGeo = new THREE.BoxGeometry(halfW * 2 + 1.6, 0.8, depth);
    const ceil = new THREE.Mesh(ceilGeo, rockCap);
    ceil.position.set(xC, H, zMid);
    g.add(ceil);
    const floorGeo = new THREE.PlaneGeometry(halfW * 2 + 1.6, depth);
    const floorM = new THREE.Mesh(floorGeo, rockFloor);
    floorM.rotation.x = -Math.PI / 2;
    floorM.position.set(xC, 0.15, zMid);
    g.add(floorM);
    const backGeo = new THREE.BoxGeometry(halfW * 2 + 1.6, H, 0.8);
    const back = new THREE.Mesh(backGeo, rock);
    back.position.set(xC, H / 2, zBack);
    g.add(back);
    this.track(sideGeo, ceilGeo, floorGeo, backGeo);

    // Bouche de mine : cadre en madriers (montants + linteau) à l'entrée côté forêt.
    const woodTex = makeWoodTexture();
    const wood = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x6a4a28, roughness: 0.9 });
    this.track(woodTex, wood);
    const postGeo = new THREE.BoxGeometry(0.7, H + 0.6, 0.7);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, wood);
      post.position.set(xC + sx * (halfW + 0.2), (H + 0.6) / 2, zMouth);
      g.add(post);
    }
    const lintelGeo = new THREE.BoxGeometry(halfW * 2 + 1.8, 0.9, 0.9);
    const lintel = new THREE.Mesh(lintelGeo, wood);
    lintel.position.set(xC, H + 0.1, zMouth);
    g.add(lintel);
    // Étai diagonal.
    const braceGeo = new THREE.BoxGeometry(halfW * 2, 0.4, 0.4);
    const brace = new THREE.Mesh(braceGeo, wood);
    brace.position.set(xC, H - 0.9, zMouth + zStep * 0.15);
    g.add(brace);
    this.track(postGeo, lintelGeo, braceGeo);

    // Montagnes derrière/autour (silhouettes sombres à travers le brouillard) → « on s'enfonce ».
    const mtnMat = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 1 });
    this.track(mtnMat);
    // Uniquement DERRIÈRE le fond (au nord) : les anciens reliefs « de flanc » débordaient dans
    // le couloir et se traversaient (le bug de texture signalé à l'entrée) → supprimés.
    const mtns = [
      [xC, zBack + zStep * 3, 42, 60],
      [xC - 34, zBack + zStep * 2, 30, 44],
      [xC + 30, zBack + zStep * 2.5, 34, 52],
    ];
    for (const [mx, mz, rad, ht] of mtns) {
      const geo = new THREE.ConeGeometry(rad, ht, 5);
      const m = new THREE.Mesh(geo, mtnMat);
      m.position.set(mx, ht / 2 - 4, mz);
      m.rotation.y = Math.random() * Math.PI;
      g.add(m);
      this.track(geo);
    }

    // Cadre d'Ansem « EXIT » au fond, contre le mur nord (face à la forêt/au joueur).
    const faceYaw = zStep < 0 ? 0 : Math.PI; // normale du cadre orientée vers la forêt (−zStep)
    const zFrame = zBack - zStep * 0.42; // juste devant le mur du fond, côté tunnel
    const outward = -Math.sign(zStep) * 0.1; // pousse image/légende devant le cadre (vers le joueur)
    const ansemTex = new THREE.TextureLoader().load('/monster.png');
    ansemTex.colorSpace = THREE.SRGBColorSpace;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e1409, roughness: 0.85 });
    const imgMat = new THREE.MeshStandardMaterial({ map: ansemTex, emissive: 0xffffff, emissiveMap: ansemTex, emissiveIntensity: 0.5, roughness: 0.9 });
    const capTex = makeCaptionTexture('EXIT');
    const capMat = new THREE.MeshStandardMaterial({ map: capTex, emissive: 0xffffff, emissiveMap: capTex, emissiveIntensity: 0.8, roughness: 0.9 });
    this.track(ansemTex, frameMat, imgMat, capTex, capMat);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.9, 0.16), frameMat);
    frame.position.set(xC, 2.3, zFrame);
    frame.rotation.y = faceYaw;
    const img = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), imgMat);
    img.position.set(xC, 2.3, zFrame + outward);
    img.rotation.y = faceYaw;
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), capMat);
    cap.position.set(xC, 0.75, zFrame + outward);
    cap.rotation.y = faceYaw;
    g.add(frame, img, cap);

    // Panneau « EXIT » néon émissif au-dessus du cadre.
    const signTex = makeExitSignTexture();
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.1, transparent: true, roughness: 0.8 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.1), signMat);
    sign.position.set(xC, 4.3, zFrame + outward);
    sign.rotation.y = faceYaw;
    g.add(sign);
    this.track(signTex, signMat);

    // Lumière : lanterne chaude + lueur d'appel (halo pulsé, réutilisé par update()).
    const lamp = lantern();
    lamp.group.position.set(xC + halfW - 0.6, 3.0, zExit);
    g.add(lamp.group);
    const glow = makeRadialGlowTexture();
    const haloMat = new THREE.SpriteMaterial({ map: glow, color: 0x9fd0ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(7, 7, 1);
    halo.position.set(xC, 2.6, zExit);
    g.add(halo);
    const light = new THREE.PointLight(0xbfe0ff, 7, CELL * 7, 1.3);
    light.position.set(xC, 3, zExit);
    g.add(light);
    // Deuxième lumière plus au sud pour éclairer l'entrée du tunnel (la roche était trop sombre).
    const light2 = new THREE.PointLight(0xffd0a0, 3.5, CELL * 6, 1.5);
    light2.position.set(xC, 3.2, zMouth + zStep * 0.5);
    g.add(light2);
    this.track(haloMat);

    this.group.add(g);
    this.exitHaloMat = haloMat; // pulsé dans update() (ligne existante)
    this.exitLight = light;
  }

  enter(game) {
    // Nuit : fond très sombre, brouillard dense, ambiante minimale (on ne voit que les feux).
    game.scene.background = new THREE.Color(0x05060a);
    game.scene.fog = new THREE.FogExp2(0x05060a, 0.04); // brouillard : BONK visible d'assez près, fondu au loin
    game.scene.traverse((o) => {
      if (o.isAmbientLight) o.intensity = 0.05;
      if (o.isHemisphereLight) o.intensity = 0.07;
    });

    // Le monstre de la forêt est BONK (créature 3D + sons distincts d'Ansem).
    game.monster.setSkin('bonk');
    game.audio.setMonsterVoice('bonk');
    game.audio.startMusic('forestTheme', 0.46); // musique d'ambiance de la forêt (fichier fourni)
    game.monster.setVisible(false);
    game.monster.setMode('none');
    game.monster.fleeing = false;
    this.lunging = false;
    this.lungeT = 0;

    game.setFade(1); // yeux fermés (chute → réveil)
    game.inputLocked = true;
    this.wakeT = 0;
    this.wakeDone = false;
    this.chaseTriggered = false;
    this.chasing = false;
    this.chaseDelay = 0;
    game.setObjective('Wake up…');
  }

  update(dt, game) {
    this.t += dt;
    const cam = game.camera.position;

    // Vacillement des feux de camp (lumière + flammes + halo).
    for (const cf of this.campfires) {
      const f = 0.78 + 0.16 * Math.sin(this.t * 11 + cf.phase) + 0.1 * Math.sin(this.t * 27 + cf.phase * 2);
      cf.light.intensity = 7 * f;
      cf.haloMat.opacity = 0.4 * f + 0.12;
      for (const fl of cf.flames) {
        fl.sprite.scale.set(fl.base * 0.62 * (0.9 + 0.2 * f), fl.base * (0.85 + 0.3 * f), 1);
        fl.mat.opacity = 0.7 + 0.25 * f;
      }
    }
    if (this.exitHaloMat) this.exitHaloMat.opacity = 0.45 + 0.12 * Math.sin(this.t * 2);

    // Vacillement du feu de cheminée (chalet).
    if (this.fireplaceFire) {
      const f = 0.8 + 0.15 * Math.sin(this.t * 9 + 1.3) + 0.08 * Math.sin(this.t * 21);
      this.fireplaceFire.light.intensity = 4 * f;
      for (const fl of this.fireplaceFire.flames) {
        fl.sprite.scale.set(fl.base * 0.7 * (0.9 + 0.2 * f), fl.base * (0.85 + 0.3 * f), 1);
        fl.mat.opacity = 0.7 + 0.25 * f;
      }
    }

    // Réveil dans le chalet (caméra qui se relève + fondu paupières).
    if (!this.wakeDone) {
      const T = (this.wakeT += dt);
      const k = smooth(clamp01((T - 0.3) / 2.6));
      game.camera.position.y = lerp(0.6, EYE_HEIGHT, k);
      game.camera.rotation.set(lerp(-0.4, 0, k), this.maze.startYaw, Math.sin(T * 3) * 0.02 * (1 - k));
      game.setFade(eyelid(T));
      if (T >= 3.2) {
        this.wakeDone = true;
        game.inputLocked = false;
        game.setFade(0);
        game.setObjective('Leave the cabin and reach the way out, deep in the forest');
      }
      return;
    }

    // Sortie du chalet : on laisse 1 s au joueur pour sortir AVANT que BONK ne se lance.
    const cell = this.maze.worldToCell(cam.x, cam.z);
    if (!this.chaseTriggered && cell.row <= this.doorRow) {
      this.chaseTriggered = true;
      this.chaseDelay = 1.0; // seconde de répit
    }
    if (this.chaseTriggered && !this.chasing) {
      this.chaseDelay -= dt;
      if (this.chaseDelay <= 0) {
        this.chasing = true;
        this.#startChase(game); // rugissement + BONK sort du chalet et poursuit
      }
    }

    // Zone sûre : à portée d'un feu, BONK ne peut pas attraper (géré par Game via playerSafe).
    let safe = false;
    for (const cf of this.campfires) {
      if (Math.hypot(cam.x - cf.x, cam.z - cf.z) < SAFE_R) {
        safe = true;
        break;
      }
    }
    game.playerSafe = safe;

    // Comportement de BONK : dès que le joueur QUITTE un feu, BONK LE POURSUIT directement
    // (plus de rôdaille), avec des RUÉES plus rapides par intermittence (rugissement). Près
    // d'un feu, il bat en retraite dans la forêt.
    if (this.chasing) {
      if (safe) {
        game.monster.fleeing = true;
        game.monster.rushMult = 1.4; // s'enfuit vivement
        this.lunging = false;
        this.lungeT = 0;
      } else {
        game.monster.fleeing = false; // IL TE COURT DESSUS
        this.lungeT += dt;
        if (!this.lunging && this.lungeT > this.lungeGap) {
          this.lunging = true;
          this.lungeLeft = 1.8;
          this.lungeT = 0;
          game.audio.bonkRoar(); // ruée
        }
        if (this.lunging) {
          game.monster.rushMult = 2.1; // ruée rapide
          this.lungeLeft -= dt;
          if (this.lungeLeft <= 0) {
            this.lunging = false;
            this.lungeGap = 3.5 + Math.random() * 3;
          }
        } else {
          game.monster.rushMult = 1.25; // poursuite soutenue (te rattrape si tu traînes)
        }
      }
      game.setObjective(safe ? 'Safe by the fire — catch your breath' : 'Run to the next fire!');
    }

    // Arrivée à la sortie → niveau suivant (ou victoire si dernier niveau).
    if (this.chaseTriggered && nearCell(cam, this.maze, this.maze.exit, CELL * 0.8)) game.advance();
  }

  #startChase(game) {
    // RUGISSEMENT dès que le joueur sort du chalet (pas de screamer d'entrée).
    game.audio.bonkRoar();
    // BONK surgit DE DERRIÈRE LE CHALET et TE POURSUIT tout de suite (la distance de spawn
    // suffit à ne pas te sauter dessus instantanément).
    game.monster.placeAt(this.#behindChalet());
    game.monster.setVisible(true);
    game.monster.setMode('chase');
    game.monster.fleeing = false;
    game.monster.rushMult = 1.25;
    this.lunging = false;
    this.lungeT = 0;
    this.lungeGap = 3.5;
  }

  // Cellule ouverte au fond du chalet (derrière le joueur) → BONK sort de la cabane.
  #behindChalet() {
    const c = this.door.col;
    for (const r of [this.chalet.r1, this.chalet.r1 - 1, this.door.row]) {
      if (!this.maze.isWall(c, r)) return { col: c, row: r };
    }
    return { col: this.door.col, row: this.door.row };
  }
}

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
