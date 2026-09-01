import { CUSTOM_PLATFORM, isPcStorefront, knownPlatforms, pegiColors, platformFromReleaseText, platformGroups } from './js/platforms.js';
import { openEventStream } from './js/events.js';
import { createTitleAutocomplete } from './js/title-autocomplete.js';
import { cardTimes, createHltbLookup } from './js/hltb-ui.js';
import { createCoverProviderSettings } from './js/cover-provider-settings.js';
import { createCatalogueNavigation } from './js/catalogue-navigation.js';
import { bindCoverResultFallbacks } from './js/cover-result-images.js';
import { uniqueArtworkUrls } from './js/artwork-url.js';
import { compareGames } from './js/game-sorting.js';
import { createProgressionUi } from './js/progression-ui.js';
import { createActivityFeed } from './js/activity-feed.js';
import { createPatchUi } from './js/patch-ui.js';
import {
  COPYRIGHT_START_YEAR, DECORATIVE_COVER_SLOT_MAX, LIBRARY_PAGE_SIZE, LOOKUP_MIN_TITLE_LENGTH, PEGI_RELEASE_PREVIEW_LIMIT,
  SOURCE_IMAGE_MAX_BYTES, UI_TIMING,
} from './js/ui-policy.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const copyrightYear = new Date().getFullYear();
$$('[data-copyright-year]').forEach(element => {
  element.textContent = copyrightYear > COPYRIGHT_START_YEAR ? `© ${COPYRIGHT_START_YEAR}-${copyrightYear}` : `© ${COPYRIGHT_START_YEAR}`;
});
function mountDecorativeCoverSlots() {
  $$('[data-cover-slots]').forEach(field => {
    const count = Math.max(0, Math.min(DECORATIVE_COVER_SLOT_MAX, Number(field.dataset.coverSlots) || 0));
    const elementName = field.dataset.coverElement || 'i'; const baseClass = field.dataset.coverClass || '';
    field.replaceChildren(...Array.from({ length: count }, (_, index) => {
      const element = document.createElement(elementName);
      if (baseClass) element.className = `${baseClass} ${baseClass}-${index + 1}`;
      return element;
    }));
  });
  $$('[data-cover-decoration]').forEach(host => {
    const element = document.createElement('i'); element.className = host.dataset.coverDecoration;
    element.setAttribute('aria-hidden', 'true'); host.append(element);
  });
}
mountDecorativeCoverSlots();
const state = { games: [], stats: null, platforms: [], page: 1, view: 'grid', loading: false, user: null, authMode: 'login', coverStatus: null, pegiStatus: null, hltbStatus: null, descriptionStatus: null, stopEvents: null, pendingGamePatches: new Map() };
let gameLoadSequence = 0;
let metaLoadSequence = 0;
let decorationSequence = 0;
let sessionGeneration = 0;
let preferencesReady = false;
let preferencesDirty = false;
let preferenceSaveTimer;
const filters = {
  q: $('#search'), platform: $('#platform-filter'), ownership: $('#ownership-filter'),
  pegi: $('#pegi-filter'), playStatus: $('#status-filter'), missing: $('#missing-filter'),
  favorite: $('#favorite-filter'), sort: $('#sort-filter'),
};
const labels = {
  owned: 'Owned', wanted: 'Wishlisted', backlog: 'Backlog',
  playing: 'Playing', completed: 'Completed', paused: 'Paused', abandoned: 'Abandoned',
  physical: 'Physical', digital: 'Digital', unknown: 'Unknown',
};
const AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE = new Set(['/api/login', '/api/register', '/api/auth/me']);

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
async function api(url, options) {
  const generation = sessionGeneration;
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && generation === sessionGeneration && !AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE.has(url)) {
    sessionGeneration++;
    showAuth('Your session expired. Authenticate again.');
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), UI_TIMING.toastMs);
}
function showAccountError(message) { $('#account-error').textContent = message; $('#account-error').hidden = false; }
const coverProviderSettings = createCoverProviderSettings({ api, toast, showError: showAccountError });
const progressionUi = createProgressionUi({ api });
const activityFeed = createActivityFeed();
const patchUi = createPatchUi({ api, toast, getUser: () => state.user });
function applySaveProgress(result) {
  if (result?.progression?.awards?.length) progressionUi.handleEvent({ progress: result.progression.progress });
}
function endSessionResume() { document.documentElement.classList.remove('resuming-session'); }
async function applyDecorativeCovers(slots, covers, isCurrent = () => true) {
  for (const slot of slots) { slot.style.backgroundImage = ''; slot.classList.remove('has-art'); }
  const candidates = uniqueArtworkUrls(covers);
  if (!slots.length || !candidates.length) return;
  const loaded = []; let nextSlot = 0;
  const loadCandidate = url => new Promise(resolve => {
    const preload = new Image(); let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timeout); preload.onload = null; preload.onerror = null; resolve(value); };
    const timeout = setTimeout(() => finish(''), UI_TIMING.artworkLoadTimeoutMs);
    preload.onload = () => finish(url); preload.onerror = () => finish(''); preload.src = url;
  });
  for (const candidate of candidates) {
    if (!isCurrent() || nextSlot >= slots.length) break;
    const url = await loadCandidate(candidate);
    if (!url || !isCurrent()) continue;
    loaded.push(url);
    const slot = slots[nextSlot++];
    slot.style.backgroundImage = `url(${JSON.stringify(url)})`; slot.classList.add('has-art');
  }
  if (!isCurrent() || !loaded.length) return;
  while (nextSlot < slots.length) {
    const slot = slots[nextSlot]; const url = loaded[nextSlot % loaded.length]; nextSlot++;
    slot.style.backgroundImage = `url(${JSON.stringify(url)})`; slot.classList.add('has-art');
  }
}
async function loadAuthCovers() {
  try {
    const response = await fetch(`/api/showcase/covers?v=${Date.now()}`, { cache: 'no-store' });
    let covers = response.ok ? (await response.json()).covers || [] : [];
    if (!covers.length) {
      const fallback = await fetch(`/cover-showcase.json?v=${Date.now()}`, { cache: 'no-store' });
      if (fallback.ok) covers = (await fallback.json()).covers || [];
    }
    const slots = [...$$('.promo-cover-deck i'), $('.promo-loose-cover'), ...$$('#auth-screen .auth-cover-field i')].filter(Boolean);
    await applyDecorativeCovers(slots, covers);
  } catch {}
}
async function loadAppBackgroundCovers(isCurrent) {
  const libraryCovers = uniqueArtworkUrls(state.games.map(game => game.coverUrl));
  let showcaseCovers = [];
  try {
    const response = await fetch(`/api/showcase/covers?v=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) showcaseCovers = (await response.json()).covers || [];
  } catch {}
  const covers = uniqueArtworkUrls([...libraryCovers, ...showcaseCovers]);
  for (let index = covers.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [covers[index], covers[swap]] = [covers[swap], covers[index]];
  }
  await applyDecorativeCovers($$('.app-cover-field i'), covers, isCurrent);
}
async function loadConfig() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    $('#app-version').textContent = config.version || 'dev';
  } catch { $('#app-version').textContent = 'dev'; }
}
function showAuth(message = '') {
  decorationSequence += 1;
  state.stopEvents?.(); state.stopEvents = null;
  gameLoadSequence++; metaLoadSequence++; state.pendingGamePatches.clear(); state.loading = false;
  state.coverStatus = null; state.pegiStatus = null; state.hltbStatus = null; state.descriptionStatus = null;
  coverProviderSettings.reset();
  preferencesReady = false; preferencesDirty = false; clearTimeout(preferenceSaveTimer);
  state.games = []; state.stats = null; state.platforms = []; state.page = 1;
  for (const [key, element] of Object.entries(filters)) element.value = key === 'sort' ? 'title' : '';
  for (const slot of $$('.hero-cover, .app-cover-field i')) { slot.style.backgroundImage = ''; slot.classList.remove('has-art'); }
  state.user = null;
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = false;
  showAuthForm();
  endSessionResume();
  $('#auth-error').textContent = message;
  $('#auth-error').hidden = !message;
  setTimeout(() => $('#auth-username').focus(), UI_TIMING.focusDelayMs);
}
function preferencePayload() {
  return { view: state.view, filters: Object.fromEntries(Object.entries(filters).map(([key, element]) => [key, element.value])) };
}
async function savePreferences(keepalive = false) {
  if (!preferencesReady || !preferencesDirty || !state.user) return;
  clearTimeout(preferenceSaveTimer);
  const generation = sessionGeneration; const userId = state.user.id;
  preferencesDirty = false;
  try {
    await api('/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferencePayload()), keepalive });
  } catch {
    if (generation === sessionGeneration && state.user?.id === userId) {
      preferencesDirty = true;
      if (!keepalive) preferenceSaveTimer = setTimeout(() => { void savePreferences(); }, UI_TIMING.preferenceRetryMs);
    }
  }
}
function schedulePreferenceSave(delay = UI_TIMING.preferenceSaveMs) {
  if (!preferencesReady || !state.user) return;
  preferencesDirty = true;
  clearTimeout(preferenceSaveTimer);
  preferenceSaveTimer = setTimeout(() => { void savePreferences(); }, delay);
}
function applyPreferences(preferences = {}) {
  preferencesReady = false;
  const saved = preferences.filters || {};
  for (const [key, element] of Object.entries(filters)) {
    const value = String(saved[key] || (key === 'sort' ? 'title' : ''));
    if (key === 'platform' && value && ![...element.options].some(option => option.value === value)) element.add(new Option(value, value));
    element.value = value;
  }
  setView(preferences.view === 'list' ? 'list' : 'grid', false);
  renderQuickFilter(); preferencesDirty = false; preferencesReady = true;
}
async function enterApp(user, savedPreferences, progress = null) {
  state.user = user;
  $('#account-name').textContent = user.username;
  $('#account-current-name').textContent = user.username;
  updateAvatarUI();
  applyPreferences(savedPreferences);
  const dataReady = Promise.all([loadGames(), loadStatsAndMeta()]);
  $('#auth-screen').hidden = true;
  $('#app-shell').hidden = false;
  endSessionResume();
  if (progress) progressionUi.render(progress);
  connectEventStream();
  void patchUi.refreshUnread();
  if (!progress) void progressionUi.load();
  await dataReady;
  if (state.user?.id !== user.id) return;
  void stageAppDecorations(user.id).catch(() => {});
}
function setAvatar(element, user) {
  element.replaceChildren();
  if (user?.avatarUrl) {
    const image = document.createElement('img'); image.src = user.avatarUrl; image.alt = '';
    element.append(image);
  } else {
    const initial = document.createElement('span'); initial.className = 'avatar-initial';
    initial.textContent = user?.username?.slice(0, 1).toUpperCase() || '?'; element.append(initial);
  }
}
function updateAvatarUI() {
  setAvatar($('#account-avatar'), state.user);
  setAvatar($('#nav-avatar'), state.user);
  $('#avatar-remove').hidden = !state.user?.avatarUrl;
}
const authInputs = $$('#auth-form input');
function clearAuthValidation() {
  $('#auth-password-confirm').setCustomValidity('');
  for (const input of authInputs) { input.classList.remove('input-invalid'); input.removeAttribute('aria-invalid'); }
}
function validateAuthForm() {
  const registration = state.authMode === 'register';
  const confirmation = $('#auth-password-confirm');
  confirmation.setCustomValidity(registration && confirmation.value !== $('#auth-password').value ? 'mismatch' : '');
  let firstInvalid = null;
  for (const input of authInputs) {
    const active = !input.closest('label')?.hidden;
    const invalid = active && !input.checkValidity();
    input.classList.toggle('input-invalid', invalid);
    if (invalid) { input.setAttribute('aria-invalid', 'true'); firstInvalid ||= input; }
    else input.removeAttribute('aria-invalid');
  }
  firstInvalid?.focus();
  return !firstInvalid;
}
for (const input of authInputs) input.addEventListener('input', () => {
  input.classList.remove('input-invalid'); input.removeAttribute('aria-invalid');
  if (input === $('#auth-password') || input === $('#auth-password-confirm')) {
    const confirmation = $('#auth-password-confirm'); confirmation.setCustomValidity('');
    confirmation.classList.remove('input-invalid'); confirmation.removeAttribute('aria-invalid');
  }
});
function setAuthMode(mode) {
  state.authMode = mode;
  $('#auth-screen').dataset.authMode = mode;
  $$('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
  $('#forgot-password').classList.remove('active');
  $('#auth-title').textContent = mode === 'register' ? 'Create an identity' : 'Access your library';
  $('#auth-copy').textContent = mode === 'register' ? 'Create an isolated library account on this server. Your games, settings, and progress stay yours.' : 'Enter your credentials to mount your personal collection.';
  $('#auth-submit').textContent = mode === 'register' ? 'Create account' : 'Authenticate';
  $('#auth-username').placeholder = mode === 'register' ? 'player_one' : '';
  $('#auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-password').placeholder = mode === 'register' ? '8+ characters' : '';
  $('#auth-email-label').hidden = mode !== 'register';
  $('#auth-confirm-label').hidden = mode !== 'register';
  $('#auth-password-confirm').required = mode === 'register';
  $('#auth-hint').hidden = mode !== 'register';
  $('#auth-error').hidden = true;
  clearAuthValidation();
}
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('#auth-error').hidden = true;
  if (!validateAuthForm()) return;
  const submit = $('#auth-submit'); submit.disabled = true; submit.textContent = state.authMode === 'register' ? 'Creating…' : 'Authenticating…';
  try {
    const result = await api(state.authMode === 'register' ? '/api/register' : '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#auth-username').value, email: state.authMode === 'register' ? $('#auth-email').value : '', password: $('#auth-password').value, passwordConfirm: state.authMode === 'register' ? $('#auth-password-confirm').value : undefined }),
    });
    sessionGeneration++;
    $('#auth-error').hidden = true;
    await enterApp(result.user, result.preferences, result.progress);
  } catch (error) { $('#auth-error').textContent = error.message; $('#auth-error').hidden = false; }
  finally { submit.disabled = false; submit.textContent = state.authMode === 'register' ? 'Create account' : 'Authenticate'; }
});
let passwordResetToken = '';
function showAuthForm() {
  passwordResetToken = '';
  $('#auth-form').hidden = false; $('.auth-tabs').hidden = false;
  $('#password-reset-request-form').hidden = true; $('#password-reset-complete-form').hidden = true;
  setAuthMode('login');
}
function showPasswordResetRequest() {
  passwordResetToken = '';
  $('#auth-form').hidden = true;
  $('#password-reset-complete-form').hidden = true; $('#password-reset-request-form').hidden = false;
  $$('[data-auth-mode]').forEach(button => button.classList.remove('active'));
  $('#forgot-password').classList.add('active');
  $('#auth-title').textContent = 'Reset your password';
  $('#auth-copy').textContent = 'Enter your username or email and we’ll send a one-time reset link.';
  $('#password-reset-request-form').reset(); $('#password-reset-request-error').hidden = true; $('#password-reset-request-success').hidden = true;
  $('#password-reset-identity').disabled = false; $('#password-reset-request-submit').hidden = false;
  setTimeout(() => $('#password-reset-identity').focus(), UI_TIMING.focusDelayMs);
}
function showPasswordResetComplete(token) {
  passwordResetToken = token;
  $('#auth-form').hidden = true;
  $('#password-reset-request-form').hidden = true; $('#password-reset-complete-form').hidden = false;
  $$('[data-auth-mode]').forEach(button => button.classList.remove('active'));
  $('#forgot-password').classList.add('active');
  $('#auth-title').textContent = 'Choose a new password';
  $('#auth-copy').textContent = 'Set a new password for your Game Kat·a·log account.';
  $('#password-reset-complete-form').reset(); $('#password-reset-complete-error').hidden = true; $('#password-reset-complete-success').hidden = true;
  $('#password-reset-new').disabled = false; $('#password-reset-confirm').disabled = false;
  $('#password-reset-complete-submit').hidden = false;
  setTimeout(() => $('#password-reset-new').focus(), UI_TIMING.focusDelayMs);
}
$('.auth-tabs').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'forgot-password') { showPasswordResetRequest(); return; }
  const mode = button.dataset.authMode;
  if (!mode) return;
  showAuthForm(); setAuthMode(mode);
  setTimeout(() => $('#auth-username').focus(), UI_TIMING.focusDelayMs);
});
$('#password-reset-request-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = $('#password-reset-request-submit'); submit.disabled = true;
  try {
    const identity = $('#password-reset-identity').value.trim();
    if (!identity) throw new Error('Enter your username or email.');
    const result = await api('/api/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity }) });
    $('#password-reset-request-success').textContent = result.message; $('#password-reset-request-success').hidden = false;
    $('#password-reset-identity').disabled = true; submit.hidden = true;
  } catch (error) { $('#password-reset-request-error').textContent = error.message; $('#password-reset-request-error').hidden = false; }
  finally { submit.disabled = false; }
});
$('#password-reset-complete-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = $('#password-reset-complete-submit'); submit.disabled = true;
  try {
    const password = $('#password-reset-new').value;
    if (password !== $('#password-reset-confirm').value) throw new Error('Passwords do not match.');
    await api('/api/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: passwordResetToken, password, passwordConfirm: $('#password-reset-confirm').value }) });
    passwordResetToken = ''; $('#password-reset-new').disabled = true; $('#password-reset-confirm').disabled = true;
    submit.hidden = true; $('#password-reset-complete-success').hidden = false;
  } catch (error) { $('#password-reset-complete-error').textContent = error.message; $('#password-reset-complete-error').hidden = false; }
  finally { submit.disabled = false; }
});
function count(group, label) { return group?.find(row => row.label === label)?.count || 0; }
function renderStats() {
  $('#stat-total').textContent = state.stats?.total?.toLocaleString() || '0';
  $('#stat-owned-physical').textContent = count(state.stats?.ownedFormats, 'physical').toLocaleString();
  $('#stat-owned-digital').textContent = count(state.stats?.ownedFormats, 'digital').toLocaleString();
  $('#stat-wanted').textContent = count(state.stats?.ownership, 'wanted').toLocaleString();
  $('#stat-backlog').textContent = count(state.stats?.play, 'backlog').toLocaleString();
  $('#stat-playing').textContent = count(state.stats?.play, 'playing').toLocaleString();
  $('#stat-completed').textContent = count(state.stats?.play, 'completed').toLocaleString();
  $('#stat-paused').textContent = count(state.stats?.play, 'paused').toLocaleString();
  $('#stat-abandoned').textContent = count(state.stats?.play, 'abandoned').toLocaleString();
  $('#stat-favorites').textContent = Number(state.stats?.favorites || 0).toLocaleString();
}
function renderPlatforms() {
  const current = filters.platform.value;
  filters.platform.innerHTML = '<option value="">All platforms</option>' + state.platforms.map(platform => `<option>${escapeHtml(platform)}</option>`).join('');
  filters.platform.value = current;
}
function renderPlatformChoices() {
  $('#game-platform').innerHTML = Object.entries(platformGroups).map(([group, platforms]) => `<optgroup label="${escapeHtml(group)}">${platforms.map(platform => `<option value="${escapeHtml(platform)}">${escapeHtml(platform)}</option>`).join('')}</optgroup>`).join('') + `<optgroup label="Other"><option value="${CUSTOM_PLATFORM}">Custom…</option></optgroup>`;
}
function toggleCustomPlatform(focus = true) {
  const custom = $('#game-platform').value === CUSTOM_PLATFORM;
  $('#game-platform-custom-label').hidden = !custom;
  $('#game-platform-custom').required = custom;
  if (custom && focus) setTimeout(() => $('#game-platform-custom').focus(), 0);
}
function setPlatformValue(platform) {
  const value = String(platform || '').trim();
  if (knownPlatforms.has(value)) { $('#game-platform').value = value; $('#game-platform-custom').value = ''; }
  else { $('#game-platform').value = CUSTOM_PLATFORM; $('#game-platform-custom').value = value; }
  toggleCustomPlatform(false);
}
function selectedPlatform() { return $('#game-platform').value === CUSTOM_PLATFORM ? $('#game-platform-custom').value.trim() : $('#game-platform').value; }
renderPlatformChoices();
$('#game-platform').addEventListener('change', () => toggleCustomPlatform());
function badge(text, className = '') { return `<span class="badge ${className}">${escapeHtml(text)}</span>`; }
function coverCredit(source) {
  const credits = {
    thegamesdb: ['TheGamesDB art ↗', 'https://thegamesdb.net/'], hltb: ['HLTB art ↗', 'https://howlongtobeat.com/'],
  };
  const credit = credits[source];
  if (credit) return `<a class="badge source-credit" href="${credit[1]}" target="_blank" rel="noopener" data-card-link>${credit[0]}</a>`;
  return source === 'steamgriddb' ? badge('SGDB art') : '';
}
function isMissingPegiInfo(game) {
  return !/^Evercade/i.test(String(game.platform || '')) && !game.pegiUrl
    && !(game.pegiDescriptors || []).length && !(game.pegiReleases || []).length
    && !game.pegiAdvice && !game.pegiOutline && !game.pegiContentIssues && !game.pegiOtherIssues;
}
function isMissingHltbInfo(game) { return !game.hltbId; }
function isMissingDescription(game) { return !String(game.description || '').trim(); }
function ratingStars(value) {
  return Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    return `<i class="rating-star ${value >= position ? 'on' : value >= position - 0.5 ? 'half' : ''}" aria-hidden="true">★</i>`;
  }).join('');
}
function personalRating(rating) {
  const value = Number(rating);
  return value ? `<span class="personal-rating" aria-label="Your rating: ${value} out of 5"><span class="rating-stars">${ratingStars(value)}</span><b>${value.toFixed(1)}</b></span>` : '';
}
function cardRatingControl(game) {
  const value = Number(game.rating) || 0;
  const stars = Array.from({ length: 5 }, (_, index) => {
    const position = index + 1; const stateClass = value >= position ? 'on' : value === position - 0.5 ? 'half' : '';
    return `<button type="button" class="rating-star ${stateClass}" data-action="rate" data-rating-star="${position}" aria-label="Rate ${position} star${position === 1 ? '' : 's'}">★</button>`;
  }).join('');
  const label = value ? `${value.toFixed(1)} / 5` : 'Not rated';
  return `<div class="rating-field card-rating-field"><div class="rating-picker card-rating-picker" data-card-rating="${value}" role="group" aria-label="Your rating: ${label}">${stars}<output>${label}</output><small class="card-rating-inline-label">Your rating</small></div></div>`;
}
function paintCardRating(picker, value, preview = false) {
  const rating = ratingValue(value); const label = rating == null ? 'Not rated' : `${rating.toFixed(1)} / 5`;
  picker.classList.toggle('previewing', preview); picker.setAttribute('aria-label', `${preview ? 'Rating preview' : 'Your rating'}: ${label}`);
  picker.querySelector('output').textContent = label;
  picker.querySelectorAll('[data-rating-star]').forEach(star => {
    const position = Number(star.dataset.ratingStar);
    star.classList.toggle('on', rating != null && rating >= position);
    star.classList.toggle('half', rating != null && rating === position - 0.5);
  });
}
function cardRatingAtPointer(event) {
  const star = event.target.closest('.card-rating-picker [data-rating-star]'); if (!star) return null;
  const bounds = star.getBoundingClientRect(); const position = Number(star.dataset.ratingStar);
  return position - (event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 0);
}
function gameCard(game) {
  const meta = [game.publisher, game.releaseYear, game.cartridgeNumber != null ? `Cartridge #${game.cartridgeNumber}` : ''].filter(Boolean).join(' · ');
  const pegiClass = game.pegi ? `pegi pegi-${game.pegi}` : '';
  const quick = game.ownership === 'wanted' ? '<button class="quick-button" data-action="own">Mark owned</button>' : '';
  const descriptorBadges = (game.pegiDescriptors || []).map(descriptor => badge(descriptor, /purchases|random items/i.test(descriptor) ? 'descriptor purchase' : 'descriptor')).join('');
  const cover = game.coverUrl ? `<img class="game-cover" src="${escapeHtml(game.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="game-cover-shade"></span>` : '';
  return `<article class="game-card ${game.coverUrl ? 'has-cover' : ''}" data-id="${game.id}" style="--rating-color:${pegiColors[game.pegi] || pegiColors.none}">${cover}
    <div class="card-top"><span class="platform-tag">${escapeHtml(game.platform)}</span><button class="favorite-button ${game.favorite ? 'on' : ''}" data-action="favorite" aria-label="${game.favorite ? 'Remove favorite' : 'Mark favorite'}">★</button></div>
    <h3 class="game-title">${escapeHtml(game.title)}</h3><div class="game-meta" title="${escapeHtml(meta)}">${escapeHtml(meta || (game.mediaFormat === 'physical' ? 'Physical copy' : labels[game.mediaFormat]))}</div>
    <div class="badges">${badge(game.pegi ? `PEGI ${game.pegi}` : game.platform === 'Evercade' ? 'No PEGI' : 'Unrated', pegiClass)}${personalRating(game.rating)}${descriptorBadges}${badge(labels[game.ownership], game.ownership)}${badge(labels[game.playStatus], game.playStatus)}${game.favorite ? badge('Favorite') : ''}${coverCredit(game.coverSource)}</div>
    ${cardTimes(game, escapeHtml)}
    ${cardRatingControl(game)}<div class="card-actions"><button class="edit-button" data-action="edit">Edit details</button>${quick}</div>
  </article>`;
}
function gameMatchesFilters(game) {
  const query = filters.q.value.trim().toLocaleLowerCase();
  if (query && ![game.title, game.publisher, game.notes, game.description].some(value => String(value || '').toLocaleLowerCase().includes(query))) return false;
  if (filters.platform.value && game.platform !== filters.platform.value) return false;
  if (filters.ownership.value === 'owned_physical' && (game.ownership !== 'owned' || game.mediaFormat !== 'physical')) return false;
  if (filters.ownership.value === 'owned_digital' && (game.ownership !== 'owned' || game.mediaFormat !== 'digital')) return false;
  if (filters.ownership.value && !filters.ownership.value.startsWith('owned_') && game.ownership !== filters.ownership.value) return false;
  if (filters.playStatus.value && game.playStatus !== filters.playStatus.value) return false;
  if (filters.pegi.value === 'none' && game.pegi != null) return false;
  if (filters.pegi.value && filters.pegi.value !== 'none' && Number(game.pegi) !== Number(filters.pegi.value)) return false;
  const missingPegi = isMissingPegiInfo(game); const missingCover = !game.coverUrl; const missingHltb = isMissingHltbInfo(game); const missingDescription = isMissingDescription(game);
  if (filters.missing.value === 'pegi' && !missingPegi) return false;
  if (filters.missing.value === 'cover' && !missingCover) return false;
  if (filters.missing.value === 'hltb' && !missingHltb) return false;
  if (filters.missing.value === 'description' && !missingDescription) return false;
  if (filters.missing.value === 'either' && !missingPegi && !missingCover && !missingHltb && !missingDescription) return false;
  if (filters.missing.value === 'both' && (!missingPegi || !missingCover || !missingHltb || !missingDescription)) return false;
  if (filters.favorite.value === '1' && !game.favorite) return false;
  return true;
}
function cardNode(game) {
  const template = document.createElement('template'); template.innerHTML = gameCard(game).trim(); return template.content.firstElementChild;
}
function pageCount() { return Math.max(1, Math.ceil(state.games.length / LIBRARY_PAGE_SIZE)); }
function pagedGames() {
  state.page = Math.min(Math.max(1, state.page), pageCount());
  const offset = (state.page - 1) * LIBRARY_PAGE_SIZE;
  return state.games.slice(offset, offset + LIBRARY_PAGE_SIZE);
}
function updateCollectionChrome() {
  const shown = pagedGames(); const pages = pageCount(); const pagination = $('#library-pagination');
  $('#library-loader').hidden = !state.loading || state.games.length > 0;
  $('#empty').hidden = state.loading || state.games.length > 0;
  pagination.hidden = state.loading || pages < 2;
  $('#library-page-status').textContent = `Page ${state.page} of ${pages}`;
  pagination.querySelector('[data-library-page="previous"]').disabled = state.page <= 1;
  pagination.querySelector('[data-library-page="next"]').disabled = state.page >= pages;
  $('#result-count').textContent = `${state.games.length.toLocaleString()} ${state.games.length === 1 ? 'game' : 'games'} found`;
}
function applyGamePatch(game) {
  if (!game?.id) return;
  if (state.loading) { state.pendingGamePatches.set(game.id, game); return; }
  const existingIndex = state.games.findIndex(item => item.id === game.id);
  const existingCard = $(`.game-card[data-id="${Number(game.id)}"]`); existingCard?.remove();
  if (existingIndex !== -1) state.games.splice(existingIndex, 1);
  if (gameMatchesFilters(game)) state.games.push(game);
  state.games.sort((left, right) => compareGames(left, right, filters.sort.value));
  const visible = pagedGames(); const visibleIds = new Set(visible.map(item => item.id));
  for (const card of $$('#games .game-card')) if (!visibleIds.has(Number(card.dataset.id))) card.remove();
  visible.forEach((item, index) => {
    const node = $(`.game-card[data-id="${Number(item.id)}"]`) || cardNode(item);
    const current = $('#games').children[index]; if (current !== node) $('#games').insertBefore(node, current || null);
  });
  updateCollectionChrome();
}
function flushPendingGamePatches() {
  const pending = [...state.pendingGamePatches.values()]; state.pendingGamePatches.clear();
  for (const game of pending) applyGamePatch(game);
}
function connectEventStream() {
  state.stopEvents?.();
  const generation = sessionGeneration;
  state.stopEvents = openEventStream({ onEvent(event, data) {
    if (event === 'game-updated') applyGamePatch(data.game);
    else if (event === 'progression-updated') progressionUi.handleEvent(data);
    else if (event === 'cover-job') { state.coverStatus = mergeLiveJobStatus(state.coverStatus, data.job); renderCoverStatus(); }
    else if (event === 'pegi-job') { state.pegiStatus = mergeLiveJobStatus(state.pegiStatus, data.job); renderPegiBulkStatus(); }
    else if (event === 'hltb-job') { state.hltbStatus = mergeLiveJobStatus(state.hltbStatus, data.job); renderHltbBulkStatus(); }
    else if (event === 'description-job') { state.descriptionStatus = mergeLiveJobStatus(state.descriptionStatus, data.job); renderDescriptionBulkStatus(); }
    else if (event === 'ping-updated') patchUi.handleEvent(event, data);
    else if (event === 'stream-reset') { loadGames(); loadCoverStatus(); coverProviderSettings.load(); loadPegiStatus(); loadHltbStatus(); loadDescriptionStatus(); }
    else coverProviderSettings.handleEvent(event, data);
  }, onUnauthorized() {
    if (generation !== sessionGeneration) return;
    sessionGeneration++; showAuth('Your session expired. Authenticate again.');
  } });
}
function mergeLiveJobStatus(status, job) {
  const missing = Math.max(0, Number(job.total || 0) - Number(job.matched || 0) - Number(job.skipped || 0));
  return { ...(status || {}), job, missing };
}
function renderGames() {
  const shown = pagedGames();
  $('#games').innerHTML = shown.map(gameCard).join('');
  $('#games').classList.toggle('list-view', state.view === 'list');
  updateCollectionChrome();
  if (state.loading) $('#result-count').textContent = 'Loading collection…';
  $('#clear-filters').hidden = !Object.entries(filters).some(([key, el]) => key !== 'sort' && el.value);
}
async function loadHeroCovers(isCurrent) {
  const slots = $$('.hero-cover');
  if (!slots.length || slots.some(slot => slot.classList.contains('has-art'))) return;
  const covers = uniqueArtworkUrls(state.games.map(game => game.coverUrl));
  for (let index = covers.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [covers[index], covers[swap]] = [covers[swap], covers[index]];
  }
  await applyDecorativeCovers(slots, covers, isCurrent);
}
async function stageAppDecorations(userId) {
  const sequence = ++decorationSequence;
  const isCurrent = () => sequence === decorationSequence && state.user?.id === userId;
  await loadHeroCovers(isCurrent);
  await loadAppBackgroundCovers(isCurrent);
}
function queryString() {
  const params = new URLSearchParams();
  for (const [key, element] of Object.entries(filters)) if (element.value) params.set(key, element.value);
  return params.toString();
}
async function loadGames() {
  const sequence = ++gameLoadSequence; const userId = state.user?.id;
  state.loading = true; renderGames();
  try {
    const games = await api(`/api/games?${queryString()}`);
    if (sequence !== gameLoadSequence || state.user?.id !== userId) return;
    state.games = games; state.page = 1;
  } catch (error) { if (sequence === gameLoadSequence && state.user?.id === userId) toast(error.message); }
  finally {
    if (sequence === gameLoadSequence && state.user?.id === userId) { state.loading = false; renderGames(); flushPendingGamePatches(); }
  }
}
async function loadStatsAndMeta() {
  const sequence = ++metaLoadSequence; const userId = state.user?.id;
  try {
    const [stats, meta] = await Promise.all([api('/api/stats'), api('/api/meta')]);
    if (sequence !== metaLoadSequence || state.user?.id !== userId) return;
    state.stats = stats; state.platforms = meta.platforms; renderStats(); renderPlatforms();
  } catch (error) { if (sequence === metaLoadSequence && state.user?.id === userId) toast(error.message); }
}
let searchTimer;
filters.q.addEventListener('input', () => { renderQuickFilter(); schedulePreferenceSave(UI_TIMING.searchPreferenceSaveMs); clearTimeout(searchTimer); searchTimer = setTimeout(loadGames, UI_TIMING.librarySearchDebounceMs); });
Object.entries(filters).filter(([key]) => !['q', 'favorite'].includes(key)).forEach(([, element]) => element.addEventListener('change', () => { renderQuickFilter(); schedulePreferenceSave(); loadGames(); }));
$('#clear-filters').addEventListener('click', () => { Object.entries(filters).forEach(([key, element]) => { element.value = key === 'sort' ? 'title' : ''; }); renderQuickFilter(); schedulePreferenceSave(); loadGames(); });
$('#library-pagination').addEventListener('click', event => {
  const direction = event.target.closest('[data-library-page]')?.dataset.libraryPage;
  if (!direction) return;
  state.page += direction === 'next' ? 1 : -1;
  renderGames();
});
function renderQuickFilter() {
  $$('[data-stat-kind]').forEach(button => {
    const { statKind: kind, statValue: value = '' } = button.dataset;
    const active = kind === 'all'
      ? !Object.entries(filters).some(([key, element]) => key !== 'sort' && element.value)
      : filters[kind].value === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
$$('[data-stat-kind]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.statKind === 'all') Object.entries(filters).forEach(([key, element]) => { if (key !== 'sort') element.value = ''; });
  else { filters.ownership.value = ''; filters.playStatus.value = ''; filters.favorite.value = ''; }
  if (button.dataset.statKind !== 'all') filters[button.dataset.statKind].value = button.dataset.statValue;
  renderQuickFilter();
  schedulePreferenceSave();
  loadGames();
}));
renderQuickFilter();
function setView(view, persist = true) {
  state.view = view === 'list' ? 'list' : 'grid';
  $('#grid-view').classList.toggle('active', view === 'grid'); $('#list-view').classList.toggle('active', view === 'list'); renderGames();
  if (persist) schedulePreferenceSave();
}
$('#grid-view').addEventListener('click', () => setView('grid')); $('#list-view').addEventListener('click', () => setView('list')); setView(state.view);

const dialog = $('#game-dialog');
const detailsDialog = $('#game-details-dialog');
let detailGame = null;
function safeDetailLink(url, label) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' ? `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>` : '';
  } catch { return ''; }
}
function detailSection(title, content) { return content ? `<section class="game-detail-section"><h3>${escapeHtml(title)}</h3>${content}</section>` : ''; }
function openDetails(game) {
  detailGame = game;
  $('#game-details-title').textContent = game.title;
  const rating = personalRating(game.rating);
  const descriptors = (game.pegiDescriptors || []).map(item => badge(item, /purchases|random items/i.test(item) ? 'descriptor purchase' : 'descriptor')).join('');
  const times = [['Main story', game.hltbMainStory], ['Main + sides', game.hltbMainExtra], ['Completionist', game.hltbCompletionist], ['All styles', game.hltbAllStyles]]
    .map(([label, value]) => `<div><span>${label}</span><strong>${value == null ? '//' : escapeHtml(String(value)) + 'h'}</strong></div>`).join('');
  const facts = [['Platform', game.platform], ['Collection', labels[game.ownership]], ['Play status', labels[game.playStatus]], ['Format', labels[game.mediaFormat]], ['Publisher', game.publisher], ['Release year', game.releaseYear], ['Cartridge no.', game.cartridgeNumber == null ? '' : game.cartridgeNumber]]
    .filter(([, value]) => value !== '' && value != null).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('');
  const pegiText = [['Advice for consumers', game.pegiAdvice], ['Brief outline', game.pegiOutline], ['Content-specific issues', game.pegiContentIssues], ['Other issues', game.pegiOtherIssues]]
    .filter(([, value]) => value).map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`).join('');
  const releases = (game.pegiReleases || []).length ? `<ul>${game.pegiReleases.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : '';
  $('#game-details-content').innerHTML = `<div class="game-detail-hero">${game.coverUrl ? `<img src="${escapeHtml(game.coverUrl)}" alt="${escapeHtml(`${game.title} cover`)}" referrerpolicy="no-referrer">` : '<div class="game-detail-no-cover">No cover</div>'}<div><p>${escapeHtml(game.platform)}</p><div class="game-detail-chips">${badge(game.pegi ? `PEGI ${game.pegi}` : 'Unrated', game.pegi ? `pegi pegi-${game.pegi}` : '')}${rating}${game.favorite ? badge('Favorite') : ''}</div>${game.description ? `<p class="game-detail-description">${escapeHtml(game.description)}</p>` : ''}${game.descriptionSource ? `<small>DESCRIPTION // ${escapeHtml(game.descriptionSource)}</small>` : ''}${safeDetailLink(game.descriptionSourceUrl, 'View description source')}</div></div><div class="game-detail-facts">${facts}</div>${detailSection('HowLongToBeat', `<div class="game-detail-times">${times}</div>${safeDetailLink(game.hltbUrl, 'View source on HowLongToBeat')}`)}${detailSection('PEGI details', `${descriptors ? `<div class="game-detail-chips">${descriptors}</div>` : ''}${releases}${pegiText}${safeDetailLink(game.pegiUrl, 'View source on PEGI')}`)}${detailSection('Notes', game.notes ? `<p>${escapeHtml(game.notes)}</p>` : '<p class="empty-detail">No personal notes.</p>')}`;
  detailsDialog.showModal();
  setTimeout(() => $('[data-details-close]').focus(), UI_TIMING.formFocusDelayMs);
}
function closeDetails() { detailsDialog.close(); detailGame = null; }
$$('[data-details-close]').forEach(button => button.addEventListener('click', closeDetails));
detailsDialog.addEventListener('close', () => { detailGame = null; });
closeOnTrueBackdrop(detailsDialog, closeDetails);
$('#game-details-edit').addEventListener('click', () => { const game = detailGame; closeDetails(); if (game) openForm(game); });
const ratingPicker = $('#game-rating-picker');
function ratingValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0.5 && numeric <= 5 ? Math.round(numeric * 2) / 2 : null;
}
function paintRating(value, preview = false) {
  const rating = ratingValue(value);
  const label = rating == null ? 'Not rated' : `${rating.toFixed(1)} / 5`;
  ratingPicker.classList.toggle('previewing', preview);
  ratingPicker.dataset.rating = rating == null ? '' : String(rating);
  ratingPicker.setAttribute('aria-label', `${preview ? 'Rating preview' : 'Your rating'}: ${label}`);
  $('#game-rating-label').textContent = label;
  $$('#game-rating-picker .rating-star').forEach(star => {
    const position = Number(star.dataset.ratingStar);
    star.classList.toggle('on', rating != null && rating >= position);
    star.classList.toggle('half', rating != null && rating === position - 0.5);
    star.setAttribute('aria-label', `Rate ${position === 1 ? '1 star' : `${position} stars`}`);
  });
}
function setRating(value) {
  const rating = ratingValue(value);
  $('#game-rating').value = rating == null ? '' : String(rating);
  paintRating(rating);
}
function ratingAtPointer(event) {
  const star = event.target.closest('[data-rating-star]');
  if (!star) return null;
  const bounds = star.getBoundingClientRect();
  const position = Number(star.dataset.ratingStar);
  return position - (event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 0);
}
ratingPicker.addEventListener('pointermove', event => {
  const rating = ratingAtPointer(event);
  if (rating != null) paintRating(rating, true);
  else if (ratingPicker.classList.contains('previewing')) paintRating($('#game-rating').value);
});
ratingPicker.addEventListener('pointerleave', () => setRating($('#game-rating').value));
ratingPicker.addEventListener('click', event => {
  const clear = event.target.closest('[data-rating-clear]');
  if (clear) return setRating(null);
  const star = event.target.closest('[data-rating-star]');
  if (!star) return;
  const position = Number(star.dataset.ratingStar);
  setRating(event.detail === 0 ? position : ratingAtPointer(event));
});
ratingPicker.addEventListener('keydown', event => {
  const current = Number($('#game-rating').value) || 0;
  const next = { ArrowLeft: current - 0.5, ArrowDown: current - 0.5, ArrowRight: current + 0.5, ArrowUp: current + 0.5, Home: 0, End: 5 }[event.key];
  if (next === undefined && event.key !== 'Backspace' && event.key !== 'Delete') return;
  event.preventDefault(); setRating(event.key === 'Backspace' || event.key === 'Delete' ? null : Math.max(0, Math.min(5, next)));
});
function formValue(game, key, fallback = '') { return game?.[key] ?? fallback; }
const pegiFields = ['pegiDescriptors', 'pegiReleases', 'pegiAdvice', 'pegiOutline', 'pegiContentIssues', 'pegiOtherIssues'];
function pegiMetadata(game = {}) {
  const source = game || {};
  return Object.fromEntries(pegiFields.map(key => [key, Array.isArray(source[key]) ? [...source[key]] : String(source[key] || '')]));
}
function renderPegiDetails() {
  const metadata = $('#game-form')._pegiMetadata || pegiMetadata();
  const descriptors = metadata.pegiDescriptors || []; const releases = metadata.pegiReleases || [];
  const textFields = [metadata.pegiAdvice, metadata.pegiOutline, metadata.pegiContentIssues, metadata.pegiOtherIssues];
  const hasDetails = descriptors.length || releases.length || textFields.some(Boolean);
  const details = $('#game-pegi-details'); details.hidden = !hasDetails;
  if (!hasDetails) { details.open = false; return; }
  $('#game-pegi-summary').textContent = [descriptors.length ? `${descriptors.length} descriptor${descriptors.length === 1 ? '' : 's'}` : '', releases.length ? `${releases.length} release${releases.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  $('#game-pegi-descriptors').innerHTML = descriptors.map(value => `<span class="pegi-detail-tag ${/purchases|random items/i.test(value) ? 'purchase' : ''}">${escapeHtml(value)}</span>`).join('');
  const purchaseLabels = descriptors.filter(value => /purchases|random items/i.test(value));
  $('#game-pegi-purchase-warning').hidden = purchaseLabels.length === 0;
  $('#game-pegi-purchase-text').textContent = purchaseLabels.join(' · ');
  $('#game-pegi-releases').innerHTML = releases.map(value => `<li>${escapeHtml(value)}</li>`).join('');
  const sections = [
    ['#game-pegi-releases-section', releases.length], ['#game-pegi-advice-section', metadata.pegiAdvice],
    ['#game-pegi-outline-section', metadata.pegiOutline], ['#game-pegi-content-section', metadata.pegiContentIssues],
    ['#game-pegi-other-section', metadata.pegiOtherIssues],
  ];
  for (const [selector, value] of sections) $(selector).hidden = !value;
  $('#game-pegi-advice').textContent = metadata.pegiAdvice; $('#game-pegi-outline').textContent = metadata.pegiOutline;
  $('#game-pegi-content').textContent = metadata.pegiContentIssues; $('#game-pegi-other').textContent = metadata.pegiOtherIssues;
  const source = $('#game-form').dataset.pegiUrl; $('#game-pegi-source').hidden = !source; if (source) $('#game-pegi-source').href = source;
}
function openForm(game = null) {
  titleAutocomplete.reset();
  $('#game-form').reset(); $('#game-id').value = game?.id || '';
  $('#game-form').dataset.pegiUrl = game?.pegiUrl || '';
  $('#game-form').dataset.coverUrl = game?.coverUrl || '';
  $('#game-form').dataset.coverSource = game?.coverSource || '';
  $('#game-form').dataset.coverMatchTitle = game?.coverMatchTitle || '';
  $('#game-form').dataset.descriptionSource = game?.descriptionSource || '';
  $('#game-form').dataset.descriptionSourceUrl = game?.descriptionSourceUrl || '';
  $('#game-form').dataset.descriptionInitial = game?.description || '';
  $('#game-form')._pegiMetadata = pegiMetadata(game);
  $('#form-title').textContent = game ? 'Edit game' : 'Add a game'; $('#form-kicker').textContent = game ? 'Update the shelf' : 'Grow the shelf';
  $('#game-title').value = formValue(game, 'title'); setPlatformValue(formValue(game, 'platform', filters.platform.value || 'Nintendo Switch'));
  $('#game-pegi').value = formValue(game, 'pegi'); $('#game-ownership').value = formValue(game, 'ownership', 'owned');
  $('#game-status').value = formValue(game, 'playStatus', 'backlog'); $('#game-format').value = formValue(game, 'mediaFormat', 'physical');
  $('#game-cartridge').value = formValue(game, 'cartridgeNumber'); $('#game-publisher').value = formValue(game, 'publisher');
  $('#game-year').value = formValue(game, 'releaseYear'); setRating(formValue(game, 'rating')); $('#game-description').value = formValue(game, 'description'); $('#game-notes').value = formValue(game, 'notes'); $('#game-favorite').checked = Boolean(game?.favorite);
  $('#delete-game').hidden = !game; $('#pegi-results').hidden = true; $('#pegi-results').innerHTML = ''; $('#cover-results').hidden = true; $('#cover-results').innerHTML = ''; $('#description-results').hidden = true; $('#description-results').innerHTML = ''; $('#form-error').hidden = true; titleAutocomplete.updateWarning(); hltbLookup.load(game); renderCoverSelection(); renderPegiDetails();
  if (!dialog.open) dialog.showModal();
  setTimeout(() => $('#game-title').focus(), UI_TIMING.formFocusDelayMs);
}
function closeForm() { titleAutocomplete.close(); dialog.close(); }
function closeOnTrueBackdrop(targetDialog, close) {
  let startedOnBackdrop = false;
  targetDialog.addEventListener('pointerdown', event => { startedOnBackdrop = event.target === targetDialog; });
  targetDialog.addEventListener('pointerup', event => {
    if (startedOnBackdrop && event.target === targetDialog) close();
    startedOnBackdrop = false;
  });
  targetDialog.addEventListener('pointercancel', () => { startedOnBackdrop = false; });
}
function confirmAction({ title = 'Confirm action', message = '', confirmLabel = 'Confirm', kicker = 'Destructive action' } = {}) {
  const actionDialog = $('#action-dialog');
  if (actionDialog.open) return Promise.resolve(false);
  $('#action-title').textContent = title; $('#action-message').textContent = message;
  $('#action-kicker').textContent = kicker; $('#action-confirm').textContent = confirmLabel;
  return new Promise(resolve => {
    let startedOnBackdrop = false; let settled = false;
    const finish = value => {
      if (settled) return; settled = true;
      actionDialog.oncancel = null; actionDialog.onpointerdown = null; actionDialog.onpointerup = null; actionDialog.onpointercancel = null;
      $('#action-close').onclick = null; $('#action-cancel').onclick = null; $('#action-confirm').onclick = null;
      actionDialog.close(); resolve(value);
    };
    $('#action-close').onclick = () => finish(false); $('#action-cancel').onclick = () => finish(false); $('#action-confirm').onclick = () => finish(true);
    actionDialog.oncancel = event => { event.preventDefault(); finish(false); };
    actionDialog.onpointerdown = event => { startedOnBackdrop = event.target === actionDialog; };
    actionDialog.onpointerup = event => { if (startedOnBackdrop && event.target === actionDialog) finish(false); startedOnBackdrop = false; };
    actionDialog.onpointercancel = () => { startedOnBackdrop = false; };
    actionDialog.showModal(); requestAnimationFrame(() => $('#action-cancel').focus());
  });
}
$$('[data-add-game]').forEach(button => button.addEventListener('click', () => openForm()));
$$('[data-close]').forEach(button => button.addEventListener('click', closeForm));
closeOnTrueBackdrop(dialog, closeForm);

async function openExistingGame(id) {
  try { const game = await api(`/api/games/${id}`); openForm(game); }
  catch {}
}
const catalogueNavigation = createCatalogueNavigation({
  onGameAdded: () => { void loadGames(); void loadStatsAndMeta(); },
  onSignalVisible: () => { void activityFeed.load(); },
});
const titleAutocomplete = createTitleAutocomplete({
  input: $('#game-title'), suggestionBox: $('#title-suggestions'), warning: $('#duplicate-warning'), summary: $('#duplicate-summary'),
  openButton: $('#open-duplicate'), platformInput: $('#game-platform'), customPlatformInput: $('#game-platform-custom'),
  api, escapeHtml, labels, getPlatform: selectedPlatform, getEditingId: () => $('#game-id').value, openExisting: openExistingGame,
  openCatalogue: slug => catalogueNavigation.open(`/game/${encodeURIComponent(slug)}`),
});
const hltbLookup = createHltbLookup({ $, api, escapeHtml, toast });
function payload() {
  return { title: $('#game-title').value, platform: selectedPlatform(), pegi: $('#game-pegi').value,
    ownership: $('#game-ownership').value, playStatus: $('#game-status').value, mediaFormat: $('#game-format').value,
    cartridgeNumber: $('#game-cartridge').value, publisher: $('#game-publisher').value, releaseYear: $('#game-year').value, rating: $('#game-rating').value,
    notes: $('#game-notes').value, description: $('#game-description').value, descriptionSource: $('#game-form').dataset.descriptionSource || '', descriptionSourceUrl: $('#game-form').dataset.descriptionSourceUrl || '', favorite: $('#game-favorite').checked, pegiUrl: $('#game-form').dataset.pegiUrl || '',
    ...($('#game-form')._pegiMetadata || pegiMetadata()), ...hltbLookup.payload(),
    coverUrl: $('#game-form').dataset.coverUrl || '', coverSource: $('#game-form').dataset.coverSource || '', coverMatchTitle: $('#game-form').dataset.coverMatchTitle || '' };
}
$('#game-form').addEventListener('submit', async event => {
  event.preventDefault(); const id = $('#game-id').value; const save = $('#save-game');
  save.disabled = true; save.textContent = 'Checking…';
  const duplicate = await titleAutocomplete.duplicateBeforeSave();
  if (!id && duplicate && !await confirmAction({ title: 'Add another copy?', message: `“${duplicate.title}” is already in your ${duplicate.platform} library. Add another entry anyway?`, confirmLabel: 'Add anyway', kicker: 'Duplicate // game' })) {
    save.disabled = false; save.textContent = 'Save game'; return;
  }
  save.textContent = 'Saving…';
  try {
    const result = await api(id ? `/api/games/${id}` : '/api/games', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    applySaveProgress(result);
    closeForm(); toast(id ? 'Game updated.' : 'Game added to the shelf.'); await Promise.all([loadGames(), loadStatsAndMeta()]);
  } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
  finally { save.disabled = false; save.textContent = 'Save game'; }
});
$('#delete-game').addEventListener('click', async () => {
  const id = $('#game-id').value; const title = $('#game-title').value;
  if (!id || !await confirmAction({ title: 'Delete game?', message: `Permanently delete “${title}” from the collection?`, confirmLabel: 'Delete game', kicker: 'Destructive // game' })) return;
  try { await api(`/api/games/${id}`, { method: 'DELETE' }); closeForm(); toast('Game deleted.'); await Promise.all([loadGames(), loadStatsAndMeta()]); }
  catch (error) { toast(error.message); }
});
$('#games').addEventListener('click', async event => {
  const card = event.target.closest('.game-card'); const action = event.target.closest('[data-action]')?.dataset.action;
  if (!card) return; const game = state.games.find(item => item.id === Number(card.dataset.id)); if (!game) return;
  if (!action) return openDetails(game);
  if (action === 'view') return openDetails(game);
  if (action === 'edit') return openForm(game);
  const changed = { ...game };
  if (action === 'favorite') changed.favorite = !changed.favorite;
  if (action === 'own') changed.ownership = 'owned';
  if (action === 'rate') {
    const star = event.target.closest('[data-rating-star]'); const position = Number(star?.dataset.ratingStar);
    if (!position) return;
    const bounds = star.getBoundingClientRect();
    const next = event.detail === 0 ? position : position - (event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 0);
    changed.rating = Number(game.rating) === next ? null : next;
  }
  try { const result = await api(`/api/games/${game.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed) }); applySaveProgress(result); await Promise.all([loadGames(), loadStatsAndMeta()]); toast(action === 'own' ? 'Moved to owned.' : action === 'rate' ? changed.rating == null ? 'Rating cleared.' : `Rated ${changed.rating.toFixed(1)} / 5.` : changed.favorite ? 'Added to favorites.' : 'Removed from favorites.'); }
  catch (error) { toast(error.message); }
});
$('#games').addEventListener('pointermove', event => {
  const rating = cardRatingAtPointer(event); const picker = event.target.closest('.card-rating-picker');
  if (picker && rating != null) paintCardRating(picker, rating, true);
});
$('#games').addEventListener('pointerout', event => {
  const picker = event.target.closest('.card-rating-picker');
  if (!picker || picker.contains(event.relatedTarget)) return;
  paintCardRating(picker, picker.dataset.cardRating, false);
});

