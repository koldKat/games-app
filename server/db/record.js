const selectFields = `id, title, platform, pegi, ownership,
  CASE WHEN hidden=1 THEN 'hidden' ELSE play_status END AS playStatus,
  CASE WHEN format_physical=1 AND format_digital=1 THEN 'both'
    WHEN format_physical=1 THEN 'physical' WHEN format_digital=1 THEN 'digital' ELSE 'unknown' END AS mediaFormat,
  format_physical AS formatPhysical, format_digital AS formatDigital,
  cartridge_number AS cartridgeNumber, publisher,
  release_year AS releaseYear, notes, rating, favorite, pegi_url AS pegiUrl,
  pegi_descriptors AS pegiDescriptorsJson, pegi_releases AS pegiReleasesJson,
  pegi_advice AS pegiAdvice, pegi_outline AS pegiOutline,
  pegi_content_issues AS pegiContentIssues, pegi_other_issues AS pegiOtherIssues,
  hltb_id AS hltbId, hltb_title AS hltbTitle, hltb_url AS hltbUrl,
  hltb_main_story AS hltbMainStory, hltb_main_extra AS hltbMainExtra,
  hltb_completionist AS hltbCompletionist, hltb_all_styles AS hltbAllStyles,
  hltb_updated_at AS hltbUpdatedAt,
  cover_url AS coverUrl, cover_source AS coverSource, cover_match_title AS coverMatchTitle,
  description, description_source AS descriptionSource, description_source_url AS descriptionSourceUrl,
  igdb_id AS igdbId, igdb_slug AS igdbSlug, igdb_url AS igdbUrl,
  igdb_rating AS igdbRating, igdb_rating_count AS igdbRatingCount,
  igdb_critic_rating AS igdbCriticRating, igdb_critic_rating_count AS igdbCriticRatingCount,
  igdb_genres AS igdbGenresJson, igdb_themes AS igdbThemesJson, igdb_developers AS igdbDevelopersJson,
  igdb_updated_at AS igdbUpdatedAt,
  steam_app_id AS steamAppId, steam_playtime_minutes AS steamPlaytimeMinutes,
  steam_last_played_at AS steamLastPlayedAt,
  gog_product_id AS gogProductId,
  canonical_game_id AS canonicalGameId, canonical_release_id AS canonicalReleaseId,
  created_at AS createdAt, updated_at AS updatedAt`;

function parseStoredList(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function hydrateGame(row) {
  if (!row) return row;
  const { pegiDescriptorsJson, pegiReleasesJson, igdbGenresJson, igdbThemesJson, igdbDevelopersJson, ...game } = row;
  return { ...game, pegiDescriptors: parseStoredList(pegiDescriptorsJson), pegiReleases: parseStoredList(pegiReleasesJson),
    igdbGenres: parseStoredList(igdbGenresJson), igdbThemes: parseStoredList(igdbThemesJson), igdbDevelopers: parseStoredList(igdbDevelopersJson) };
}

module.exports = { selectFields, hydrateGame };
