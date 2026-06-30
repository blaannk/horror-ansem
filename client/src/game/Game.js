import * as THREE from 'three';
import { Player } from './Player.js';
import { Monster } from './Monster.js';
import { AudioManager } from './AudioManager.js';
import { Hud } from '../ui/Hud.js';
import { EndScreen } from '../ui/EndScreen.js';
import { LEVELS } from './levels.js';
import { CELL, MONSTER_CATCH_DIST, DETECT_MAX, DETECT_MIN, PLAYER_FAST_FROM, PLAYER_BOOST_MAX } from '../config.js';

const PROX_FAR = CELL * 6;

// Orchestrateur : enchaîne les niveaux (Réveil → Labyrinthe → Terreur → Map finale).
// Ressources partagées (renderer, scène, caméra, joueur, monstre, audio, voix, HUD) ;
// chaque Level fournit son maze + décors et pilote ses propres animations/déclencheurs.

export class Game {
  constructor(container, config, onExitToMenu) {
    this.container = container;
    this.config = config;
    this.onExitToMenu = onExitToMenu;
    this.state = 'ready'; // ready | running | paused | transition | over
    this.inputLocked = false;
    this.started = false;
    this.elapsedMs = 0;
    this.clock = new THREE.Clock();
    this.levelIndex = 0;
    this.level = null;
    this.sanity = clamp01(config.sanityStart ?? 1);

    this.#setupRenderer();
    this.#setupScene();
    this.#setupOverlays();
    this.#setupSanityControl();

    this._onResize = () => this.#resize();
    window.addEventListener('resize', this._onResize);
    this.#loop();
  }

  // ----- API utilisée par les niveaux -----
  setObjective(text) {
    this.hud.setObjective(text);
  }
  setFade(alpha) {
    this.fade.style.opacity = String(alpha);
  }
  flash() {
    this.flashEl.style.opacity = '0.9';
    setTimeout(() => (this.flashEl.style.opacity = '0'), 70);
  }
  advance() {
    if (this.state === 'transition' || this.state === 'over') return;
    const next = this.levelIndex + 1;
    if (next >= LEVELS.length) {
      this.win();
      return;
    }
    this.state = 'transition';
    this.setFade(1);
    setTimeout(() => {
      this.#startLevel(next);
      this.setFade(0); // les niveaux gèrent leur propre noir si besoin (réveil)
      this.state = 'running';
    }, 650);
  }
  win() {
    this.#end(true);
  }
  lose() {
    this.#end(false);
  }

