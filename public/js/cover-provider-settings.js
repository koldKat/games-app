import { UI_LOCALE } from './ui-policy.js';

const PROVIDERS = Object.freeze({
  thegamesdb: { label: 'TheGamesDB', fields: ['apiKey'], remaining: count => `${count} covers remain`, purpose: 'search its artwork', started: 'cover scan' },
  igdb: { label: 'IGDB', fields: [], remaining: count => `${count} games need IGDB information`, purpose: 'match games and retrieve metadata', started: 'metadata scan' },
});

function setBulkStatus(element, shortStatus, detail) {
  element.textContent = shortStatus; element.dataset.tooltip = detail; element.removeAttribute('title'); element.setAttribute('aria-label', `${shortStatus}. ${detail}`);
}

export function createCoverProviderSettings({ api, toast, showError, onStatus = () => {} }) {
  const states = new Map();
  const root = provider => document.querySelector(`[data-cover-provider="${provider}"]`);

  function render(provider) {
    const panel = root(provider); const status = states.get(provider); if (!panel || !status) return;
    const editing = panel.dataset.editing === 'true'; const saving = panel.dataset.saving === 'true';
    const canConfigure = status.canConfigure !== false;
    const remaining = PROVIDERS[provider].remaining(Number(status.missing || 0).toLocaleString(UI_LOCALE));
    panel.querySelector('[data-provider-status]').textContent = status.configured
      ? `${remaining}${status.shared ? ' · shared' : ''}`
      : canConfigure ? `Connect ${PROVIDERS[provider].label} to ${PROVIDERS[provider].purpose}.` : `${PROVIDERS[provider].label} is not configured for this server.`;
    const connected = panel.querySelector('[data-provider-connected]');
    const fields = panel.querySelector('[data-provider-fields]');
    const connectedInput = connected?.querySelector('input');
    const replace = panel.querySelector('[data-provider-replace]');
    const save = panel.querySelector('[data-provider-save]');
    if (connected) connected.hidden = !status.configured || editing;
    if (fields) fields.hidden = !canConfigure || status.configured && !editing;
    if (connectedInput) { connectedInput.value = status.shared ? 'App connected' : 'Connected'; connectedInput.disabled = true; }
    if (replace) replace.hidden = !canConfigure;
    if (save) { save.disabled = saving; save.textContent = saving ? 'Checking…' : status.configured ? 'Save credentials' : 'Connect'; }
    for (const input of panel.querySelectorAll('[data-credential]')) input.disabled = saving;
    const bulk = panel.querySelector('[data-provider-bulk]'); bulk.disabled = !status.configured || status.job?.state === 'running' || Number(status.missing) === 0;
    const job = status.job; let short = 'Exact title + platform only.'; let detail = 'Automatic matching requires one exact title on the selected platform.';
    if (job?.state === 'running') {
      short = `Scanning ${job.processed.toLocaleString(UI_LOCALE)}/${job.total.toLocaleString(UI_LOCALE)} · ${job.matched.toLocaleString(UI_LOCALE)} found`;
      detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
    } else if (job?.state === 'complete') {
      short = `Done · ${job.matched.toLocaleString(UI_LOCALE)} found · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
      detail = `${job.processed.toLocaleString(UI_LOCALE)} scanned · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped`;
    } else if (job?.state === 'failed') { short = 'Scan paused · details'; detail = job.lastError || job.error || `${PROVIDERS[provider].label} unavailable.`; }
    setBulkStatus(panel.querySelector('[data-provider-bulk-status]'), short, detail);
  }

  async function loadOne(provider) {
    const panel = root(provider);
    try {
      const status = await api(`/api/cover-providers/${provider}/status`);
      states.set(provider, status); render(provider); onStatus(provider, status);
    }
    catch (error) {
      states.delete(provider); panel.querySelector('[data-provider-status]').textContent = error.message;
      const connected = panel.querySelector('[data-provider-connected]'); const fields = panel.querySelector('[data-provider-fields]');
      if (connected) connected.hidden = true; if (fields) fields.hidden = provider === 'igdb';
      panel.querySelector('[data-provider-bulk]').disabled = true;
    }
  }
  const load = () => Promise.all(Object.keys(PROVIDERS).map(loadOne));

  for (const [provider, definition] of Object.entries(PROVIDERS)) {
    const panel = root(provider); if (!panel) continue;
    panel.querySelector('[data-provider-replace]')?.addEventListener('click', () => {
      panel.dataset.editing = 'true'; render(provider); panel.querySelector('[data-credential]')?.focus();
    });
    panel.querySelector('[data-provider-save]')?.addEventListener('click', async () => {
      const payload = Object.fromEntries([...panel.querySelectorAll('[data-credential]')].map(input => [input.dataset.credential, input.value.trim()]));
      if (definition.fields.some(field => !payload[field])) { showError(`Complete the ${definition.label} credentials first.`); return; }
      panel.dataset.saving = 'true'; render(provider);
      try {
        await api(`/api/cover-providers/${provider}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        for (const input of panel.querySelectorAll('[data-credential]')) input.value = '';
        panel.dataset.saving = 'false'; panel.dataset.editing = 'false'; toast(`${definition.label} connected.`); await loadOne(provider);
      } catch (error) { panel.dataset.saving = 'false'; showError(error.message); render(provider); }
    });
    panel.querySelector('[data-provider-bulk]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await api(`/api/cover-providers/${provider}/bulk`, { method: 'POST' }); toast(`${definition.label} ${definition.started} started.`); await loadOne(provider); }
      catch (error) { showError(error.message); render(provider); }
    });
  }

  function handleEvent(event, data) {
    const provider = event.endsWith('-job') ? event.slice(0, -4) : '';
    if (!PROVIDERS[provider]) return false;
    const previous = states.get(provider) || {}; const job = data.job;
    states.set(provider, { ...previous, job, missing: Math.max(0, Number(job.total || 0) - Number(job.matched || 0) - Number(job.skipped || 0)) });
    render(provider); return true;
  }
  function reset() {
    states.clear();
    for (const provider of Object.keys(PROVIDERS)) {
      const panel = root(provider); panel.dataset.editing = 'false'; panel.dataset.saving = 'false';
      panel.querySelector('[data-provider-status]').textContent = 'Checking configuration…';
      const connected = panel.querySelector('[data-provider-connected]'); const fields = panel.querySelector('[data-provider-fields]'); const save = panel.querySelector('[data-provider-save]');
      if (connected) connected.hidden = true; if (fields) fields.hidden = provider === 'igdb';
      if (save) { save.disabled = provider === 'igdb'; save.textContent = 'Connect'; }
      panel.querySelector('[data-provider-bulk]').disabled = true;
      for (const input of panel.querySelectorAll('[data-credential]')) input.value = '';
    }
  }
  return { handleEvent, load, reset };
}
