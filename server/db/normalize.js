const { MEDIA_FORMAT_VALUES, OWNERSHIP_VALUES, PEGI_RATINGS, PLAY_STATUS_VALUES, STORED_PLAY_STATUS_VALUES } = require('../constants');
const { GAME_LIMITS } = require('../validation-policy');
const { normalizeMediaFormats } = require('../media-format-policy');
const { safeList, safeText, boundedText, validReleaseYear, hltbHours } = require('./values');
function normalizeGame(input = {}) {
  const title = boundedText(input.title, GAME_LIMITS.titleMax, 'Title');
  const platform = boundedText(input.platform, GAME_LIMITS.platformMax, 'Platform');
  if (!title) throw new Error('Title is required.');
  if (!platform) throw new Error('Platform is required.');
  const pegi = input.pegi === '' || input.pegi == null ? null : Number(input.pegi);
  if (pegi != null && !PEGI_RATINGS.includes(pegi)) throw new Error('PEGI must be 3, 7, 12, 16, 18, or blank.');
  const requestedOwnership = String(input.ownership || 'owned');
  if (!OWNERSHIP_VALUES.includes(requestedOwnership)) throw new Error('Collection must be Owned or Wishlisted.');
  const ownership = requestedOwnership;
  const requestedPlayStatus = PLAY_STATUS_VALUES.includes(input.playStatus) ? input.playStatus : 'backlog';
  const hidden = requestedPlayStatus === 'hidden' ? 1 : 0;
  const playStatus = hidden ? 'backlog' : requestedPlayStatus;
  const { mediaFormat, mediaFormats, formatPhysical, formatDigital } = normalizeMediaFormats(input);
  const cartridgeNumber = input.cartridgeNumber === '' || input.cartridgeNumber == null ? null : Number.parseInt(input.cartridgeNumber, 10);
  const releaseYear = input.releaseYear === '' || input.releaseYear == null ? null : Number.parseInt(input.releaseYear, 10);
  const rating = input.rating === '' || input.rating == null ? null : Number(input.rating);
  if (cartridgeNumber != null && (!Number.isInteger(cartridgeNumber) || cartridgeNumber < 0)) throw new Error('Cartridge number must be a positive whole number.');
  if (releaseYear != null && !validReleaseYear(releaseYear)) throw new Error('Release year is invalid.');
  if (rating != null && (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2))) throw new Error('Rating must be in half-star steps from 0.5 to 5.');
  const hltbId = Number.isInteger(Number(input.hltbId)) && Number(input.hltbId) > 0 ? Number(input.hltbId) : null;
  const igdbId = Number.isInteger(Number(input.igdbId)) && Number(input.igdbId) > 0 ? Number(input.igdbId) : null;
  const igdbScore = value => igdbId && value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100
    ? Math.round(Number(value) * 10) / 10 : null;
  const igdbCount = value => igdbId ? Math.max(0, Number.parseInt(value, 10) || 0) : 0;
  return {
    title, platform, pegi, ownership, playStatus, hidden, mediaFormat, mediaFormats, formatPhysical, formatDigital, cartridgeNumber,
    publisher: boundedText(input.publisher, GAME_LIMITS.publisherMax, 'Publisher'), releaseYear,
    notes: boundedText(input.notes, GAME_LIMITS.notesMax, 'Notes'), rating, favorite: input.favorite ? 1 : 0,
    pegiUrl: boundedText(input.pegiUrl, GAME_LIMITS.urlMax, 'PEGI URL'),
    pegiDescriptorsJson: JSON.stringify(safeList(input.pegiDescriptors)),
    pegiReleasesJson: JSON.stringify(safeList(input.pegiReleases)),
    pegiAdvice: safeText(input.pegiAdvice), pegiOutline: safeText(input.pegiOutline),
    pegiContentIssues: safeText(input.pegiContentIssues), pegiOtherIssues: safeText(input.pegiOtherIssues),
    hltbId, hltbTitle: hltbId ? safeText(input.hltbTitle, GAME_LIMITS.titleMax) : '',
    hltbUrl: hltbId ? safeText(input.hltbUrl, GAME_LIMITS.urlMax) : '',
    hltbMainStory: hltbId ? hltbHours(input.hltbMainStory) : null,
    hltbMainExtra: hltbId ? hltbHours(input.hltbMainExtra) : null,
    hltbCompletionist: hltbId ? hltbHours(input.hltbCompletionist) : null,
    hltbAllStyles: hltbId ? hltbHours(input.hltbAllStyles) : null,
    hltbUpdatedAt: hltbId ? safeText(input.hltbUpdatedAt, GAME_LIMITS.hltbTimestampMax) || new Date().toISOString() : null,
    coverUrl: String(input.coverUrl || '').trim().slice(0, GAME_LIMITS.urlMax),
    coverSource: String(input.coverSource || '').trim().slice(0, GAME_LIMITS.coverSourceMax),
    coverMatchTitle: String(input.coverMatchTitle || '').trim().slice(0, GAME_LIMITS.coverMatchTitleMax),
    description: safeText(input.description, GAME_LIMITS.descriptionMax),
    descriptionSource: safeText(input.description) ? String(input.descriptionSource || '').trim().slice(0, GAME_LIMITS.coverSourceMax) : '',
    descriptionSourceUrl: safeText(input.description) ? String(input.descriptionSourceUrl || '').trim().slice(0, GAME_LIMITS.urlMax) : '',
    igdbId, igdbSlug: igdbId ? safeText(input.igdbSlug, GAME_LIMITS.igdbSlugMax) : '',
    igdbUrl: igdbId ? safeText(input.igdbUrl, GAME_LIMITS.urlMax) : '',
    igdbRating: igdbScore(input.igdbRating), igdbRatingCount: igdbCount(input.igdbRatingCount),
    igdbCriticRating: igdbScore(input.igdbCriticRating), igdbCriticRatingCount: igdbCount(input.igdbCriticRatingCount),
    igdbGenresJson: JSON.stringify(igdbId ? safeList(input.igdbGenres) : []),
    igdbThemesJson: JSON.stringify(igdbId ? safeList(input.igdbThemes) : []),
    igdbDevelopersJson: JSON.stringify(igdbId ? safeList(input.igdbDevelopers) : []),
    igdbUpdatedAt: igdbId ? safeText(input.igdbUpdatedAt, GAME_LIMITS.hltbTimestampMax) || new Date().toISOString() : null,
    steamAppId: Number.isInteger(Number(input.steamAppId)) && Number(input.steamAppId) > 0 ? Number(input.steamAppId) : null,
    steamPlaytimeMinutes: Math.max(0, Number.parseInt(input.steamPlaytimeMinutes, 10) || 0),
    steamLastPlayedAt: input.steamLastPlayedAt ? safeText(input.steamLastPlayedAt, GAME_LIMITS.hltbTimestampMax) : null,
    gogProductId: /^\d+$/.test(String(input.gogProductId || '')) ? String(input.gogProductId) : null,
  };
}

module.exports = { normalizeGame };