$('#pegi-search-button').addEventListener('click', async () => {
  const title = $('#game-title').value.trim(); const box = $('#pegi-results'); box.hidden = false;
  if (title.length < LOOKUP_MIN_TITLE_LENGTH) { box.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>'; return; }
  box.innerHTML = '<p class="pegi-message">Searching PEGI’s catalogue…</p>';
  try {
    const results = await api(`/api/pegi/search?q=${encodeURIComponent(title)}`);
    box.innerHTML = results.length ? `<p class="pegi-message pegi-result-count">${results.length.toLocaleString()} PEGI result${results.length === 1 ? '' : 's'}</p>${results.map((result, index) => `<button type="button" class="pegi-result" data-pegi-index="${index}"><span class="pegi-box">${result.pegi || '?'}</span><span><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml([result.publisher, ...result.releases.slice(0, PEGI_RELEASE_PREVIEW_LIMIT)].filter(Boolean).join(' · '))}</small></span></button>`).join('')}` : `<p class="pegi-message">No PEGI match found. You can keep entering it manually or <a href="https://pegi.info/search-pegi?q=${encodeURIComponent(title)}" target="_blank" rel="noopener">search PEGI directly</a>.</p>`;
    box._results = results;
  } catch (error) { box.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)} You can still enter the game manually.</p>`; }
});
$('#pegi-results').addEventListener('click', event => {
  const button = event.target.closest('[data-pegi-index]'); if (!button) return;
  const result = $('#pegi-results')._results?.[Number(button.dataset.pegiIndex)]; if (!result) return;
  $('#game-title').value = result.title; $('#game-pegi').value = result.pegi || ''; $('#game-publisher').value = result.publisher || ''; $('#game-year').value = result.releaseYear || '';
  const mapped = platformFromReleaseText(result.releases.join(' '));
  if (mapped && !(mapped === 'PC (Windows)' && isPcStorefront(selectedPlatform()))) setPlatformValue(mapped);
  $('#game-form').dataset.pegiUrl = result.pegiUrl;
  $('#game-form')._pegiMetadata = pegiMetadata({ pegiDescriptors: result.descriptors, pegiReleases: result.releases, pegiAdvice: result.advice, pegiOutline: result.outline, pegiContentIssues: result.contentIssues, pegiOtherIssues: result.otherIssues });
  $('#pegi-results').hidden = true; renderPegiDetails(); $('#game-pegi-details').open = true; toast('PEGI details applied.');
});
$('#game-description').addEventListener('input', () => {
  if ($('#game-description').value !== $('#game-form').dataset.descriptionInitial) {
    $('#game-form').dataset.descriptionSource = $('#game-description').value.trim() ? 'Manual' : '';
    $('#game-form').dataset.descriptionSourceUrl = '';
  }
});
$('#description-search-button').addEventListener('click', async () => {
  const title = $('#game-title').value.trim(); const box = $('#description-results'); box.hidden = false;
  if (title.length < LOOKUP_MIN_TITLE_LENGTH) { box.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>'; return; }
  box.innerHTML = '<p class="pegi-message">Searching Steam Store and TheGamesDB…</p>';
  try {
    const results = await api(`/api/descriptions/search?q=${encodeURIComponent(title)}&platform=${encodeURIComponent(selectedPlatform())}`); box._results = results;
    box.innerHTML = results.length ? results.map((result, index) => `<button type="button" class="pegi-result" data-description-index="${index}"><span><strong>${escapeHtml(result.gameTitle)}</strong><small>${escapeHtml(result.source)} · ${escapeHtml(result.description.slice(0, 180))}${result.description.length > 180 ? '…' : ''}</small></span></button>`).join('') : '<p class="pegi-message">No description match found. You can write one manually.</p>';
  } catch (error) { box.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)} You can still write a description manually.</p>`; }
});
$('#description-results').addEventListener('click', event => {
  const button = event.target.closest('[data-description-index]'); if (!button) return;
  const result = $('#description-results')._results?.[Number(button.dataset.descriptionIndex)]; if (!result) return;
  $('#game-description').value = result.description; $('#game-form').dataset.descriptionInitial = result.description;
  $('#game-form').dataset.descriptionSource = result.source; $('#game-form').dataset.descriptionSourceUrl = result.sourceUrl;
  $('#description-results').hidden = true; toast(`${result.source} description applied.`);
});

