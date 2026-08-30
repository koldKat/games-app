'use strict';

const { hasPegiMetadata, hasHltbMetadata, hasDurableCover } = require('./catalogue-policy');

const GAME_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
const ENRICHED_MILESTONES = [10, 25, 50];
const COMPLETED_MILESTONES = [10, 25, 50];
const platformKey = value => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
function isEnriched(game) { return hasDurableCover(game) && hasPegiMetadata(game) && hasHltbMetadata(game) && Boolean(String(game.description || '').trim()); }

function createProgressionService({ store, data }) {
  function award(userId, event, ref, awarded) { const result = store.award(userId, event, ref); if (result.awarded) awarded.push({ event, amount: result.amount }); return result; }
  function recordGame(userId, game, { created = false } = {}) {
    if (!game?.id) return { progress: store.info(userId), awards: [] };
    const awards = []; let latest = { progress: store.info(userId) };
    const give = (event, ref) => { latest = award(userId, event, ref, awards); };
    if (created) give('game_added', game.id);
    if (hasDurableCover(game)) give('cover_added', game.id);
    if (hasPegiMetadata(game)) give('pegi_added', game.id);
    if (hasHltbMetadata(game)) give('hltb_added', game.id);
    if (String(game.description || '').trim()) give('description_added', game.id);
    if (String(game.publisher || '').trim()) give('publisher_added', game.id);
    if (Number(game.releaseYear)) give('release_year_added', game.id);
    if (Number(game.rating)) give('rating_added', game.id);
    if (Number(game.favorite)) give('favourite_added', game.id);
    if (game.ownership === 'wanted') give('wishlisted', game.id);
    if (game.playStatus === 'playing') give('playing_started', game.id);
    if (game.playStatus === 'completed') give('game_completed', game.id);
    if (platformKey(game.platform)) give('platform_first', platformKey(game.platform));
    const games = data.listGames(userId, {}); const enriched = games.filter(isEnriched).length; const completed = games.filter(item => item.playStatus === 'completed').length;
    for (const count of GAME_MILESTONES) if (games.length >= count) give(`game_count_${count}`, count);
    for (const count of ENRICHED_MILESTONES) if (enriched >= count) give(`enriched_count_${count}`, count);
    for (const count of COMPLETED_MILESTONES) if (completed >= count) give(`completed_count_${count}`, count);
    return { progress: latest.progress, awards };
  }
  function recordAvatar(userId) { const awards = []; const result = award(userId, 'avatar_added', 'first-avatar', awards); return { progress: result.progress, awards }; }
  function backfill(userId) { if (store.isBackfilled(userId)) return { progress: store.info(userId), awards: [] }; let result = { progress: store.info(userId), awards: [] }; for (const game of data.listGames(userId, {})) { const next = recordGame(userId, game, { created: true }); result = { progress: next.progress, awards: [...result.awards, ...next.awards] }; } store.markBackfilled(userId); return result; }
  return { backfill, info: store.info, recordAvatar, recordGame };
}
module.exports = { createProgressionService, isEnriched };
