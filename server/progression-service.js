'use strict';

const { hasPegiMetadata, hasHltbMetadata, hasDurableCover, normalizeKatalogText } = require('./katalog-policy');

const GAME_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
const ENRICHED_MILESTONES = [10, 25, 50];
const COMPLETED_MILESTONES = [10, 25, 50];
const COLLECTION_ACHIEVEMENTS_BACKFILL = 'collection-achievements-v1';
const PLATFORM_SPECIALIST_COUNT = 25;
const platformKey = value => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const titleKey = normalizeKatalogText;
const gameKey = game => Number(game.canonicalGameId) > 0 ? `canonical-${Number(game.canonicalGameId)}` : `title-${titleKey(game.title)}`;
function isEnriched(game) { return hasDurableCover(game) && hasPegiMetadata(game) && hasHltbMetadata(game) && Boolean(String(game.description || '').trim()); }

function createProgressionService({ store, data }) {
  function award(userId, event, ref, awarded) { const result = store.award(userId, event, ref); if (result.awarded) awarded.push({ event, ref, amount: result.amount, levels: result.levels }); return result; }
  function awardCollectionMilestones(userId, give) {
    const games = data.listGames(userId, {});
    const enriched = games.filter(isEnriched).length;
    const completed = games.filter(item => item.playStatus === 'completed').length;
    for (const count of GAME_MILESTONES) if (games.length >= count) give(`game_count_${count}`, count);
    for (const count of ENRICHED_MILESTONES) if (enriched >= count) give(`enriched_count_${count}`, count);
    for (const count of COMPLETED_MILESTONES) if (completed >= count) give(`completed_count_${count}`, count);
    awardCollectionAchievements(games, give);
  }
  function awardCollectionAchievements(games, give) {
    const owned = games.filter(game => game.ownership === 'owned' && game.playStatus !== 'hidden');
    const platformsByGame = new Map();
    const formatsByRelease = new Map();
    const gamesByPlatform = new Map();
    for (const game of owned) {
      const identity = gameKey(game); const platform = platformKey(game.platform);
      if (!titleKey(game.title) || !platform) continue;
      if (!platformsByGame.has(identity)) platformsByGame.set(identity, new Set());
      platformsByGame.get(identity).add(platform);
      const release = `${identity}:${platform}`;
      if (!formatsByRelease.has(release)) formatsByRelease.set(release, new Set());
      formatsByRelease.get(release).add(String(game.mediaFormat || '').toLowerCase());
      if (!gamesByPlatform.has(platform)) gamesByPlatform.set(platform, new Set());
      gamesByPlatform.get(platform).add(identity);
    }
    for (const [identity, platforms] of platformsByGame) if (platforms.size >= 2) give('multiplatform_collector', identity);
    for (const [release, formats] of formatsByRelease) if (formats.has('physical') && formats.has('digital')) give('format_double_dip', release);
    for (const [platform, gamesOnPlatform] of gamesByPlatform) if (gamesOnPlatform.size >= PLATFORM_SPECIALIST_COUNT) give('platform_specialist', platform);
  }
  function collectionGames(userId) {
    return typeof data.listProgressionGames === 'function' ? data.listProgressionGames(userId) : data.listGames(userId, {});
  }
  function backfillCollectionAchievements(userId) {
    if (store.hasMigration?.(userId, COLLECTION_ACHIEVEMENTS_BACKFILL)) return { progress: store.info(userId), awards: [] };
    const awards = []; let latest = { progress: store.info(userId) };
    const give = (event, ref) => { latest = award(userId, event, ref, awards); };
    awardCollectionAchievements(collectionGames(userId), give);
    store.markMigration?.(userId, COLLECTION_ACHIEVEMENTS_BACKFILL);
    return { progress: latest.progress, awards };
  }
  function backfillCollectionAchievementsForAll() {
    const userIds = typeof data.listUserIds === 'function' ? data.listUserIds() : [];
    return userIds.map(userId => ({ userId, ...backfillCollectionAchievements(userId) }));
  }
  function recordGame(userId, game, { created = false, previous = null, katalogContribution = false } = {}) {
    if (!game?.id) return { progress: store.info(userId), awards: [] };
    const awards = []; let latest = { progress: store.info(userId) };
    const give = (event, ref) => { latest = award(userId, event, ref, awards); };
    if (created) give('game_added', game.id);
    if (hasDurableCover(game)) give('cover_added', game.id);
    if (hasPegiMetadata(game)) give('pegi_added', game.id);
    if (hasHltbMetadata(game)) give('hltb_added', game.id);
    if (String(game.description || '').trim()) give('description_added', game.id);
    if (String(game.notes || '').trim()) give('note_added', game.id);
    if (String(game.publisher || '').trim()) give('publisher_added', game.id);
    if (Number(game.releaseYear)) give('release_year_added', game.id);
    if (Number(game.rating)) give('rating_added', game.id);
    if (Number(game.favorite)) give('favourite_added', game.id);
    if (game.ownership === 'wanted') give('wishlisted', game.id);
    if (previous?.ownership === 'wanted' && game.ownership === 'owned') give('wishlist_fulfilled', game.id);
    if (game.playStatus === 'playing') give('playing_started', game.id);
    if (game.playStatus === 'completed') give('game_completed', game.id);
    if (katalogContribution) give('catalogue_contribution', game.id);
    if (platformKey(game.platform)) give('platform_first', platformKey(game.platform));
    awardCollectionMilestones(userId, give);
    return { progress: latest.progress, awards };
  }
  function recordImportedGames(userId, games = [], { milestones = true } = {}) {
    const awards = []; let latest = { progress: store.info(userId) };
    const give = (event, ref) => { latest = award(userId, event, ref, awards); };
    for (const game of games) {
      if (!game?.id) continue;
      give('game_added', game.id);
      if (platformKey(game.platform)) give('platform_first', platformKey(game.platform));
    }
    if (milestones) awardCollectionMilestones(userId, give);
    return { progress: latest.progress, awards };
  }
  function recordAvatar(userId) { const awards = []; const result = award(userId, 'avatar_added', 'first-avatar', awards); return { progress: result.progress, awards }; }
  function recordForumThread(userId, threadId) { const awards = []; const result = award(userId, 'forum_thread', `thread-${threadId}`, awards); return { progress: result.progress, awards }; }
  function recordForumReply(userId, threadId, postId) { const awards = []; const result = award(userId, 'forum_reply', `post-${postId || threadId}`, awards); return { progress: result.progress, awards }; }
  function recordForumReplyReceived(userId, threadId) { const awards = []; const result = award(userId, 'forum_reply_received', `thread-${threadId}`, awards); return { progress: result.progress, awards }; }
  function backfillKatalogContributions(contributions = []) {
    const awards = [];
    for (const contribution of contributions) award(contribution.userId, 'catalogue_contribution', contribution.gameId, awards);
    const progress = contributions.length ? store.info(contributions[contributions.length - 1].userId) : null;
    return { progress, awards };
  }
  function backfill(userId) { if (store.isBackfilled(userId)) return { progress: store.info(userId), awards: [] }; let result = { progress: store.info(userId), awards: [] }; for (const game of data.listGames(userId, {})) { const next = recordGame(userId, game, { created: true }); result = { progress: next.progress, awards: [...result.awards, ...next.awards] }; } store.markBackfilled(userId); return result; }
  return { backfill, backfillCollectionAchievements, backfillCollectionAchievementsForAll, backfillKatalogContributions, info: store.info, recordAvatar, recordForumReply, recordForumReplyReceived, recordForumThread, recordGame, recordImportedGames };
}
module.exports = { COLLECTION_ACHIEVEMENTS_BACKFILL, PLATFORM_SPECIALIST_COUNT, createProgressionService, isEnriched };
