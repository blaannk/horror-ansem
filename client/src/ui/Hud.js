// In-game UI overlay: timer, level objective, mental-health bar,
// stamina gauge, crosshair, red vignette that pulses with proximity, and the
// mental-health monitor (live chart) pinned bottom-right.

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

    // Mental-health monitor: live chart sampled ~1x/s (60 s sliding window).
    this.mhChart = new Chart(this.root.querySelector('[data-hud-chart]'), { compact: true });
    this.mhValEl = this.root.querySelector('[data-mh-val]');
    this.mhBuf = [];
    this.mhLastT = -1;
  }

  setObjective(text) {
    this.objectiveEl.textContent = text || '';
  }

  // PEPE key counter; hidden when the level has none (total = 0).
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

    // Compass: points to the exit (relative to the look direction).
    if (typeof exitAngle === 'number') {
      this.compass.classList.add('on');
      this.compassArrow.style.transform = `rotate(${((exitAngle * 180) / Math.PI).toFixed(1)}deg)`;
    } else {
      this.compass.classList.remove('on');
    }

    // Mental health = ONLY indicator (bottom-right monitor). The bar was removed.
    if (typeof sanity === 'number') {
      const s = Math.max(0, Math.min(1, sanity));
      // Sample the chart once per second of gameplay (60-point sliding window).
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

  // PEPE key minimap: only appears at low mental health (<= 30%). Top-down view
  // of the maze with the uncollected PEPEs, the exit, and the player's arrow.
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

    // Walkable cells (walls stay dark).
    ctx.fillStyle = 'rgba(120,150,140,0.16)';
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        if (maze.isWall(c, r)) continue;
        ctx.fillRect(ox + c * s, oy + r * s, s + 0.6, s + 0.6);
      }
    }

    const toXY = (col, row) => [ox + (col + 0.5) * s, oy + (row + 0.5) * s];

    // (The exit is NOT shown on the minimap - only the PEPEs and the player.)

    // Uncollected PEPE keys.
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

    // Player (arrow oriented per look direction).
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
