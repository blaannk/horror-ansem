import * as THREE from 'three';
import { Maze } from '../game/Maze.js';
import { MazeRenderer } from '../game/MazeRenderer.js';

// Fond de menu : survol 3D lent d'un vrai labyrinthe (mêmes murs « crypto » que le jeu),
// éclairé par une torche qui suit la caméra, dans un brouillard épais. Par-dessus : des
// « bugs d'écran » (glitch RGB/secousse) et de brefs FLASH du visage d'Ansem.
export class MenuBackground {
  constructor(host) {
    this.host = host; // .landing-fx
    this.root = host.parentElement; // .landing (pour les overlays)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.className = 'menu-bg-canvas';
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0710, 0.03); // brouillard allégé → fond plus visible
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 400);

    this.scene.add(new THREE.AmbientLight(0x3a2e42, 0.85)); // ambiante relevée
    this.torch = new THREE.PointLight(0xff8248, 5, 64, 1.5); // torche plus forte & plus loin
    this.scene.add(this.torch);

    this.maze = new Maze({ generate: { cols: 15, rows: 15, ceil: 5, withMonster: false } });
    this.mr = new MazeRenderer(this.maze, { portal: false });
    this.scene.add(this.mr.group);

    // Trajet = chemin le plus long du labyrinthe (fly-through en va-et-vient).
    const path = this.maze.findPath(this.maze.playerSpawn, this.maze.exit);
    const cells = [this.maze.playerSpawn, ...path];
    this.pts = cells.map((c) => {
      const w = this.maze.cellToWorld(c.col, c.row);
      return new THREE.Vector3(w.x, 1.7, w.z);
    });
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum[i] = this.cum[i - 1] + this.pts[i - 1].distanceTo(this.pts[i]);
    this.len = this.cum[this.cum.length - 1] || 1;
    this.d = 0;
    this.dir = 1;
    this.speed = 3.6;
    this.look = this.#posAt(4).clone();
    this.bob = 0;

    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);

    this.clock = new THREE.Clock();
    this.#loop();
    this.#buildOverlays();
    this.#scheduleGlitch();
  }

  #posAt(d) {
    const c = Math.max(0, Math.min(this.len, d));
    let i = 0;
    while (i < this.pts.length - 2 && this.cum[i + 1] <= c) i++;
    const t = (c - this.cum[i]) / (this.cum[i + 1] - this.cum[i] || 1);
    return this.pts[i].clone().lerp(this.pts[i + 1], t);
  }

  #loop() {
    this._raf = requestAnimationFrame(() => this.#loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.d += this.speed * this.dir * dt;
    if (this.d >= this.len) {
      this.d = this.len;
      this.dir = -1;
    } else if (this.d <= 0) {
      this.d = 0;
      this.dir = 1;
    }
    this.bob += dt;
    const pos = this.#posAt(this.d);
    pos.y = 1.7 + Math.sin(this.bob * 1.8) * 0.06;
    this.camera.position.copy(pos);
    this.torch.position.set(pos.x, pos.y + 0.4, pos.z);
    // Regard vers l'avant (dans le sens du déplacement), lissé.
    const target = this.#posAt(this.d + this.dir * 5);
    this.look.lerp(target, 0.06);
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
  }

  #buildOverlays() {
    this.scan = document.createElement('div');
    this.scan.className = 'menu-scanlines';
    this.root.appendChild(this.scan);

    this.scare = document.createElement('img');
    this.scare.className = 'menu-scare';
    this.scare.src = '/monster.png';
    this.scare.alt = '';
    this.root.appendChild(this.scare);
  }

  #scheduleGlitch() {
    // Plus FRÉQUENT qu'avant (toutes les ~2 à 5,5 s).
    const delay = 2000 + Math.random() * 3500;
    this._glitchT = setTimeout(() => {
      this.#glitch();
      this.#scheduleGlitch();
    }, delay);
  }

  // Bug d'écran + flashs du visage d'Ansem, de DURÉE VARIABLE (parfois de brefs clignotements,
  // parfois il s'attarde plus longtemps à l'écran).
  #glitch() {
    this.root.classList.add('menu-glitching');
    clearTimeout(this._glitchOffT);
    this._glitchOffT = setTimeout(() => this.root.classList.remove('menu-glitching'), 220 + Math.random() * 320);
    // 1 fois sur 3 : apparition SOUTENUE (il reste ~0,6–1,4 s) ; sinon clignotements courts.
    if (Math.random() < 0.34) {
      this.scare.style.opacity = String(0.72 + Math.random() * 0.26);
      clearTimeout(this._flashT);
      this._flashT = setTimeout(() => (this.scare.style.opacity = '0'), 600 + Math.random() * 800);
      return;
    }
    const pulses = 4 + ((Math.random() * 10) | 0); // 4 à 13 clignotements → temps à l'écran varié
    let n = 0;
    const pulse = () => {
      this.scare.style.opacity = n % 2 ? '0' : String(0.65 + Math.random() * 0.3);
      n++;
      if (n < pulses) this._flashT = setTimeout(pulse, 40 + Math.random() * 70);
      else this.scare.style.opacity = '0';
    };
    pulse();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._glitchT);
    clearTimeout(this._glitchOffT);
    clearTimeout(this._flashT);
    window.removeEventListener('resize', this._onResize);
    this.root.classList.remove('menu-glitching');
    this.scan?.remove();
    this.scare?.remove();
    this.mr?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
