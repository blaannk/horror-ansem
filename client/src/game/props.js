import * as THREE from 'three';
import {
  makeBrokenScreenTexture,
  makeChartTexture,
  makeAnsemPosterTexture,
} from './textures.js';

// Fabriques d'objets de décor. Chacune renvoie un Object3D (ou { group, ... }) que le
// niveau positionne et, au besoin, anime (clignotement de néon, pulsation des graphiques,
// glissement de porte). Les ressources sont collectées dans `disposables` du niveau.

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

// Barre de néon au plafond : mesh émissif + PointLight (le niveau fait clignoter `light`).
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

// Écran cassé affichant une phrase.
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

// Panneau graphique crypto qui s'effondre (matériau accessible pour pulser en rouge).
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

// Affiche « RECHERCHÉ » + portrait d'Ansem.
export function ansemPoster() {
  const group = new THREE.Group();
  const posterTex = makeAnsemPosterTexture();
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 3.0),
    new THREE.MeshStandardMaterial({ map: posterTex, emissive: 0x222018, emissiveMap: posterTex, emissiveIntensity: 0.25 })
  );
  group.add(poster);
  // Portrait réel par-dessus l'emplacement.
  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.45),
    new THREE.MeshStandardMaterial({ map: ansemTex(), emissive: 0xffffff, emissiveMap: ansemTex(), emissiveIntensity: 0.35 })
  );
  photo.position.set(0, 0.36, 0.02);
  group.add(photo);
  return { group, posterTex };
}

// Simple cadre photo d'Ansem (pour parsemer les murs).
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

// Porte blindée coulissante (groupe détaillé) ; le niveau anime sa montée à l'ouverture.
// Face avant (vers +Z par défaut) décorée ; le niveau tourne le groupe selon le couloir.
export function door(width, height) {
  const group = new THREE.Group();

  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.7, metalness: 0.5 });

  // Panneau principal.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.45), metal);
  group.add(panel);

  // Cadre (montants + linteau).
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

  // Rainure centrale (deux battants).
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.08, height - fThick * 2, 0.52), dark);
  seam.position.z = 0.01;
  group.add(seam);

  // Bandes de danger jaunes/noires en bas.
  const hazard = new THREE.MeshStandardMaterial({ color: 0xffcf2a, emissive: 0x3a2e00, emissiveIntensity: 0.4, roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(width / 6, 0.5, 0.5), hazard);
    s.position.set((i - 2) * (width / 5.5), -height / 2 + 0.6, 0.02);
    s.rotation.z = 0.5;
    group.add(s);
  }

  // Voyant de verrouillage rouge (passe au vert à l'ouverture).
  const lockMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 1.6 });
  const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), lockMat);
  lock.rotation.x = Math.PI / 2;
  lock.position.set(0, 0.3, 0.26);
  group.add(lock);

  // Gros rivets.
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), dark);
      r.position.set(sx * (width / 2 - 0.6), sy * (height / 2 - 0.7), 0.24);
      group.add(r);
    }

  return { group, lockMat };
}
