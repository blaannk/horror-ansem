// End of game screen: victory (escape) or defeat (caught).
// In BOTH cases we record progress to the leaderboard (ranked by % progress).
// Shows the player's rank, their % reached, their badges, and the Top 10 by progress.

import {
  CHAPTERS,
  percentOf,
  badgesOf,
  getPlayerId,
  getPlayerName,
  setPlayerName,
} from '../game/progress.js';
import { connectWallet, disconnectWallet, getAuthToken, isConnected, shortWallet } from '../game/wallet.js';
import { icon } from './icons.js';

export class EndScreen {
  constructor(container, { won, timeMs, config, levelReached = 1, runToken = null, onReplay, onMenu }) {
    this.container = container;
    this.config = config;
    this.timeMs = timeMs;
    this.levelReached = levelReached;
    this.runToken = runToken;
    this.won = won;
    this.onReplay = onReplay;
    this.onMenu = onMenu;
    this.playerId = getPlayerId();
    this.percent = percentOf(levelReached);
    this.submitted = false; // idempotence guard: one run = ONE recorded row only

    this.root = document.createElement('div');
    this.root.className = `endscreen ${won ? 'win' : 'lose'}`;
    this.root.innerHTML = this.#html();
    // Mounted on <body> (not the game container) so position:fixed is relative to the REAL viewport,
    // safe from any transformed/filtered ancestor: the window stays centered, no scroll.
    document.body.appendChild(this.root);

    // On leaving this screen (replay / menu), we record the run one last time if the player
    // hasn't clicked "Save my name" - this way both death AND victory get recorded, but only ONCE
    // (the `submitted` guard), with no duplicate and no overwriting of the name by auto-submit.
    this.root.querySelector('[data-replay]').addEventListener('click', () => {
      this.#submitScore();
      this.destroy();
      onReplay();
    });
    this.root.querySelector('[data-menu]').addEventListener('click', () => {
      this.#submitScore();
      this.destroy();
      onMenu();
    });

    this.#wireSaveArea();
    this.#loadLeaderboard();
  }