function renderCoverSelection() {
  const url = $('#game-form').dataset.coverUrl || ''; const box = $('#cover-selection');
  $('#cover-remove-button').hidden = !url; box.hidden = !url;
  const source = $('#game-form').dataset.coverSource || ''; const sourceLabels = { steamgriddb: 'SteamGridDB', thegamesdb: 'TheGamesDB', hltb: 'HowLongToBeat' };
  const details = [$('#game-form').dataset.coverMatchTitle || 'Custom match', sourceLabels[source]].filter(Boolean).join(' · ');
  box.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="Selected game cover"><span><strong>Cover selected</strong><small>${escapeHtml(details)}</small></span>` : '';
}
$('#cover-search-button').addEventListener('click', async () => {
  const title = $('#game-title').value.trim(); const box = $('#cover-results'); box.hidden = false;
  if (title.length < LOOKUP_MIN_TITLE_LENGTH) { box.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>'; return; }
  box.innerHTML = '<p class="pegi-message">Querying cover sources…</p>';
  try {
    const results = await api(`/api/covers/search?q=${encodeURIComponent(title)}&platform=${encodeURIComponent(selectedPlatform())}`); box._results = results;
    const providerLabels = { steamgriddb: 'SteamGridDB', thegamesdb: 'TheGamesDB', hltb: 'HowLongToBeat' };
    box.innerHTML = results.length ? results.map((result, index) => `<button type="button" class="cover-result" data-cover-index="${index}"><img src="${escapeHtml(result.thumbnailUrl)}" data-cover-image-index="${index}" alt="" loading="lazy" referrerpolicy="no-referrer"><span><strong>${escapeHtml(result.gameTitle)}</strong><small>${escapeHtml([providerLabels[result.source] || result.source, result.width && result.height ? `${result.width}×${result.height}` : '', result.style].filter(Boolean).join(' · '))}</small></span></button>`).join('') : '<p class="pegi-message">No portrait covers found. Try a shorter or more exact title.</p>';
    bindCoverResultFallbacks(box, results);
  } catch (error) { box.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)}</p>`; }
});
$('#cover-results').addEventListener('click', event => {
  const button = event.target.closest('[data-cover-index]'); if (!button) return;
  const result = $('#cover-results')._results?.[Number(button.dataset.coverIndex)]; if (!result) return;
  $('#game-form').dataset.coverUrl = result.url; $('#game-form').dataset.coverSource = result.source; $('#game-form').dataset.coverMatchTitle = result.gameTitle;
  $('#cover-results').hidden = true; renderCoverSelection(); toast('Cover selected. Save the game to keep it.');
});
$('#cover-remove-button').addEventListener('click', () => {
  $('#game-form').dataset.coverUrl = ''; $('#game-form').dataset.coverSource = ''; $('#game-form').dataset.coverMatchTitle = ''; renderCoverSelection();
});

