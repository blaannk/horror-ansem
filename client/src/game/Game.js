import * as THREE from 'three';
import { Player } from './Player.js';
import { Monster } from './Monster.js';
import { AudioManager } from './AudioManager.js';
import { Hud } from '../ui/Hud.js';
import { EndScreen } from '../ui/EndScreen.js';
import { LEVELS } from './levels.js';
import { chapterReached, bumpLocalMaxChapter } from './progress.js';
import { TouchControls, isTouchDevice } from './TouchControls.js';
import {
  CELL,
  MONSTER_CATCH_DIST,
  DETECT_MAX,
  DETECT_MIN,
  PLAYER_FAST_FROM,
  PLAYER_BOOST_MAX,
  COMPASS_SANITY,
  MINIMAP_SANITY,
  saveConfig,
} from '../config.js';

const PROX_FAR = CELL * 6;

// Orchestrator: chains the levels together (Wake up -> Maze -> Terror -> Final map).
// Shared resources (renderer, scene, camera, player, monster, audio, voice, HUD);
// each Level provides its own maze + scenery and drives its own animations/triggers.

export class Game {
  constructor(container, config, onExitToMenu, startIndex = 0) {
    this.container = container;
    this.config = config;
    this.onExitToMenu = onExitToMenu;
    this.startIndex = Math.max(0, Math.min(LEVELS.length - 1, startIndex | 0)); // starting level (menu selection)
    this.isTouch = isTouchDevice(); // mobile: touch controls + forced landscape, no pointer-lock
    this.state = 'ready'; // ready | running | paused | transition | over
    this.inputLocked = false;
    this.started = false;
    this.runToken = null; // signed anti-cheat token, obtained when the run starts
    this.elapsedMs = 0;
    this.clock = new THREE.Clock();
    this.levelIndex = 0;
    this.level = null;
    // Sanity: driven ONLY by the server (the token's on-chain market cap), read
    // continuously via /api/global/sanity. The player can no longer modify it. Starting value
    // is 1 until the first fetch completes (overwritten as soon as the first sync happens).
    this.sanity = 1;

    // Objectives / mechanics for level 1.
    this.keysCollected = 0;
    this.keysTotal = 0;
    this.flashlightOn = true;
    this.playerHidden = false; // hidden in a corner, flashlight off, not moving
    this.playerSafe = false; // within range of a campfire (forest) -> cannot be hunted
    this._fall = null; // state of the falling animation (hole -> forest)
    this._ambientScreamT = 18; // timer for ambient screams (per level)

    this.#setupRenderer();
    this.#setupScene();
    this.#setupOverlays();
    this.#setupSanityControl();
    this.#setupTouch();

    this._onResize = () => this.#resize();
    window.addEventListener('resize', this._onResize);
    this.#loop();
  }