  // Save area: name form if a wallet is connected, otherwise a prompt
  // to connect the wallet (required to be ranked).
  #saveAreaHtml() {
    if (isConnected()) {
      return `
        <form data-score-form class="score-form">
          <input type="text" name="name" maxlength="24" placeholder="Your name" autocomplete="off"
                 value="${escapeHtml(getPlayerName() || shortWallet())}" />
          <button type="submit">Save my name</button>
        </form>`;
    }
    return `
      <div class="connect-prompt">
        <p>Connect your wallet to save this run and enter the leaderboard.</p>
        <button class="btn-primary" data-connect>Connect Wallet</button>
      </div>`;
  }

  #wireSaveArea() {
    const area = this.root.querySelector('[data-save-area]');
    area.querySelector('[data-score-form]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.#submitScore();
    });
    area.querySelector('[data-connect]')?.addEventListener('click', (e) =>
      this.#connectAndSave(e.currentTarget)
    );
  }

  // Connects the wallet from the end screen, then records the run.
  async #connectAndSave(btn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    try {
      await connectWallet();
      const area = this.root.querySelector('[data-save-area]');
      area.innerHTML = this.#saveAreaHtml(); // becomes the name form
      this.#wireSaveArea();
      this.#submitScore();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = err?.message === 'phantom-missing' ? 'Install Phantom' : 'Connect failed';
      setTimeout(() => {
        btn.textContent = original;
      }, 1800);
    }
  }

  #html() {
    const title = this.won
      ? `<h1 class="end-title">${icon('exit', { size: 34 })} ESCAPED!</h1>`
      : `<h1 class="end-title dead">${icon('skull', { size: 34 })} CAUGHT</h1>`;
    const verb = this.won ? 'You got away from Ansem in' : 'Ansem got you after';
    const earned = badgesOf(this.levelReached, this.won);
    return `
      <div class="end-panel">
        ${title}
        <p class="end-sub">${verb} <strong>${(this.timeMs / 1000).toFixed(2)}s</strong></p>
        <div class="end-progress">
          <span class="end-pct">${this.percent}%</span>
          <div class="end-badges">${badgeChips(earned)}</div>
        </div>
        <div class="save-area" data-save-area>${this.#saveAreaHtml()}</div>
        <div class="submit-msg" data-submit-msg></div>
        <h2 class="lb-title">${icon('trophy', { size: 16 })} Furthest survivors</h2>
        <ol class="leaderboard lb-progress" data-leaderboard><li class="lb-loading">Loading…</li></ol>
        <div class="end-actions">
          <button class="btn-primary" data-replay>${this.won ? 'Play again' : 'Try again'}</button>
          <button class="btn-ghost" data-menu>Menu</button>
        </div>
      </div>`;
  }

  async #submitScore() {
    if (this.submitted) return; // only one recording per run (no duplicates)
    // Wallet REQUIRED to be ranked: without a connection, we record nothing (the player
    // can leave without saving). The connect prompt stays shown in the dedicated area.
    if (!isConnected()) return;
    this.submitted = true;
    const input = this.root.querySelector('input[name="name"]');
    const msg = this.root.querySelector('[data-submit-msg]');
    const typed = input?.value.trim() || '';
    const name = typed || getPlayerName() || shortWallet();
    if (typed) setPlayerName(typed);
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          time_ms: Math.round(this.timeMs),
          maze_size: 21, // fixed map (leaderboard schema compat)
          difficulty: this.config.difficulty,
          level_reached: this.levelReached,
          player_id: this.playerId,
          won: this.won,
          run_token: this.runToken,
          auth_token: getAuthToken(),
        }),
      });
      if (res.status === 409) {
        // Run already submitted (replay): this isn't a network error, don't retry.
        msg.textContent = 'ℹ️ Already saved for this run.';
        this.#loadLeaderboard();
        return;
      }
      if (res.status === 403) {
        // Run not verified (missing/expired token): don't retry (avoid infinite retry loop).
        msg.textContent = '⚠️ Run not verified, score not ranked.';
        return;
      }
      if (res.status === 401) {
        // Wallet session missing/expired: show the connect prompt again.
        this.submitted = false;
        await disconnectWallet();
        const area = this.root.querySelector('[data-save-area]');
        area.innerHTML = this.#saveAreaHtml();
        this.#wireSaveArea();
        msg.textContent = '⚠️ Connect your wallet to enter the leaderboard.';
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.rank) {
        msg.textContent = `✅ Saved · you're #${data.rank}${data.total ? ` / ${data.total}` : ''}`;
      } else {
        msg.textContent = '✅ Saved!';
      }
      this.#loadLeaderboard();
    } catch {
      this.submitted = false; // network failure: allow retrying
      msg.textContent = '⚠️ Could not save (server offline?)';
    }
  }

  async #loadLeaderboard() {
    const list = this.root.querySelector('[data-leaderboard]');
    try {
      const res = await fetch(`/api/leaderboard?sort=progress&me=${encodeURIComponent(this.playerId)}&limit=10`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { scores } = await res.json();
      if (!scores.length) {
        list.innerHTML = '<li class="lb-empty">No runs yet. Be the first!</li>';
        return;
      }
      list.innerHTML = scores.map((s, i) => leaderboardRow(s, i, this.playerId)).join('');
    } catch {
      list.innerHTML = '<li class="lb-empty">Leaderboard unavailable (server offline).</li>';
    }
  }

  destroy() {
    this.root.remove();
  }
}

// Badge chips (chapters cleared).
export function badgeChips(badgeNums) {
  if (!badgeNums || !badgeNums.length) return '';
  return badgeNums
    .map((n) => {
      const b = CHAPTERS[n - 1]?.badge;
      if (!b) return '';
      return `<span class="badge-chip" style="--chip:${b.color}" title="${escapeHtml(b.label)}">${icon(b.icon, { size: 13 })}</span>`;
    })
    .join('');
}

// A progress-leaderboard row (rank, name, %, badges, time).
export function leaderboardRow(s, i, meId) {
  const mine = meId && s.player_id === meId ? ' class="lb-me"' : '';
  return (
    `<li${mine}><span class="lb-rank">#${i + 1}</span>` +
    `<span class="lb-name">${escapeHtml(s.name)}</span>` +
    `<span class="lb-badges">${badgeChips(s.badges)}</span>` +
    `<span class="lb-pct">${s.percent ?? 0}%</span>` +
    `<span class="lb-time">${(s.time_ms / 1000).toFixed(2)}s</span></li>`
  );
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
