import * as THREE from 'three';
import { Player } from './Player.js';
import { Monster } from './Monster.js';
import { AudioManager } from './AudioManager.js';
import { Hud } from '../ui/Hud.js';
import { EndScreen } from '../ui/EndScreen.js';
import { LEVELS } from './levels.js';
import { chapterReached, bumpLocalMaxChapter } from './progress.js';
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

// Orchestrateur : enchaîne les niveaux (Réveil → Labyrinthe → Terreur → Map finale).
// Ressources partagées (renderer, scène, caméra, joueur, monstre, audio, voix, HUD) ;
// chaque Level fournit son maze + décors et pilote ses propres animations/déclencheurs.

export class Game {
  constructor(container, config, onExitToMenu, startIndex = 0) {
    this.container = container;
    this.config = config;
    this.onExitToMenu = onExitToMenu;
    this.startIndex = Math.max(0, Math.min(LEVELS.length - 1, startIndex | 0)); // niveau de départ (sélection menu)
    this.state = 'ready'; // ready | running | paused | transition | over
    this.inputLocked = false;
    this.started = false;
    this.elapsedMs = 0;
    this.clock = new THREE.Clock();
    this.levelIndex = 0;
    this.level = null;
    this.sanity = clamp01(config.sanityStart ?? 1);

    // Objectifs / mécaniques niveau 1.
    this.keysCollected = 0;
    this.keysTotal = 0;
    this.flashlightOn = true;
    this.playerHidden = false; // caché dans un coin, lampe éteinte, immobile
    this.playerSafe = false; // à portée d'un feu de camp (forêt) → intraquable
    this._fall = null; // état de l'animation de chute (trou → forêt)
    this._ambientScreamT = 18; // minuterie des cris d'ambiance (par niveau)

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

  // Chute cinématique dans le trou de sortie : gèle l'input, fait plonger la caméra en
  // accélérant + fondu au noir + whoosh, puis exécute onDone (typiquement advance()).
  fallThrough(onDone) {
    if (this._fall || this.state === 'over') return;
    this.inputLocked = true;
    this.audio.silenceAmbience();
    this.audio.fallWhoosh();
    // On fige la souris pendant la cinématique pour ne pas contrarier la caméra scriptée.
    if (this.player.controls) this.player.controls.enabled = false;
    // Cible = centre du trou (pour plonger DANS le puits, pas à travers le sol).
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
    // Phase A (0→0.22) : on glisse au-dessus du trou et le regard bascule vers le bas.
    const sRaw = clamp01(k / 0.22);
    const slide = sRaw * sRaw * (3 - 2 * sRaw);
    cam.position.x = f.sx + (f.hx - f.sx) * slide;
    cam.position.z = f.sz + (f.hz - f.sz) * slide;
    cam.rotation.x = -1.35 * slide; // regarde presque droit dans le trou
    // Phase B : plongée accélérée dans le puits + vrille.
    const plunge = k <= 0.22 ? 0 : (k - 0.22) / 0.78;
    cam.position.y = f.sy - plunge * plunge * 26;
    cam.rotation.z += dt * 3.2;
    this.setFade(clamp01((k - 0.35) / 0.4)); // noir avant d'atteindre le fond
    if (k >= 1 && !f.done) {
      f.done = true;
      const cb = f.onDone;
      this._fall = null;
      if (this.player.controls) this.player.controls.enabled = true;
      cam.rotation.set(0, cam.rotation.y, 0);
      cb?.();
    }
  }

  // Ramassage d'une clé PEPE : quand toutes sont réunies, la sortie (le trou) s'active.
  // Niveau muet : on garde le son + le compteur HUD, mais AUCUNE annonce texte.
  collectKey() {
    this.keysCollected++;
    this.audio.coinPickup();
    this.hud.setKeys(this.keysCollected, this.keysTotal);
    if (this.keysCollected >= this.keysTotal) {
      this.setPortalActive(true); // active le trou (sans annonce)
    }
  }

  // Active/désactive visuellement + logiquement le portail de sortie.
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
        <div class="pause-slider">
          <label>Mental health: <span data-sanity-val>100%</span></label>
          <input type="range" min="0" max="100" step="1" value="100" data-sanity-slider />
        </div>
        <div class="pause-slider">
          <label>Volume: <span data-volume-val>80%</span></label>
          <input type="range" min="0" max="100" step="1" value="80" data-volume-slider />
        </div>
        <button class="btn-primary" data-resume>Resume</button>
        <button class="btn-ghost" data-quit>Back to menu</button>
      </div>`;
    this.container.appendChild(this.pause);
    this.pause.querySelector('[data-resume]').addEventListener('click', () => this.player.controls.lock());
    this.pause.querySelector('[data-quit]').addEventListener('click', () => this.#exitToMenu());

    // Curseur de santé mentale (accessible dès la pause / Échap).
    this.sanitySlider = this.pause.querySelector('[data-sanity-slider]');
    this.sanityValEl = this.pause.querySelector('[data-sanity-val]');
    this.sanitySlider.addEventListener('input', () => {
      this.sanity = clamp01(Number(this.sanitySlider.value) / 100);
      this.sanityValEl.textContent = `${Math.round(this.sanity * 100)}%`;
    });

    // Curseur de volume (maître) — persistant via la config.
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

    // Lampe torche (F). La boussole n'est plus une touche : elle s'active seule à basse santé.
    this._onAbilityKey = (e) => {
      if (this.state !== 'running' || this.inputLocked) return;
      const k = (e.key || '').toLowerCase();
      if (k === 'f') this.#toggleFlashlight();
      else if (k === 'e') this.level?.onInteract?.(this); // interaction (bouton, trophée…)
    };
    document.addEventListener('keydown', this._onAbilityKey);
  }

  #toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.hud.setFlashlight(this.flashlightOn);
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
      this.#startLevel(this.startIndex);
      this.state = 'running';
    } else if (this.state === 'paused') {
      this.state = 'running';
    }
  }

  #onUnlock() {
    if (this.state === 'running') {
      this.state = 'paused';
      this.#syncSanitySlider();
      this.pause.classList.remove('hidden');
      this.audio.suspend();
      this.#clearSubtitle();
    }
  }

  #syncSanitySlider() {
    if (!this.sanitySlider) return;
    const pct = Math.round(clamp01(this.sanity) * 100);
    this.sanitySlider.value = String(pct);
    this.sanityValEl.textContent = `${pct}%`;
  }

  #startLevel(i) {
    if (this.level) {
      this.scene.remove(this.level.group);
      this.level.dispose();
    }
    this.#clearSubtitle();
    // Coupe les sons transitoires du niveau précédent (la musique est gérée track-aware plus bas).
    this.audio.silenceTransients();

    const level = new LEVELS[i]();
    level.build(this);
    this.level = level;
    // Musique par niveau : ne coupe la piste précédente que si la nouvelle DIFFÈRE (la musique
    // du chapitre 1 reste ainsi continue à travers ses sous-niveaux). enter() la (re)démarre.
    if (this.audio.currentMusicName() !== (level.musicTrack || null)) this.audio.stopMusic();
    this.levelIndex = i;
    this.scene.add(level.group);

    this.player.terrain = level.terrain || null; // hauteurs/trous/plafonds bas (niveau 3) ; sinon plat
    this.player.setMaze(level.maze);
    this.monster.setMaze(level.maze);
    if (level.monsterMode === 'chase' && level.maze.spawn) {
      this.monster.placeAt(level.maze.spawn);
      this.monster.setMode('chase');
    } else {
      this.monster.setMode('none');
    }

    // Réinitialise les objectifs / mécaniques pour ce niveau.
    this.keysCollected = 0;
    this.keysTotal = level.coins?.length ?? 0;
    this.flashlightOn = true;
    this.playerHidden = false;
    this.playerSafe = false;
    this._fall = null;
    // Cadence des cris d'ambiance propre au niveau ([min,max] en s ; défaut ~14-26 s).
    {
      const [smin, smax] = level.screamEvery ?? [14, 26];
      this._ambientScreamT = smin + Math.random() * (smax - smin); // premier cri
    }
    // Monstre par défaut = Ansem (niveaux crypto) ; la forêt bascule en BONK dans enter().
    this.monster.fleeing = false;
    this.monster.rushMult = 1;
    this.monster.setSkin('ansem');
    this.audio.setMonsterVoice('ansem');
    this.hud.setKeys(0, this.keysTotal);
    this.hud.setFlashlight(true);
    // Portail verrouillé tant qu'il reste des clés (actif d'emblée s'il n'y en a pas).
    if (level.portal) this.setPortalActive(this.keysTotal === 0);

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
    this.flashlight.visible = this.flashlightOn;
  }

  // Caché = lampe éteinte + immobile + tapi dans un coin (murs sur deux côtés perpendiculaires).
  // Dans cet état, Ansem ne te détecte plus et « passe devant » toi.
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
      // Si le niveau lui-même a mis fin à la partie (ex. décompte d'effondrement du niveau 3),
      // on sort tout de suite : l'audio.update de cette frame ne doit pas relancer l'ambiance
      // que #end() vient de couper (silenceAmbience).
      if (this.state !== 'running') {
        this.renderer.render(this.scene, this.camera);
        return;
      }

      // Cris d'ambiance aléatoires, propres au niveau (de temps en temps).
      if (this.level.ambientScreams?.length && !this.inputLocked && !this._fall) {
        this._ambientScreamT -= dt;
        if (this._ambientScreamT <= 0) {
          const list = this.level.ambientScreams;
          this.audio.playSample(list[(Math.random() * list.length) | 0], { gain: 0.55 });
          const [imin, imax] = this.level.screamEvery ?? [16, 38];
          this._ambientScreamT = imin + Math.random() * (imax - imin);
        }
      }
      // Difficulté calée sur le seuil du niveau (feasibleSanity : L1 = 0.3, L2 = 0.6, …) :
      // jouable à partir du seuil, quasi impossible en dessous (BONK plus rapide + te repère
      // toujours) ; au-dessus, le joueur accélère → de plus en plus facile.
      const feasible = this.level?.feasibleSanity ?? 0.5;
      const s = clamp01(this.sanity);
      this.player.speedMult = playerSpeedMult(s, feasible);
      if (!this.inputLocked) this.player.update(dt);

      // Vitesse de BONK/Ansem pilotée par la santé mentale, avec une FALAISE au seuil du niveau :
      // sous feasibleSanity → nettement plus rapide que le joueur (quasi impossible) ; au seuil
      // ou au-dessus → base (échappable, d'autant plus que la santé monte).
      this.monster.speedMult =
        s < feasible ? 1.6 + this.config.sanityFear * ((feasible - s) / feasible) : 1;
      // Niveaux « relentless » (poursuite scénarisée : couloir unique) → le monstre te repère
      // toujours (la santé mentale ne pilote alors que sa VITESSE, pas sa capacité à te trouver).
      this.monster.detectRadius = this.level?.relentless ? DETECT_MAX : detectRadius(s, feasible);
      this.playerHidden = this.#computeHidden();
      this.monster.hidden = this.playerHidden;
      this.monster.lit = this.flashlightOn; // lampe allumée → le joueur se trahit (repérable)
      // La fuite/charge est pilotée par le niveau (forêt). Sécurité : à un feu → fuite forcée.
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
        // Le bruit de chasse (growl, cœur, vignette) ne joue que s'il te TRAQUE :
        // dès qu'il t'a perdu (errance), il se coupe même s'il est encore proche.
        proximity = this.monster.hunting ? cues.proximity : 0;
      }
      if (this._fall) proximity = 0; // pendant la chute : pas de bruit/vignette de chasse
      this.audio.update(dt, {
        proximity,
        pan,
        playerMoving: this.player.moving,
        playerSprinting: this.player.sprinting,
        monsterMoving: this.monster.moving,
      });
      // Boussole : angle vers la sortie relatif au regard — disponible tant que la santé
      // mentale reste ≥ COMPASS_SANITY (de 20 % à 100 %) ; elle se perd en dessous.
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
        const side = dx * -fwd.z + dz * fwd.x; // vecteur droite = (-fwd.z, 0, fwd.x)
        exitAngle = Math.atan2(side, ahead);
      }
      // Carte des PEPE : disponible tant que la santé mentale reste ≥ MINIMAP_SANITY
      // (de 30 % à 100 %) ; elle se perd en dessous. (Niveaux à clés uniquement.)
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

      // Conditions de fin EN DERNIER : ainsi silenceAmbience() (dans #end) n'est pas
      // réécrasé par l'audio.update de cette frame → le son se coupe bien à la capture.
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
    this.audio.silenceAmbience(); // coupe le bruit continu quand Ansem t'a eu (ou à l'évasion)
    if (this.player.controls.isLocked) this.player.controls.unlock();

    if (!won) {
      // CAPTURE : screamer plein écran avant l'écran de fin — visage/son selon le monstre
      // (Ansem dans le crypto, BONK dans la forêt).
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
        if (!bonk) this.audio.sting('catch'); // BONK : seul le screamer fourni joue (pas de sting)
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
    // Déblocage local des fenêtres de lore : on retient le chapitre le plus loin atteint.
    bumpLocalMaxChapter(chapterReached(levelReached));
    new EndScreen(this.container, {
      won,
      timeMs: this.elapsedMs,
      config: this.config,
      levelReached,
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
    clearTimeout(this._endScreamT);
    clearTimeout(this._screamT);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('keydown', this._onSanityKey);
    document.removeEventListener('keydown', this._onAbilityKey);
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

// Rayon de détection selon la santé mentale, calé sur le seuil du niveau : au seuil ou en
// dessous → max (te repère quasi toujours) ; au-dessus → rétrécit de DETECT_MAX à DETECT_MIN.
function detectRadius(sanity, feasible = 0.5) {
  const s = clamp01(sanity);
  if (s <= feasible) return DETECT_MAX;
  const t = (s - feasible) / Math.max(0.001, 1 - feasible);
  return DETECT_MAX + (DETECT_MIN - DETECT_MAX) * t;
}

// Vitesse du joueur : ×1 jusqu'au seuil du niveau, puis monte jusqu'à ×(1 + PLAYER_BOOST_MAX)
// à 100 % de santé → au-dessus du seuil, de plus en plus facile.
function playerSpeedMult(sanity, feasible = PLAYER_FAST_FROM) {
  const s = clamp01(sanity);
  if (s <= feasible) return 1;
  const t = (s - feasible) / Math.max(0.001, 1 - feasible);
  return 1 + PLAYER_BOOST_MAX * t;
}
