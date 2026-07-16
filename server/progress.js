// Deriving progress from (level_reached, won).
// Model: 3 visible chapters for 5 internal levels.
//   LEVELS = [Spawn(0), Labyrinth(1), Escape(2), Forest(3), Endgame(4)]
//   CHAPTER_OF_LEVEL (index -> chapter) = [1, 1, 1, 2, 3]
// level_reached = levelIndex + 1 (1..5). The client-side mirror is client/src/game/progress.js.

export const TOTAL_CHAPTERS = 3;

// Furthest chapter REACHED (where the player was).
export function chapterReached(levelReached) {
  const lr = Math.max(1, Math.min(5, Math.round(Number(levelReached) || 1)));
  if (lr <= 3) return 1;
  if (lr === 4) return 2;
  return 3;
}

// Progress in % (33 / 66 / 100) based on the chapter reached.
export function percentOf(levelReached) {
  return Math.round((chapterReached(levelReached) / TOTAL_CHAPTERS) * 100);
}

// Chapters CLEARED (badges). Cleared = having gone past the chapter (or won it for the 3rd).
//  - ch1 cleared if the forest was reached (lr >= 4)
//  - ch2 cleared if the liquidation was reached (lr >= 5)
//  - ch3 cleared on final victory (won)
export function badgesOf(levelReached, won) {
  const lr = Math.max(1, Math.min(5, Math.round(Number(levelReached) || 1)));
  const badges = [];
  if (lr >= 4) badges.push(1);
  if (lr >= 5) badges.push(2);
  if (won && lr >= 5) badges.push(3);
  return badges;
}

// Enriches a leaderboard row with percent + badges.
export function enrich(row) {
  return {
    ...row,
    percent: percentOf(row.level_reached),
    badges: badgesOf(row.level_reached, row.won),
  };
}
