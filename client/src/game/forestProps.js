import * as THREE from 'three';
import { CELL } from '../config.js';
import { makeRadialGlowTexture } from './textures.js';

// Object factories for the forest level: campfire (light source + safe zone) and
// a few pieces of furniture for the chalet interior. The level positions/animates (flames, glow).

const WOOD = (c = 0x3a2617) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });

// Campfire: teepee logs + embers + flames (additive sprites) + halo + warm
// PointLight. `flames`, `light`, `haloMat` are animated by the level (flicker).
export function campfire() {
  const group = new THREE.Group();

  const logMat = new THREE.MeshStandardMaterial({
    color: 0x2e1d10,
    roughness: 0.95,
    emissive: 0x2a0d00,
    emissiveIntensity: 0.5,
  });
  const logGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.6, 7);
  for (let i = 0; i < 6; i++) {
    const log = new THREE.Mesh(logGeo, logMat);
    const a = (i / 6) * Math.PI * 2;
    log.position.set(Math.cos(a) * 0.28, 0.35, Math.sin(a) * 0.28);
    log.rotation.z = 0.5;
    log.rotation.y = -a;
    group.add(log);
  }

  // Central embers (self-lit).
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false });
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), emberMat);
  ember.position.y = 0.2;
  ember.scale.y = 0.45;
  group.add(ember);

  // Flames: stacked additive sprites (yellow at the core, orange around).
  const glow = makeRadialGlowTexture();
  const flames = [];
  const flameColors = [0xff7a1a, 0xffb028, 0xffe070];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: glow,
      color: flameColors[i],
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const s = new THREE.Sprite(mat);
    const sc = 2.3 - i * 0.55;
    s.scale.set(sc * 0.62, sc, 1);
    s.position.y = 0.7 + i * 0.32;
    group.add(s);
    flames.push({ sprite: s, mat, base: sc, y: s.position.y });
  }

  // Large diffuse ground halo: visible from afar through the fog (guides the player).
  const haloMat = new THREE.SpriteMaterial({
    map: glow,
    color: 0xff9030,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(7, 7, 1);
  halo.position.y = 1.4;
  group.add(halo);

  const light = new THREE.PointLight(0xff9440, 7, CELL * 4.5, 1.4);
  light.position.y = 1.2;
  group.add(light);

  return { group, light, flames, emberMat, haloMat, mats: [logMat, emberMat, haloMat] };
}

// Low wooden table.
export function chaletTable() {
  const group = new THREE.Group();
  const mat = WOOD(0x43301c);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 1.0), mat);
  top.position.y = 0.9;
  group.add(top);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mat);
    leg.position.set(sx * 0.68, 0.45, sz * 0.4);
    group.add(leg);
  }
  group.userData.mat = mat;
  return group;
}

// Simple chair.
export function chaletChair() {
  const group = new THREE.Group();
  const mat = WOOD(0x3a2817);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), mat);
  seat.position.y = 0.55;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.1), mat);
  back.position.set(0, 0.9, -0.25);
  group.add(back);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.09), mat);
    leg.position.set(sx * 0.24, 0.27, sz * 0.24);
    group.add(leg);
  }
  group.userData.mat = mat;
  return group;
}

// Chalet bed (where you wake up): wood frame + stained mattress + pillow.
// Long axis along X; the level rotates the group depending on the wall.
export function chaletBed() {
  const group = new THREE.Group();
  const frameMat = WOOD(0x2e1f12);
  const fabric = new THREE.MeshStandardMaterial({ color: 0x6a6152, roughness: 1 });
  const dirty = new THREE.MeshStandardMaterial({ color: 0x33271a, roughness: 1 });
  // Frame.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 1.2), frameMat);
  frame.position.y = 0.3;
  group.add(frame);
  // Headboard.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 1.2), frameMat);
  head.position.set(-1.1, 0.5, 0);
  group.add(head);
  // Mattress + pillow.
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 1.05), fabric);
  mattress.position.set(0.05, 0.6, 0);
  group.add(mattress);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.85), dirty);
  pillow.position.set(-0.75, 0.76, 0);
  group.add(pillow);
  group.userData.mats = [frameMat, fabric, dirty];
  return group;
}

// BONK's bowl (Ansem's dog): dented metal bowl with a dried-up leftover.
export function dogBowl() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.5, metalness: 0.6 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.16, 20, 1, true), metal);
  wall.position.y = 0.1;
  group.add(wall);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 20), metal);
  bottom.position.y = 0.02;
  group.add(bottom);
  const gunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a1c0f, roughness: 1 })
  );
  gunk.position.y = 0.05;
  group.add(gunk);
  group.userData.mat = metal;
  return group;
}

