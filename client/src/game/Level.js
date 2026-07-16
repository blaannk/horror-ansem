import * as THREE from 'three';
import { CELL } from '../config.js';
import { MazeRenderer } from './MazeRenderer.js';

// Base class for a level. A level owns its `maze`, a THREE `group` (geometry
// + decor) added to the scene, and drives its own animations/triggers in update().
// The Game calls build() -> enter() -> update(dt), and dispose() on transition.

export class Level {
  constructor() {
    this.group = new THREE.Group();
    this.disposables = [];
    this.maze = null;
    this.monsterMode = 'none'; // none | reveal | chase (chase is placed/activated by Game)
    this.portal = false;
    this.objective = '';
  }

  build(/* game */) {}
  enter(/* game */) {}
  update(/* dt, game */) {}

  // Builds the current maze's render into the level's group.
  buildMazeRenderer() {
    this.renderer = new MazeRenderer(this.maze, { portal: this.portal, exitKind: this.exitKind });
    this.group.add(this.renderer.group);
    this.disposables.push(this.renderer);
  }

  // Places a panel/plane flush against a cell's neighboring wall, facing inward.
  // side: 'north' | 'south' | 'east' | 'west'.
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
