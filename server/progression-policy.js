'use strict';

const XP_EVENTS = Object.freeze({
  game_added: { amount: 50, label: 'Added a game' },
  cover_added: { amount: 15, label: 'Added box art' },
  pegi_added: { amount: 20, label: 'Recorded PEGI details' },
  hltb_added: { amount: 20, label: 'Recorded HLTB times' },
  description_added: { amount: 15, label: 'Added a description' },
  publisher_added: { amount: 5, label: 'Recorded a publisher' },
  release_year_added: { amount: 5, label: 'Recorded a release year' },
  rating_added: { amount: 10, label: 'Rated a game' },
  favourite_added: { amount: 10, label: 'Marked a favourite' },
  wishlisted: { amount: 10, label: 'Wishlisted a game' },
  playing_started: { amount: 10, label: 'Started playing' },
  game_completed: { amount: 75, label: 'Completed a game' },
  avatar_added: { amount: 25, label: 'Set a first avatar' },
  platform_first: { amount: 20, label: 'Opened a new platform shelf' },
  game_count_10: { amount: 100, label: '10-game shelf milestone' },
  game_count_25: { amount: 150, label: '25-game shelf milestone' },
  game_count_50: { amount: 250, label: '50-game shelf milestone' },
  game_count_100: { amount: 400, label: '100-game shelf milestone' },
  game_count_250: { amount: 700, label: '250-game shelf milestone' },
  game_count_500: { amount: 1000, label: '500-game shelf milestone' },
  game_count_1000: { amount: 1500, label: '1,000-game shelf milestone' },
  enriched_count_10: { amount: 150, label: '10 fully enriched records' },
  enriched_count_25: { amount: 300, label: '25 fully enriched records' },
  enriched_count_50: { amount: 600, label: '50 fully enriched records' },
  completed_count_10: { amount: 250, label: '10 completed games' },
  completed_count_25: { amount: 500, label: '25 completed games' },
  completed_count_50: { amount: 1000, label: '50 completed games' },
});

const TITLES = Object.freeze([
  'Uncatalogued', 'Shelf Scout', 'Cartridge Keeper', 'Box Hunter', 'Kat·a·log Runner', 'Metadata Miner',
  'Cover Curator', 'Platform Cartographer', 'Backlog Warden', 'Library Operator', 'Archive Hacker',
  'Release Researcher', 'Collection Engineer', 'Canon Keeper', 'Kat·a·log Architect', 'Signal Archivist',
  'Vault Guardian', 'Master Curator', 'Neon Librarian', 'Kat·a·log Legend', 'The Archivist', 'Eternal Collector',
]);

function computeLevel(xp) { return Math.min(100, Math.floor((-1 + Math.sqrt(1 + (8 * Math.max(0, Number(xp) || 0)) / 1000)) / 2)); }
function xpForLevel(level) { const value = Math.max(0, Math.min(100, Math.floor(Number(level) || 0))); return 1000 * value * (value + 1) / 2; }
function titleForLevel(level) { const clean = Math.max(0, Math.floor(Number(level) || 0)); return TITLES[Math.min(TITLES.length - 1, clean ? Math.floor(clean / 5) + 1 : 0)]; }
function progressForXp(xp) {
  const level = computeLevel(xp); const current = xpForLevel(level); const next = level >= 100 ? current : xpForLevel(level + 1);
  return { xp: Math.max(0, Math.round(Number(xp) || 0)), level, title: titleForLevel(level), currentLevelXp: current, nextLevelXp: next,
    progress: next === current ? 100 : Math.round(((Math.max(0, xp) - current) / (next - current)) * 100) };
}

module.exports = { XP_EVENTS, TITLES, computeLevel, xpForLevel, titleForLevel, progressForXp };