  #setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'game-canvas';
    this.container.appendChild(this.renderer.domElement);
  }

  #setupScene() {
    const cfg = this.config;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    if (cfg.fog) this.scene.fog = new THREE.FogExp2(0x000000, 0.05);

    this.camera = new THREE.PerspectiveCamera(cfg.fov, window.innerWidth / window.innerHeight, 0.1, 1000);

    this.scene.add(new THREE.AmbientLight(0x303040, 0.35));
    this.scene.add(new THREE.HemisphereLight(0x222233, 0x050505, 0.3));

    this.flashlight = new THREE.SpotLight(0xfff0d8, 30, CELL * 7, Math.PI / 5, 0.4, 1.4);
    this.flashTarget = new THREE.Object3D();
    this.scene.add(this.flashlight, this.flashTarget);
    this.flashlight.target = this.flashTarget;

    // Joueur & monstre sans maze : chaque niveau fournit le sien (setMaze).
    this.player = new Player(this.camera, this.renderer.domElement, null, cfg);
    this.monster = new Monster(null, cfg);
    this.scene.add(this.monster.mesh);

    this.audio = new AudioManager(cfg.volume);
    this.hud = new Hud(this.container, cfg);

    this.player.controls.addEventListener('lock', () => this.#onLock());
    this.player.controls.addEventListener('unlock', () => this.#onUnlock());
  }

  #setupOverlays() {
    this.ready = document.createElement('div');
    this.ready.className = 'overlay ready-overlay';
    this.ready.innerHTML = `
      <div class="overlay-box">
        <h2>Ready?</h2>
        <p>Click to lock the mouse. You're about to wake up…</p>
        <button class="btn-primary" data-start>Start</button>
      </div>`;
    this.container.appendChild(this.ready);
    this.ready.querySelector('[data-start]').addEventListener('click', () => this.#begin());

    this.pause = document.createElement('div');
    this.pause.className = 'overlay pause-overlay hidden';
    this.pause.innerHTML = `
      <div class="overlay-box">
        <h2>Paused</h2>
        <button class="btn-primary" data-resume>Resume</button>
        <button class="btn-ghost" data-quit>Back to menu</button>
      </div>`;
    this.container.appendChild(this.pause);
    this.pause.querySelector('[data-resume]').addEventListener('click', () => this.player.controls.lock());
    this.pause.querySelector('[data-quit]').addEventListener('click', () => this.#exitToMenu());

    this.flashEl = document.createElement('div');
    this.flashEl.className = 'cinematic-flash';
    this.container.appendChild(this.flashEl);

    this.fade = document.createElement('div');
    this.fade.className = 'level-fade';
    this.fade.style.opacity = '0';
    this.container.appendChild(this.fade);

    // Screamer plein écran (visage d'Ansem) + gros texte (« RUN »).
    this.screamerEl = document.createElement('div');
    this.screamerEl.className = 'screamer hidden';
    this.screamerEl.innerHTML = '<img src="/monster.png" alt="" />';
    this.container.appendChild(this.screamerEl);

    this.bigTextEl = document.createElement('div');
    this.bigTextEl.className = 'big-text hidden';
    this.container.appendChild(this.bigTextEl);

    // Sous-titre des répliques (accompagne le chuchotement synthétisé).
    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'subtitle hidden';
    this.container.appendChild(this.subtitleEl);

    // Message géant tremblant (fin de décompte).
    this.bigMsgEl = document.createElement('div');
    this.bigMsgEl.className = 'big-message hidden';
    this.container.appendChild(this.bigMsgEl);
  }

  // Message dramatique géant et tremblant (ex. fin du décompte).
  bigMessage(text, ms = 4500) {
    this.bigMsgEl.textContent = text;
    this.bigMsgEl.classList.remove('hidden');
    clearTimeout(this._bigMsgT);
    this._bigMsgT = setTimeout(() => this.bigMsgEl.classList.add('hidden'), ms);
  }

  // ----- Effets scénarisés -----
  // Affiche une réplique en sous-titre (sans bruitage).
  showLine(text, ms = 3200) {
    this.subtitleEl.textContent = text;
    this.subtitleEl.classList.remove('hidden');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => this.subtitleEl.classList.add('hidden'), ms);
  }

  #clearSubtitle() {
    this.subtitleEl?.classList.add('hidden');
  }

  bigText(text, ms = 1600) {
    this.bigTextEl.textContent = text;
    this.bigTextEl.classList.remove('hidden');
    clearTimeout(this._bigTextT);
    this._bigTextT = setTimeout(() => this.bigTextEl.classList.add('hidden'), ms);
  }

  // Jumpscare : visage plein écran + cri ; verrouille l'input, puis affiche « RUN ».
  screamer(onDone) {
    this.inputLocked = true;
    this.screamerEl.classList.remove('hidden');
    this.audio.sting('scream');
    this.flash();
    clearTimeout(this._screamT);
    this._screamT = setTimeout(() => {
      this.screamerEl.classList.add('hidden');
      this.inputLocked = false;
      this.bigText('RUN', 1800);
      onDone?.();
    }, 1100);
  }

  #setupSanityControl() {
    window.escapeBonk = {
      getSanity: () => this.sanity,
      setSanity: (v) => {
        this.sanity = clamp01(Number(v));
        return this.sanity;
      },
    };
    this._onSanityKey = (e) => {
      if (e.key === '[') this.sanity = clamp01(this.sanity - 0.05);
      else if (e.key === ']') this.sanity = clamp01(this.sanity + 0.05);
    };
    document.addEventListener('keydown', this._onSanityKey);
  }

  #begin() {
    this.audio.start();
    this.player.controls.lock();
  }

  #onLock() {
    this.ready.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.audio.resume();
    if (this.state === 'over') return;
    if (!this.started) {
      this.started = true;
      this.#startLevel(0);
      this.state = 'running';
    } else if (this.state === 'paused') {
      this.state = 'running';
    }
  }

  #onUnlock() {
    if (this.state === 'running') {
      this.state = 'paused';
      this.pause.classList.remove('hidden');
      this.audio.suspend();
      this.#clearSubtitle();
    }
  }

  #startLevel(i) {
    if (this.level) {
      this.scene.remove(this.level.group);
      this.level.dispose();
    }
    this.#clearSubtitle();
    this.audio.neonBuzz(false);
    this.audio.keyboardAmbience(false);

    const level = new LEVELS[i]();
    level.build(this);
    this.level = level;
    this.levelIndex = i;
    this.scene.add(level.group);

    this.player.setMaze(level.maze);
    this.monster.setMaze(level.maze);
    if (level.monsterMode === 'chase' && level.maze.spawn) {
      this.monster.placeAt(level.maze.spawn);
      this.monster.setMode('chase');
    } else {
      this.monster.setMode('none');
    }

    this.setObjective(level.objective || '');
    this.inputLocked = false;
    level.enter(this);
  }

  #updateFlashlight() {
    const cam = this.camera;
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    this.flashlight.position.copy(cam.position);
    this.flashTarget.position.copy(cam.position).addScaledVector(forward, 5);
  }

  #computeAudioCues() {
    const cam = this.camera;
    const m = this.monster.position;
    const dist = Math.hypot(m.x - cam.position.x, m.z - cam.position.z);
    const proximity = Math.max(0, Math.min(1, 1 - (dist - MONSTER_CATCH_DIST) / (PROX_FAR - MONSTER_CATCH_DIST)));
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const toM = new THREE.Vector3(m.x - cam.position.x, 0, m.z - cam.position.z);
    if (toM.lengthSq() > 0) toM.normalize();
    const pan = Math.max(-1, Math.min(1, toM.dot(right)));
    return { dist, proximity, pan };
  }

  #loop() {
    this._raf = requestAnimationFrame(() => this.#loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsedSec = this.elapsedMs / 1000;

    if (this.level?.renderer) this.level.renderer.update(dt, elapsedSec);

    if (this.state === 'running') {
      if (!this.inputLocked) this.elapsedMs += dt * 1000;
      this.level.update(dt, this);
      // Haute santé mentale → le joueur devient plus rapide (facile à partir de 80 %).
      this.player.speedMult = playerSpeedMult(this.sanity);
      if (!this.inputLocked) this.player.update(dt);

      this.monster.speedMult = 1 + this.config.sanityFear * (1 - clamp01(this.sanity));
      this.monster.detectRadius = detectRadius(this.sanity);
      this.monster.update(dt, this.camera.position, this.elapsedMs / 1000);
      this.#updateFlashlight();

      let proximity = 0;
      let pan = 0;
      let dist = Infinity;
      if (this.monster.mode === 'chase' || this.monster.mode === 'creep') {
        const cues = this.#computeAudioCues();
        pan = cues.pan;
        dist = cues.dist;
        // Le bruit de chasse (growl, cœur, vignette) ne joue que s'il te TRAQUE :
        // dès qu'il t'a perdu (errance), il se coupe même s'il est encore proche.
        proximity = this.monster.hunting ? cues.proximity : 0;
      }
      this.audio.update(dt, {
        proximity,
        pan,
        playerMoving: this.player.moving,
        playerSprinting: this.player.sprinting,
        monsterMoving: this.monster.moving,
      });
      // Boussole : angle vers la sortie relatif au regard (uniquement quand il y a un portail).
      let exitAngle = null;
      if (this.level.portal) {
        const ex = this.level.maze.cellToWorld(this.level.maze.exit.col, this.level.maze.exit.row);
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        let dx = ex.x - this.camera.position.x;
        let dz = ex.z - this.camera.position.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const ahead = dx * fwd.x + dz * fwd.z;
        const side = dx * -fwd.z + dz * fwd.x; // vecteur droite = (-fwd.z, 0, fwd.x)
        exitAngle = Math.atan2(side, ahead);
      }
      this.hud.update({ elapsedMs: this.elapsedMs, sanity: this.sanity, proximity, exitAngle });

      // Conditions de fin EN DERNIER : ainsi silenceAmbience() (dans #end) n'est pas
      // réécrasé par l'audio.update de cette frame → le son se coupe bien à la capture.
      if (this.monster.mode === 'chase' && dist < MONSTER_CATCH_DIST) {
        this.lose();
      } else if (this.level.portal) {
        const e = this.level.maze.cellToWorld(this.level.maze.exit.col, this.level.maze.exit.row);
        if (Math.hypot(e.x - this.camera.position.x, e.z - this.camera.position.z) < CELL * 0.7) this.win();
      }
    } else {
      this.#updateFlashlight();
    }

    this.renderer.render(this.scene, this.camera);
  }

  #end(won) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.#clearSubtitle();
    this.audio.silenceAmbience(); // coupe le bruit continu quand Ansem t'a eu (ou à l'évasion)
    this.audio.sting(won ? 'win' : 'catch');
    this.audio.update(0, { proximity: 0, pan: 0 });
    if (this.player.controls.isLocked) this.player.controls.unlock();

    new EndScreen(this.container, {
      won,
      timeMs: this.elapsedMs,
      config: this.config,
      onReplay: () => this.#exitToMenu(true),
      onMenu: () => this.#exitToMenu(false),
    });
  }

  #exitToMenu(replay = false) {
    this.destroy();
    this.onExitToMenu(replay);
  }

  #resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('keydown', this._onSanityKey);
    if (window.escapeBonk) delete window.escapeBonk;
    this.#clearSubtitle();
    if (this.level) this.level.dispose();
    this.player.dispose();
    this.audio.dispose();
    this.hud.destroy();
    this.ready.remove();
    this.pause.remove();
    this.flashEl.remove();
    this.fade.remove();
    this.screamerEl.remove();
    this.bigTextEl.remove();
    this.subtitleEl.remove();
    this.bigMsgEl.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// Rayon de détection selon la santé mentale : < 0.5 → max (repère quasi toujours) ;
// 0.5→1 → rétrécit de DETECT_MAX à DETECT_MIN.
function detectRadius(sanity) {
  const s = clamp01(sanity);
  if (s < 0.5) return DETECT_MAX;
  const t = (s - 0.5) / 0.5;
  return DETECT_MAX + (DETECT_MIN - DETECT_MAX) * t;
}

// Vitesse du joueur selon la santé mentale : ×1 jusqu'à PLAYER_FAST_FROM, puis monte
// jusqu'à ×(1 + PLAYER_BOOST_MAX) à 100 % → haute santé = nettement plus facile.
function playerSpeedMult(sanity) {
  const s = clamp01(sanity);
  if (s <= PLAYER_FAST_FROM) return 1;
  const t = (s - PLAYER_FAST_FROM) / (1 - PLAYER_FAST_FROM);
  return 1 + PLAYER_BOOST_MAX * t;
}
