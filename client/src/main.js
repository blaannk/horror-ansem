import './style.css';
import { Menu } from './ui/Menu.js';
import { Game } from './game/Game.js';
import { loadConfig } from './config.js';

const app = document.getElementById('app');

function showMenu(config) {
  new Menu(app, config, (chosen) => startGame(chosen));
}

function startGame(config) {
  // Clone la config pour que la partie en cours ne soit pas mutée par le menu.
  const gameConfig = structuredClone(config);
  new Game(app, gameConfig, (replay) => {
    if (replay) startGame(config);
    else showMenu(config);
  });
}

showMenu(loadConfig());
