// "How it works" page: story, controls (with the intentional left/right swap)
// and mechanics (mental health, PEPE keys -> portal, gated compass, flashlight + hiding, Ansem).

export class HowItWorks {
  constructor(container, { onBack, onPlay }) {
    this.onBack = onBack;
    this.onPlay = onPlay;

    this.root = document.createElement('div');
    this.root.className = 'howto';
    this.root.innerHTML = `
      <header class="landing-nav">
        <span class="landing-logo">☠&nbsp;ESCAPE&nbsp;<span class="bonk">ANSEM</span></span>
        <button class="btn-ghost" data-back>← Back</button>
      </header>

      <div class="howto-body">
        <h1 class="howto-title">How it works</h1>

        <section class="howto-block">
          <h2>The nightmare</h2>
          <p>You wake in a filthy yellow room, buzzing neons, a broken screen stuck on
          <em>"Buy the dip."</em> Thread the maze while crypto charts crash around you, then a
          door opens and <strong>Ansem</strong> starts hunting. Find the way out before he finds you.</p>
        </section>

        <section class="howto-block">
          <h2>Your goal: the 🐸 keys</h2>
          <p>Scattered through the maze are <strong>PEPE coins</strong>. Collect <strong>all of them</strong>
          to open the way out, a <strong>pit in the floor</strong> that stays sealed until then. Once every key
          is in, drop into it to fall to the next level.</p>
        </section>

        <section class="howto-block">
          <h2>Controls</h2>
          <div class="howto-warn">⚠ Left and right are <strong>intentionally swapped</strong>.</div>
          <table class="howto-keys">
            <tr><td>Move</td><td><kbd>Z</kbd>/<kbd>W</kbd> · <kbd>S</kbd> (or ↑ / ↓)</td></tr>
            <tr><td>Left / Right</td><td><kbd>Q</kbd>·<kbd>A</kbd> / <kbd>D</kbd> (swapped)</td></tr>
            <tr><td>Sprint</td><td><kbd>Shift</kbd></td></tr>
            <tr><td>Jump</td><td><kbd>Space</kbd></td></tr>
            <tr><td>Crouch / crawl</td><td><kbd>Ctrl</kbd> or <kbd>C</kbd></td></tr>
            <tr><td>Look</td><td>Mouse (click = lock)</td></tr>
            <tr><td>Flashlight</td><td><kbd>F</kbd></td></tr>
            <tr><td>Pause / options</td><td><kbd>Esc</kbd></td></tr>
          </table>
        </section>

        <section class="howto-block">
          <h2>Mechanics</h2>
          <ul class="howto-list">
            <li><strong>Sanity</strong>: the lower it is, the faster Ansem runs and the further he senses you.
            High sanity even makes <em>you</em> faster.</li>
            <li><strong>Flashlight (F)</strong>: turn it <strong>off</strong>, stand <strong>still</strong> in a
            <strong>corner</strong>, and Ansem walks right past you.</li>
            <li><strong>Compass &amp; map</strong>: appear automatically while your sanity holds up
            (compass ≥ 20%, PEPE map ≥ 30%); they point you to the exit and the keys.</li>
            <li><strong>Get caught</strong> and he lunges into a full-screen scream. Then it's over.</li>
          </ul>
        </section>

        <button class="btn-play" data-play-back>▶ I'm ready, PLAY</button>
      </div>
    `;
    container.appendChild(this.root);

    this.root.querySelector('[data-back]').addEventListener('click', () => this.onBack());
    this.root.querySelector('[data-play-back]').addEventListener('click', () => this.onPlay());
  }

  destroy() {
    this.root.remove();
  }
}
