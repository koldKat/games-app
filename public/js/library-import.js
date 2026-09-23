import { mountThemedSearchClears, syncSearchClears } from './search-clears.js';
import { platformDisplayName, platformThemeClass } from './platforms.js';

const STATUS = Object.freeze({
  new: ['NEW', 'New library record'],
  'other-platform': ['NEW COPY', 'Owned on another platform'],
  link: ['LINK', 'Matches one existing platform record'],
  ambiguous: ['REVIEW', 'Multiple same-title platform records'],
  already: ['IMPORTED', 'Provider identity already linked'],
});
const REVIEW_RENDER_LIMIT = 250;

function element(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createLibraryImporter({ api, toast, onImported, provider }) {
  const { id, label, identityKey, selectionBodyKey } = provider;
  const byId = suffix => document.getElementById(`${id}-${suffix}`);
  const panelStatus = byId('import-status');
  const detail = byId('connection-detail');
  const profileInput = byId('profile-reference');
  const authorizationLink = byId('authorization-link');
  const connectButton = byId('connect');
  const reviewButton = byId('import-review');
  const disconnectButton = byId('disconnect');
  const dialog = byId('import-dialog');
  const loading = byId('import-loading');
  const content = byId('import-content');
  const summary = byId('import-summary');
  const list = byId('import-list');
  const search = byId('import-search');
  const error = byId('import-error');
  const selectedCount = byId('selected-count');
  const confirm = byId('import-confirm');
  const progress = byId('import-progress');
  const progressLabel = byId('import-progress-label');
  const progressCount = byId('import-progress-count');
  const progressFill = byId('import-progress-fill');
  const closeButtons = [...dialog.querySelectorAll(`[data-${id}-close]`)];
  const selectionButtons = [byId('select-importable'), byId('clear-selection')];
  let preview = null; let importing = false; let previewing = false; let previewSequence = 0;
  let connectionStatus = null; let editingProfile = false; let connecting = false;
  const selected = new Set();

  function showError(message) { error.textContent = message; error.hidden = !message; }
  function available() { return provider.requiresConfiguration ? Boolean(connectionStatus?.configured) : true; }
  function renderConnectionControls() {
    const configured = available();
    const connected = Boolean(connectionStatus?.connected && connectionStatus.connection);
    const showingConnected = connected && !editingProfile;
    profileInput.classList.toggle('is-connected', showingConnected);
    if (showingConnected) profileInput.value = 'Connected';
    else if (!connected && profileInput.value === 'Connected') profileInput.value = '';
    profileInput.disabled = !configured || showingConnected || connecting;
    connectButton.disabled = !configured || connecting;
    connectButton.textContent = connecting ? 'Connecting…' : showingConnected
      ? (provider.replaceLabel || 'Replace profile') : (provider.connectLabel || 'Connect');
    reviewButton.disabled = !configured || !connected;
    disconnectButton.hidden = !connected && !connectionStatus?.requiresReconnect;
  }
  function renderStatus(status) {
    connectionStatus = status;
    if (authorizationLink && status.authorizationUrl) { authorizationLink.href = status.authorizationUrl; authorizationLink.hidden = false; }
    const connected = status.connected && status.connection;
    panelStatus.textContent = !available() ? 'Not configured by the server operator.'
      : connected ? `Connected as ${provider.connectionName(status.connection)}`
        : status.requiresReconnect ? `${label} authorization required.` : (provider.readyText || `Ready to connect a ${label} profile.`);
    detail.textContent = connected ? provider.connectionDetail(status.connection)
      : status.requiresReconnect ? (provider.reconnectText || `Reconnect ${label} to continue.`) : (provider.disconnectedText || `No ${label} profile connected.`);
    renderConnectionControls();
  }

  async function load() {
    connectionStatus = null; editingProfile = false; connecting = false; profileInput.value = ''; renderConnectionControls();
    try { renderStatus(await api(`/api/${id}/status`)); }
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
    if (!importing && !previewing) return;
    const phases = {
      previewing: `Reading ${label} library pages…`,
      fetching: `Refreshing owned games from ${label}…`, importing: 'Writing selected library records…',
      processing: 'Recording collector XP…', complete: `${label} import complete.`,
    };
    const current = Math.max(0, Number(update.current) || 0); const total = Math.max(0, Number(update.total) || 0);
    const indeterminate = (update.phase === 'fetching' || update.phase === 'previewing') && !total;
    const percent = total ? Math.min(100, (current / total) * 100) : update.phase === 'complete' ? 100 : 0;
    progress.hidden = false; progress.classList.toggle('is-indeterminate', indeterminate);
    progressLabel.textContent = phases[update.phase] || `Importing ${label} library…`;
    progressCount.textContent = indeterminate || !total ? '' : `${current.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`;
    progressFill.style.width = indeterminate ? '' : `${percent}%`;
  }
  function row(item) {
    const identity = String(item[identityKey]);
    const rowLabel = document.createElement('label'); rowLabel.className = `library-import-row is-${item.status}`;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(identity);
    checkbox.disabled = item.action === 'none'; checkbox.dataset.importIdentity = identity;
    const copy = element('span', 'library-import-copy'); copy.append(element('strong', '', item.title));
    const metadata = element('small', '', provider.itemMeta(item));
    for (const match of item.matches || []) {
      metadata.append(' // ', element('em', `library-import-platform platform-coded ${platformThemeClass(match.platform)}`, platformDisplayName(match.platform)), `: ${match.title}`);
    }
    copy.append(metadata);
    const state = element('span', `library-import-state state-${item.status}`);
    state.append(element('b', '', STATUS[item.status]?.[0] || item.status), element('small', '', STATUS[item.status]?.[1] || ''));
    rowLabel.append(checkbox, copy, state); return rowLabel;
  }
  function renderList() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = (preview?.items || []).filter(item => !query || item.title.toLocaleLowerCase().includes(query));
    list.replaceChildren(...matches.slice(0, REVIEW_RENDER_LIMIT).map(row));
    if (!matches.length) list.append(element('p', 'library-import-empty', `No ${label} titles match this filter.`));
    else if (matches.length > REVIEW_RENDER_LIMIT) {
      list.append(element('p', 'library-import-limit', `Showing ${REVIEW_RENDER_LIMIT.toLocaleString('en-US')} of ${matches.length.toLocaleString('en-US')} matches. Filter by title to narrow the review.`));
    }
    syncSearchClears(dialog);
  }
  function renderPreview(result) {
    preview = result; selected.clear();
    for (const item of result.items) if (item.selected) selected.add(String(item[identityKey]));
    const labels = [['new', 'new'], ['other-platform', 'other-platform copies'], ['link', 'existing records to link'],
      ['ambiguous', 'need review'], ['already', 'already imported']];
    summary.replaceChildren(element('strong', '', `${result.total.toLocaleString('en-US')} ${label} games`),
      ...labels.map(([key, text]) => element('span', `summary-${key}`, `${result.counts[key].toLocaleString('en-US')} ${text}`)));
    search.value = ''; renderList(); updateSelectedCount();
  }
  async function openPreview() {
    const sequence = ++previewSequence;
    document.getElementById('account-dialog')?.close();
    preview = null; selected.clear(); search.value = ''; showError(''); content.hidden = true; loading.hidden = false;
    progress.hidden = true; progress.classList.remove('is-indeterminate'); progressFill.style.width = '0';
    confirm.disabled = true; selectedCount.textContent = '0 selected'; previewing = true; dialog.showModal();
    renderProgress({ phase: 'previewing', current: 0, total: 0 });
    try {
      const result = await api(`/api/${id}/import-preview`);
      if (sequence !== previewSequence) return;
      renderPreview(result); content.hidden = false; loading.hidden = true; progress.hidden = true;
    } catch (previewError) {
      if (sequence !== previewSequence) return;
      loading.hidden = true; progress.hidden = true; showError(previewError.message);
    } finally { if (sequence === previewSequence) previewing = false; }
  }

  connectButton.addEventListener('click', async () => {
    if (connectionStatus?.connected && !editingProfile) {
      editingProfile = true; profileInput.value = ''; renderConnectionControls(); profileInput.focus(); return;
    }
    const connectionValue = profileInput.value.trim();
    if (!connectionValue) { panelStatus.textContent = provider.missingConnectionText || `Enter a ${label} profile first.`; return; }
    connecting = true; renderConnectionControls();
    try {
      const connectionBodyKey = provider.connectionBodyKey || 'profile';
      const status = await api(`/api/${id}/connection`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [connectionBodyKey]: connectionValue }) });
      editingProfile = false; connecting = false; profileInput.value = ''; renderStatus(status); toast(provider.connectedToast || `${label} profile connected.`);
    } catch (connectError) { panelStatus.textContent = connectError.message; }
    finally { connecting = false; renderConnectionControls(); }
  });
  profileInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return; event.preventDefault(); if (!connectButton.disabled) connectButton.click();
  });
  disconnectButton.addEventListener('click', async () => {
    disconnectButton.disabled = true;
    try { editingProfile = false; profileInput.value = ''; renderStatus(await api(`/api/${id}/connection`, { method: 'DELETE' })); toast(provider.disconnectedToast || `${label} profile disconnected.`); }
    catch (disconnectError) { panelStatus.textContent = disconnectError.message; }
    finally { disconnectButton.disabled = false; }
  });
  reviewButton.addEventListener('click', openPreview);
  search.addEventListener('input', renderList);
  list.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-import-identity]'); if (!checkbox) return;
    const identity = checkbox.dataset.importIdentity; if (checkbox.checked) selected.add(identity); else selected.delete(identity); updateSelectedCount();
  });
  byId('select-importable').addEventListener('click', () => {
    for (const item of preview?.items || []) if (item.action !== 'none' && item.status !== 'ambiguous') selected.add(String(item[identityKey]));
    renderList(); updateSelectedCount();
  });
  byId('clear-selection').addEventListener('click', () => { selected.clear(); renderList(); updateSelectedCount(); });
  confirm.addEventListener('click', async () => {
    setImportBusy(true); confirm.textContent = 'Importing…'; showError(''); renderProgress({ phase: 'fetching', current: 0, total: 0 });
    let succeeded = false;
    try {
      const body = { [selectionBodyKey]: [...selected] };
      const result = await api(`/api/${id}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      renderProgress({ phase: 'complete', current: selected.size, total: selected.size }); succeeded = true; dialog.close();
      toast(`${label} import complete // ${result.created.length} added, ${result.linked.length} linked, ${result.skipped.length} skipped.`);
      try { await onImported(result); } catch { toast(`${label} import complete // refresh the Kat·a·log to see every change.`); }
    } catch (importError) { showError(importError.message); }
    finally { confirm.textContent = 'Import selected'; setImportBusy(false); if (!succeeded) progress.hidden = true; }
  });
  function closeDialog() {
    if (importing) return;
    previewing = false; previewSequence++; dialog.close();
  }
  closeButtons.forEach(button => button.addEventListener('click', closeDialog));
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('pointerup', event => {
    const shouldClose = pressedBackdrop && event.target === dialog; pressedBackdrop = false; if (shouldClose) closeDialog();
  });
  dialog.addEventListener('pointercancel', () => { pressedBackdrop = false; });
  dialog.addEventListener('cancel', event => {
    if (importing) event.preventDefault(); else { event.preventDefault(); closeDialog(); }
  });
  mountThemedSearchClears(dialog);
  return { handleEvent: renderProgress, load, openPreview };
}
