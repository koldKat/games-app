'use strict';

const ACCOUNT_LIMITS = Object.freeze({
  usernameMin: 3,
  usernameMax: 32,
  passwordMin: 8,
  passwordMax: 200,
  emailMax: 254,
});

const GAME_LIMITS = Object.freeze({
  titleMax: 220,
  platformMax: 80,
  publisherMax: 160,
  notesMax: 2_000,
  descriptionMax: 12_000,
  urlMax: 2_000,
  metadataTextMax: 8_000,
  metadataItemMax: 180,
  metadataItemsMax: 24,
  coverSourceMax: 80,
  coverMatchTitleMax: 300,
  hltbTimestampMax: 40,
  hltbHoursMax: 100_000,
  releaseYearMin: 1970,
  releaseYearMax: 2100,
  titleSearchDefault: 10,
  titleSearchMax: 20,
});

const KATALOG_LIMITS = Object.freeze({
  pageSize: 80,
  pageSizeMax: 80,
  searchMax: 120,
  adminResultsMax: 250,
  slugMax: 100,
});

module.exports = Object.freeze({ ACCOUNT_LIMITS, GAME_LIMITS, KATALOG_LIMITS });