  // ----- API used by the levels -----
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
      this.setFade(0); // levels handle their own fade-to-black if needed (waking up)
      this.state = 'running';
    }, 650);
  }
  win() {
    this.#end(true);
  }
  lose() {
    this.#end(false);
  }

  // Cinematic fall into the exit hole: locks input, plunges the camera down with
  // acceleration + fade to black + whoosh, then runs onDone (typically advance()).
  fallThrough(onDone) {
    if (this._fall || this.state === 'over') return;
    this.inputLocked = true;
    this.audio.silenceAmbience();
    this.audio.fallWhoosh();
    // Freeze the mouse during the cinematic so it doesn't interfere with the scripted camera.
    if (this.player.controls) this.player.controls.enabled = false;
    // Target = center of the hole (to plunge INTO the pit, not through the floor).
    const cam = this.camera.position;
    let hx = cam.x;
    let hz = cam.z;
    const ex = this.level?.maze?.exit;
    if (ex) {
      const w = this.level.maze.cellToWorld(ex.col, ex.row);
      hx = w.x;
      hz = w.z;
    }
    this._fall = { t: 0, dur: 1.7, sx: cam.x, sz: cam.z, sy: cam.y, hx, hz, onDone, done: false };
  }

  #updateFall(dt) {
    const f = this._fall;
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    const cam = this.camera;
    // Phase A (0->0.22): slide above the hole while the view tilts downward.
    const sRaw = clamp01(k / 0.22);
    const slide = sRaw * sRaw * (3 - 2 * sRaw);
    cam.position.x = f.sx + (f.hx - f.sx) * slide;
    cam.position.z = f.sz + (f.hz - f.sz) * slide;
    cam.rotation.x = -1.35 * slide; // looking almost straight down into the hole
    // Phase B: accelerating plunge into the pit + spin.
    const plunge = k <= 0.22 ? 0 : (k - 0.22) / 0.78;
    cam.position.y = f.sy - plunge * plunge * 26;
    cam.rotation.z += dt * 3.2;
    this.setFade(clamp01((k - 0.35) / 0.4)); // fade to black before reaching the bottom
    if (k >= 1 && !f.done) {
      f.done = true;
      const cb = f.onDone;
      this._fall = null;
      if (this.player.controls) this.player.controls.enabled = true;
      cam.rotation.set(0, cam.rotation.y, 0);
      cb?.();
    }
  }

  // Picking up a PEPE key: once all are collected, the exit (the hole) activates.
  // Silent level: keeps the sound + the HUD counter, but NO text announcement.
  collectKey() {
    this.keysCollected++;
    this.audio.coinPickup();
    this.hud.setKeys(this.keysCollected, this.keysTotal);
    if (this.keysCollected >= this.keysTotal) {
      this.setPortalActive(true); // activates the hole (no announcement)
    }
  }

  // Visually and logically activates/deactivates the exit portal.
  setPortalActive(active) {
    if (this.level) this.level.portalActive = active;
    this.level?.renderer?.setPortalActive?.(active);
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

    // Player & monster without a maze: each level provides its own (setMaze).
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
        <p>${
          this.isTouch
            ? 'Tap Start (landscape). You’re about to wake up…'
            : 'Click to lock the mouse. You’re about to wake up…'
        }</p>
        <button class="btn-primary" data-start>Start</button>
      </div>`;
    this.container.appendChild(this.ready);
    this.ready.querySelector('[data-start]').addEventListener('click', () => this.#begin());

    this.pause = document.createElement('div');
    this.pause.className = 'overlay pause-overlay hidden';
    this.pause.innerHTML = `
      <div class="overlay-box">
        <h2>Paused</h2>
        <div class="pause-slider">
          <label>Volume: <span data-volume-val>80%</span></label>
          <input type="range" min="0" max="100" step="1" value="80" data-volume-slider />
        </div>
        <button class="btn-primary" data-resume>Resume</button>
        <button class="btn-ghost" data-quit>Back to menu</button>
      </div>`;
    this.container.appendChild(this.pause);
    this.pause.querySelector('[data-resume]').addEventListener('click', () => {
      if (this.isTouch) this.#activateTouch();
      else this.player.controls.lock();
    });
    this.pause.querySelector('[data-quit]').addEventListener('click', () => this.#exitToMenu());

    // Master volume slider - persisted via config.
    this.volumeSlider = this.pause.querySelector('[data-volume-slider]');
    this.volumeValEl = this.pause.querySelector('[data-volume-val]');
    this.volumeSlider.value = String(Math.round(clamp01(this.config.volume ?? 0.8) * 100));
    this.volumeValEl.textContent = `${this.volumeSlider.value}%`;
    this.volumeSlider.addEventListener('input', () => {
      const v = clamp01(Number(this.volumeSlider.value) / 100);
      this.config.volume = v;
      this.audio.setVolume(v);
      this.volumeValEl.textContent = `${Math.round(v * 100)}%`;
      saveConfig(this.config);
    });

    this.flashEl = document.createElement('div');
    this.flashEl.className = 'cinematic-flash';
    this.container.appendChild(this.flashEl);

    this.fade = document.createElement('div');
    this.fade.className = 'level-fade';
    this.fade.style.opacity = '0';
    this.container.appendChild(this.fade);

    // Full-screen screamer (Ansem's face) + big text ("RUN").
    this.screamerEl = document.createElement('div');
    this.screamerEl.className = 'screamer hidden';
    this.screamerEl.innerHTML = '<img src="/monster.png" alt="" />';
    this.container.appendChild(this.screamerEl);

    this.bigTextEl = document.createElement('div');
    this.bigTextEl.className = 'big-text hidden';
    this.container.appendChild(this.bigTextEl);

    // Line subtitle (accompanies the synthesized whisper).
    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'subtitle hidden';
    this.container.appendChild(this.subtitleEl);

    // Giant shaking message (end of countdown).
    this.bigMsgEl = document.createElement('div');
    this.bigMsgEl.className = 'big-message hidden';
    this.container.appendChild(this.bigMsgEl);
  }

  // Giant dramatic shaking message (e.g. end of countdown).
  bigMessage(text, ms = 4500) {
    this.bigMsgEl.textContent = text;
    this.bigMsgEl.classList.remove('hidden');
    clearTimeout(this._bigMsgT);
    this._bigMsgT = setTimeout(() => this.bigMsgEl.classList.add('hidden'), ms);
  }

  // ----- Scripted effects -----
  // Displays a line as a subtitle (no sound effect).
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

  // Jumpscare: full-screen face + scream; locks input, then displays "RUN".
  screamer(onDone) {
    this.inputLocked = true;
    this.screamerEl.classList.remove('hidden');
    this.audio.ansemScream();
    this.flash();
    clearTimeout(this._screamT);
    this._screamT = setTimeout(() => {
      this.screamerEl.classList.add('hidden');
      this.inputLocked = false;
      onDone?.();
    }, 1100);
  }


  #setupSanityControl() {
    // Sanity is computed SERVER-SIDE (the token's on-chain market cap) and read
    // continuously. The player can no longer modify it: exposed as READ-ONLY (debug/console).
    window.escapeAnsem = {
      getSanity: () => this.sanity,
    };
    this.#startSanitySync();

    // Flashlight (F). The compass is no longer a key: it activates on its own at low sanity.
    this._onAbilityKey = (e) => {
      if (this.state !== 'running' || this.inputLocked) return;
      const k = (e.key || '').toLowerCase();
      if (k === 'f') this.#toggleFlashlight();
      else if (k === 'e') this.level?.onInteract?.(this); // interaction (button, trophy...)
    };
    document.addEventListener('keydown', this._onAbilityKey);
  }

  // Syncs sanity from the server (single source: the token's market cap).
  // Immediate first fetch, then every 10s. Offline -> keeps the last known value.
  #startSanitySync() {
    const pull = async () => {
      try {
        const res = await fetch('/api/global/sanity?limit=2');
        if (!res.ok) return;
        const { sanity } = await res.json();
        const v = Number(sanity);
        if (Number.isFinite(v)) this.sanity = clamp01(v);
      } catch {
        /* network unavailable: keep the last known value */
      }
    };
    pull();
    this._sanitySyncT = setInterval(pull, 10_000);
  }

  // Requests a signed run token from the server right at the start of the game (anti-cheat
  // for the leaderboard). The timer (elapsedMs) starts at the same instant -> the server can
  // verify temporal consistency. Offline: no token -> the run won't be ranked.
  #requestRunToken() {
    this.runToken = null;
    fetch('/api/run/start', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.token) this.runToken = data.token;
      })
      .catch(() => {
        /* network unavailable: run not ranked */
      });
  }

  #toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.hud.setFlashlight(this.flashlightOn);
  }
  // Public passthrough (touch button).
  toggleFlashlight() {
    this.#toggleFlashlight();
  }

  // ----- Touch (mobile) -----
  #setupTouch() {
    if (!this.isTouch) return;
    document.body.classList.add('touch-mode');
    this.touch = new TouchControls(this.container, {
      camera: this.camera,
      player: this.player,
      onFlashlight: () => this.#toggleFlashlight(),
      onPause: () => this.#pauseTouch(),
    });
    // Prompt to switch to landscape (portrait -> blocking overlay, driven by CSS).
    this.rotateEl = document.createElement('div');
    this.rotateEl.className = 'rotate-prompt';
    this.rotateEl.innerHTML = '<div>📱↻<br/>Rotate your device<br/><span>landscape only</span></div>';
    this.container.appendChild(this.rotateEl);
  }

  // Starts/resumes the game on touch (without pointer-lock): equivalent of #onLock.
  #activateTouch() {
    this.ready.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.audio.resume();
    if (this.state === 'over') return;
    if (!this.started) {
      this.started = true;
      this.#requestRunToken();
      this.#startLevel(this.startIndex);
      this.state = 'running';
    } else if (this.state === 'paused') {
      this.state = 'running';
    }
    this.player.touchMode = true;
    this.touch?.setVisible(true);
  }

  #pauseTouch() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.pause.classList.remove('hidden');
    this.audio.suspend();
    this.#clearSubtitle();
    this.player.touchMode = false;
    this.touch?.setVisible(false);
  }

  // Fullscreen + landscape lock (Android). iOS ignores the lock -> the CSS overlay takes over.
  #enterLandscape() {
    try {
      const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      Promise.resolve(p)
        .then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }

  #checkOrientation() {
    if (!this.isTouch || !this.started) return;
    const portrait = window.matchMedia?.('(orientation: portrait)').matches;
    if (portrait && this.state === 'running') this.#pauseTouch();
  }

  #begin() {
    this.audio.start();
    if (this.isTouch) {
      this.#enterLandscape();
      this.#activateTouch();
    } else {
      this.player.controls.lock();
    }
  }

  #onLock() {
    this.ready.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.audio.resume();
    if (this.state === 'over') return;
    if (!this.started) {
      this.started = true;
      this.#requestRunToken();
      this.#startLevel(this.startIndex);
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
    // Cuts transient sounds from the previous level (music is handled track-aware further below).
    this.audio.silenceTransients();

    const level = new LEVELS[i]();
    level.build(this);
    this.level = level;
    // Music per level: only stops the previous track if the new one DIFFERS (so chapter 1's
    // music stays continuous across its sub-levels). enter() (re)starts it.
    if (this.audio.currentMusicName() !== (level.musicTrack || null)) this.audio.stopMusic();
    this.levelIndex = i;
    this.scene.add(level.group);

    this.player.terrain = level.terrain || null; // heights/holes/low ceilings (level 3); otherwise flat
    this.player.setMaze(level.maze);
    this.monster.setMaze(level.maze);
    if (level.monsterMode === 'chase' && level.maze.spawn) {
      this.monster.placeAt(level.maze.spawn);
      this.monster.setMode('chase');
    } else {
      this.monster.setMode('none');
    }

    // Resets the objectives / mechanics for this level.
    this.keysCollected = 0;
    this.keysTotal = level.coins?.length ?? 0;
    this.flashlightOn = true;
    this.playerHidden = false;
    this.playerSafe = false;
    this._fall = null;
    // Ambient scream cadence specific to the level ([min,max] in seconds; default ~14-26s).
    {
      const [smin, smax] = level.screamEvery ?? [14, 26];
      this._ambientScreamT = smin + Math.random() * (smax - smin); // first scream
    }
    // Default monster = Ansem (crypto levels); the forest switches to BONK in enter().
    this.monster.fleeing = false;
    this.monster.rushMult = 1;
    this.monster.setSkin('ansem');
    this.audio.setMonsterVoice('ansem');
    this.hud.setKeys(0, this.keysTotal);
    this.hud.setFlashlight(true);
    // Portal locked while keys remain (active right away if there are none).
    if (level.portal) this.setPortalActive(this.keysTotal === 0);

    this.setObjective(level.objective || '');
    // Touch button set based on the chapter (Ch.1 flashlight - Ch.2 none - Ch.3 jump+crouch).
    this.touch?.setLevelButtons(chapterReached(i + 1));
    this.inputLocked = false;
    level.enter(this);
  }

  #updateFlashlight() {
    const cam = this.camera;
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    this.flashlight.position.copy(cam.position);
    this.flashTarget.position.copy(cam.position).addScaledVector(forward, 5);
    this.flashlight.visible = this.flashlightOn;
  }

  // Hidden = flashlight off + not moving + tucked in a corner (walls on two perpendicular sides).
  // In this state, Ansem no longer detects the player and "walks right past" them.
  #computeHidden() {
    if (this.flashlightOn || this.player.moving || !this.level?.maze) return false;
    const { col, row } = this.level.maze.worldToCell(this.camera.position.x, this.camera.position.z);
    const m = this.level.maze;
    const n = m.isWall(col, row - 1);
    const s = m.isWall(col, row + 1);
    const e = m.isWall(col + 1, row);
    const w = m.isWall(col - 1, row);
    return (n && e) || (n && w) || (s && e) || (s && w);
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
    if (this._fall) this.#updateFall(dt);

    if (this.state === 'running') {
      if (!this.inputLocked) this.elapsedMs += dt * 1000;
      this.level.update(dt, this);
      // If the level itself has ended the game (e.g. the level 3 collapse countdown),
      // exit right away: this frame's audio.update must not restart the ambience
      // that #end() just cut (silenceAmbience).
      if (this.state !== 'running') {
        this.renderer.render(this.scene, this.camera);
        return;
      }

      // Random ambient screams, specific to the level (every now and then).
      if (this.level.ambientScreams?.length && !this.inputLocked && !this._fall) {
        this._ambientScreamT -= dt;
        if (this._ambientScreamT <= 0) {
          const list = this.level.ambientScreams;
          this.audio.playSample(list[(Math.random() * list.length) | 0], { gain: 0.55 });
          const [imin, imax] = this.level.screamEvery ?? [16, 38];
          this._ambientScreamT = imin + Math.random() * (imax - imin);
        }
      }
      // Difficulty pinned to the level's threshold (feasibleSanity: L1 = 0.3, L2 = 0.6, ...):
      // playable from the threshold up, nearly impossible below it (BONK faster + always spots
      // the player); above it, the player speeds up -> increasingly easy.
      const feasible = this.level?.feasibleSanity ?? 0.5;
      const s = clamp01(this.sanity);
      this.player.speedMult = playerSpeedMult(s, feasible);
      if (!this.inputLocked) this.player.update(dt);

      // BONK/Ansem's speed driven by sanity, with a CLIFF at the level's threshold:
      // below feasibleSanity -> noticeably faster than the player (nearly impossible); at the
      // threshold or above -> base speed (escapable, increasingly so as sanity rises).
      this.monster.speedMult =
        s < feasible ? 1.6 + this.config.sanityFear * ((feasible - s) / feasible) : 1;
      // "Relentless" levels (scripted chase: single corridor) -> the monster always spots
      // the player (sanity then only drives its SPEED, not its ability to find the player).
      this.monster.detectRadius = this.level?.relentless ? DETECT_MAX : detectRadius(s, feasible);
      this.playerHidden = this.#computeHidden();
      this.monster.hidden = this.playerHidden;
      this.monster.lit = this.flashlightOn; // flashlight on -> the player gives themselves away (detectable)
      // Fleeing/charging is driven by the level (forest). Safety net: at a fire -> forced fleeing.
      if (this.playerSafe) this.monster.fleeing = true;
      this.monster.update(dt, this.camera.position, this.elapsedMs / 1000);
      this.#updateFlashlight();

      let proximity = 0;
      let pan = 0;
      let dist = Infinity;
      if (this.monster.mode === 'chase' || this.monster.mode === 'creep') {
        const cues = this.#computeAudioCues();
        pan = cues.pan;
        dist = cues.dist;
        // The chase sound (growl, heartbeat, vignette) only plays while it's HUNTING the player:
        // as soon as it loses them (wandering), it cuts even if it's still close.
        proximity = this.monster.hunting ? cues.proximity : 0;
      }
      if (this._fall) proximity = 0; // during the fall: no chase sound/vignette
      this.audio.update(dt, {
        proximity,
        pan,
        playerMoving: this.player.moving,
        playerSprinting: this.player.sprinting,
        monsterMoving: this.monster.moving,
      });
      // Compass: angle to the exit relative to the view direction - available as long as sanity
      // stays >= COMPASS_SANITY (from 20% to 100%); it's lost below that.
      let exitAngle = null;
      if (this.level.portal && this.sanity >= COMPASS_SANITY) {
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
        const side = dx * -fwd.z + dz * fwd.x; // right vector = (-fwd.z, 0, fwd.x)
        exitAngle = Math.atan2(side, ahead);
      }
      // PEPE map: available as long as sanity stays >= MINIMAP_SANITY
      // (from 30% to 100%); it's lost below that. (Key levels only.)
      let minimap = null;
      if (this.sanity >= MINIMAP_SANITY && this.level?.coins?.length) {
        const maze = this.level.maze;
        const pc = maze.worldToCell(this.camera.position.x, this.camera.position.z);
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd);
        const pepes = this.level.coins.filter((c) => !c.collected).map((c) => ({ col: c.col, row: c.row }));
        minimap = { maze, player: pc, pepes, exit: maze.exit, fx: fwd.x, fz: fwd.z };
      }
      this.hud.update({ elapsedMs: this.elapsedMs, sanity: this.sanity, proximity, exitAngle, minimap });

      // End conditions LAST: this way silenceAmbience() (inside #end) doesn't get
      // overwritten by this frame's audio.update -> the sound properly cuts on capture.
      if (this.monster.mode === 'chase' && dist < MONSTER_CATCH_DIST && !this.playerHidden && !this.playerSafe && !this._fall) {
        this.lose();
      } else if (this.level.portal && this.level.portalActive && this.level.exitKind !== 'hole') {
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
    this.audio.silenceAmbience(); // cuts the continuous ambience when Ansem catches the player (or on escape)
    if (this.player.controls.isLocked) this.player.controls.unlock();

    if (!won) {
      // CAPTURE: full-screen screamer before the end screen - face/sound depends on the monster
      // (Ansem in the crypto levels, BONK in the forest).
      const bonk = this.monster.skin === 'bonk';
      const img = this.screamerEl.querySelector('img');
      if (img) img.src = bonk ? '/bonk-face.png' : '/monster.png';
      this.screamerEl.classList.remove('hidden');
      if (bonk) this.audio.bonkScream();
      else this.audio.ansemScream();
      this.flash();
      clearTimeout(this._endScreamT);
      this._endScreamT = setTimeout(() => {
        this.screamerEl.classList.add('hidden');
        if (!bonk) this.audio.sting('catch'); // BONK: only the provided screamer sound plays (no sting)
        this.#showEndScreen(false);
      }, 1100);
      return;
    }

    this.audio.sting('win');
    this.audio.update(0, { proximity: 0, pan: 0 });
    this.#showEndScreen(true);
  }

  #showEndScreen(won) {
    this.audio.update(0, { proximity: 0, pan: 0 });
    const levelReached = this.levelIndex + 1;
    // Local unlock of the lore windows: keeps track of the furthest chapter reached.
    bumpLocalMaxChapter(chapterReached(levelReached));
    new EndScreen(this.container, {
      won,
      timeMs: this.elapsedMs,
      config: this.config,
      levelReached,
      runToken: this.runToken,
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
    this.#checkOrientation();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._endScreamT);
    clearTimeout(this._screamT);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('keydown', this._onAbilityKey);
    clearInterval(this._sanitySyncT);
    if (window.escapeAnsem) delete window.escapeAnsem;
    // Touch: releases the orientation + fullscreen lock and removes the touch UI.
    if (this.isTouch) {
      document.body.classList.remove('touch-mode');
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* ignore */
      }
      try {
        if (document.fullscreenElement) document.exitFullscreen?.();
      } catch {
        /* ignore */
      }
      this.touch?.destroy();
      this.rotateEl?.remove();
    }
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

// Detection radius based on sanity, pinned to the level's threshold: at or below the
// threshold -> max (spots the player almost always); above it -> shrinks from DETECT_MAX to DETECT_MIN.
function detectRadius(sanity, feasible = 0.5) {
  const s = clamp01(sanity);
  if (s <= feasible) return DETECT_MAX;
  const t = (s - feasible) / Math.max(0.001, 1 - feasible);
  return DETECT_MAX + (DETECT_MIN - DETECT_MAX) * t;
}

// Player speed: x1 up to the level's threshold, then rises up to x(1 + PLAYER_BOOST_MAX)
// at 100% sanity -> above the threshold, increasingly easy.
function playerSpeedMult(sanity, feasible = PLAYER_FAST_FROM) {
  const s = clamp01(sanity);
  if (s <= feasible) return 1;
  const t = (s - feasible) / Math.max(0.001, 1 - feasible);
  return 1 + PLAYER_BOOST_MAX * t;
}
