// Surcouche d'interface pendant le jeu : chrono, objectif du niveau, barre de santé
// mentale, jauge de stamina, réticule, vignette rouge qui pulse selon la proximité, et le
// moniteur de santé mentale (courbe live) épinglé en bas à droite.

import { Chart } from './Chart.js';

export class Hud {
  constructor(container, config) {
    this.config = config;

    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-vignette"></div>
      <div class="hud-crosshair"></div>
      <div class="hud-top">
        <div class="hud-timer">0.0s</div>
        <div class="hud-hint" data-objective></div>
        <div class="hud-keys" data-keys hidden><span class="hud-keys-icon">🐸</span> <span data-keys-count>0 / 0</span></div>
      </div>
      <div class="hud-compass">
        <div class="hud-compass-dial">
          <div class="hud-compass-arrow"></div>
        </div>
        <span class="hud-compass-label">EXIT</span>
      </div>
      <div class="hud-minimap" data-minimap hidden>
        <div class="hud-minimap-title">🐸 PEPE MAP</div>
        <canvas class="hud-minimap-canvas" data-minimap-canvas width="190" height="190"></canvas>
      </div>
      <div class="hud-controls">
        <span class="hud-ctl" data-flashlight>🔦 <b>ON</b></span>
        <span class="hud-ctl-hint">[F] flashlight</span>
      </div>
      <div class="hud-monitor mh-monitor compact">
        <div class="mh-screen">
          <div class="mh-header">
            <span class="mh-title">MENTAL HEALTH</span>
            <span class="mh-tag" data-mh-val>-</span>
          </div>
          <canvas class="mh-plot" data-hud-chart></canvas>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.vignette = this.root.querySelector('.hud-vignette');
    this.timerEl = this.root.querySelector('.hud-timer');
    this.objectiveEl = this.root.querySelector('[data-objective]');
    this.compass = this.root.querySelector('.hud-compass');
    this.compassArrow = this.root.querySelector('.hud-compass-arrow');
    this.keysEl = this.root.querySelector('[data-keys]');
    this.keysCountEl = this.root.querySelector('[data-keys-count]');
    this.flashlightEl = this.root.querySelector('[data-flashlight]');
    this.minimapEl = this.root.querySelector('[data-minimap]');
    this.minimapCanvas = this.root.querySelector('[data-minimap-canvas]');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    // Moniteur de santé mentale : courbe live échantillonnée ~1×/s (fenêtre glissante 60 s).
    this.mhChart = new Chart(this.root.querySelector('[data-hud-chart]'), { compact: true });
    this.mhValEl = this.root.querySelector('[data-mh-val]');
    this.mhBuf = [];
    this.mhLastT = -1;
  }

  setObjective(text) {
    this.objectiveEl.textContent = text || '';
  }

  // Compteur de clés PEPE ; masqué quand le niveau n'en comporte pas (total = 0).
  setKeys(collected, total) {
    if (!total) {
      this.keysEl.hidden = true;
      return;
    }
    this.keysEl.hidden = false;
    this.keysCountEl.textContent = `${collected} / ${total}`;
    this.keysEl.classList.toggle('done', collected >= total);
  }

  setFlashlight(on) {
    this.flashlightEl.innerHTML = `🔦 <b>${on ? 'ON' : 'OFF'}</b>`;
    this.flashlightEl.classList.toggle('off', !on);
  }

  update({ elapsedMs, sanity, proximity, exitAngle, minimap }) {
    this.timerEl.textContent = `${(elapsedMs / 1000).toFixed(1)}s`;

    // Boussole : pointe vers la sortie (relativement à la direction du regard).
    if (typeof exitAngle === 'number') {
      this.compass.classList.add('on');
      this.compassArrow.style.transform = `rotate(${((exitAngle * 180) / Math.PI).toFixed(1)}deg)`;
    } else {
      this.compass.classList.remove('on');
    }

    // Santé mentale = SEUL indicateur (moniteur bas-droite). La barre a été retirée.
    if (typeof sanity === 'number') {
      const s = Math.max(0, Math.min(1, sanity));
      // Échantillonne la courbe une fois par seconde de jeu (fenêtre glissante de 60 pts).
      const t = Math.floor(elapsedMs / 1000);
      if (t !== this.mhLastT) {
        this.mhLastT = t;
        this.mhBuf.push({ sanity: s });
        if (this.mhBuf.length > 60) this.mhBuf.shift();
        this.mhChart.setData(this.mhBuf);
        this.mhValEl.textContent = `${Math.round(s * 100)}%`;
        this.mhValEl.style.color = s < 0.3 ? '#ff6a6a' : '#e6e9ee';
      }
    }

    this.renderMinimap(minimap);

    const p = proximity ?? 0;
    const pulse = 0.85 + Math.sin(elapsedMs / 90) * 0.15 * p;
    this.vignette.style.opacity = (p * pulse).toFixed(3);
  }

  // Mini-carte des clés PEPE : n'apparaît qu'à basse santé mentale (≤ 30 %). Vue de dessus
  // du labyrinthe avec les PEPE non ramassées, la sortie et la flèche du joueur.
  renderMinimap(mm) {
    if (!mm) {
      if (!this.minimapEl.hidden) this.minimapEl.hidden = true;
      return;
    }
    this.minimapEl.hidden = false;
    const ctx = this.minimapCtx;
    const cv = this.minimapCanvas;
    const maze = mm.maze;
    const W = cv.width;
    const H = cv.height;
    const s = Math.min(W / maze.cols, H / maze.rows);
    const ox = (W - s * maze.cols) / 2;
    const oy = (H - s * maze.rows) / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);

    // Cellules praticables (les murs restent sombres).
    ctx.fillStyle = 'rgba(120,150,140,0.16)';
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        if (maze.isWall(c, r)) continue;
        ctx.fillRect(ox + c * s, oy + r * s, s + 0.6, s + 0.6);
      }
    }

    const toXY = (col, row) => [ox + (col + 0.5) * s, oy + (row + 0.5) * s];

    // (La sortie n'est PAS indiquée sur la mini-carte - seulement les PEPE et le joueur.)

    // Clés PEPE non ramassées.
    ctx.shadowColor = '#9bff5a';
    ctx.shadowBlur = 7;
    ctx.fillStyle = '#9bff5a';
    for (const p of mm.pepes) {
      const [px, py] = toXY(p.col, p.row);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2.6, s * 1.05), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Joueur (flèche orientée selon le regard).
    const [plx, ply] = toXY(mm.player.col, mm.player.row);
    ctx.save();
    ctx.translate(plx, ply);
    ctx.rotate(Math.atan2(mm.fz, mm.fx));
    ctx.fillStyle = '#ffd060';
    const a = Math.max(4.5, s * 1.7);
    ctx.beginPath();
    ctx.moveTo(a, 0);
    ctx.lineTo(-a * 0.7, a * 0.7);
    ctx.lineTo(-a * 0.7, -a * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  destroy() {
    this.root.remove();
  }
}
