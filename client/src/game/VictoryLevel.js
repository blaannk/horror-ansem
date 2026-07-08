import * as THREE from 'three';
import { CELL } from '../config.js';
import { Maze } from './Maze.js';
import { Level } from './Level.js';
import { VICTORY_LAYOUT } from './mapData.js';
import { makeMachinePanelTexture, makeCeilingTexture } from './textures.js';
import { trophyProp } from './props.js';

// =============================================================
// Salle finale — LA SORTIE : après avoir traversé le portail du niveau 3, le joueur arrive dans
// une pièce SPHÉRIQUE (même skin « machine » que le niveau 3 mais bien éclairée), avec un trophée
// sur un piédestal au centre. Interagir (E) avec le trophée termine le jeu (écran de victoire).
// =============================================================
export class VictoryLevel extends Level {
  build() {
    this.maze = new Maze(VICTORY_LAYOUT);
    this.monsterMode = 'none';
    this.portal = false;
    this.feasibleSanity = 0; // aucun danger ici
    this.objective = '';

    const g = this.group;
    const center = this.maze.cellToWorld(4, 4); // centre de la pièce
    this.center = center;

    // Coque sphérique (skin « machine » du niveau 3, éclaircie), vue de l'intérieur.
    const wallTex = makeMachinePanelTexture();
    const sphereMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0x8a8f98, roughness: 0.8, metalness: 0.4, side: THREE.BackSide });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(26, 40, 30), sphereMat);
    sphere.position.set(center.x, 4, center.z);
    g.add(sphere);
    this.track(sphereMat, sphere.geometry);

    // Sol clair.
    const floorTex = makeCeilingTexture();
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x6a6e76, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, 0.02, center.z);
    g.add(floor);
    this.track(floorTex, floorMat, floor.geometry);

    // Piédestal + trophée au centre.
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.5 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.2, 24), pedMat);
    ped.position.set(center.x, 0.6, center.z);
    g.add(ped);
    this.track(pedMat, ped.geometry);
    const tr = trophyProp();
    tr.group.position.set(center.x, 1.2, center.z);
    g.add(tr.group);
    this.trophy = tr;
    this.trophyPos = { x: center.x, z: center.z };

    // Éclairage vif (contraste avec la pénombre du niveau 3).
    const key = new THREE.PointLight(0xfff0d8, 3, 60, 1.4);
    key.position.set(center.x, 12, center.z);
    g.add(key);
    const fill1 = new THREE.PointLight(0x9fd0ff, 1.5, 50, 1.6);
    fill1.position.set(center.x + 10, 6, center.z + 10);
    g.add(fill1);
    const fill2 = new THREE.PointLight(0xffd0a0, 1.5, 50, 1.6);
    fill2.position.set(center.x - 10, 6, center.z - 8);
    g.add(fill2);

    this.t = 0;
    this.done = false;
  }

  enter(game) {
    // Réinitialise la pénombre héritée du niveau 3 : pièce CLAIRE, sans brouillard épais.
    game.scene.background = new THREE.Color(0x14161c);
    game.scene.fog = new THREE.FogExp2(0x14161c, 0.012);
    game.scene.traverse((o) => {
      if (o.isAmbientLight) o.intensity = 0.6;
      if (o.isHemisphereLight) o.intensity = 0.5;
    });
    game.monster.setMode('none');
    game.monster.setVisible(false);
    game.setObjective('You made it out. Claim your prize — press E at the trophy.');
  }

  update(dt) {
    this.t += dt;
    if (this.trophy) {
      this.trophy.group.rotation.y += dt * 0.6;
      const pulse = 0.5 + Math.abs(Math.sin(this.t * 1.5)) * 0.5;
      this.trophy.mat.emissiveIntensity = 0.4 + pulse * 0.5;
      if (this.trophy.glowMat) this.trophy.glowMat.opacity = 0.45 + pulse * 0.3;
      if (this.trophy.light) this.trophy.light.intensity = 2.5 + pulse * 1.5;
    }
  }

  // Interaction « E » sur le trophée → fin du jeu.
  onInteract(game) {
    if (this.done) return;
    const cam = game.camera.position;
    if (Math.hypot(this.trophyPos.x - cam.x, this.trophyPos.z - cam.z) > CELL * 1.3) return;
    this.done = true;
    game.bigMessage?.('YOU ESCAPED ANSEM', 2600);
    game.inputLocked = true;
    setTimeout(() => game.win(), 2200);
  }
}
