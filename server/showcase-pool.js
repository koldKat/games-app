'use strict';

const DEFAULT_LIMIT = 14;
const MAX_LIMIT = 48;
const COVER_PREDICATE = "(cover_url LIKE 'https://%' OR cover_url LIKE '/covers/%')";

function boundedLimit(value) {
  return Math.max(1, Math.min(MAX_LIMIT, Number.parseInt(value, 10) || DEFAULT_LIMIT));
}

function createShowcasePool(database) {
  function owned(limit = DEFAULT_LIMIT, userId = null) {
    const accountId = Number.parseInt(userId, 10) || 0;
    if (!accountId) return [];
    return database.prepare(`SELECT cover_url AS coverUrl FROM games
      WHERE user_id=? AND ownership='owned' AND ${COVER_PREDICATE}
      GROUP BY cover_url ORDER BY RANDOM() LIMIT ?`).all(accountId, boundedLimit(limit)).map(row => row.coverUrl);
  }

  function publicCovers(limit = DEFAULT_LIMIT) {
    return database.prepare(`SELECT cover_url AS coverUrl FROM catalogue_entries
      WHERE status='public' AND ${COVER_PREDICATE}
      GROUP BY cover_url ORDER BY RANDOM() LIMIT ?`).all(boundedLimit(limit)).map(row => row.coverUrl);
  }

  function shared(limit = DEFAULT_LIMIT, userId = null) {
    const count = boundedLimit(limit);
    const accountId = Number.parseInt(userId, 10) || 0;
    if (!accountId) return publicCovers(count);
    return database.prepare(`SELECT coverUrl FROM (
      SELECT cover_url AS coverUrl FROM catalogue_entries WHERE status='public' AND ${COVER_PREDICATE}
      UNION
      SELECT cover_url AS coverUrl FROM games WHERE user_id=@userId AND ownership='owned' AND ${COVER_PREDICATE}
    ) GROUP BY coverUrl ORDER BY RANDOM() LIMIT @count`).all({ userId: accountId, count }).map(row => row.coverUrl);
  }

  return { owned, public: publicCovers, shared };
}

module.exports = { createShowcasePool };
