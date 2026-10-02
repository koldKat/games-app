import { $ } from './dom.js';
import { GAME_LABELS } from '../library/game-labels.js';

export const runtime = {};
let state;
let filters;
let labels;
let AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE;

export function initializeCoreRuntime() {
  state = {
    games: [],
    gameTotal: 0,
    gamePages: 1,
    stats: null,
    platforms: [],
    integrations: {},
    page: 1,
    view: 'grid',
    loading: false,
    user: null,
    authMode: 'login',
    coverStatus: null,
    pegiStatus: null,
    hltbStatus: null,
    descriptionStatus: null,
    stopEvents: null,
    pendingGamePatches: new Map(),
  };
  runtime.gameLoadSequence = 0;
  runtime.metaLoadSequence = 0;
  runtime.decorationSequence = 0;
  runtime.authDecorationSequence = 0;
  runtime.sessionGeneration = 0;
  runtime.preferencesReady = false;
  runtime.preferencesDirty = false;
  runtime.preferenceSaveTimer = undefined;
  runtime.groupFilterRefreshTimer = undefined;
  runtime.randomGamePicker = null;
  filters = {
    q: $('#search'), platform: $('#platform-filter'), ownership: $('#ownership-filter'),
    pegi: $('#pegi-filter'), playStatus: $('#status-filter'), missing: $('#missing-filter'),
    favorite: $('#favorite-filter'), sort: $('#sort-filter'),
  };
  labels = GAME_LABELS;
  AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE = new Set(['/api/login', '/api/register', '/api/auth/me']);
}
export { AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE, state, filters, labels };
