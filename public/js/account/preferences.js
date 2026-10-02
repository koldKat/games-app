import { state, filters, runtime } from '../core/runtime.js';
import { api } from '../core/api.js';
import { UI_TIMING } from '../core/ui-policy.js';
import { setView, renderQuickFilter } from '../library/render.js';

function preferencePayload() {
  return { view: state.view, filters: Object.fromEntries(Object.entries(filters).map(([key, element]) => [key, element.value])) };
}

async function savePreferences(keepalive = false) {
  if (!runtime.preferencesReady || !runtime.preferencesDirty || !state.user) return;
  clearTimeout(runtime.preferenceSaveTimer);
  const generation = runtime.sessionGeneration; const userId = state.user.id;
  runtime.preferencesDirty = false;
  try {
    await api('/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferencePayload()), keepalive });
  } catch {
    if (generation === runtime.sessionGeneration && state.user?.id === userId) {
      runtime.preferencesDirty = true;
      if (!keepalive) runtime.preferenceSaveTimer = setTimeout(() => { void savePreferences(); }, UI_TIMING.preferenceRetryMs);
    }
  }
}

function schedulePreferenceSave(delay = UI_TIMING.preferenceSaveMs) {
  if (!runtime.preferencesReady || !state.user) return;
  runtime.preferencesDirty = true;
  clearTimeout(runtime.preferenceSaveTimer);
  runtime.preferenceSaveTimer = setTimeout(() => { void savePreferences(); }, delay);
}

function applyPreferences(preferences = {}) {
  runtime.preferencesReady = false;
  const saved = preferences.filters || {};
  for (const [key, element] of Object.entries(filters)) {
    const value = String(saved[key] || (key === 'sort' ? 'title' : ''));
    if (key === 'platform' && value && ![...element.options].some(option => option.value === value)) element.add(new Option(value, value));
    element.value = value;
  }
  setView(preferences.view === 'list' ? 'list' : 'grid', false);
  renderQuickFilter(); runtime.preferencesDirty = false; runtime.preferencesReady = true;
}

export { applyPreferences, schedulePreferenceSave, savePreferences };
