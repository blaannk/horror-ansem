import './style.css';
import { Landing } from './ui/Landing.js';
import { Game } from './game/Game.js';
import { loadConfig, saveConfig } from './config.js';

const app = document.getElementById('app');

let current = null;

// Musique du menu (boucle). L'autoplay étant bloqué avant interaction, on démarre au premier
// clic/touche si le play() initial est refusé. Le volume est partagé avec le jeu (config).
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
// Volume du menu (partagé avec le jeu via la config).
function setMenuVolume(v) {
  if (menuAudio) menuAudio.volume = v;
  const c = loadConfig();
  c.volume = v;
  saveConfig(c);
}

// Petit routeur d'écrans (pas de vraie route/URL) : on détruit l'écran courant puis on
// monte le suivant sous #app. Écrans : 'landing' (hub, explications intégrées au scroll), 'game'.
let lastStartLevel = 0; // niveau choisi au menu (rejoué à l'identique sur « Play again »)

function showScreen(name, levelIndex = 0) {
  if (current?.destroy) current.destroy();
  current = null;

  // Musique de menu : active sur le menu, coupée en jeu.
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
  // Config persistée (volume, etc.) ; loadConfig fusionne avec les défauts et renvoie un objet neuf.
  const gameConfig = loadConfig();
  // La partie est pilotée par le Game ; il n'a pas de destroy() côté routeur (il se nettoie
  // lui-même à la sortie), donc on ne le stocke pas comme `current`.
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
