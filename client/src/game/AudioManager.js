// Audio 100 % synthétisé via la Web Audio API (aucun fichier requis).
//  - Drone ambiant continu et inquiétant.
//  - Battement de cœur dont le tempo ET le volume montent quand le monstre approche.
//  - Growl guttural directionnel (panoramique selon la position du monstre).
//  - Stingers sur capture / évasion.
//
// `update(dt, proximity, pan)` est appelé chaque frame : proximity ∈ [0..1]
// (0 = monstre loin, 1 = sur toi), pan ∈ [-1..1] (gauche/droite).

export class AudioManager {
  constructor(volume = 0.8) {
    this.volume = volume;
    this.ctx = null;
    this.running = false;
    this.beatClock = 0;
    this.playerStepClock = 0;
    this.monsterStepClock = 0;
    this.monsterStepParity = false;
    this.kbOn = false;
    this.kbClock = 0;
    this.kbNext = 0.2;
    this.neonGain = null;
    this.dread = null;
    this.monsterVoice = 'ansem'; // 'ansem' (growl/screech) | 'bonk' (pas lourds + rugissement)
    this.buffers = null; // échantillons audio décodés (rugissement, screamer, musiques, screams)
    this._near = null; // boucle de proximité d'Ansem (fichier)
    this._music = null; // source de la musique de fond en boucle (par niveau)
    this._musicWanted = false;
    this._musicName = null;
    this._musicGain = 0.32;
  }

  // Choisit la « voix » du monstre : coupe le growl/screech d'Ansem pour BONK.
  setMonsterVoice(v) {
    this.monsterVoice = v;
  }

  // Doit être appelé suite à une interaction utilisateur (clic « Jouer »).
  start() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    this.#buildDrone();
    this.#buildGrowl();
    this.#buildScreech();
    this.#loadSamples();

