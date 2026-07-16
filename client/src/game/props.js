import * as THREE from 'three';
import { CELL } from '../config.js';
import {
  makeBrokenScreenTexture,
  makeChartTexture,
  makeAnsemPosterTexture,
  makeRadialGlowTexture,
  makeExitSignTexture,
  makeHideHintTexture,
  makeClawMarksTexture,
} from './textures.js';

// Factories for decor objects. Each returns an Object3D (or { group, ... }) that the
// level positions and, if needed, animates (neon flicker, chart pulsing,
// door sliding). Resources are collected in the level's `disposables`.

const ansemTex = (() => {
  let tex = null;
  return () => {
    if (!tex) {
      tex = new THREE.TextureLoader().load('/monster.png');
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }
    return tex;
  };
})();

const pepeTex = (() => {
  let tex = null;
  return () => {
    if (!tex) {
      tex = new THREE.TextureLoader().load('/pepe.png');
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }
    return tex;
  };
})();

// PEPE coin = key to collect in the maze. Neon billboard (Sprite): double radial
// additive halo + spinning neon ring (self-lit torus) + pulsing green PointLight, to really
// pop in the dark. The level positions the `group`, animates it (float/rotation +
// neon pulse), and hides it once picked up.
const NEON_GREEN = 0x8dff5a;
export function pepeCoin() {
  const group = new THREE.Group();
  const glowTex = makeRadialGlowTexture();

  // Large soft diffuse glow (additive) + a tighter, brighter halo just behind it.
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: NEON_GREEN,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(3.2, 3.2, 1);

  const haloMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xd8ffbf,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(1.7, 1.7, 1);

  // Neon ring (self-lit, unaffected by lights) that spins around the coin.
  const ringMat = new THREE.MeshBasicMaterial({ color: NEON_GREEN, fog: true, toneMapped: false });
  const ringGeo = new THREE.TorusGeometry(0.72, 0.055, 10, 40);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2.4;

  const tex = pepeTex();
  const mat = new THREE.SpriteMaterial({ map: tex, fog: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.15, 1.15, 1);

  group.add(glow, halo, ring, sprite);

  const light = new THREE.PointLight(0x9bff5a, 2.6, CELL * 4, 1.7);
  group.add(light);

  return { group, tex, mat, haloMat, glowMat, halo, glow, ring, ringMat, ringGeo, sprite, light };
}

// Emissive "EXIT down" sign mounted on the wall facing the exit hole.
export function exitSign() {
  const tex = makeExitSignTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 1.1,
    transparent: true,
    roughness: 0.8,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), mat);
  return { mesh, mat, tex };
}

// Emissive "HIDE" sign for the spawn room (explains the hiding mechanic: corner + flashlight off).
export function hideHintPanel() {
  const tex = makeHideHintTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.95,
    roughness: 0.85,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.9), mat);
  return { mesh, mat, tex };
}

// Ceiling neon bar: emissive mesh + PointLight (the level makes `light` flicker).
export function neonFixture(color = 0xcfe8ff) {
  const group = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({
    color: 0x20242a,
    emissive: color,
    emissiveIntensity: 1.6,
  });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.4), barMat);
  group.add(bar);
  const light = new THREE.PointLight(color, 14, 22, 1.6);
  light.position.y = -0.2;
  group.add(light);
  return { group, light, barMat };
}

// Broken screen displaying a phrase.
export function brokenScreen(text = 'Buy the dip.') {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 1.9, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.7 })
  );
  group.add(frame);
  const tex = makeBrokenScreenTexture(text);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 1.1,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.7), mat);
  screen.position.z = 0.09;
  group.add(screen);
  return { group, mat, tex };
}

// Crashing crypto chart panel (material exposed so it can pulse red).
export function chartPanel() {
  const tex = makeChartTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xff2a1a,
    emissiveMap: tex,
    emissiveIntensity: 0.5,
    roughness: 0.8,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), mat);
  return { mesh, mat, tex };
}

