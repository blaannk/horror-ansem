import { SETTINGS_SCHEMA, saveConfig } from '../config.js';

// Menu d'accueil minimal : trois réglages (vitesse du joueur, santé mentale de départ,
// volume), puis lancement de la partie. La carte est fixe et n'est plus configurable.

export class Menu {
  constructor(container, config, onPlay) {
    this.config = config;
    this.onPlay = onPlay;

    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">🐕 ESCAPE&nbsp;<span class="bonk">BONK</span></h1>
        <p class="menu-tagline">Find the exit before he catches you. Good luck.</p>

        <div class="menu-section">
          <span class="menu-label">Settings</span>
          <div class="sliders" data-sliders></div>
        </div>

        <button class="btn-play" data-play>▶ PLAY</button>
        <p class="menu-controls">Z/S to move · Q/D (left/right are <strong>swapped</strong>) · Shift to sprint · Mouse to look · Esc to pause</p>
      </div>`;
    container.appendChild(this.root);

    this.#renderSliders();

    this.root.querySelector('[data-play]').addEventListener('click', () => {
      saveConfig(this.config);
      this.destroy();
      this.onPlay(this.config);
    });
  }

  #renderSliders() {
    const wrap = this.root.querySelector('[data-sliders]');
    wrap.innerHTML = '';
    for (const s of SETTINGS_SCHEMA) {
      const row = document.createElement('label');
      row.className = 'slider-row';
      const value = this.config[s.key];
      row.innerHTML = `
        <span class="slider-name">${s.label}</span>
        <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${value}" data-key="${s.key}" />
        <span class="slider-val" data-val="${s.key}">${formatVal(value, s)}</span>`;
      const input = row.querySelector('input');
      const valEl = row.querySelector('[data-val]');
      input.addEventListener('input', () => {
        const v = Number(input.value);
        this.config[s.key] = v;
        valEl.textContent = formatVal(v, s);
      });
      wrap.appendChild(row);
    }
  }

  destroy() {
    this.root.remove();
  }
}

function formatVal(v, s) {
  const num = s.step < 1 ? v.toFixed(2) : v;
  return `${num}${s.unit || ''}`;
}
