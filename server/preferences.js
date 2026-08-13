'use strict';

const { db } = require('./db');

const SORTS = new Set(['title', 'title_desc', 'platform', 'publisher', 'year_desc', 'year', 'pegi', 'pegi_desc',
  'ownership', 'status', 'favorites', 'newest', 'oldest', 'updated', 'hltb_main_short', 'hltb_main_long',
  'hltb_extra_short', 'hltb_extra_long', 'hltb_100_short', 'hltb_100_long', 'hltb_all_short', 'hltb_all_long', 'cartridge']);
const OWNERSHIP = new Set(['', 'owned_physical', 'owned_digital', 'wanted', 'unavailable']);
const PEGI = new Set(['', '3', '7', '12', '16', '18', 'none']);
const STATUS = new Set(['', 'backlog', 'playing', 'completed', 'paused', 'abandoned']);
const MISSING = new Set(['', 'pegi', 'cover', 'hltb', 'either', 'both']);

const defaults = () => ({ view: 'grid', filters: { q: '', platform: '', ownership: '', pegi: '', playStatus: '', missing: '', favorite: '', sort: 'title' } });
const text = (value, limit) => String(value || '').trim().slice(0, limit);
const choice = (value, allowed, fallback = '') => allowed.has(String(value || '')) ? String(value || '') : fallback;

function normalize(input = {}) {
  const filters = input.filters || {};
  return {
    view: input.view === 'list' ? 'list' : 'grid',
    filters: {
      q: text(filters.q, 220), platform: text(filters.platform, 80),
      ownership: choice(filters.ownership, OWNERSHIP), pegi: choice(filters.pegi, PEGI),
      playStatus: choice(filters.playStatus, STATUS), missing: choice(filters.missing, MISSING),
      favorite: filters.favorite === '1' ? '1' : '', sort: choice(filters.sort, SORTS, 'title'),
    },
  };
}

function get(userId) {
  const row = db.prepare(`SELECT library_view AS view, search_query AS q, platform_filter AS platform,
    ownership_filter AS ownership, pegi_filter AS pegi, status_filter AS playStatus,
    missing_filter AS missing, favorite_filter AS favorite, sort_order AS sort
    FROM user_preferences WHERE user_id=?`).get(userId);
  return row ? normalize({ view: row.view, filters: row }) : defaults();
}

function set(userId, input) {
  const value = normalize(input);
  db.prepare(`INSERT INTO user_preferences (user_id, library_view, search_query, platform_filter,
    ownership_filter, pegi_filter, status_filter, missing_filter, favorite_filter, sort_order)
    VALUES (@userId, @view, @q, @platform, @ownership, @pegi, @playStatus, @missing, @favorite, @sort)
    ON CONFLICT(user_id) DO UPDATE SET library_view=excluded.library_view, search_query=excluded.search_query,
    platform_filter=excluded.platform_filter, ownership_filter=excluded.ownership_filter,
    pegi_filter=excluded.pegi_filter, status_filter=excluded.status_filter,
    missing_filter=excluded.missing_filter, favorite_filter=excluded.favorite_filter,
    sort_order=excluded.sort_order, updated_at=CURRENT_TIMESTAMP`).run({ userId, view: value.view, ...value.filters });
  return value;
}

module.exports = { SORTS, defaults, get, normalize, set };
