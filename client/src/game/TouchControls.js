import * as THREE from 'three';

// Touch controls (mobile): movement joystick on the left, look via drag on the right,
// and contextual action buttons (flashlight / jump / crouch depending on the chapter). Replaces
// pointer-lock + keyboard, unavailable on touch. Mounted only on touch screens.

const LOOK_SENS = 0.0042; // look sensitivity (rad per pixel)
const MAX_PITCH = Math.PI / 2 - 0.05;

export function isTouchDevice() {
  try {
    return (
      window.matchMedia?.('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  } catch {
    return false;
  }
}

export class TouchControls {
  // callbacks: { onFlashlight, onPause }
  constructor(container, { camera, player, onFlashlight, onPause }) {
    this.container = container;
    this.camera = camera;
    this.player = player;
    this.onFlashlight = onFlashlight;
    this.onPause = onPause;

    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.joyId = null;
    this.lookId = null;
    this.joyCenter = { x: 0, y: 0 };
    this.crouched = false;

    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.innerHTML = `
      <div class="touch-joy" data-joy hidden>
        <div class="touch-joy-knob" data-knob></div>
      </div>
      <div class="touch-actions">
        <button class="touch-btn touch-flash" data-act="flashlight" hidden aria-label="Flashlight">🔦</button>
        <button class="touch-btn touch-crouch" data-act="crouch" hidden aria-label="Crouch">CROUCH</button>
        <button class="touch-btn touch-jump" data-act="jump" hidden aria-label="Jump">JUMP</button>
      </div>
      <button class="touch-pause" data-pause aria-label="Pause">❚❚</button>
    `;
    container.appendChild(this.root);

    this.joyEl = this.root.querySelector('[data-joy]');
    this.knobEl = this.root.querySelector('[data-knob]');
    this.flashBtn = this.root.querySelector('[data-act="flashlight"]');
    this.crouchBtn = this.root.querySelector('[data-act="crouch"]');
    this.jumpBtn = this.root.querySelector('[data-act="jump"]');

    // Joystick radius (in px), derived from the rendered size of the base.
    this.joyRadius = 52;

    this.#bind();
    this.setVisible(false);
  }

  #bind() {
    this._onDown = (e) => this.#onDown(e);
    this._onMove = (e) => this.#onMove(e);
    this._onUp = (e) => this.#onUp(e);
    this.root.addEventListener('pointerdown', this._onDown, { passive: false });
    this.root.addEventListener('pointermove', this._onMove, { passive: false });
    this.root.addEventListener('pointerup', this._onUp);
    this.root.addEventListener('pointercancel', this._onUp);

    // Action buttons: consume the event (no look/joystick triggered underneath).
    this.flashBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.flashBtn.classList.toggle('active');
      this.onFlashlight?.();
    });
    this.jumpBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.player.jump();
    });
    this.crouchBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.crouched = !this.crouched;
      this.player.setCrouch(this.crouched);
      this.crouchBtn.classList.toggle('active', this.crouched);
    });
    this.root.querySelector('[data-pause]').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.onPause?.();
    });
  }

  #onDown(e) {
    if (e.target.closest('[data-act],[data-pause]')) return; // handled by the button
    e.preventDefault();
    const leftZone = e.clientX < window.innerWidth * 0.5;
    if (leftZone && this.joyId === null) {
      this.joyId = e.pointerId;
      this.joyCenter = { x: e.clientX, y: e.clientY };
      this.joyEl.hidden = false;
      this.joyEl.style.left = `${e.clientX}px`;
      this.joyEl.style.top = `${e.clientY}px`;
      this.joyRadius = this.joyEl.offsetWidth / 2 || 52;
      this.#moveKnob(0, 0);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    } else {
      return;
    }
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  #onMove(e) {
    if (e.pointerId === this.joyId) {
      e.preventDefault();
      let dx = e.clientX - this.joyCenter.x;
      let dy = e.clientY - this.joyCenter.y;
      const r = this.joyRadius;
      const len = Math.hypot(dx, dy);
      if (len > r) {
        dx = (dx / len) * r;
        dy = (dy / len) * r;
      }
      this.#moveKnob(dx, dy);
      // strafe +1 = right; forward +1 = forward (top of screen = negative dy).
      this.player.setMove(dx / r, -dy / r);
    } else if (e.pointerId === this.lookId) {
      e.preventDefault();
      const dx = e.clientX - this.lookX;
      const dy = e.clientY - this.lookY;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      this.#applyLook(dx, dy);
    }
  }

  #onUp(e) {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.joyEl.hidden = true;
      this.player.clearMove();
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
    try {
      this.root.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  #moveKnob(dx, dy) {
    this.knobEl.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
  }

  // Look: replicates PointerLockControls' mechanics (YXZ euler + pitch clamp).
  #applyLook(dx, dy) {
    const q = this.camera.quaternion;
    this._euler.setFromQuaternion(q);
    this._euler.y -= dx * LOOK_SENS;
    this._euler.x -= dy * LOOK_SENS;
    this._euler.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this._euler.x));
    q.setFromEuler(this._euler);
  }

  // Button set depending on the visible chapter: Ch.1 -> flashlight, Ch.2 -> none, Ch.3 -> jump + crouch.
  setLevelButtons(chapter) {
    this.flashBtn.hidden = chapter !== 1;
    this.jumpBtn.hidden = chapter !== 3;
    this.crouchBtn.hidden = chapter !== 3;
    // The flashlight starts on at every level (mirrors game.flashlightOn).
    this.flashBtn.classList.add('active');
    // Reset crouch between levels.
    this.crouched = false;
    this.crouchBtn.classList.remove('active');
    this.player.setCrouch(false);
  }

  setVisible(on) {
    this.root.hidden = !on;
    if (!on) this.#reset();
  }

  #reset() {
    this.joyId = null;
    this.lookId = null;
    this.joyEl.hidden = true;
    this.player.clearMove();
  }

  destroy() {
    this.root.removeEventListener('pointerdown', this._onDown);
    this.root.removeEventListener('pointermove', this._onMove);
    this.root.removeEventListener('pointerup', this._onUp);
    this.root.removeEventListener('pointercancel', this._onUp);
    this.root.remove();
  }
}