// "WANTED" poster + Ansem's portrait.
export function ansemPoster() {
  const group = new THREE.Group();
  const posterTex = makeAnsemPosterTexture();
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 3.0),
    new THREE.MeshStandardMaterial({ map: posterTex, emissive: 0x222018, emissiveMap: posterTex, emissiveIntensity: 0.25 })
  );
  group.add(poster);
  // Actual portrait placed over the slot.
  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.45),
    new THREE.MeshStandardMaterial({ map: ansemTex(), emissive: 0xffffff, emissiveMap: ansemTex(), emissiveIntensity: 0.35 })
  );
  photo.position.set(0, 0.36, 0.02);
  group.add(photo);
  return { group, posterTex };
}

// Simple photo frame of Ansem (to scatter across the walls).
export function photoFrame(size = 1.2) {
  const group = new THREE.Group();
  const border = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.12, size * 1.12),
    new THREE.MeshStandardMaterial({ color: 0x14110a })
  );
  group.add(border);
  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: ansemTex(), emissive: 0xffffff, emissiveMap: ansemTex(), emissiveIntensity: 0.3 })
  );
  photo.position.z = 0.01;
  group.add(photo);
  return group;
}

// Claw marks laid over a wall (transparent plane). Place with placeWallDecal.
// The level collects `mat` and `tex` for disposal. Each call varies via the seed.
export function clawMarks(w = 2.6, h = 2.6, seed = 0) {
  const tex = makeClawMarksTexture(seed);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return { mesh, mat, tex };
}

// Filthy desk (level 1): top + drawer unit + legs. Returns a Group ready to position.
export function deskProp() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2b2117, roughness: 0.85 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.95), wood);
  top.position.y = 0.92;
  group.add(top);
  // Drawer unit on the right side.
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.82, 0.9), wood);
  box.position.set(0.6, 0.45, 0);
  group.add(box);
  for (const [x, z] of [[-0.9, -0.4], [-0.9, 0.4]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), wood);
    leg.position.set(x, 0.45, z);
    group.add(leg);
  }
  group.userData.mat = wood;
  return group;
}

// Simple office chair (level 1). Can be tipped over by the level (rotation.z).
export function chairProp() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.7, metalness: 0.2 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.58), mat);
  seat.position.y = 0.52;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.09), mat);
  back.position.set(0, 0.86, -0.25);
  group.add(back);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), mat);
  stem.position.y = 0.26;
  group.add(stem);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 5), mat);
  base.position.y = 0.03;
  group.add(base);
  group.userData.mat = mat;
  return group;
}

// Stained mattress on the floor (level 1) - the player "wakes up" here.
export function mattressProp() {
  const group = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color: 0x6a6353, roughness: 1 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 1.2), fabric);
  pad.position.y = 0.14;
  group.add(pad);
  // Dark stains (rings) on top.
  const stainMat = new THREE.MeshStandardMaterial({ color: 0x2c2113, roughness: 1 });
  for (const [x, z, r] of [[-0.4, 0.1, 0.42], [0.5, -0.2, 0.3]]) {
    const stain = new THREE.Mesh(new THREE.CircleGeometry(r, 16), stainMat);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(x, 0.29, z);
    group.add(stain);
  }
  group.userData.mats = [fabric, stainMat];
  return group;
}

// Old dead CRT monitor (yellowed beige) - placed tipped over on a desk/the floor.
export function crtMonitor() {
  const group = new THREE.Group();
  const beige = new THREE.MeshStandardMaterial({ color: 0x8a835f, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.95), beige);
  body.position.y = 0.4;
  group.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.3, metalness: 0.2 })
  );
  screen.position.set(0, 0.42, 0.481);
  group.add(screen);
  group.userData.mat = beige;
  return group;
}

// Filing cabinet with drawers, set along a wall.
export function filingCabinet() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x3c4147, roughness: 0.6, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.7), metal);
  body.position.y = 0.8;
  group.add(body);
  const handle = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.44, 0.04), handle);
    face.position.set(0, 0.35 + i * 0.5, 0.36);
    group.add(face);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), metal);
    knob.position.set(0, 0.35 + i * 0.5, 0.39);
    group.add(knob);
  }
  group.userData.mats = [metal, handle];
  return group;
}

