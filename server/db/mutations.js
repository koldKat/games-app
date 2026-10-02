const { db, canonical } = require('./connection');
const { normalizeGame } = require('./normalize');
const { getGame, findDuplicateGames } = require('./library');
const { GAME_LIMITS } = require('../validation-policy');
const { safeText } = require('./values');
const insert = db.prepare(`
  INSERT INTO games (user_id, title, platform, pegi, ownership, play_status, hidden, media_format, format_physical, format_digital,
    cartridge_number, publisher, release_year, notes, rating, favorite, pegi_url, pegi_descriptors,
    pegi_releases, pegi_advice, pegi_outline, pegi_content_issues, pegi_other_issues,
    hltb_id, hltb_title, hltb_url, hltb_main_story, hltb_main_extra, hltb_completionist, hltb_all_styles, hltb_updated_at,
    cover_url, cover_source, cover_match_title, description, description_source, description_source_url,
    igdb_id, igdb_slug, igdb_url, igdb_rating, igdb_rating_count, igdb_critic_rating, igdb_critic_rating_count,
    igdb_genres, igdb_themes, igdb_developers, igdb_updated_at,
    steam_app_id, steam_playtime_minutes, steam_last_played_at, gog_product_id)
  VALUES (@userId, @title, @platform, @pegi, @ownership, @playStatus, @hidden, @mediaFormat, @formatPhysical, @formatDigital,
    @cartridgeNumber, @publisher, @releaseYear, @notes, @rating, @favorite, @pegiUrl, @pegiDescriptorsJson,
    @pegiReleasesJson, @pegiAdvice, @pegiOutline, @pegiContentIssues, @pegiOtherIssues,
    @hltbId, @hltbTitle, @hltbUrl, @hltbMainStory, @hltbMainExtra, @hltbCompletionist, @hltbAllStyles, @hltbUpdatedAt,
    @coverUrl, @coverSource, @coverMatchTitle, @description, @descriptionSource, @descriptionSourceUrl,
    @igdbId, @igdbSlug, @igdbUrl, @igdbRating, @igdbRatingCount, @igdbCriticRating, @igdbCriticRatingCount,
    @igdbGenresJson, @igdbThemesJson, @igdbDevelopersJson, @igdbUpdatedAt,
    @steamAppId, @steamPlaytimeMinutes, @steamLastPlayedAt, @gogProductId)
`);
const update = db.prepare(`
  UPDATE games SET title=@title, platform=@platform, pegi=@pegi, ownership=@ownership,
    play_status=CASE WHEN @hidden=1 THEN play_status ELSE @playStatus END, hidden=@hidden,
    media_format=@mediaFormat, format_physical=@formatPhysical, format_digital=@formatDigital, cartridge_number=@cartridgeNumber,
    publisher=@publisher, release_year=@releaseYear, notes=@notes, rating=@rating, favorite=@favorite,
    pegi_url=@pegiUrl, pegi_descriptors=@pegiDescriptorsJson, pegi_releases=@pegiReleasesJson,
    pegi_advice=@pegiAdvice, pegi_outline=@pegiOutline, pegi_content_issues=@pegiContentIssues,
    pegi_other_issues=@pegiOtherIssues, hltb_id=@hltbId, hltb_title=@hltbTitle, hltb_url=@hltbUrl,
    hltb_main_story=@hltbMainStory, hltb_main_extra=@hltbMainExtra,
    hltb_completionist=@hltbCompletionist, hltb_all_styles=@hltbAllStyles, hltb_updated_at=@hltbUpdatedAt,
    cover_url=@coverUrl, cover_source=@coverSource,
    cover_match_title=@coverMatchTitle, description=@description, description_source=@descriptionSource,
    description_source_url=@descriptionSourceUrl, igdb_id=@igdbId, igdb_slug=@igdbSlug, igdb_url=@igdbUrl,
    igdb_rating=@igdbRating, igdb_rating_count=@igdbRatingCount,
    igdb_critic_rating=@igdbCriticRating, igdb_critic_rating_count=@igdbCriticRatingCount,
    igdb_genres=@igdbGenresJson, igdb_themes=@igdbThemesJson, igdb_developers=@igdbDevelopersJson,
    igdb_updated_at=@igdbUpdatedAt, steam_app_id=@steamAppId,
    steam_playtime_minutes=@steamPlaytimeMinutes, steam_last_played_at=@steamLastPlayedAt,
    gog_product_id=@gogProductId,
    updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId
`);

function createGame(userId, input) {
  const game = normalizeGame(input); const id = insert.run({ ...game, userId }).lastInsertRowid;
  canonical.syncGameById(id); return getGame(userId, id);
}
function updateGame(userId, id, input) {
  const existing = db.prepare(`SELECT steam_app_id AS steamAppId,steam_playtime_minutes AS steamPlaytimeMinutes,
    steam_last_played_at AS steamLastPlayedAt,gog_product_id AS gogProductId FROM games WHERE id=? AND user_id=?`).get(id, userId);
  const game = normalizeGame({ ...input,
    steamAppId: input.steamAppId === undefined ? existing?.steamAppId : input.steamAppId,
    steamPlaytimeMinutes: input.steamPlaytimeMinutes === undefined ? existing?.steamPlaytimeMinutes : input.steamPlaytimeMinutes,
    steamLastPlayedAt: input.steamLastPlayedAt === undefined ? existing?.steamLastPlayedAt : input.steamLastPlayedAt,
    gogProductId: input.gogProductId === undefined ? existing?.gogProductId : input.gogProductId,
  }); const result = update.run({ ...game, id, userId });
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}

function linkSteamGame(userId, id, steamGame = {}) {
  const appId = Number(steamGame.appId); if (!Number.isInteger(appId) || appId <= 0) return null;
  const result = db.prepare(`UPDATE games SET steam_app_id=?,steam_playtime_minutes=?,steam_last_played_at=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND steam_app_id IS NULL`).run(appId, Math.max(0, Number.parseInt(steamGame.playtimeMinutes, 10) || 0),
      steamGame.lastPlayedAt || null, id, userId);
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}
function linkGogGame(userId, id, gogGame = {}) {
  const productId = String(gogGame.productId || '').trim(); if (!/^\d+$/.test(productId)) return null;
  const result = db.prepare(`UPDATE games SET gog_product_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND gog_product_id IS NULL`).run(productId, id, userId);
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}
function deleteGame(userId, id) {
  const game = db.prepare('SELECT canonical_game_id AS canonicalGameId FROM games WHERE id=? AND user_id=?').get(id, userId);
  const deleted = db.prepare('DELETE FROM games WHERE id=? AND user_id=?').run(id, userId).changes > 0;
  if (deleted && game?.canonicalGameId) canonical.pruneOrphans(game.canonicalGameId);
  return deleted;
}

module.exports = { createGame, updateGame, linkSteamGame, linkGogGame, deleteGame };
