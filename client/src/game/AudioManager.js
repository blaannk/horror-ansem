// Audio 100% synthesized via the Web Audio API (no files required).
//  - Continuous, unsettling ambient drone.
//  - Heartbeat whose tempo AND volume rise as the monster approaches.
//  - Directional guttural growl (panned according to the monster's position).
//  - Stingers on capture / escape.
//
// `update(dt, proximity, pan)` is called every frame: proximity ∈ [0..1]
// (0 = monster far, 1 = on you), pan ∈ [-1..1] (left/right).

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
    this.monsterVoice = 'ansem'; // 'ansem' (growl/screech) | 'bonk' (heavy steps + roar)
    this.buffers = null; // decoded audio samples (roar, screamer, music tracks, screams)
    this._near = null; // Ansem's proximity loop (file)
    this._music = null; // looping background music source (per level)
    this._musicWanted = false;
    this._musicName = null;
    this._musicGain = 0.32;
  }

  // Chooses the monster's "voice": cuts Ansem's growl/screech for BONK.
  setMonsterVoice(v) {
    this.monsterVoice = v;
  }

  // Must be called following a user interaction (clicking "Play").
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

  // Loads/decodes the forest level's audio files (provided by the user, in /sfx).
  #loadSamples() {
    if (this.buffers) return;
    this.buffers = {};
    const files = {
      roar: '/sfx/bonk-roar.mp3',
      screamer: '/sfx/bonk-screamer.mp3',
      ansemScreamer: '/sfx/ansem-screamer.mp3', // Ansem's appearance + jumpscare
      ansemNear: '/sfx/ansem-near.mp3', // sound of Ansem approaching (loop)
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
          this.#ensureMusic(); // starts the looping music if already requested and ready
        })
        .catch(() => {
          /* file missing -> synth fallback */
        });
    }
  }

  // Plays a decoded sample through the master. loop=true -> returns { src, gain } (to stop it).
  // duration>0 cuts playback after N s (with optional fadeOut) - useful for trimming a
  // file (e.g. cutting the spoken ending off the wakeup sound).
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

  // Looping background music (per level: forest theme, level 3 music...). Fade in +
  // resilient to loading timing (retried from #loadSamples).
  startMusic(name, gain = 0.32) {
    // Already playing this track -> let it keep going (no restart).
    // Lets chapter 1's music stay continuous across its sub-levels.
    if (this._music && this._musicName === name) return;
    this._musicWanted = true;
    this._musicName = name;
    this._musicGain = gain;
    this.#ensureMusic();
    // Lowers the synth drone to let the music breathe.
    if (this.droneGain && this.ctx) this.droneGain.gain.setTargetAtTime(0.04, this.ctx.currentTime, 1);
  }

  // Name of the CURRENTLY playing track (null if none) - to decide whether to stop it.
  currentMusicName() {
    return this._music ? this._musicName : null;
  }

  #ensureMusic() {
    if (!this._musicWanted || this._music || !this.ctx || !this._musicName) return;
    const t = this.playSample(this._musicName, { gain: 0.0001, loop: true });
    if (!t) return; // not decoded yet -> retried from #loadSamples
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

  // BONK's sound screamer (provided file; falls back to the synth scream). First cuts any
  // roar still playing so ONLY the screamer sound is left.
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

  // ANSEM's sound screamer ("appearance and jumpscare" file; falls back to the synth scream).
  // First cuts the proximity loop so ONLY the screamer is left.
  ansemScream() {
    if (!this.running || !this.ctx) return;
    if (this._near) this._near.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
    if (this.playSample('ansemScreamer', { gain: 0.95 })) return;
    this.sting('scream');
  }

  // Ansem's proximity loop ("when he's close to you" file): volume driven by
  // proximity, panned according to position. Replaces the synthesized growl/screech.
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
    // Looping white noise.
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

    // LFO for a "living" growl.
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

  // Dissonant, distorted screech: only rises at very close range (about to be caught).
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

  // A footstep: filtered noise burst + low-frequency impact, panned.
  #step({ kind = 'player', gain = 0.3, pan = 0 }) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const isBonk = kind === 'bonk';
    const isMonster = kind === 'monster' || isBonk;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master);

    // Noise burst (scuffing/dust; BONK = duller paw impact).
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

    // Low-frequency impact (BONK = deeper, longer thud).
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

  // BONK's roar: provided file (/sfx) if available, otherwise synth guttural fallback.
  bonkRoar() {
    if (!this.running || !this.ctx) return;
    const sample = this.playSample('roar', { gain: 0.9 });
    if (sample) {
      this._roar = sample; // tracked so it can be cut when the screamer plays
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

  // A heartbeat "lub-dub".
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
    beat(now + 0.16, v * 0.7); // second beat
  }

  // Neon buzz (60/120 Hz hum + slight tremolo). on=true turns it on.
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
      // Tremolo (crackle).
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

  // Small distant mechanical key click.
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

  // Market-crash sting (the market collapses).
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

  // Falling into the hole: swelling wind whoosh + descending sub-bass (falling sensation).
  fallWhoosh() {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 1.5;

    // Wind: bandpass noise with falling frequency + volume that swells then cuts.
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

    // Diving sub-bass.
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

  // Rising dread of the countdown: rumble + whine that intensify.
  // startDread() then setDread(x) every frame with x ∈ [0..1], then stopDread().
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

  // Fully synthesized menacing whisper (replaces the TTS voice).
  // Filtered noise (moving formants) + "syllable" tremolo + echo + sub-bass.
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

    // Moving formants (whispered vowels).
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    const fT = [0, 0.5, 1.0, 1.45];
    const fF = [420, 720, 360, 600];
    fT.forEach((t, i) => bp.frequency.setValueAtTime(fF[i], now + t));

    // Tremolo -> gives the impression of syllables.
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

    // Overall envelope.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.16, now + 0.18);
    env.gain.setValueAtTime(0.16, now + dur - 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.4;

    // Corridor echo / reverb.
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

    // Menacing sub-bass.
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

    // Keyboard ambience (distant, irregular typing).
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

    // SYNTHESIZED growl/screech REMOVED: Ansem's "voice" is now the ansem-near
    // file (loop) whose volume rises with proximity. BONK keeps its file-based sounds.
    this.growlGain.gain.setTargetAtTime(0, now, 0.1);
    this.screechGain?.gain.setTargetAtTime(0, now, 0.08);
    this.droneFilter.frequency.setTargetAtTime(220 + p * 600, now, 0.2);
    this.#updateNear(bonk ? 0 : p, pan);

    // Heartbeat: interval from 1.25 s (calm) to 0.34 s (panic).
    const interval = 1.25 - p * 0.91;
    this.beatClock += dt;
    if (p > 0.05 && this.beatClock >= interval) {
      this.beatClock = 0;
      this.#thump(p);
    }

    // Player footsteps (cadence based on walk/sprint).
    if (cues.playerMoving) {
      this.playerStepClock += dt;
      const stride = cues.playerSprinting ? 0.3 : 0.46;
      if (this.playerStepClock >= stride) {
        this.playerStepClock = 0;
        this.#step({ kind: 'player', gain: cues.playerSprinting ? 0.3 : 0.22 });
      }
    } else {
      this.playerStepClock = 0.5; // immediate first step on resuming
    }

    // Monster footsteps. BONK: HEAVY steps that speed up (gallop) and grow louder
    // as it gets closer. Ansem: a lighter limp.
    if (cues.monsterMoving) {
      this.monsterStepClock += dt;
      let stride;
      let gain;
      if (bonk) {
        stride = 0.5 - p * 0.28; // 0.5 s (far) -> 0.22 s (near): gallop
        gain = 0.18 + p * 1.1; // noticeably louder as it approaches
      } else {
        stride = this.monsterStepParity ? 0.34 : 0.56; // limp
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

  // On LEVEL CHANGE: cuts the previous level's transient sounds (neon, keyboard,
  // Ansem's proximity loop, growl/screech, dread). MUSIC is handled separately (track-aware)
  // so it stays continuous when the next level uses the same track.
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

  // Cuts all continuous sounds (drone, growl, screech, neon, dread, keyboard).
  // The one-shot stinger (catch/win) stays audible since it's wired separately.
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

  // One-shot stinger.
  sting(type) {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(this.master);

    if (type === 'scream') {
      // Screamer: shrill, saturated, loud scream.
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

  // Picking up a PEPE coin: small rising neon "zap" + bright, clear arpeggio.
  coinPickup() {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    g.connect(this.master);

    // Neon zap: quick sweep upward in pitch, slightly saturated.
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

    // Bright chime arpeggio on top.
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
