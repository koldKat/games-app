import { state } from '../core/runtime.js';
import { $ } from '../core/dom.js';
import { UI_LOCALE } from '../core/ui-policy.js';
import { api, toast } from '../core/api.js';

function setBulkStatus(element, shortStatus, detail) {
  element.textContent = shortStatus; element.dataset.tooltip = detail; element.removeAttribute('title'); element.setAttribute('aria-label', `${shortStatus}. ${detail}`);
}

function renderCoverStatus() {
  const status = state.coverStatus; if (!status) return;
  $('#cover-provider-status').textContent = status.configured
    ? `${status.missing.toLocaleString(UI_LOCALE)} games need covers · shared`
    : 'SteamGridDB is not configured for this server.';
  $('#cover-bulk-start').disabled = !status.configured || status.job?.state === 'running' || status.missing === 0;
  const job = status.job; let shortStatus = 'Exact-title matches only.'; let detail = 'Only exact normalized title matches receive covers automatically.';
  if (job?.state === 'running') {
    shortStatus = `Scanning ${job.processed.toLocaleString(UI_LOCALE)}/${job.total.toLocaleString(UI_LOCALE)} · ${job.matched.toLocaleString(UI_LOCALE)} found`;
    detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
  } else if (job?.state === 'complete') {
    shortStatus = `Done · ${job.matched.toLocaleString(UI_LOCALE)} found · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
    detail = `${job.processed.toLocaleString(UI_LOCALE)} scanned · ${job.matched.toLocaleString(UI_LOCALE)} matched · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
  } else if (job?.state === 'failed') {
    shortStatus = 'Scan paused · details'; detail = job.lastError || job.error || 'Cover provider unavailable.';
  }
  setBulkStatus($('#cover-bulk-status'), shortStatus, detail);
}

async function loadCoverStatus() {
  try {
    state.coverStatus = await api('/api/covers/status'); renderCoverStatus();
  } catch (error) {
    state.coverStatus = null;
    $('#cover-provider-status').textContent = error.message;
    $('#cover-bulk-start').disabled = true;
  }
}

function renderPegiBulkStatus() {
  const status = state.pegiStatus; if (!status) return;
  $('#pegi-provider-status').textContent = `${status.missing.toLocaleString(UI_LOCALE)} games need PEGI details.`;
  $('#pegi-bulk-start').disabled = status.job?.state === 'running' || status.missing === 0;
  const job = status.job; let shortStatus = 'Exact-title and platform-aware.'; let detail = 'Unique exact titles are accepted; ambiguous editions require one platform-specific match.';
  if (job?.state === 'running') {
    shortStatus = `Scanning ${job.processed.toLocaleString(UI_LOCALE)}/${job.total.toLocaleString(UI_LOCALE)} · ${job.matched.toLocaleString(UI_LOCALE)} found`;
    detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
  } else if (job?.state === 'complete') {
    shortStatus = `Done · ${job.matched.toLocaleString(UI_LOCALE)} found · ${job.unmatched.toLocaleString(UI_LOCALE)} review`;
    detail = `${job.processed.toLocaleString(UI_LOCALE)} scanned · ${job.matched.toLocaleString(UI_LOCALE)} matched · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched or ambiguous · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
  } else if (job?.state === 'failed') {
    shortStatus = 'Scan paused · details'; detail = job.lastError || job.error || 'PEGI unavailable.';
  }
  setBulkStatus($('#pegi-bulk-status'), shortStatus, detail);
}

async function loadPegiStatus() {
  try { state.pegiStatus = await api('/api/pegi/status'); renderPegiBulkStatus(); }
  catch (error) { state.pegiStatus = null; $('#pegi-provider-status').textContent = error.message; $('#pegi-bulk-start').disabled = true; }
}

function renderHltbBulkStatus() {
  const status = state.hltbStatus; if (!status) return;
  $('#hltb-provider-status').textContent = `${status.missing.toLocaleString(UI_LOCALE)} games need HLTB estimates.`;
  $('#hltb-bulk-start').disabled = status.job?.state === 'running' || status.missing === 0;
  const job = status.job; let shortStatus = 'Unique exact-title matches only.'; let detail = 'Ambiguous editions stay blank for manual review.';
  if (job?.state === 'running') {
    shortStatus = `Scanning ${job.processed.toLocaleString(UI_LOCALE)}/${job.total.toLocaleString(UI_LOCALE)} · ${job.matched.toLocaleString(UI_LOCALE)} found`;
    detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
  } else if (job?.state === 'complete') {
    shortStatus = `Done · ${job.matched.toLocaleString(UI_LOCALE)} found · ${job.unmatched.toLocaleString(UI_LOCALE)} review`;
    detail = `${job.processed.toLocaleString(UI_LOCALE)} scanned · ${job.matched.toLocaleString(UI_LOCALE)} matched · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched or ambiguous · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
  } else if (job?.state === 'failed') {
    shortStatus = 'Scan paused · details'; detail = job.lastError || job.error || 'HLTB unavailable.';
  }
  setBulkStatus($('#hltb-bulk-status'), shortStatus, detail);
}

async function loadHltbStatus() {
  try { state.hltbStatus = await api('/api/hltb/status'); renderHltbBulkStatus(); }
  catch (error) { state.hltbStatus = null; $('#hltb-provider-status').textContent = error.message; $('#hltb-bulk-start').disabled = true; }
}

function renderDescriptionBulkStatus() {
  const status = state.descriptionStatus; if (!status) return;
  $('#description-provider-status').textContent = `${status.missing.toLocaleString(UI_LOCALE)} games need descriptions · ${status.thegamesdbConfigured ? 'TheGamesDB connected' : 'Steam only'}`;
  $('#description-bulk-start').disabled = status.job?.state === 'running' || status.missing === 0;
  const job = status.job; let shortStatus = 'Steam Store first; exact titles only.'; let detail = 'TheGamesDB is used only when Steam Store has no unique exact-title match.';
  if (job?.state === 'running') {
    shortStatus = `Scanning ${job.processed.toLocaleString(UI_LOCALE)}/${job.total.toLocaleString(UI_LOCALE)} · ${job.matched.toLocaleString(UI_LOCALE)} found`;
    detail = `Currently scanning: ${job.current || 'preparing next title'} · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
  } else if (job?.state === 'complete') {
    shortStatus = `Done · ${job.matched.toLocaleString(UI_LOCALE)} found · ${job.unmatched.toLocaleString(UI_LOCALE)} review`;
    detail = `${job.processed.toLocaleString(UI_LOCALE)} scanned · ${job.unmatched.toLocaleString(UI_LOCALE)} unmatched or ambiguous · ${(job.skipped || 0).toLocaleString(UI_LOCALE)} skipped · ${job.errors.toLocaleString(UI_LOCALE)} errors`;
  } else if (job?.state === 'failed') { shortStatus = 'Scan paused · details'; detail = job.lastError || job.error || 'A description source is unavailable.'; }
  setBulkStatus($('#description-bulk-status'), shortStatus, detail);
}

async function loadDescriptionStatus() {
  try { state.descriptionStatus = await api('/api/descriptions/status'); renderDescriptionBulkStatus(); }
  catch (error) { state.descriptionStatus = null; $('#description-provider-status').textContent = error.message; $('#description-bulk-start').disabled = true; }
}

export function initializeMetadataBulkUi() {
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
}
export {
  renderCoverStatus, renderPegiBulkStatus, renderHltbBulkStatus, renderDescriptionBulkStatus,
  loadCoverStatus, loadPegiStatus, loadHltbStatus, loadDescriptionStatus,
};