// Scattered trash: cans, a bottle, crumpled paper (small group placed on the floor).
export function trashClutter() {
  const group = new THREE.Group();
  const canMat = new THREE.MeshStandardMaterial({ color: 0x7a6a3a, roughness: 0.5, metalness: 0.5 });
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xb8b09a, roughness: 1 });
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0x25402c, roughness: 0.4, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 4; i++) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10), canMat);
    can.rotation.z = Math.PI / 2;
    can.position.set((Math.random() - 0.5) * 1.4, 0.06, (Math.random() - 0.5) * 1.2);
    can.rotation.y = Math.random() * Math.PI;
    group.add(can);
  }
  for (let i = 0; i < 3; i++) {
    const wad = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), paperMat);
    wad.position.set((Math.random() - 0.5) * 1.5, 0.09, (Math.random() - 0.5) * 1.3);
    wad.scale.set(1, 0.8, 1);
    group.add(wad);
  }
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.34, 10), bottleMat);
  bottle.rotation.z = Math.PI / 2.2;
  bottle.position.set(0.4, 0.08, 0.3);
  group.add(bottle);
  group.userData.mats = [canMat, paperMat, bottleMat];
  return group;
}

// Golden trophy (final room): cup + handles + base, emissive gold, glowing halo.
// The level animates rotation/pulsing via `group` and `mat`.
export function trophyProp() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffcf4a,
    emissive: 0xffa520,
    emissiveIntensity: 0.6,
    roughness: 0.25,
    metalness: 0.95,
  });
  // Cup (bowl) + neck + base.
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.28, 0.55, 20), gold);
  bowl.position.y = 1.35;
  group.add(bowl);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 12), gold);
  neck.position.y = 1.0;
  group.add(neck);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), gold);
  knob.position.y = 0.86;
  group.add(knob);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.18, 20), gold);
  foot.position.y = 0.7;
  group.add(foot);
  // Handles (cut torus -> side half-rings).
  for (const sx of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 10, 20, Math.PI), gold);
    handle.position.set(sx * 0.48, 1.4, 0);
    handle.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(handle);
  }
  // Glowing halo + warm point light.
  const glowMat = new THREE.SpriteMaterial({
    map: makeRadialGlowTexture(),
    color: 0xffd66a,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(4, 4, 1);
  glow.position.y = 1.35;
  group.add(glow);
  const light = new THREE.PointLight(0xffcf7a, 3, 14, 1.6);
  light.position.set(0, 1.8, 0);
  group.add(light);
  return { group, mat: gold, glowMat, light };
}

// Sliding armored door (detailed group); the level animates it sliding up to open.
// Front face (facing +Z by default) is decorated; the level rotates the group to match the corridor.
export function door(width, height) {
  const group = new THREE.Group();

  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.7, metalness: 0.5 });

  // Main panel.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.45), metal);
  group.add(panel);

  // Frame (uprights + lintel).
  const frameMat = dark;
  const fThick = 0.35;
  for (const [w, h, x, y] of [
    [width, fThick, 0, height / 2 - fThick / 2],
    [width, fThick, 0, -height / 2 + fThick / 2],
    [fThick, height, -width / 2 + fThick / 2, 0],
    [fThick, height, width / 2 - fThick / 2, 0],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), frameMat);
    bar.position.set(x, y, 0);
    group.add(bar);
  }

  // Center seam (two panels).
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.08, height - fThick * 2, 0.52), dark);
  seam.position.z = 0.01;
  group.add(seam);

  // Yellow/black hazard stripes at the bottom.
  const hazard = new THREE.MeshStandardMaterial({ color: 0xffcf2a, emissive: 0x3a2e00, emissiveIntensity: 0.4, roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(width / 6, 0.5, 0.5), hazard);
    s.position.set((i - 2) * (width / 5.5), -height / 2 + 0.6, 0.02);
    s.rotation.z = 0.5;
    group.add(s);
  }

  // Red lock indicator light (turns green when opened).
  const lockMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 1.6 });
  const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), lockMat);
  lock.rotation.x = Math.PI / 2;
  lock.position.set(0, 0.3, 0.26);
  group.add(lock);

  // Large rivets.
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), dark);
      r.position.set(sx * (width / 2 - 0.6), sy * (height / 2 - 0.7), 0.24);
      group.add(r);
    }

  return { group, lockMat };
}
