// The private grid has five desktop columns: fifty records make ten complete rows.
export const LIBRARY_PAGE_SIZE = 50;
export const LOOKUP_MIN_TITLE_LENGTH = 2;
export const SOURCE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const PEGI_RELEASE_PREVIEW_LIMIT = 2;
export const DECORATIVE_COVER_SLOT_MAX = 64;
export const COPYRIGHT_START_YEAR = 2026;

export const UI_TIMING = Object.freeze({
  toastMs: 2_600,
  artworkLoadTimeoutMs: 6_000,
  focusDelayMs: 40,
  formFocusDelayMs: 60,
  preferenceRetryMs: 5_000,
  preferenceSaveMs: 120,
  searchPreferenceSaveMs: 260,
  librarySearchDebounceMs: 220,
});

export const AUTOCOMPLETE_POLICY = Object.freeze({
  queryMinLength: 3,
  resultLimit: 10,
  debounceMs: 100,
  blurDelayMs: 100,
});
