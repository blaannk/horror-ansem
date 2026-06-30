// Surcouche d'interface pendant le jeu : chrono, objectif du niveau, barre de santé
// mentale, jauge de stamina, réticule, et vignette rouge qui pulse selon la proximité.

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
      </div>
      <div class="hud-compass">
        <div class="hud-compass-arrow"></div>
        <span class="hud-compass-label">EXIT</span>
      </div>
      <div class="hud-sanity">
        <span class="hud-sanity-label">Sanity</span>
        <div class="hud-sanity-track"><div class="hud-sanity-fill"></div></div>
      </div>
    `;
    container.appendChild(this.root);

    this.vignette = this.root.querySelector('.hud-vignette');
    this.timerEl = this.root.querySelector('.hud-timer');
    this.objectiveEl = this.root.querySelector('[data-objective]');
    this.sanityFill = this.root.querySelector('.hud-sanity-fill');
    this.compass = this.root.querySelector('.hud-compass');
    this.compassArrow = this.root.querySelector('.hud-compass-arrow');
  }

  setObjective(text) {
    this.objectiveEl.textContent = text || '';
  }

  update({ elapsedMs, sanity, proximity, exitAngle }) {
    this.timerEl.textContent = `${(elapsedMs / 1000).toFixed(1)}s`;

    // Boussole : pointe vers la sortie (relativement à la direction du regard).
    if (typeof exitAngle === 'number') {
      this.compass.classList.add('on');
      this.compassArrow.style.transform = `rotate(${((exitAngle * 180) / Math.PI).toFixed(1)}deg)`;
    } else {
      this.compass.classList.remove('on');
    }

    if (typeof sanity === 'number') {
      const s = Math.max(0, Math.min(1, sanity));
      this.sanityFill.style.width = `${Math.round(s * 100)}%`;
      this.sanityFill.style.background = `hsl(${Math.round(s * 155)}, 75%, 50%)`;
      this.sanityFill.classList.toggle('low', s < 0.3);
    }

    const p = proximity ?? 0;
    const pulse = 0.85 + Math.sin(elapsedMs / 90) * 0.15 * p;
    this.vignette.style.opacity = (p * pulse).toFixed(3);
  }

  destroy() {
    this.root.remove();
  }
}