    this.running = true;
  }

  // Charge/décode les fichiers audio du niveau forêt (fournis par l'utilisateur, dans /sfx).
  #loadSamples() {
    if (this.buffers) return;
    this.buffers = {};
    const files = {
      roar: '/sfx/bonk-roar.mp3',
      screamer: '/sfx/bonk-screamer.mp3',
      ansemScreamer: '/sfx/ansem-screamer.mp3', // apparition + jumpscare d'Ansem
      ansemNear: '/sfx/ansem-near.mp3', // son d'Ansem quand il se rapproche (boucle)
      forestTheme: '/sfx/forest-theme.mp3',
      level1Music: '/sfx/level1-music.mp3',
      level3Music: '/sfx/level3-music.mp3',
      wakeup: '/sfx/wakeup.mp3',
      scream1: '/sfx/scream1.mp3',
      scream2: '/sfx/scream2.mp3',
      scream3: '/sfx/scream3.mp3',
      scream4: '/sfx/scream4.mp3',
    };
    for (const [name, url] of Object.entries(files)) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((ab) => this.ctx.decodeAudioData(ab))
        .then((buf) => {
          this.buffers[name] = buf;
          this.#ensureMusic(); // démarre la musique en boucle si déjà demandée et prête
        })
        .catch(() => {
          /* fichier absent → repli synthé */
        });
    }
  }

  // Joue un échantillon décodé via le master. loop=true → renvoie { src, gain } (pour l'arrêter).
  // duration>0 coupe la lecture après N s (avec fadeOut optionnel) — utile pour tronquer un
  // fichier (ex. couper la fin parlée du son de réveil).
  playSample(name, { gain = 0.8, loop = false, duration = 0, fadeOut = 0 } = {}) {
    if (!this.ctx || !this.buffers || !this.buffers[name]) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.loop = loop;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    const now = this.ctx.currentTime;
    if (duration > 0) {
      if (fadeOut > 0) {
        g.gain.setValueAtTime(gain, now + Math.max(0, duration - fadeOut));
        g.gain.linearRampToValueAtTime(0.0001, now + duration);
      }
      src.start(now, 0, duration);
    } else {
      src.start(now);
    }
    return { src, gain: g };
  }

  // Musique de fond en boucle (par niveau : thème forêt, musique niveau 3…). Fondu +
  // résistance au timing de chargement (réessai depuis #loadSamples).
  startMusic(name, gain = 0.32) {
    // Déjà en train de jouer cette piste → on la laisse continuer (pas de redémarrage).
    // Permet à la musique du chapitre 1 de rester continue à travers ses sous-niveaux.
    if (this._music && this._musicName === name) return;
    this._musicWanted = true;
    this._musicName = name;
    this._musicGain = gain;
    this.#ensureMusic();
    // Baisse le drone synthé pour laisser respirer la musique.
    if (this.droneGain && this.ctx) this.droneGain.gain.setTargetAtTime(0.04, this.ctx.currentTime, 1);
  }

  // Nom de la piste EN COURS de lecture (null si aucune) — pour décider s'il faut la couper.
  currentMusicName() {
    return this._music ? this._musicName : null;
  }

  #ensureMusic() {
    if (!this._musicWanted || this._music || !this.ctx || !this._musicName) return;
    const t = this.playSample(this._musicName, { gain: 0.0001, loop: true });
    if (!t) return; // pas encore décodé → réessai depuis #loadSamples
    this._music = t;
    t.gain.gain.setTargetAtTime(this._musicGain, this.ctx.currentTime, 1.0);
  }

  stopMusic() {
    this._musicWanted = false;
    if (!this._music) return;
    const { src, gain } = this._music;
    this._music = null;
    const now = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0.0001, now, 0.5);
    try {
      src.stop(now + 0.8);
    } catch {
      /* ignore */
    }
  }

  // Screamer sonore de BONK (fichier fourni ; repli sur le cri synthé). On coupe d'abord un
  // éventuel rugissement encore en cours pour NE laisser QUE le son du screamer.
  bonkScream() {
    if (!this.running || !this.ctx) return;
    try {
      this._roar?.src.stop();
    } catch {
      /* ignore */
    }
    this._roar = null;
    if (this.playSample('screamer', { gain: 0.95 })) return;
    this.sting('scream');
  }

  // Screamer sonore d'ANSEM (fichier « apparition et jumpscare » ; repli sur le cri synthé).
  // Coupe d'abord la boucle de proximité pour ne laisser QUE le screamer.
  ansemScream() {
    if (!this.running || !this.ctx) return;
    if (this._near) this._near.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
    if (this.playSample('ansemScreamer', { gain: 0.95 })) return;
    this.sting('scream');
  }

  // Boucle de proximité d'Ansem (fichier « quand il est proche de toi ») : volume piloté par la
  // proximité, panoramique selon la position. Remplace le growl/screech synthétisés.
  #updateNear(level, pan) {
    if (!this.ctx) return;
    if (!this._near && this.buffers?.ansemNear) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.ansemNear;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      const panner = this.ctx.createStereoPanner();
      src.connect(g).connect(panner).connect(this.master);
      src.start();
      this._near = { src, gain: g, pan: panner };
    }
    if (!this._near) return;
    const now = this.ctx.currentTime;
    const target = level <= 0 ? 0.0001 : Math.min(0.9, level * level * 0.9 + 0.02);
    this._near.gain.gain.setTargetAtTime(target, now, 0.15);
    this._near.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.15);
  }

  #buildDrone() {
    const ctx = this.ctx;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    droneGain.connect(lp).connect(this.master);

    for (const freq of [40, 41.5, 60.3]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(droneGain);
      osc.start();
    }
    this.droneGain = droneGain;
    this.droneFilter = lp;
  }

  #buildGrowl() {
    const ctx = this.ctx;
    // Bruit blanc en boucle.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 140;
    bp.Q.value = 4;

    // LFO pour un grognement « vivant ».
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 50;
    lfo.connect(lfoGain).connect(bp.frequency);
    lfo.start();

    const growlGain = ctx.createGain();
    growlGain.gain.value = 0;

    const panner = ctx.createStereoPanner();

    src.connect(bp).connect(growlGain).connect(panner).connect(this.master);
    src.start();

    this.growlGain = growlGain;
    this.growlPan = panner;
  }

  // Cri dissonant et distordu : ne monte qu'à très courte distance (sur le point d'être attrapé).
  #buildScreech() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortion(120);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.7;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 450;
    lfo.connect(lfoGain).connect(bp.frequency);
    lfo.start();

    for (const f of [760, 1190, 1670, 2530]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = Math.random() * 30 - 15;
      osc.connect(shaper);
      osc.start();
    }
    shaper.connect(bp).connect(gain).connect(this.master);
    this.screechGain = gain;
  }

  // Un pas : burst de bruit filtré + impact basse fréquence, panoramique inclus.
  #step({ kind = 'player', gain = 0.3, pan = 0 }) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const isBonk = kind === 'bonk';
    const isMonster = kind === 'monster' || isBonk;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master);

    // Burst de bruit (frottement/poussière ; BONK = impact de patte plus sourd).
    const dur = isBonk ? 0.26 : isMonster ? 0.2 : 0.1;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = isBonk ? 300 : isMonster ? 480 : 1500;
    const ng = ctx.createGain();
    ng.gain.value = gain * (isMonster ? 0.9 : 0.5);
    noise.connect(lp).connect(ng).connect(panner);
    noise.start(now);
    noise.stop(now + dur);

    // Impact basse fréquence (BONK = thud plus grave et plus long).
    const f0 = isBonk ? 50 : isMonster ? 65 : 115;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, now + (isBonk ? 0.16 : 0.12));
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(gain * (isBonk ? 0.95 : isMonster ? 0.7 : 0.4), now + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, now + (isBonk ? 0.3 : isMonster ? 0.24 : 0.13));
    osc.connect(og).connect(panner);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  // Rugissement de BONK : fichier fourni (/sfx) si disponible, sinon repli synthé guttural.
  bonkRoar() {
    if (!this.running || !this.ctx) return;
    const sample = this.playSample('roar', { gain: 0.9 });
    if (sample) {
      this._roar = sample; // suivi pour pouvoir le couper au screamer
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.75, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    g.connect(this.master);
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortion(300);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(950, now);
    lp.frequency.exponentialRampToValueAtTime(240, now + 1.0);
    shaper.connect(lp).connect(g);
    for (const f of [70, 104, 146, 190]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 1.6, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.7, now + 0.9);
      osc.detune.value = Math.random() * 40 - 20;
      osc.connect(shaper);
      osc.start(now);
      osc.stop(now + 1.15);
    }
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.8);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.5, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    sub.connect(sg).connect(this.master);
    sub.start(now);
    sub.stop(now + 0.95);
  }

  // Un « lub-dub » de battement de cœur.
  #thump(intensity) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const beat = (t0, peak) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, t0);
      osc.frequency.exponentialRampToValueAtTime(32, t0 + 0.14);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.25);
    };
    const v = 0.25 + intensity * 0.8;
    beat(now, v);
    beat(now + 0.16, v * 0.7); // second battement
  }

  // Bourdonnement de néon (hum 60/120 Hz + léger trémolo). on=true l'allume.
  neonBuzz(on) {
    if (!this.ctx) return;
    if (!this.neonGain) {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      gain.connect(lp).connect(this.master);
      for (const f of [60, 120, 179]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.connect(gain);
        osc.start();
      }
      // Trémolo (grésillement).
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
      this.neonGain = gain;
    }
    this.neonGain.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.2);
  }

  keyboardAmbience(on) {
    this.kbOn = on;
    this.kbClock = 0;
  }

  // Petit clic de touche mécanique (lointain).
  #keyClick() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.02);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800 + Math.random() * 1200;
    const g = ctx.createGain();
    g.gain.value = 0.04 + Math.random() * 0.03;
    noise.connect(hp).connect(g).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.03);
  }

  // Sting de chute des cours (le marché s'effondre).
  crash() {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    g.connect(this.master);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.85);
    osc.connect(g);
    osc.start(now);
    osc.stop(now + 0.95);
  }

  // Chute dans le trou : whoosh de vent qui enfle + sous-grave descendant (sensation de plongée).
  fallWhoosh() {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 1.5;

    // Vent : bruit passe-bande dont la fréquence chute + volume qui enfle puis coupe.
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(1200, now);
    bp.frequency.exponentialRampToValueAtTime(180, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.4, now + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    noise.connect(bp).connect(g).connect(this.master);
    noise.start(now);
    noise.stop(now + dur);

    // Sous-grave qui plonge.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.32, now + 0.15);
    og.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(og).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  // Tension montante du décompte : grondement + whine qui s'intensifient.
  // startDread() puis setDread(x) chaque frame avec x ∈ [0..1], puis stopDread().
  startDread() {
    if (!this.ctx || this.dread) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    gain.connect(lp).connect(this.master);
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    whine.frequency.value = 80;
    whine.connect(gain);
    whine.start();
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 44;
    const subG = ctx.createGain();
    subG.gain.value = 0.5;
    sub.connect(subG).connect(gain);
    sub.start();
    this.dread = { gain, lp, whine, sub };
  }

  setDread(x) {
    if (!this.dread) return;
    const now = this.ctx.currentTime;
    const k = Math.max(0, Math.min(1, x));
    this.dread.gain.gain.setTargetAtTime(0.03 + k * 0.5, now, 0.05);
    this.dread.whine.frequency.setTargetAtTime(80 + k * k * 900, now, 0.05);
    this.dread.lp.frequency.setTargetAtTime(250 + k * 3200, now, 0.05);
  }

  stopDread() {
    if (!this.dread) return;
    const now = this.ctx.currentTime;
    const d = this.dread;
    this.dread = null;
    d.gain.gain.setTargetAtTime(0.0001, now, 0.1);
    try {
      d.whine.stop(now + 0.4);
      d.sub.stop(now + 0.4);
    } catch {
      /* ignore */
    }
  }

  // Chuchotement menaçant entièrement synthétisé (remplace la voix TTS).
  // Bruit filtré (formants mouvants) + trémolo « syllabes » + écho + sous-grave.
  whisper() {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 1.9;

    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Formants qui bougent (voyelles chuchotées).
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    const fT = [0, 0.5, 1.0, 1.45];
    const fF = [420, 720, 360, 600];
    fT.forEach((t, i) => bp.frequency.setValueAtTime(fF[i], now + t));

    // Trémolo → impression de syllabes.
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 3.7;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(trem.gain);
    lfo.start(now);
    lfo.stop(now + dur);

    // Enveloppe globale.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.16, now + 0.18);
    env.gain.setValueAtTime(0.16, now + dur - 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.4;

    // Écho / réverbération de couloir.
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.31;
    const fb = ctx.createGain();
    fb.gain.value = 0.5;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    delay.connect(fb).connect(delay);

    src.connect(bp).connect(trem).connect(env);
    env.connect(pan).connect(this.master); // dry
    env.connect(delay).connect(wet).connect(pan); // wet
    src.start(now);
    src.stop(now + dur);

    // Sous-grave menaçant.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(74, now);
    osc.frequency.exponentialRampToValueAtTime(46, now + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.07, now + 0.12);
    og.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(og).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  // cues = { proximity, pan, playerMoving, playerSprinting, monsterMoving }
  update(dt, cues = {}) {
    if (!this.running || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Ambiance clavier (frappe lointaine et irrégulière).
    if (this.kbOn) {
      this.kbClock += dt;
      if (this.kbClock >= this.kbNext) {
        this.kbClock = 0;
        this.kbNext = 0.07 + Math.random() * 0.4;
        this.#keyClick();
      }
    }
    const p = Math.max(0, Math.min(1, cues.proximity ?? 0));
    const pan = Math.max(-1, Math.min(1, cues.pan ?? 0));
    const bonk = this.monsterVoice === 'bonk';

    // Growl/screech SYNTHÉTISÉS RETIRÉS : la « voix » d'Ansem est désormais le fichier
    // ansem-near (boucle) dont le volume monte avec la proximité. BONK garde ses sons fichiers.
    this.growlGain.gain.setTargetAtTime(0, now, 0.1);
    this.screechGain?.gain.setTargetAtTime(0, now, 0.08);
    this.droneFilter.frequency.setTargetAtTime(220 + p * 600, now, 0.2);
    this.#updateNear(bonk ? 0 : p, pan);

    // Battement de cœur : intervalle de 1.25 s (calme) à 0.34 s (panique).
    const interval = 1.25 - p * 0.91;
    this.beatClock += dt;
    if (p > 0.05 && this.beatClock >= interval) {
      this.beatClock = 0;
      this.#thump(p);
    }

    // Pas du joueur (cadence selon marche/sprint).
    if (cues.playerMoving) {
      this.playerStepClock += dt;
      const stride = cues.playerSprinting ? 0.3 : 0.46;
      if (this.playerStepClock >= stride) {
        this.playerStepClock = 0;
        this.#step({ kind: 'player', gain: cues.playerSprinting ? 0.3 : 0.22 });
      }
    } else {
      this.playerStepClock = 0.5; // premier pas immédiat à la reprise
    }

    // Pas du monstre. BONK : pas LOURDS qui accélèrent (galop) et deviennent de plus en plus
    // forts à mesure qu'il se rapproche. Ansem : boiterie plus légère.
    if (cues.monsterMoving) {
      this.monsterStepClock += dt;
      let stride;
      let gain;
      if (bonk) {
        stride = 0.5 - p * 0.28; // 0.5 s (loin) → 0.22 s (près) : galop
        gain = 0.18 + p * 1.1; // franchement plus fort en approchant
      } else {
        stride = this.monsterStepParity ? 0.34 : 0.56; // boiterie
        gain = 0.12 + p * 0.6;
      }
      if (this.monsterStepClock >= stride) {
        this.monsterStepClock = 0;
        this.monsterStepParity = !this.monsterStepParity;
        this.#step({ kind: bonk ? 'bonk' : 'monster', gain, pan });
      }
    } else {
      this.monsterStepClock = 0;
    }
  }

  // Au CHANGEMENT DE NIVEAU : coupe les sons transitoires du niveau précédent (néon, clavier,
  // boucle de proximité d'Ansem, growl/screech, dread). La MUSIQUE est gérée à part (track-aware)
  // pour rester continue quand le niveau suivant utilise la même piste.
  silenceTransients() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.neonBuzz(false);
    this.kbOn = false;
    this.growlGain?.gain.setTargetAtTime(0, now, 0.05);
    this.screechGain?.gain.setTargetAtTime(0, now, 0.05);
    this._near?.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    this.stopDread();
  }

  // Coupe tous les sons continus (drone, growl, screech, néon, dread, clavier).
  // Le stinger ponctuel (catch/win) reste audible car branché à part.
  silenceAmbience() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.droneGain?.gain.setTargetAtTime(0, now, 0.08);
    this.growlGain?.gain.setTargetAtTime(0, now, 0.08);
    this.screechGain?.gain.setTargetAtTime(0, now, 0.08);
    this._near?.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    this.neonGain?.gain.setTargetAtTime(0, now, 0.08);
    this.kbOn = false;
    this.stopDread();
    this.stopMusic();
  }

  // Stinger ponctuel.
  sting(type) {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(this.master);

    if (type === 'scream') {
      // Screamer : cri strident, saturé et fort.
      g.gain.setValueAtTime(0.85, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortion(600);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 0.6;
      shaper.connect(bp).connect(g);
      for (const f of [880, 1320, 1990, 2670, 3110]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.6, now + 1.2);
        osc.detune.value = Math.random() * 40 - 20;
        osc.connect(shaper);
        osc.start(now);
        osc.stop(now + 1.4);
      }
      return;
    }

    if (type === 'catch') {
      g.gain.setValueAtTime(0.6, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 1.1);
      const dist = ctx.createWaveShaper();
      dist.curve = makeDistortion(400);
      osc.connect(dist).connect(g);
      osc.start(now);
      osc.stop(now + 1.2);
    } else if (type === 'win') {
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.4, now + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      [523, 659, 784, 1046].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, now + i * 0.12);
        og.gain.exponentialRampToValueAtTime(0.3, now + i * 0.12 + 0.03);
        og.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.5);
        osc.connect(og).connect(g);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.55);
      });
    }
  }

  // Ramassage d'une pièce PEPE : petit « zap » néon qui monte + arpège clair et brillant.
  coinPickup() {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    g.connect(this.master);

    // Zap néon : balayage rapide vers l'aigu, légèrement saturé.
    const zg = ctx.createGain();
    zg.gain.setValueAtTime(0.0001, now);
    zg.gain.exponentialRampToValueAtTime(0.28, now + 0.015);
    zg.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    const zap = ctx.createOscillator();
    zap.type = 'sawtooth';
    zap.frequency.setValueAtTime(320, now);
    zap.frequency.exponentialRampToValueAtTime(2600, now + 0.14);
    const zbp = ctx.createBiquadFilter();
    zbp.type = 'bandpass';
    zbp.frequency.value = 1600;
    zbp.Q.value = 1.2;
    zap.connect(zbp).connect(zg).connect(g);
    zap.start(now);
    zap.stop(now + 0.18);

    // Arpège chime brillant par-dessus.
    [880, 1320, 1760].forEach((f, i) => {
      const t = now + 0.04 + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(og).connect(g);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend() {
    this.ctx?.suspend?.();
  }

  resume() {
    this.ctx?.resume?.();
  }

  dispose() {
    this.running = false;
    try {
      this.ctx?.close?.();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

function makeDistortion(amount) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * Math.PI) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
