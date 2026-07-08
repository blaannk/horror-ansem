// Dérivation de l'avancement à partir de (level_reached, won).
// Modèle : 3 chapitres visibles pour 5 niveaux internes.
//   LEVELS = [Spawn(0), Labyrinth(1), Escape(2), Forest(3), Endgame(4)]
//   CHAPTER_OF_LEVEL (index -> chapitre) = [1, 1, 1, 2, 3]
// level_reached = levelIndex + 1 (1..5). Le miroir côté client est client/src/game/progress.js.

export const TOTAL_CHAPTERS = 3;

// Chapitre le plus loin ATTEINT (où le joueur se trouvait).
export function chapterReached(levelReached) {
  const lr = Math.max(1, Math.min(5, Math.round(Number(levelReached) || 1)));
  if (lr <= 3) return 1;
  if (lr === 4) return 2;
  return 3;
}

// Avancement en % (33 / 66 / 100) basé sur le chapitre atteint.
export function percentOf(levelReached) {
  return Math.round((chapterReached(levelReached) / TOTAL_CHAPTERS) * 100);
}

// Chapitres FRANCHIS (badges). Franchir = avoir dépassé le chapitre (ou l'avoir gagné pour le 3e).
//  - ch1 franchi si on a atteint la forêt (lr >= 4)
//  - ch2 franchi si on a atteint la liquidation (lr >= 5)
//  - ch3 franchi si victoire finale (won)
export function badgesOf(levelReached, won) {
  const lr = Math.max(1, Math.min(5, Math.round(Number(levelReached) || 1)));
  const badges = [];
  if (lr >= 4) badges.push(1);
  if (lr >= 5) badges.push(2);
  if (won && lr >= 5) badges.push(3);
  return badges;
}

// Enrichit une ligne de leaderboard avec percent + badges.
export function enrich(row) {
  return {
    ...row,
    percent: percentOf(row.level_reached),
    badges: badgesOf(row.level_reached, row.won),
  };
}
