import { mountThemedSearchClears, syncSearchClears } from './search-clears.js';

const STATUS = Object.freeze({
  new: ['NEW', 'New Steam library record'],
  'other-platform': ['NEW COPY', 'Owned on another platform'],
  link: ['LINK', 'Matches one existing Steam record'],
  ambiguous: ['REVIEW', 'Multiple same-title Steam records'],
  already: ['IMPORTED', 'Steam AppID already linked'],
});
const REVIEW_RENDER_LIMIT = 250;

function playtime(minutes) {
  const value = Number(minutes) || 0;
  if (!value) return 'Never played';
  if (value < 60) return `${value} min`;
  return `${(value / 60).toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;
}

function element(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createSteamImporter({ api, toast, onImported }) {
  const panelStatus = document.getElementById('steam-import-status');
  const detail = document.getElementById('steam-connection-detail');
  const profileInput = document.getElementById('steam-profile-reference');
  const connectButton = document.getElementById('steam-connect');
  const reviewButton = document.getElementById('steam-import-review');
  const disconnectButton = document.getElementById('steam-disconnect');
  const dialog = document.getElementById('steam-import-dialog');
  const loading = document.getElementById('steam-import-loading');
  const content = document.getElementById('steam-import-content');
  const summary = document.getElementById('steam-import-summary');
  const list = document.getElementById('steam-import-list');
  const search = document.getElementById('steam-import-search');
  const error = document.getElementById('steam-import-error');
  const selectedCount = document.getElementById('steam-selected-count');
  const confirm = document.getElementById('steam-import-confirm');
  const progress = document.getElementById('steam-import-progress');
  const progressLabel = document.getElementById('steam-import-progress-label');
  const progressCount = document.getElementById('steam-import-progress-count');
  const progressFill = document.getElementById('steam-import-progress-fill');
  const closeButtons = [...dialog.querySelectorAll('[data-steam-close]')];
  const selectionButtons = [document.getElementById('steam-select-importable'), document.getElementById('steam-clear-selection')];
  let preview = null;
  let importing = false;
  let connectionStatus = null;
  let editingProfile = false;
  let connecting = false;
  const selected = new Set();

  function showError(message) { error.textContent = message; error.hidden = !message; }
  function renderConnectionControls() {
    const configured = Boolean(connectionStatus?.configured);
    const connected = Boolean(connectionStatus?.connected && connectionStatus.connection);
    const showingConnected = connected && !editingProfile;
    profileInput.classList.toggle('is-connected', showingConnected);
    if (showingConnected) profileInput.value = 'Connected';
    else if (!connected && profileInput.value === 'Connected') profileInput.value = '';
    profileInput.disabled = !configured || showingConnected || connecting;
    connectButton.disabled = !configured || connecting;
    connectButton.textContent = connecting ? 'Connecting…' : showingConnected ? 'Replace profile' : 'Connect';
    reviewButton.disabled = !configured || !connected;
    disconnectButton.hidden = !connected;
  }
  function renderStatus(status) {
    connectionStatus = status;
    const connected = status.connected && status.connection;
    panelStatus.textContent = !status.configured ? 'Not configured by the server operator.'
      : connected ? `Connected as ${status.connection.personaName || status.connection.steamId}` : 'Ready to connect a Steam profile.';
    detail.textContent = connected
      ? `${status.connection.steamId}${status.connection.lastSyncedAt ? ` // last import ${new Date(status.connection.lastSyncedAt).toLocaleString()}` : ''}`
      : 'No Steam profile connected.';
    renderConnectionControls();
  }

  async function load() {
    connectionStatus = null; editingProfile = false; connecting = false; profileInput.value = ''; renderConnectionControls();
    try { renderStatus(await api('/api/steam/status')); }
    catch (loadError) { panelStatus.textContent = loadError.message; detail.textContent = 'Connection status unavailable.'; reviewButton.disabled = true; }
  }

  function updateSelectedCount() {
    selectedCount.textContent = `${selected.size.toLocaleString('en-US')} selected`;
    confirm.disabled = importing || selected.size === 0;
  }

  function setImportBusy(value) {
    importing = value;
    closeButtons.forEach(button => { button.disabled = value; });
    selectionButtons.forEach(button => { button.disabled = value; });
    search.disabled = value;
    const searchClear = dialog.querySelector('.themed-search-clear'); if (searchClear) searchClear.disabled = value;
    list.querySelectorAll('input[type="checkbox"]').forEach(input => { input.disabled = value || Boolean(input.closest('.is-already')); });
    updateSelectedCount();
  }

  function renderProgress(update = {}) {
    if (!importing) return;
    const phases = {
      fetching: 'Refreshing owned games from Steam…',
      importing: 'Writing selected library records…',
      processing: 'Recording collector XP…',
      complete: 'Steam import complete.',
    };
    const current = Math.max(0, Number(update.current) || 0);
    const total = Math.max(0, Number(update.total) || 0);
    const indeterminate = update.phase === 'fetching';
    const percent = total ? Math.min(100, (current / total) * 100) : update.phase === 'complete' ? 100 : 0;
    progress.hidden = false;
    progress.classList.toggle('is-indeterminate', indeterminate);
    progressLabel.textContent = phases[update.phase] || 'Importing Steam library…';
    progressCount.textContent = indeterminate || !total ? '' : `${current.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`;
    progressFill.style.width = indeterminate ? '' : `${percent}%`;
  }

  function row(item) {
    const label = document.createElement('label'); label.className = `steam-import-row is-${item.status}`;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(item.appId);
    checkbox.disabled = item.action === 'none'; checkbox.dataset.appId = String(item.appId);
    const copy = element('span', 'steam-import-copy');
    copy.append(element('strong', '', item.title));
    const matchText = item.matches?.length ? ` // ${item.matches.map(match => `${match.platform}: ${match.title}`).join(' // ')}` : '';
    copy.append(element('small', '', `${playtime(item.playtimeMinutes)}${matchText}`));
    const state = element('span', `steam-import-state state-${item.status}`);
    state.append(element('b', '', STATUS[item.status]?.[0] || item.status), element('small', '', STATUS[item.status]?.[1] || ''));
    label.append(checkbox, copy, state); return label;
  }

  function renderList() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = (preview?.items || []).filter(item => !query || item.title.toLocaleLowerCase().includes(query));
    const items = matches.slice(0, REVIEW_RENDER_LIMIT);
    list.replaceChildren(...items.map(row));
    if (!matches.length) list.append(element('p', 'steam-import-empty', 'No Steam titles match this filter.'));
    else if (matches.length > REVIEW_RENDER_LIMIT) {
      list.append(element('p', 'steam-import-limit', `Showing ${REVIEW_RENDER_LIMIT.toLocaleString('en-US')} of ${matches.length.toLocaleString('en-US')} matches. Filter by title to narrow the review.`));
    }
    syncSearchClears(dialog);
  }

  function renderPreview(result) {
    preview = result; selected.clear();
    for (const item of result.items) if (item.selected) selected.add(item.appId);
    const labels = [
      ['new', 'new'], ['other-platform', 'other-platform copies'], ['link', 'existing records to link'],
      ['ambiguous', 'need review'], ['already', 'already imported'],
    ];
    summary.replaceChildren(element('strong', '', `${result.total.toLocaleString('en-US')} Steam games`),
      ...labels.map(([key, label]) => element('span', `summary-${key}`, `${result.counts[key].toLocaleString('en-US')} ${label}`)));
    search.value = ''; renderList(); updateSelectedCount();
  }

  async function openPreview() {
    document.getElementById('account-dialog')?.close();
    preview = null; selected.clear(); search.value = ''; showError(''); content.hidden = true; loading.hidden = false;
    progress.hidden = true; progress.classList.remove('is-indeterminate'); progressFill.style.width = '0';
    confirm.disabled = true; selectedCount.textContent = '0 selected'; dialog.showModal();
    try { renderPreview(await api('/api/steam/import-preview')); content.hidden = false; loading.hidden = true; }
    catch (previewError) { loading.hidden = true; showError(previewError.message); }
  }

  connectButton.addEventListener('click', async () => {
    if (connectionStatus?.connected && !editingProfile) {
      editingProfile = true; profileInput.value = ''; renderConnectionControls(); profileInput.focus(); return;
    }
    const profile = profileInput.value.trim();
    if (!profile) { panelStatus.textContent = 'Enter a Steam profile first.'; return; }
    connecting = true; renderConnectionControls();
    try {
      const status = await api('/api/steam/connection', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) });
      editingProfile = false; connecting = false; profileInput.value = ''; renderStatus(status); toast('Steam profile connected.');
    } catch (connectError) { panelStatus.textContent = connectError.message; }
    finally { connecting = false; renderConnectionControls(); }
  });
  profileInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!connectButton.disabled) connectButton.click();
  });
  disconnectButton.addEventListener('click', async () => {
    disconnectButton.disabled = true;
    try { editingProfile = false; profileInput.value = ''; renderStatus(await api('/api/steam/connection', { method: 'DELETE' })); toast('Steam profile disconnected.'); }
    catch (disconnectError) { panelStatus.textContent = disconnectError.message; }
    finally { disconnectButton.disabled = false; }
  });
  reviewButton.addEventListener('click', openPreview);
  search.addEventListener('input', renderList);
  list.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-app-id]'); if (!checkbox) return;
    const appId = Number(checkbox.dataset.appId); if (checkbox.checked) selected.add(appId); else selected.delete(appId);
    updateSelectedCount();
  });
  document.getElementById('steam-select-importable').addEventListener('click', () => {
    for (const item of preview?.items || []) if (item.action !== 'none' && item.status !== 'ambiguous') selected.add(item.appId);
    renderList(); updateSelectedCount();
  });
  document.getElementById('steam-clear-selection').addEventListener('click', () => { selected.clear(); renderList(); updateSelectedCount(); });
  confirm.addEventListener('click', async () => {
    setImportBusy(true); confirm.textContent = 'Importing…'; showError('');
    renderProgress({ phase: 'fetching', current: 0, total: selected.size });
    let succeeded = false;
    try {
      const result = await api('/api/steam/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appIds: [...selected] }) });
      renderProgress({ phase: 'complete', current: selected.size, total: selected.size });
      succeeded = true;
      dialog.close();
      toast(`Steam import complete // ${result.created.length} added, ${result.linked.length} linked, ${result.skipped.length} skipped.`);
      try { await onImported(result); }
      catch { toast('Steam import complete // refresh the Kat·a·log to see every change.'); }
    } catch (importError) { showError(importError.message); }
    finally {
      confirm.textContent = 'Import selected'; setImportBusy(false);
      if (!succeeded) progress.hidden = true;
    }
  });
  closeButtons.forEach(button => button.addEventListener('click', () => { if (!importing) dialog.close(); }));
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('pointerup', event => {
    const shouldClose = pressedBackdrop && event.target === dialog;
    pressedBackdrop = false;
    if (shouldClose && !importing) dialog.close();
  });
  dialog.addEventListener('pointercancel', () => { pressedBackdrop = false; });
  dialog.addEventListener('cancel', event => { if (importing) event.preventDefault(); });
  mountThemedSearchClears(dialog);

  return { handleEvent: renderProgress, load, openPreview };
}
