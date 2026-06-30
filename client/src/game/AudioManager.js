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

    this.running = true;
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
    const isMonster = kind === 'monster';

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master);

    // Burst de bruit (frottement/poussière).
    const dur = isMonster ? 0.2 : 0.1;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = isMonster ? 480 : 1500;
    const ng = ctx.createGain();
    ng.gain.value = gain * (isMonster ? 0.9 : 0.5);
    noise.connect(lp).connect(ng).connect(panner);
    noise.start(now);
    noise.stop(now + dur);

    // Impact basse fréquence.
    const f0 = isMonster ? 65 : 115;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, now + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(gain * (isMonster ? 0.7 : 0.4), now + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, now + (isMonster ? 0.24 : 0.13));
    osc.connect(og).connect(panner);
    osc.start(now);
    osc.stop(now + 0.27);
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

    // Growl : monte avec la proximité.
    this.growlGain.gain.setTargetAtTime(p * p * 0.5, now, 0.1);
    this.growlPan.pan.setTargetAtTime(pan, now, 0.1);

    // Drone : s'assombrit/ouvre selon la tension.
    this.droneFilter.frequency.setTargetAtTime(220 + p * 600, now, 0.2);

    // Screech : n'émerge qu'au-delà de 72 % de proximité (il va t'attraper).
    const screech = p > 0.72 ? (p - 0.72) / 0.28 : 0;
    this.screechGain?.gain.setTargetAtTime(screech * screech * 0.2, now, 0.08);

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

    // Pas du monstre (claudicants → intervalles inégaux ; volume/pan selon la proximité).
    if (cues.monsterMoving) {
      this.monsterStepClock += dt;
      const stride = this.monsterStepParity ? 0.34 : 0.56; // boiterie
      if (this.monsterStepClock >= stride) {
        this.monsterStepClock = 0;
        this.monsterStepParity = !this.monsterStepParity;
        this.#step({ kind: 'monster', gain: 0.12 + p * 0.6, pan });
      }
    } else {
      this.monsterStepClock = 0;
    }
  }

  // Coupe tous les sons continus (drone, growl, screech, néon, dread, clavier).
  // Le stinger ponctuel (catch/win) reste audible car branché à part.
  silenceAmbience() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.droneGain?.gain.setTargetAtTime(0, now, 0.08);
    this.growlGain?.gain.setTargetAtTime(0, now, 0.08);
    this.screechGain?.gain.setTargetAtTime(0, now, 0.08);
    this.neonGain?.gain.setTargetAtTime(0, now, 0.08);
    this.kbOn = false;
    this.stopDread();
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
