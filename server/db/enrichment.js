const { db, canonical } = require('./connection');
const { getGame } = require('./library');
const { normalizeGame } = require('./normalize');
const { safeText, safeList, validReleaseYear, hltbHours } = require('./values');
const { GAME_LIMITS } = require('../validation-policy');
const { PEGI_RATINGS } = require('../constants');
function gamesMissingCovers(userId) { return db.prepare(`SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0 AND cover_url='' ORDER BY title COLLATE NOCASE`).all(userId); }
function updateGameCover(userId, id, cover) {
  const result = db.prepare(`UPDATE games SET cover_url=?, cover_source=?, cover_match_title=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND hidden=0 AND cover_url=''`).run(cover.url || '', cover.source || '', cover.matchTitle || '', id, userId);
  return result.changes ? getGame(userId, id) : null;
}
function gamesWithRemoteCovers() {
  return db.prepare(`SELECT id, user_id AS userId, cover_url AS coverUrl FROM games
    WHERE cover_url LIKE 'https://%' ORDER BY id`).all();
}
function gamesWithLocalCovers() {
  return db.prepare(`SELECT id, user_id AS userId, cover_url AS coverUrl FROM games
    WHERE cover_url LIKE '/covers/%' ORDER BY id`).all();
}
function coverUrlReferenceCount(coverUrl) {
  return db.prepare('SELECT COUNT(*) AS count FROM games WHERE cover_url=?').get(coverUrl).count;
}
function replaceGameCoverUrl(userId, id, expectedUrl, localUrl) {
  const result = db.prepare(`UPDATE games SET cover_url=?
    WHERE id=? AND user_id=? AND cover_url=?`).run(localUrl, id, userId, expectedUrl);
  return result.changes ? getGame(userId, id) : null;
}

function gamesMissingPegiMetadata(userId) {
  return db.prepare(`SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0
    AND pegi_url=''
    AND pegi_descriptors='[]' AND pegi_releases='[]' AND pegi_advice=''
    AND pegi_outline='' AND pegi_content_issues='' AND pegi_other_issues=''
    ORDER BY title COLLATE NOCASE`).all(userId);
}

function updateGamePegiMetadata(userId, id, metadata = {}) {
  const ratingValue = metadata.pegi ?? metadata.rating;
  const yearValue = metadata.releaseYear ?? metadata.year;
  const pegi = PEGI_RATINGS.includes(Number(ratingValue)) ? Number(ratingValue) : null;
  const releaseYear = validReleaseYear(yearValue) ? Number(yearValue) : null;
  const result = db.prepare(`UPDATE games SET pegi=COALESCE(@pegi, pegi),
    publisher=CASE WHEN @publisher<>'' THEN @publisher ELSE publisher END,
    release_year=COALESCE(@releaseYear, release_year), pegi_url=@pegiUrl,
    pegi_descriptors=@pegiDescriptorsJson, pegi_releases=@pegiReleasesJson,
    pegi_advice=@pegiAdvice, pegi_outline=@pegiOutline,
    pegi_content_issues=@pegiContentIssues, pegi_other_issues=@pegiOtherIssues,
    updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId AND hidden=0
    AND pegi_url='' AND pegi_descriptors='[]' AND pegi_releases='[]'
    AND pegi_advice='' AND pegi_outline='' AND pegi_content_issues='' AND pegi_other_issues=''`).run({
      id, userId, pegi, releaseYear,
      publisher: safeText(metadata.publisher, GAME_LIMITS.publisherMax), pegiUrl: safeText(metadata.pegiUrl ?? metadata.url, GAME_LIMITS.urlMax),
      pegiDescriptorsJson: JSON.stringify(safeList(metadata.descriptors)),
      pegiReleasesJson: JSON.stringify(safeList(metadata.releases)),
      pegiAdvice: safeText(metadata.advice), pegiOutline: safeText(metadata.outline),
      pegiContentIssues: safeText(metadata.contentIssues), pegiOtherIssues: safeText(metadata.otherIssues),
    });
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}

function gamesMissingHltb(userId) {
  return db.prepare('SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0 AND hltb_id IS NULL ORDER BY title COLLATE NOCASE').all(userId);
}

function gamesMissingDescriptions(userId) {
  return db.prepare("SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0 AND description='' ORDER BY title COLLATE NOCASE").all(userId);
}

function gamesMissingIgdb(userId) {
  return db.prepare('SELECT id, title, platform FROM games WHERE user_id=? AND hidden=0 AND igdb_id IS NULL ORDER BY title COLLATE NOCASE').all(userId);
}