const accountDialog = $('#account-dialog');
$('#account-button').addEventListener('click', () => {
  $('#account-username').value = state.user?.username || '';
  $('#account-email').value = state.user?.email || '';
  $('#account-current-password').value = '';
  $('#account-new-password').value = '';
  $('#account-confirm-password').value = '';
  $('#account-hide-from-activity').checked = Boolean(state.user?.hideFromActivity);
  $('#account-error').hidden = true;
  setCoverKeyMode(Boolean(state.coverStatus?.configured));
  accountDialog.showModal();
  Promise.all([loadCoverStatus(), coverProviderSettings.load(), loadPegiStatus(), loadHltbStatus(), loadDescriptionStatus(), progressionUi.load()]);
  setTimeout(() => $('#account-username').focus(), UI_TIMING.focusDelayMs);
});
function setBulkStatus(element, shortStatus, detail) {
  element.textContent = shortStatus; element.dataset.tooltip = detail; element.title = detail; element.setAttribute('aria-label', `${shortStatus}. ${detail}`);
}
function setCoverKeyMode(configured, replacing = false) {
  const input = $('#cover-api-key'); const button = $('#cover-api-save');
  const saving = input.dataset.saving === 'true';
  input.dataset.replacing = replacing ? 'true' : 'false';
  if (configured && !replacing) {
    input.type = 'text'; input.value = 'Connected'; input.disabled = true; input.placeholder = '';
    input.classList.add('is-connected'); button.textContent = 'Replace key'; button.disabled = saving;
    return;
  }
  if (input.classList.contains('is-connected') || input.type === 'text') input.value = '';
  input.type = 'password'; input.disabled = saving; input.classList.remove('is-connected');
  input.placeholder = replacing ? 'Paste replacement API key' : 'Paste personal API key';
  button.textContent = saving ? 'Checking…' : replacing ? 'Save key' : 'Connect'; button.disabled = saving;
}
function renderCoverStatus() {
  const status = state.coverStatus; if (!status) return;
  const replacing = $('#cover-api-key').dataset.replacing === 'true';
  $('#cover-provider-status').textContent = status.configured ? `${status.missing.toLocaleString()} games still need covers.` : 'Add a personal API key to enable cover lookup.';
  setCoverKeyMode(status.configured, status.configured && replacing);
  $('#cover-bulk-start').disabled = !status.configured || status.job?.state === 'running' || status.missing === 0;
  const job = status.job; let shortStatus = 'Exact-title matches only.'; let detail = 'Only exact normalized title matches receive covers automatically.';
  if (job?.state === 'running') {
    shortStatus = `Scanning ${job.processed.toLocaleString()}/${job.total.toLocaleString()} · ${job.matched.toLocaleString()} found`;
    detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString()} unmatched · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
  } else if (job?.state === 'complete') {
    shortStatus = `Done · ${job.matched.toLocaleString()} found · ${job.errors.toLocaleString()} errors`;
    detail = `${job.processed.toLocaleString()} scanned · ${job.matched.toLocaleString()} matched · ${job.unmatched.toLocaleString()} unmatched · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
  } else if (job?.state === 'failed') {
    shortStatus = 'Scan paused · details'; detail = job.lastError || job.error || 'Cover provider unavailable.';
  }
  setBulkStatus($('#cover-bulk-status'), shortStatus, detail);
}
async function loadCoverStatus() {
  try {
    state.coverStatus = await api('/api/covers/status'); renderCoverStatus();
  } catch (error) {
    $('#cover-provider-status').textContent = error.message;
    setCoverKeyMode(Boolean(state.coverStatus?.configured));
  }
}
function renderPegiBulkStatus() {
  const status = state.pegiStatus; if (!status) return;
  $('#pegi-provider-status').textContent = `${status.missing.toLocaleString()} games still need PEGI details.`;
  $('#pegi-bulk-start').disabled = status.job?.state === 'running' || status.missing === 0;
  const job = status.job; let shortStatus = 'Exact-title and platform-aware.'; let detail = 'Unique exact titles are accepted; ambiguous editions require one platform-specific match.';
  if (job?.state === 'running') {
    shortStatus = `Scanning ${job.processed.toLocaleString()}/${job.total.toLocaleString()} · ${job.matched.toLocaleString()} found`;
    detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString()} unmatched · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
  } else if (job?.state === 'complete') {
    shortStatus = `Done · ${job.matched.toLocaleString()} found · ${job.unmatched.toLocaleString()} review`;
    detail = `${job.processed.toLocaleString()} scanned · ${job.matched.toLocaleString()} matched · ${job.unmatched.toLocaleString()} unmatched or ambiguous · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
  } else if (job?.state === 'failed') {
    shortStatus = 'Scan paused · details'; detail = job.lastError || job.error || 'PEGI unavailable.';
  }
  setBulkStatus($('#pegi-bulk-status'), shortStatus, detail);
}
async function loadPegiStatus() {
  try { state.pegiStatus = await api('/api/pegi/status'); renderPegiBulkStatus(); }
  catch (error) { $('#pegi-provider-status').textContent = error.message; }
}
function renderHltbBulkStatus() {
  const status = state.hltbStatus; if (!status) return;
  $('#hltb-provider-status').textContent = `${status.missing.toLocaleString()} games still need HLTB estimates.`;
  $('#hltb-bulk-start').disabled = status.job?.state === 'running' || status.missing === 0;
  const job = status.job; let shortStatus = 'Unique exact-title matches only.'; let detail = 'Ambiguous editions stay blank for manual review.';
  if (job?.state === 'running') {
    shortStatus = `Scanning ${job.processed.toLocaleString()}/${job.total.toLocaleString()} · ${job.matched.toLocaleString()} found`;
    detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString()} unmatched · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
  } else if (job?.state === 'complete') {
    shortStatus = `Done · ${job.matched.toLocaleString()} found · ${job.unmatched.toLocaleString()} review`;
    detail = `${job.processed.toLocaleString()} scanned · ${job.matched.toLocaleString()} matched · ${job.unmatched.toLocaleString()} unmatched or ambiguous · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
  } else if (job?.state === 'failed') {
    shortStatus = 'Scan paused · details'; detail = job.lastError || job.error || 'HLTB unavailable.';
  }
  setBulkStatus($('#hltb-bulk-status'), shortStatus, detail);
}
async function loadHltbStatus() {
  try { state.hltbStatus = await api('/api/hltb/status'); renderHltbBulkStatus(); }
  catch (error) { $('#hltb-provider-status').textContent = error.message; }
}
function renderDescriptionBulkStatus() {
  const status = state.descriptionStatus; if (!status) return;
  $('#description-provider-status').textContent = `${status.missing.toLocaleString()} games still need descriptions.${status.thegamesdbConfigured ? ' TheGamesDB fallback connected.' : ' Steam Store only until TheGamesDB is connected.'}`;
  $('#description-bulk-start').disabled = status.job?.state === 'running' || status.missing === 0;
  const job = status.job; let shortStatus = 'Steam Store first; exact titles only.'; let detail = 'TheGamesDB is used only when Steam Store has no unique exact-title match.';
  if (job?.state === 'running') {
    shortStatus = `Scanning ${job.processed.toLocaleString()}/${job.total.toLocaleString()} · ${job.matched.toLocaleString()} found`;
    detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString()} unmatched · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
  } else if (job?.state === 'complete') {
    shortStatus = `Done · ${job.matched.toLocaleString()} found · ${job.unmatched.toLocaleString()} review`;
    detail = `${job.processed.toLocaleString()} scanned · ${job.unmatched.toLocaleString()} unmatched or ambiguous · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
  } else if (job?.state === 'failed') { shortStatus = 'Scan paused · details'; detail = job.lastError || job.error || 'A description source is unavailable.'; }
  setBulkStatus($('#description-bulk-status'), shortStatus, detail);
}
async function loadDescriptionStatus() {
  try { state.descriptionStatus = await api('/api/descriptions/status'); renderDescriptionBulkStatus(); }
  catch (error) { $('#description-provider-status').textContent = error.message; }
}
$('#cover-api-save').addEventListener('click', async () => {
  const input = $('#cover-api-key');
  if (state.coverStatus?.configured && input.dataset.replacing !== 'true') {
    setCoverKeyMode(true, true); input.focus(); return;
  }
  const key = input.value.trim(); if (!key) { $('#account-error').textContent = 'Paste your SteamGridDB API key first.'; $('#account-error').hidden = false; return; }
  input.dataset.saving = 'true'; setCoverKeyMode(Boolean(state.coverStatus?.configured), input.dataset.replacing === 'true');
  try {
    await api('/api/covers/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }) });
    input.value = ''; input.dataset.saving = 'false'; $('#account-error').hidden = true; toast('SteamGridDB connected.'); await loadCoverStatus();
  } catch (error) {
    input.dataset.saving = 'false'; $('#account-error').textContent = error.message; $('#account-error').hidden = false;
    setCoverKeyMode(Boolean(state.coverStatus?.configured), true); input.focus();
  }
});
$('#cover-bulk-start').addEventListener('click', async () => {
  const button = $('#cover-bulk-start'); button.disabled = true;
  try { await api('/api/covers/bulk', { method: 'POST' }); toast('Background cover scan started.'); await loadCoverStatus(); }
  catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; button.disabled = false; }
});
$('#pegi-bulk-start').addEventListener('click', async () => {
  const button = $('#pegi-bulk-start'); button.disabled = true;
  try { await api('/api/pegi/bulk', { method: 'POST' }); toast('Background PEGI scan started.'); await loadPegiStatus(); }
  catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; button.disabled = false; }
});
$('#hltb-bulk-start').addEventListener('click', async () => {
  const button = $('#hltb-bulk-start'); button.disabled = true;
  try { await api('/api/hltb/bulk', { method: 'POST' }); toast('Background HLTB scan started.'); await loadHltbStatus(); }
  catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; button.disabled = false; }
});
$('#description-bulk-start').addEventListener('click', async () => {
  const button = $('#description-bulk-start'); button.disabled = true;
  try { await api('/api/descriptions/bulk', { method: 'POST' }); toast('Background description scan started.'); await loadDescriptionStatus(); }
  catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; button.disabled = false; }
});
$('#avatar-picker').addEventListener('click', () => $('#avatar-file').click());
$('#avatar-upload').addEventListener('click', () => $('#avatar-file').click());
function avatarBlob(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file.'));
    if (file.size > SOURCE_IMAGE_MAX_BYTES) return reject(new Error('Source image is too large (maximum 20 MB).'));
    const image = new Image(); const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - size) / 2; const sy = (image.naturalHeight - size) / 2;
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
      canvas.getContext('2d').drawImage(image, sx, sy, size, size, 0, 0, 512, 512);
      const encode = quality => canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Could not process that image.'));
        if (blob.size <= 256 * 1024 || quality <= .2) return blob.size <= 256 * 1024 ? resolve(blob) : reject(new Error('Could not compress avatar below 256 KB.'));
        encode(quality - .1);
      }, 'image/jpeg', quality);
      encode(.9);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read that image.')); };
    image.src = objectUrl;
  });
}
$('#avatar-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  $('#account-error').hidden = true;
  try {
    const blob = await avatarBlob(file);
    const result = await api('/api/account/avatar', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    state.user.avatarUrl = `${result.avatarUrl}?v=${Date.now()}`; updateAvatarUI(); toast('Avatar updated.');
  } catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; }
});
$('#avatar-remove').addEventListener('click', async () => {
  try { await api('/api/account/avatar', { method: 'DELETE' }); state.user.avatarUrl = null; updateAvatarUI(); toast('Avatar removed.'); }
  catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; }
});
$$('[data-account-close]').forEach(button => button.addEventListener('click', () => accountDialog.close()));
closeOnTrueBackdrop(accountDialog, () => accountDialog.close());
$('#logout-button').addEventListener('click', async () => {
  await savePreferences();
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  sessionGeneration++;
  accountDialog.close();
  $('#auth-form').reset();
  showAuth();
});
window.addEventListener('pagehide', () => {
  state.stopEvents?.(); state.stopEvents = null;
  activityFeed.stop();
  void savePreferences(true);
});
window.addEventListener('pageshow', event => {
  if (!event.persisted || !state.user) return;
  connectEventStream();
  activityFeed.start();
});
$('#account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const newPassword = $('#account-new-password').value;
  if (newPassword !== $('#account-confirm-password').value) {
    $('#account-error').textContent = 'New passwords do not match.'; $('#account-error').hidden = false; return;
  }
  const save = $('#account-save'); save.disabled = true; save.textContent = 'Saving…';
  try {
    const result = await api('/api/account', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      username: $('#account-username').value, email: $('#account-email').value, currentPassword: $('#account-current-password').value, newPassword,
      hideFromActivity: $('#account-hide-from-activity').checked,
    }) });
    accountDialog.close();
    if (result.user.sessionInvalidated) {
      sessionGeneration++; showAuth('Password changed. Log in with the new password.');
    } else {
      state.user = result.user; $('#account-name').textContent = result.user.username; $('#account-current-name').textContent = result.user.username; updateAvatarUI(); toast('Account updated.');
    }
  } catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; }
  finally { save.disabled = false; save.textContent = 'Save account'; }
});

(async function boot() {
  setAuthMode('login');
  activityFeed.start();
  loadConfig();
  loadAuthCovers();
  const resetToken = new URLSearchParams(window.location.search).get('reset');
  if (resetToken) { history.replaceState({}, '', window.location.pathname); showAuth(); showPasswordResetComplete(resetToken); return; }
  try { const result = await api('/api/auth/me'); await enterApp(result.user, result.preferences, result.progress); }
  catch { showAuth(); }
})();