// Stack of piled-up logs (near the fireplace).
export function woodPile() {
  const group = new THREE.Group();
  const logMat = WOOD(0x3a2617);
  const geo = new THREE.CylinderGeometry(0.14, 0.15, 1.5, 8);
  let y = 0.16;
  for (let row = 0; row < 3; row++) {
    const count = 3 - row;
    for (let i = 0; i < count; i++) {
      const log = new THREE.Mesh(geo, logMat);
      log.rotation.z = Math.PI / 2;
      log.position.set((Math.random() - 0.5) * 0.08, y, (i - (count - 1) / 2) * 0.33);
      group.add(log);
    }
    y += 0.29;
  }
  group.userData.mat = logMat;
  return group;
}

// Wall shelf with grimy jars/bottles.
export function shelf() {
  const group = new THREE.Group();
  const wood = WOOD(0x2e1f12);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.36), wood);
  group.add(plank);
  for (const sx of [-0.95, 0.95]) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.3), wood);
    br.position.set(sx, -0.2, 0);
    group.add(br);
  }
  const jarCols = [0x3a5a3a, 0x5a3a2a, 0x2a3a5a, 0x4a4a2a, 0x503048];
  for (let i = 0; i < 5; i++) {
    const h = 0.3 + Math.random() * 0.2;
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, h, 10),
      new THREE.MeshStandardMaterial({ color: jarCols[i], roughness: 0.4, transparent: true, opacity: 0.85 })
    );
    jar.position.set(-0.82 + i * 0.41, 0.05 + h / 2, (Math.random() - 0.5) * 0.08);
    group.add(jar);
  }
  return group;
}

// Worn rug on the floor.
export function rug() {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 3.0),
    new THREE.MeshStandardMaterial({ color: 0x5a3226, roughness: 1 })
  );
  outer.rotation.x = -Math.PI / 2;
  group.add(outer);
  const inner = new THREE.Mesh(
    new THREE.PlaneGeometry(3.7, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x36201a, roughness: 1 })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.006;
  group.add(inner);
  return group;
}

// Three-legged stool.
export function stool() {
  const group = new THREE.Group();
  const mat = WOOD(0x3a2817);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 14), mat);
  seat.position.y = 0.55;
  group.add(seat);
  for (const a of [0, 2.094, 4.188]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), mat);
    leg.position.set(Math.cos(a) * 0.18, 0.27, Math.sin(a) * 0.18);
    group.add(leg);
  }
  group.userData.mat = mat;
  return group;
}

// Lantern: small warm light (emissive box + faint PointLight).
export function lantern() {
  const group = new THREE.Group();
  const cage = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.36, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: 0xffb857, emissiveIntensity: 1.4, roughness: 0.6 })
  );
  group.add(cage);
  const light = new THREE.PointLight(0xffb457, 2.2, 9, 1.7);
  group.add(light);
  return { group, light };
}

// Fireplace: stone hearth with an interior fire (emissive + warm light).
export function fireplace() {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 1 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.4), stone);
  back.position.set(0, 1.3, 0);
  group.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 1.2), stone);
    side.position.set(sx * 1.0, 1.3, 0.6);
    group.add(side);
  }
  const mantle = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 1.4), stone);
  mantle.position.set(0, 2.75, 0.5);
  group.add(mantle);
  // Logs + embers in the hearth.
  const logMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.95, emissive: 0x2a0d00, emissiveIntensity: 0.5 });
  const logGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.1, 6);
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.z = Math.PI / 2;
    log.position.set((i - 1) * 0.28, 0.2, 0.4);
    group.add(log);
  }
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a12, toneMapped: false });
  const ember = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), emberMat);
  ember.position.set(0, 0.3, 0.4);
  group.add(ember);

  // Flames: additive sprites (like the campfire), much nicer than a cube.
  const glow = makeRadialGlowTexture();
  const flames = [];
  const cols = [0xff7a1a, 0xffb028, 0xffe070];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: glow,
      color: cols[i],
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const sp = new THREE.Sprite(mat);
    const sc = 1.5 - i * 0.35;
    sp.scale.set(sc * 0.7, sc, 1);
    sp.position.set((i - 1) * 0.26, 0.55 + i * 0.22, 0.4);
    group.add(sp);
    flames.push({ sprite: sp, mat, base: sc, y: sp.position.y });
  }
  const light = new THREE.PointLight(0xff8a3a, 4, 12, 1.6);
  light.position.set(0, 0.9, 0.7);
  group.add(light);
  return { group, light, flames, logGeo, mats: [stone, logMat, emberMat] };
}
