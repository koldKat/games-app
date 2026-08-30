'use strict';

const APP_USER_AGENT = 'Game-Kat-a-log/1.0 personal-library';
const TITLE_LOOKUP_MIN_LENGTH = 2;
const TITLE_AUTOCOMPLETE_MIN_LENGTH = 3;
const PC_STOREFRONT_VALUES = Object.freeze([
  'Steam', 'GOG', 'Epic Games Store', 'Microsoft Store', 'PC Game Pass', 'Xbox app (PC)',
  'EA app', 'Origin', 'Ubisoft Connect', 'Uplay', 'Battle.net', 'Rockstar Games Launcher',
  'itch.io', 'Amazon Games',
]);

const PEGI_RATINGS = Object.freeze([3, 7, 12, 16, 18]);
const OWNERSHIP_VALUES = Object.freeze(['owned', 'wanted']);
const PLAY_STATUS_VALUES = Object.freeze(['backlog', 'playing', 'completed', 'paused', 'abandoned']);
const MEDIA_FORMAT_VALUES = Object.freeze(['physical', 'digital', 'unknown']);
const OWNERSHIP_FILTER_VALUES = Object.freeze(['owned_physical', 'owned_digital', 'wanted']);
const MISSING_FILTER_VALUES = Object.freeze(['pegi', 'esrb', 'cover', 'hltb', 'description', 'either', 'both']);
const SORT_VALUES = Object.freeze([
  'title', 'title_desc', 'platform', 'publisher', 'year_desc', 'year', 'pegi', 'pegi_desc',
  'ownership', 'status', 'favorites', 'newest', 'oldest', 'updated', 'hltb_main_short', 'hltb_main_long',
  'hltb_extra_short', 'hltb_extra_long', 'hltb_100_short', 'hltb_100_long', 'hltb_all_short', 'hltb_all_long',
  'cartridge',
]);

const BULK_JOB = Object.freeze({
  maxConsecutiveErrors: 5,
  coverDelayMs: 150,
  pegiDelayMs: 500,
  esrbDelayMs: 750,
  hltbDelayMs: 1_500,
  descriptionDelayMs: 1_500,
});

module.exports = {
  APP_USER_AGENT,
  BULK_JOB,
  MEDIA_FORMAT_VALUES,
  MISSING_FILTER_VALUES,
  OWNERSHIP_FILTER_VALUES,
  OWNERSHIP_VALUES,
  PC_STOREFRONT_VALUES,
  PEGI_RATINGS,
  PLAY_STATUS_VALUES,
  SORT_VALUES,
  TITLE_AUTOCOMPLETE_MIN_LENGTH,
  TITLE_LOOKUP_MIN_LENGTH,
};
