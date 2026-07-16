import './style.css';
import { Landing } from './ui/Landing.js';
import { Game } from './game/Game.js';
import { loadConfig, saveConfig } from './config.js';

const app = document.getElementById('app');

let current = null;

// Menu music (loop). Since autoplay is blocked before interaction, we start on the first
// click/key press if the initial play() is rejected. Volume is shared with the game (config).
let menuAudio = null;
function startMenuMusic() {
  if (!menuAudio) {
    menuAudio = new Audio('/sfx/menu-music.mp3');
    menuAudio.loop = true;
    menuAudio.volume = loadConfig().volume ?? 0.8;
  }
  menuAudio.play().catch(() => {
    const once = () => {
      menuAudio.play().catch(() => {});
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('keydown', once);
    };
    document.addEventListener('pointerdown', once);
    document.addEventListener('keydown', once);
  });
}
function stopMenuMusic() {
  if (menuAudio) menuAudio.pause();
}
// Menu volume (shared with the game via config).
function setMenuVolume(v) {
  if (menuAudio) menuAudio.volume = v;
  const c = loadConfig();
  c.volume = v;
  saveConfig(c);
}

// Small screen router (no real route/URL): destroy the current screen then
// mount the next one under #app. Screens: 'landing' (hub, explanations built into the scroll), 'game'.
let lastStartLevel = 0; // level chosen in the menu (replayed identically on "Play again")

function showScreen(name, levelIndex = 0) {
  if (current?.destroy) current.destroy();
  current = null;

  // Menu music: on during the menu, off during gameplay.
  if (name === 'game') stopMenuMusic();
  else startMenuMusic();

  if (name === 'landing') {
    current = new Landing(app, {
      onPlay: (lvl = 0) => showScreen('game', lvl),
      volume: loadConfig().volume ?? 0.8,
      onVolume: setMenuVolume,
    });
  } else if (name === 'game') {
    startGame(levelIndex);
  }
}

function startGame(levelIndex = 0) {
  lastStartLevel = levelIndex;
  // Persisted config (volume, etc.); loadConfig merges with the defaults and returns a new object.
  const gameConfig = loadConfig();
  // The game session is driven by Game; it has no destroy() on the router side (it cleans
  // itself up on exit), so we don't store it as `current`.
  current = null;
  new Game(
    app,
    gameConfig,
    (replay) => {
      if (replay) startGame(lastStartLevel);
      else showScreen('landing');
    },
    levelIndex
  );
}

showScreen('landing');
