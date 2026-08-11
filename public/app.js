import { CUSTOM_PLATFORM, knownPlatforms, pegiColors, platformFromReleaseText, platformGroups } from './js/platforms.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const TOKEN_KEY = 'games_shelf_auth_token';
const state = { games: [], stats: null, platforms: [], limit: 120, view: localStorage.getItem('games-view') || 'grid', loading: false, user: null, authMode: 'login', coverStatus: null };
const filters = {
  q: $('#search'), platform: $('#platform-filter'), ownership: $('#ownership-filter'),
  pegi: $('#pegi-filter'), playStatus: $('#status-filter'), favorite: $('#favorite-filter'), sort: $('#sort-filter'),
};
const labels = {
  owned: 'Owned', wanted: 'Wishlisted', unavailable: 'Unavailable', backlog: 'Backlog',
  playing: 'Playing', completed: 'Completed', paused: 'Paused', abandoned: 'Abandoned',
  physical: 'Physical', digital: 'Digital', unknown: 'Unknown',
};

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
async function api(url, options) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { ...(options?.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && !['/api/login', '/api/register'].includes(url)) {
    localStorage.removeItem(TOKEN_KEY);
    showAuth('Your session expired. Authenticate again.');
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}
async function loadAuthCovers() {
  try {
    const response = await fetch(`/api/showcase/covers?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const { covers = [] } = await response.json();
    const slots = [...$$('.promo-cover-deck i'), $('.promo-loose-cover'), ...$$('.auth-cover-field i')].filter(Boolean);
    slots.forEach((slot, index) => {
      if (!covers[index]) return;
      const preload = new Image();
      preload.onload = () => { slot.style.backgroundImage = `url(${JSON.stringify(preload.src)})`; slot.classList.add('has-art'); };
      preload.src = covers[index];
    });
  } catch {}
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
  state.user = null;
  $('#app-shell').hidden = true;
  $('#auth-screen').hidden = false;
  if (message) { $('#auth-error').textContent = message; $('#auth-error').hidden = false; }
  setTimeout(() => $('#auth-username').focus(), 40);
}
async function enterApp(user) {
  state.user = user;
  $('#account-name').textContent = user.username;
  $('#account-current-name').textContent = user.username;
  updateAvatarUI();
  $('#auth-screen').hidden = true;
  $('#app-shell').hidden = false;
  await Promise.all([loadGames(), loadStatsAndMeta()]);
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
function setAuthMode(mode) {
  state.authMode = mode;
  $$('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
  $('#auth-title').textContent = mode === 'register' ? 'Create an identity' : 'Access your library';
  $('#auth-copy').textContent = mode === 'register' ? 'Create an isolated library account on this server.' : 'Enter your credentials to mount your personal collection.';
  $('#auth-submit').textContent = mode === 'register' ? 'Create account' : 'Authenticate';
  $('#auth-username').placeholder = mode === 'register' ? 'player_one' : '';
  $('#auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-password').placeholder = mode === 'register' ? '8+ characters' : '';
  $('#auth-email-label').hidden = mode !== 'register';
  $('#auth-confirm-label').hidden = mode !== 'register';
  $('#auth-password-confirm').required = mode === 'register';
  $('#auth-hint').hidden = mode !== 'register';
  $('#auth-error').hidden = true;
}
$$('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.authMode === 'register' && $('#auth-password').value !== $('#auth-password-confirm').value) {
    $('#auth-error').textContent = 'Passwords do not match.'; $('#auth-error').hidden = false; return;
  }
  const submit = $('#auth-submit'); submit.disabled = true; submit.textContent = state.authMode === 'register' ? 'Creating…' : 'Authenticating…';
  try {
    const result = await api(state.authMode === 'register' ? '/api/register' : '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#auth-username').value, email: state.authMode === 'register' ? $('#auth-email').value : '', password: $('#auth-password').value, passwordConfirm: state.authMode === 'register' ? $('#auth-password-confirm').value : undefined }),
    });
    localStorage.setItem(TOKEN_KEY, result.token);
    $('#auth-error').hidden = true;
    await enterApp(result.user);
  } catch (error) { $('#auth-error').textContent = error.message; $('#auth-error').hidden = false; }
  finally { submit.disabled = false; submit.textContent = state.authMode === 'register' ? 'Create account' : 'Authenticate'; }
});
function count(group, label) { return group?.find(row => row.label === label)?.count || 0; }
function renderStats() {
  $('#stat-total').textContent = state.stats?.total?.toLocaleString() || '0';
  $('#stat-owned').textContent = count(state.stats?.ownership, 'owned').toLocaleString();
  $('#stat-wanted').textContent = count(state.stats?.ownership, 'wanted').toLocaleString();
  $('#stat-unavailable').textContent = count(state.stats?.ownership, 'unavailable').toLocaleString();
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
function gameCard(game) {
  const meta = [game.publisher, game.releaseYear, game.cartridgeNumber != null ? `Cartridge #${game.cartridgeNumber}` : ''].filter(Boolean).join(' · ');
  const pegiClass = game.pegi ? `pegi pegi-${game.pegi}` : '';
  const quick = game.ownership === 'wanted' ? '<button class="quick-button" data-action="own">Mark owned</button>' : '';
  const cover = game.coverUrl ? `<img class="game-cover" src="${escapeHtml(game.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="game-cover-shade"></span>` : '';
  return `<article class="game-card ${game.coverUrl ? 'has-cover' : ''}" data-id="${game.id}" style="--rating-color:${pegiColors[game.pegi] || pegiColors.none}">${cover}
    <div class="card-top"><span class="platform-tag"><i class="platform-dot"></i>${escapeHtml(game.platform)}</span><button class="favorite-button ${game.favorite ? 'on' : ''}" data-action="favorite" aria-label="${game.favorite ? 'Remove favourite' : 'Mark favourite'}">★</button></div>
    <h3 class="game-title">${escapeHtml(game.title)}</h3><div class="game-meta" title="${escapeHtml(meta)}">${escapeHtml(meta || (game.mediaFormat === 'physical' ? 'Physical copy' : labels[game.mediaFormat]))}</div>
    <div class="badges">${badge(game.pegi ? `PEGI ${game.pegi}` : game.platform === 'Evercade' ? 'No PEGI' : 'Unrated', pegiClass)}${badge(labels[game.ownership], game.ownership)}${badge(labels[game.playStatus], game.playStatus)}${game.favorite ? badge('Favourite') : ''}${game.coverSource === 'steamgriddb' ? badge('SGDB art') : ''}</div>
    <div class="card-actions"><button class="edit-button" data-action="edit">Edit details</button>${quick}</div>
  </article>`;
}
function renderGames() {
  const shown = state.games.slice(0, state.limit);
  $('#games').innerHTML = shown.map(gameCard).join('');
  $('#games').classList.toggle('list-view', state.view === 'list');
  $('#empty').hidden = state.loading || state.games.length > 0;
  $('#load-more').hidden = shown.length >= state.games.length;
  $('#result-count').textContent = state.loading ? 'Loading collection…' : `${state.games.length.toLocaleString()} ${state.games.length === 1 ? 'game' : 'games'} found`;
  $('#clear-filters').hidden = !Object.entries(filters).some(([key, el]) => key !== 'sort' && el.value);
}
function loadHeroCovers() {
  const slots = $$('.hero-cover');
  if (!slots.length || slots.some(slot => slot.classList.contains('has-art'))) return;
  const covers = [...new Set(state.games.map(game => game.coverUrl).filter(url => /^https:\/\//i.test(url)))];
  for (let index = covers.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [covers[index], covers[swap]] = [covers[swap], covers[index]];
  }
  slots.forEach((slot, index) => {
    if (!covers[index]) return;
    const preload = new Image();
    preload.onload = () => { slot.style.backgroundImage = `url(${JSON.stringify(preload.src)})`; slot.classList.add('has-art'); };
    preload.src = covers[index];
  });
}
function queryString() {
  const params = new URLSearchParams();
  for (const [key, element] of Object.entries(filters)) if (element.value) params.set(key, element.value);
  return params.toString();
}
async function loadGames() {
  state.loading = true; renderGames();
  try { state.games = await api(`/api/games?${queryString()}`); state.limit = 120; loadHeroCovers(); }
  catch (error) { toast(error.message); }
  finally { state.loading = false; renderGames(); }
}
async function loadStatsAndMeta() {
  try {
    const [stats, meta] = await Promise.all([api('/api/stats'), api('/api/meta')]);
    state.stats = stats; state.platforms = meta.platforms; renderStats(); renderPlatforms();
  } catch (error) { toast(error.message); }
}
let searchTimer;
filters.q.addEventListener('input', () => { renderQuickFilter(); clearTimeout(searchTimer); searchTimer = setTimeout(loadGames, 220); });
Object.entries(filters).filter(([key]) => !['q', 'favorite'].includes(key)).forEach(([, element]) => element.addEventListener('change', () => { renderQuickFilter(); loadGames(); }));
$('#clear-filters').addEventListener('click', () => { Object.entries(filters).forEach(([key, element]) => { element.value = key === 'sort' ? 'title' : ''; }); renderQuickFilter(); loadGames(); });
$('#load-more').addEventListener('click', () => { state.limit += 120; renderGames(); });
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
  loadGames(); document.querySelector('.library').scrollIntoView({ behavior: 'smooth' });
}));
renderQuickFilter();
function setView(view) {
  state.view = view; localStorage.setItem('games-view', view);
  $('#grid-view').classList.toggle('active', view === 'grid'); $('#list-view').classList.toggle('active', view === 'list'); renderGames();
}
$('#grid-view').addEventListener('click', () => setView('grid')); $('#list-view').addEventListener('click', () => setView('list')); setView(state.view);

const dialog = $('#game-dialog');
function formValue(game, key, fallback = '') { return game?.[key] ?? fallback; }
function openForm(game = null) {
  $('#game-form').reset(); $('#game-id').value = game?.id || '';
  $('#game-form').dataset.pegiUrl = game?.pegiUrl || '';
  $('#game-form').dataset.coverUrl = game?.coverUrl || '';
  $('#game-form').dataset.coverSource = game?.coverSource || '';
  $('#game-form').dataset.coverMatchTitle = game?.coverMatchTitle || '';
  $('#form-title').textContent = game ? 'Edit game' : 'Add a game'; $('#form-kicker').textContent = game ? 'Update the shelf' : 'Grow the shelf';
  $('#game-title').value = formValue(game, 'title'); setPlatformValue(formValue(game, 'platform', filters.platform.value || 'Nintendo Switch'));
  $('#game-pegi').value = formValue(game, 'pegi'); $('#game-ownership').value = formValue(game, 'ownership', 'owned');
  $('#game-status').value = formValue(game, 'playStatus', 'backlog'); $('#game-format').value = formValue(game, 'mediaFormat', 'physical');
  $('#game-cartridge').value = formValue(game, 'cartridgeNumber'); $('#game-publisher').value = formValue(game, 'publisher');
  $('#game-year').value = formValue(game, 'releaseYear'); $('#game-notes').value = formValue(game, 'notes'); $('#game-favorite').checked = Boolean(game?.favorite);
  $('#delete-game').hidden = !game; $('#pegi-results').hidden = true; $('#pegi-results').innerHTML = ''; $('#cover-results').hidden = true; $('#cover-results').innerHTML = ''; $('#form-error').hidden = true; renderCoverSelection();
  dialog.showModal(); setTimeout(() => $('#game-title').focus(), 60);
}
function closeForm() { dialog.close(); }
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
function payload() {
  return { title: $('#game-title').value, platform: selectedPlatform(), pegi: $('#game-pegi').value,
    ownership: $('#game-ownership').value, playStatus: $('#game-status').value, mediaFormat: $('#game-format').value,
    cartridgeNumber: $('#game-cartridge').value, publisher: $('#game-publisher').value, releaseYear: $('#game-year').value,
    notes: $('#game-notes').value, favorite: $('#game-favorite').checked, pegiUrl: $('#game-form').dataset.pegiUrl || '',
    coverUrl: $('#game-form').dataset.coverUrl || '', coverSource: $('#game-form').dataset.coverSource || '', coverMatchTitle: $('#game-form').dataset.coverMatchTitle || '' };
}
$('#game-form').addEventListener('submit', async event => {
  event.preventDefault(); const id = $('#game-id').value; const save = $('#save-game'); save.disabled = true; save.textContent = 'Saving…';
  try {
    await api(id ? `/api/games/${id}` : '/api/games', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
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
  if (!card || !action) return; const game = state.games.find(item => item.id === Number(card.dataset.id)); if (!game) return;
  if (action === 'edit') return openForm(game);
  const changed = { ...game };
  if (action === 'favorite') changed.favorite = !changed.favorite;
  if (action === 'own') changed.ownership = 'owned';
  try { await api(`/api/games/${game.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed) }); await Promise.all([loadGames(), loadStatsAndMeta()]); toast(action === 'own' ? 'Moved to owned.' : changed.favorite ? 'Added to favourites.' : 'Removed from favourites.'); }
  catch (error) { toast(error.message); }
});

$('#pegi-search-button').addEventListener('click', async () => {
  const title = $('#game-title').value.trim(); const box = $('#pegi-results'); box.hidden = false;
  if (title.length < 2) { box.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>'; return; }
  box.innerHTML = '<p class="pegi-message">Searching PEGI’s catalogue…</p>';
  try {
    const results = await api(`/api/pegi/search?q=${encodeURIComponent(title)}`);
    box.innerHTML = results.length ? results.map((result, index) => `<button type="button" class="pegi-result" data-pegi-index="${index}"><span class="pegi-box">${result.pegi || '?'}</span><span><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml([result.publisher, ...result.releases.slice(0, 2)].filter(Boolean).join(' · '))}</small></span></button>`).join('') : `<p class="pegi-message">No PEGI match found. You can keep entering it manually or <a href="https://pegi.info/search-pegi?q=${encodeURIComponent(title)}" target="_blank" rel="noopener">search PEGI directly</a>.</p>`;
    box._results = results;
  } catch (error) { box.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)} You can still enter the game manually.</p>`; }
});
$('#pegi-results').addEventListener('click', event => {
  const button = event.target.closest('[data-pegi-index]'); if (!button) return;
  const result = $('#pegi-results')._results?.[Number(button.dataset.pegiIndex)]; if (!result) return;
  $('#game-title').value = result.title; $('#game-pegi').value = result.pegi || ''; $('#game-publisher').value = result.publisher || ''; $('#game-year').value = result.releaseYear || '';
  const mapped = platformFromReleaseText(result.releases.join(' '));
  if (mapped) setPlatformValue(mapped); $('#game-form').dataset.pegiUrl = result.pegiUrl; $('#pegi-results').hidden = true; toast('PEGI details applied.');
});

function renderCoverSelection() {
  const url = $('#game-form').dataset.coverUrl || ''; const box = $('#cover-selection');
  $('#cover-remove-button').hidden = !url; box.hidden = !url;
  box.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="Selected game cover"><span><strong>Cover selected</strong><small>${escapeHtml($('#game-form').dataset.coverMatchTitle || 'Custom match')}</small></span>` : '';
}
$('#cover-search-button').addEventListener('click', async () => {
  const title = $('#game-title').value.trim(); const box = $('#cover-results'); box.hidden = false;
  if (title.length < 2) { box.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>'; return; }
  box.innerHTML = '<p class="pegi-message">Querying SteamGridDB artwork…</p>';
  try {
    const results = await api(`/api/covers/search?q=${encodeURIComponent(title)}`); box._results = results;
    box.innerHTML = results.length ? results.map((result, index) => `<button type="button" class="cover-result" data-cover-index="${index}"><img src="${escapeHtml(result.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span><strong>${escapeHtml(result.gameTitle)}</strong><small>${escapeHtml([result.width && result.height ? `${result.width}×${result.height}` : '', result.style].filter(Boolean).join(' · '))}</small></span></button>`).join('') : '<p class="pegi-message">No portrait covers found. Try a shorter or more exact title.</p>';
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
  $('#account-error').hidden = true;
  accountDialog.showModal();
  loadCoverStatus();
  setTimeout(() => $('#account-username').focus(), 40);
});
async function loadCoverStatus() {
  try {
    const status = await api('/api/covers/status'); state.coverStatus = status;
    $('#cover-provider-status').textContent = status.configured ? `${status.missing.toLocaleString()} games still need covers.` : 'API key not configured.';
    $('#cover-bulk-start').disabled = !status.configured || status.job?.state === 'running' || status.missing === 0;
    const job = status.job;
    $('#cover-bulk-status').textContent = job?.state === 'running' ? `${job.processed.toLocaleString()}/${job.total.toLocaleString()} scanned · ${job.matched.toLocaleString()} matched · ${job.current}` : job?.state === 'complete' ? `Complete: ${job.matched.toLocaleString()} matched, ${job.unmatched.toLocaleString()} unmatched, ${job.errors.toLocaleString()} errors.` : job?.state === 'failed' ? `Paused after repeated errors: ${job.lastError || job.error || 'provider unavailable'}` : 'Conservative exact-title matching only.';
    if (job?.state === 'running') { clearTimeout(loadCoverStatus.timer); loadCoverStatus.timer = setTimeout(loadCoverStatus, 1800); }
    else if (job?.state === 'complete' && !loadCoverStatus.refreshed) { loadCoverStatus.refreshed = true; await loadGames(); }
  } catch (error) { $('#cover-provider-status').textContent = error.message; }
}
$('#cover-api-save').addEventListener('click', async () => {
  const key = $('#cover-api-key').value.trim(); if (!key) { $('#account-error').textContent = 'Paste your SteamGridDB API key first.'; $('#account-error').hidden = false; return; }
  const button = $('#cover-api-save'); button.disabled = true; button.textContent = 'Checking…';
  try { await api('/api/covers/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }) }); $('#cover-api-key').value = ''; $('#account-error').hidden = true; toast('SteamGridDB connected.'); await loadCoverStatus(); }
  catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; }
  finally { button.disabled = false; button.textContent = 'Connect'; }
});
$('#cover-bulk-start').addEventListener('click', async () => {
  const button = $('#cover-bulk-start'); button.disabled = true;
  try { await api('/api/covers/bulk', { method: 'POST' }); loadCoverStatus.refreshed = false; toast('Background cover scan started.'); await loadCoverStatus(); }
  catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; button.disabled = false; }
});
$('#avatar-picker').addEventListener('click', () => $('#avatar-file').click());
$('#avatar-upload').addEventListener('click', () => $('#avatar-file').click());
function avatarBlob(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file.'));
    if (file.size > 20 * 1024 * 1024) return reject(new Error('Source image is too large (maximum 20 MB).'));
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
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
  accountDialog.close();
  $('#auth-form').reset();
  showAuth();
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
    }) });
    accountDialog.close();
    if (result.user.sessionInvalidated) {
      localStorage.removeItem(TOKEN_KEY); showAuth('Password changed. Log in with the new password.');
    } else {
      state.user = result.user; $('#account-name').textContent = result.user.username; $('#account-current-name').textContent = result.user.username; updateAvatarUI(); toast('Account updated.');
    }
  } catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; }
  finally { save.disabled = false; save.textContent = 'Save account'; }
});

(async function boot() {
  setAuthMode('login');
  loadConfig();
  loadAuthCovers();
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return showAuth();
  try { const result = await api('/api/auth/me'); await enterApp(result.user); }
  catch { showAuth(); }
})();