function updateGameIgdb(userId, id, metadata = {}) {
  const igdbId = Number.isInteger(Number(metadata.igdbId ?? metadata.id)) && Number(metadata.igdbId ?? metadata.id) > 0
    ? Number(metadata.igdbId ?? metadata.id) : null;
  if (!igdbId) return null;
  const score = value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100
    ? Math.round(Number(value) * 10) / 10 : null;
  const count = value => Math.max(0, Number.parseInt(value, 10) || 0);
  const description = safeText(metadata.description, GAME_LIMITS.descriptionMax);
  const result = db.prepare(`UPDATE games SET igdb_id=@igdbId, igdb_slug=@igdbSlug, igdb_url=@igdbUrl,
    igdb_rating=@igdbRating, igdb_rating_count=@igdbRatingCount,
    igdb_critic_rating=@igdbCriticRating, igdb_critic_rating_count=@igdbCriticRatingCount,
    igdb_genres=@igdbGenres, igdb_themes=@igdbThemes, igdb_developers=@igdbDevelopers,
    igdb_updated_at=@igdbUpdatedAt,
    publisher=CASE WHEN publisher='' AND @publisher<>'' THEN @publisher ELSE publisher END,
    release_year=CASE WHEN release_year IS NULL THEN @releaseYear ELSE release_year END,
    description=CASE WHEN description='' AND @description<>'' THEN @description ELSE description END,
    description_source=CASE WHEN description='' AND @description<>'' THEN 'IGDB' ELSE description_source END,
    description_source_url=CASE WHEN description='' AND @description<>'' THEN @igdbUrl ELSE description_source_url END,
    updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId AND hidden=0 AND igdb_id IS NULL`).run({
      id, userId, igdbId, igdbSlug: safeText(metadata.slug ?? metadata.igdbSlug, GAME_LIMITS.igdbSlugMax),
      igdbUrl: safeText(metadata.sourceUrl ?? metadata.igdbUrl, GAME_LIMITS.urlMax),
      igdbRating: score(metadata.rating ?? metadata.igdbRating), igdbRatingCount: count(metadata.ratingCount ?? metadata.igdbRatingCount),
      igdbCriticRating: score(metadata.criticRating ?? metadata.igdbCriticRating), igdbCriticRatingCount: count(metadata.criticRatingCount ?? metadata.igdbCriticRatingCount),
      igdbGenres: JSON.stringify(safeList(metadata.genres ?? metadata.igdbGenres)),
      igdbThemes: JSON.stringify(safeList(metadata.themes ?? metadata.igdbThemes)),
      igdbDevelopers: JSON.stringify(safeList(metadata.developers ?? metadata.igdbDevelopers)),
      igdbUpdatedAt: new Date().toISOString(), publisher: safeText(metadata.publisher, GAME_LIMITS.publisherMax),
      releaseYear: validReleaseYear(metadata.releaseYear) ? Number(metadata.releaseYear) : null, description,
    });
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}

function updateGameDescription(userId, id, metadata = {}) {
  const description = safeText(metadata.description, GAME_LIMITS.descriptionMax);
  if (!description) return null;
  const result = db.prepare(`UPDATE games SET description=@description, description_source=@descriptionSource,
    description_source_url=@descriptionSourceUrl, updated_at=CURRENT_TIMESTAMP WHERE id=@id AND user_id=@userId AND hidden=0 AND description=''`).run({
    id, userId, description, descriptionSource: safeText(metadata.source, GAME_LIMITS.coverSourceMax),
    descriptionSourceUrl: safeText(metadata.url || metadata.sourceUrl, GAME_LIMITS.urlMax),
  });
  if (!result.changes) return null;
  canonical.syncGameById(id); return getGame(userId, id);
}

function updateGameHltb(userId, id, metadata = {}) {
  const normalized = normalizeGame({ title: 'placeholder', platform: 'placeholder', ...metadata,
    hltbId: metadata.hltbId ?? metadata.id, hltbTitle: metadata.hltbTitle ?? metadata.title,
    hltbUrl: metadata.hltbUrl ?? metadata.url, hltbMainStory: metadata.hltbMainStory ?? metadata.mainStory,
    hltbMainExtra: metadata.hltbMainExtra ?? metadata.mainExtra,
    hltbCompletionist: metadata.hltbCompletionist ?? metadata.completionist,
    hltbAllStyles: metadata.hltbAllStyles ?? metadata.allStyles, hltbUpdatedAt: new Date().toISOString(),
  });
  if (!normalized.hltbId) return null;
  const result = db.prepare(`UPDATE games SET hltb_id=@hltbId, hltb_title=@hltbTitle, hltb_url=@hltbUrl,
    hltb_main_story=@hltbMainStory, hltb_main_extra=@hltbMainExtra,
    hltb_completionist=@hltbCompletionist, hltb_all_styles=@hltbAllStyles,
    hltb_updated_at=@hltbUpdatedAt, updated_at=CURRENT_TIMESTAMP
    WHERE id=@id AND user_id=@userId AND hidden=0 AND hltb_id IS NULL`).run({ id, userId, ...normalized });
  return result.changes ? getGame(userId, id) : null;
}

module.exports = {
  gamesMissingCovers, updateGameCover, gamesWithRemoteCovers, gamesWithLocalCovers,
  coverUrlReferenceCount, replaceGameCoverUrl, gamesMissingPegiMetadata,
  updateGamePegiMetadata, gamesMissingHltb, gamesMissingDescriptions, gamesMissingIgdb,
  updateGameIgdb, updateGameDescription, updateGameHltb,
};
