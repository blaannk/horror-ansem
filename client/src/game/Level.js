import * as THREE from 'three';
import { CELL } from '../config.js';
import { MazeRenderer } from './MazeRenderer.js';

// Classe de base d'un niveau. Un niveau possède son `maze`, un `group` THREE (géométrie
// + décors) ajouté à la scène, et pilote ses propres animations/déclencheurs dans update().
// Le Game appelle build() → enter() → update(dt) et dispose() à la transition.

export class Level {
  constructor() {
    this.group = new THREE.Group();
    this.disposables = [];
    this.maze = null;
    this.monsterMode = 'none'; // none | reveal | chase (chase est placé/activé par Game)
    this.portal = false;
    this.objective = '';
  }

  build(/* game */) {}
  enter(/* game */) {}
  update(/* dt, game */) {}

  // Construit le rendu du labyrinthe courant dans le group du niveau.
  buildMazeRenderer() {
    this.renderer = new MazeRenderer(this.maze, { portal: this.portal, exitKind: this.exitKind });
    this.group.add(this.renderer.group);
    this.disposables.push(this.renderer);
  }

  // Place un panneau/plan plaqué contre le mur voisin d'une cellule, face à l'intérieur.
  // side : 'north' | 'south' | 'east' | 'west'.
  placeWallDecal(obj, col, row, side, { y = 2.2, offset = 0.06 } = {}) {
    const { x, z } = this.maze.cellToWorld(col, row);
    const h = CELL / 2;
    if (side === 'west') {
      obj.position.set(x - h + offset, y, z);
      obj.rotation.y = Math.PI / 2;
    } else if (side === 'east') {
      obj.position.set(x + h - offset, y, z);
      obj.rotation.y = -Math.PI / 2;
    } else if (side === 'north') {
      obj.position.set(x, y, z - h + offset);
      obj.rotation.y = 0;
    } else {
      obj.position.set(x, y, z + h - offset);
      obj.rotation.y = Math.PI;
    }
    this.group.add(obj);
  }

  track(...objs) {
    for (const o of objs) if (o) this.disposables.push(o);
  }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose?.());
      }
    });
  }
}
