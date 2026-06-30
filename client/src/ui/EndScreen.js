// Écran de fin de partie : victoire (évasion) ou défaite (capturé).
// En cas de victoire, propose de soumettre son temps au leaderboard.
// Affiche le Top 10 pour la difficulté courante.

export class EndScreen {
  constructor(container, { won, timeMs, config, onReplay, onMenu }) {
    this.container = container;
    this.config = config;
    this.timeMs = timeMs;
    this.onReplay = onReplay;
    this.onMenu = onMenu;
    this.submitted = false;

    this.root = document.createElement('div');
    this.root.className = `endscreen ${won ? 'win' : 'lose'}`;
    this.root.innerHTML = won ? this.#winHtml() : this.#loseHtml();
    container.appendChild(this.root);

    this.root.querySelector('[data-replay]').addEventListener('click', () => {
      this.destroy();
      onReplay();
    });
    this.root.querySelector('[data-menu]').addEventListener('click', () => {
      this.destroy();
      onMenu();
    });

    if (won) {
      const form = this.root.querySelector('[data-score-form]');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.#submitScore();
      });
    }

    this.#loadLeaderboard();
  }

  #winHtml() {
    return `
      <div class="end-panel">
        <h1 class="end-title">🏃 ESCAPED!</h1>
        <p class="end-sub">You got away from Ansem in <strong>${(this.timeMs / 1000).toFixed(2)}s</strong></p>
        <form data-score-form class="score-form">
          <input type="text" name="name" maxlength="24" placeholder="Your name" autocomplete="off" />
          <button type="submit">Submit my time</button>
        </form>
        <div class="submit-msg" data-submit-msg></div>
        <h2 class="lb-title">🏆 Best times</h2>
        <ol class="leaderboard" data-leaderboard><li class="lb-loading">Loading…</li></ol>
        <div class="end-actions">
          <button class="btn-primary" data-replay>Play again</button>
          <button class="btn-ghost" data-menu>Menu</button>
        </div>
      </div>`;
  }

  #loseHtml() {
    return `
      <div class="end-panel">
        <h1 class="end-title dead">💀 CAUGHT</h1>
        <p class="end-sub">Ansem got you after <strong>${(this.timeMs / 1000).toFixed(2)}s</strong></p>
        <h2 class="lb-title">🏆 Best times</h2>
        <ol class="leaderboard" data-leaderboard><li class="lb-loading">Loading…</li></ol>
        <div class="end-actions">
          <button class="btn-primary" data-replay>Try again</button>
          <button class="btn-ghost" data-menu>Menu</button>
        </div>
      </div>`;
  }

  async #submitScore() {
    if (this.submitted) return;
    const input = this.root.querySelector('input[name="name"]');
    const msg = this.root.querySelector('[data-submit-msg]');
    const name = input.value.trim() || 'Anonymous';
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          time_ms: Math.round(this.timeMs),
          maze_size: 21, // carte fixe (compat schéma leaderboard)
          difficulty: this.config.difficulty,
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.submitted = true;
      msg.textContent = '✅ Score saved!';
      this.root.querySelector('[data-score-form]').style.display = 'none';
      this.#loadLeaderboard();
    } catch (err) {
      msg.textContent = '⚠️ Could not save (server offline?)';
    }
  }

  async #loadLeaderboard() {
    const list = this.root.querySelector('[data-leaderboard]');
    try {
      const res = await fetch(`/api/leaderboard?difficulty=${encodeURIComponent(this.config.difficulty)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { scores } = await res.json();
      if (!scores.length) {
        list.innerHTML = '<li class="lb-empty">No times yet. Be the first!</li>';
        return;
      }
      list.innerHTML = scores
        .map(
          (s, i) =>
            `<li><span class="lb-rank">#${i + 1}</span><span class="lb-name">${escapeHtml(s.name)}</span><span class="lb-time">${(s.time_ms / 1000).toFixed(2)}s</span></li>`
        )
        .join('');
    } catch {
      list.innerHTML = '<li class="lb-empty">Leaderboard unavailable (server offline).</li>';
    }
  }

  destroy() {
    this.root.remove();
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
