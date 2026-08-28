const PROVIDERS = Object.freeze({
  thegamesdb: { label: 'TheGamesDB', fields: ['apiKey'] },
});

function setBulkStatus(element, shortStatus, detail) {
  element.textContent = shortStatus; element.dataset.tooltip = detail; element.title = detail; element.setAttribute('aria-label', `${shortStatus}. ${detail}`);
}

export function createCoverProviderSettings({ api, toast, showError }) {
  const states = new Map();
  const root = provider => document.querySelector(`[data-cover-provider="${provider}"]`);

  function render(provider) {
    const panel = root(provider); const status = states.get(provider); if (!panel || !status) return;
    const editing = panel.dataset.editing === 'true'; const saving = panel.dataset.saving === 'true';
    panel.querySelector('[data-provider-status]').textContent = status.configured
      ? `${Number(status.missing || 0).toLocaleString()} games still need covers.` : `Connect ${PROVIDERS[provider].label} to search its artwork.`;
    panel.querySelector('[data-provider-connected]').hidden = !status.configured || editing;
    panel.querySelector('[data-provider-fields]').hidden = status.configured && !editing;
    const connectedInput = panel.querySelector('[data-provider-connected] input'); connectedInput.value = 'Connected'; connectedInput.disabled = true;
    const save = panel.querySelector('[data-provider-save]'); save.disabled = saving; save.textContent = saving ? 'Checking…' : status.configured ? 'Save credentials' : 'Connect';
    for (const input of panel.querySelectorAll('[data-credential]')) input.disabled = saving;
    const bulk = panel.querySelector('[data-provider-bulk]'); bulk.disabled = !status.configured || status.job?.state === 'running' || Number(status.missing) === 0;
    const job = status.job; let short = 'Exact title + platform only.'; let detail = 'Automatic matching requires one exact title on the selected platform.';
    if (job?.state === 'running') {
      short = `Scanning ${job.processed.toLocaleString()}/${job.total.toLocaleString()} · ${job.matched.toLocaleString()} found`;
      detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString()} unmatched · ${(job.skipped || 0).toLocaleString()} skipped · ${job.errors.toLocaleString()} errors`;
    } else if (job?.state === 'complete') {
      short = `Done · ${job.matched.toLocaleString()} found · ${job.errors.toLocaleString()} errors`;
      detail = `${job.processed.toLocaleString()} scanned · ${job.unmatched.toLocaleString()} unmatched · ${(job.skipped || 0).toLocaleString()} skipped`;
    } else if (job?.state === 'failed') { short = 'Scan paused · details'; detail = job.lastError || job.error || `${PROVIDERS[provider].label} unavailable.`; }
    setBulkStatus(panel.querySelector('[data-provider-bulk-status]'), short, detail);
  }

  async function loadOne(provider) {
    const panel = root(provider);
    try { states.set(provider, await api(`/api/cover-providers/${provider}/status`)); render(provider); }
    catch (error) {
      states.delete(provider); panel.querySelector('[data-provider-status]').textContent = error.message;
      panel.querySelector('[data-provider-connected]').hidden = true; panel.querySelector('[data-provider-fields]').hidden = false;
      panel.querySelector('[data-provider-bulk]').disabled = true;
    }
  }
  const load = () => Promise.all(Object.keys(PROVIDERS).map(loadOne));

  for (const [provider, definition] of Object.entries(PROVIDERS)) {
    const panel = root(provider); if (!panel) continue;
    panel.querySelector('[data-provider-replace]').addEventListener('click', () => {
      panel.dataset.editing = 'true'; render(provider); panel.querySelector('[data-credential]')?.focus();
    });
    panel.querySelector('[data-provider-save]').addEventListener('click', async () => {
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
      try { await api(`/api/cover-providers/${provider}/bulk`, { method: 'POST' }); toast(`${definition.label} cover scan started.`); await loadOne(provider); }
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
      panel.querySelector('[data-provider-connected]').hidden = true; panel.querySelector('[data-provider-fields]').hidden = false;
      panel.querySelector('[data-provider-save]').disabled = false; panel.querySelector('[data-provider-save]').textContent = 'Connect';
      panel.querySelector('[data-provider-bulk]').disabled = true;
      for (const input of panel.querySelectorAll('[data-credential]')) input.value = '';
    }
  }
  return { handleEvent, load, reset };
}
