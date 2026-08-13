import { AUTOCOMPLETE_POLICY, LOOKUP_MIN_TITLE_LENGTH } from './ui-policy.js';

const sameText = (left, right) => String(left || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  === String(right || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function createTitleAutocomplete({
  input, suggestionBox, warning, summary, openButton, platformInput, customPlatformInput,
  api, escapeHtml, labels, getPlatform, getEditingId, openExisting,
}) {
  let timer = null;
  let request = null;
  let suggestions = [];
  let existingMatches = [];
  let activeSuggestion = -1;

  function close() {
    clearTimeout(timer);
    request?.abort(); request = null;
    suggestions = []; activeSuggestion = -1;
    suggestionBox.hidden = true; suggestionBox.replaceChildren();
    input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  }

  function exactDuplicate(matches = existingMatches) {
    const editingId = Number(getEditingId() || 0); const platform = getPlatform();
    return matches.find(game => game.id !== editingId && sameText(game.title, input.value) && sameText(game.platform, platform)) || null;
  }

  function updateWarning() {
    const duplicate = exactDuplicate(); warning.hidden = !duplicate;
    if (!duplicate) { delete warning.dataset.gameId; return; }
    warning.dataset.gameId = duplicate.id;
    summary.textContent = `${duplicate.platform} · ${labels[duplicate.ownership] || duplicate.ownership}`;
  }

  function reset() {
    close(); existingMatches = []; updateWarning();
  }

  function highlight(index) {
    if (!suggestions.length) return;
    activeSuggestion = (index + suggestions.length) % suggestions.length;
    const options = [...suggestionBox.querySelectorAll('[role="option"]')];
    options.forEach((option, optionIndex) => {
      const active = optionIndex === activeSuggestion;
      option.classList.toggle('active', active); option.setAttribute('aria-selected', String(active));
    });
    const active = options[activeSuggestion];
    input.setAttribute('aria-activedescendant', active.id);
    if (active.offsetTop < suggestionBox.scrollTop) suggestionBox.scrollTop = active.offsetTop;
    else if (active.offsetTop + active.offsetHeight > suggestionBox.scrollTop + suggestionBox.clientHeight) {
      suggestionBox.scrollTop = active.offsetTop + active.offsetHeight - suggestionBox.clientHeight;
    }
  }

  function choose(index) {
    const choice = suggestions[index];
    if (!choice) return;
    if (choice.kind === 'existing') return openExisting(choice.game.id);
    input.value = choice.title; close(); updateWarning(); input.focus();
  }

  function render(results = {}) {
    existingMatches = Array.isArray(results.existing) ? results.existing : [];
    const remote = Array.isArray(results.suggestions)
      ? results.suggestions.filter(title => typeof title === 'string' && title.trim()).slice(0, AUTOCOMPLETE_POLICY.resultLimit) : [];
    suggestions = [
      ...existingMatches.map(game => ({ kind: 'existing', game })),
      ...remote.filter(title => !existingMatches.some(game => sameText(game.title, title))).map(title => ({ kind: 'remote', title })),
    ];
    activeSuggestion = -1;
    suggestionBox.innerHTML = suggestions.map((choice, index) => choice.kind === 'existing'
      ? `<button type="button" class="existing" id="title-suggestion-${index}" role="option" aria-selected="false" data-title-suggestion="${index}"><span>${escapeHtml(choice.game.title)}<small>${escapeHtml(choice.game.platform)} · ${escapeHtml(labels[choice.game.ownership] || choice.game.ownership)}</small></span><b>In library</b></button>`
      : `<button type="button" id="title-suggestion-${index}" role="option" aria-selected="false" data-title-suggestion="${index}"><span>${escapeHtml(choice.title)}</span><small>SteamGridDB</small></button>`).join('');
    suggestionBox.hidden = suggestions.length === 0;
    input.setAttribute('aria-expanded', String(suggestions.length > 0));
    updateWarning();
  }

  input.addEventListener('input', () => {
    clearTimeout(timer); request?.abort(); request = null; render({});
    const query = input.value.trim();
    if (query.length < AUTOCOMPLETE_POLICY.queryMinLength) return;
    timer = setTimeout(async () => {
      const controller = new AbortController(); request = controller;
      try {
        const local = await api(`/api/titles/autocomplete?local=1&q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!controller.signal.aborted && input.value.trim() === query) render(local);
        const results = await api(`/api/titles/autocomplete?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!controller.signal.aborted && input.value.trim() === query) render(results);
      } catch {}
      finally { if (request === controller) request = null; }
    }, AUTOCOMPLETE_POLICY.debounceMs);
  });
  platformInput.addEventListener('change', updateWarning);
  customPlatformInput.addEventListener('input', updateWarning);
  input.addEventListener('keydown', event => {
    if (suggestionBox.hidden || !suggestions.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); highlight(activeSuggestion + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(activeSuggestion < 0 ? suggestions.length - 1 : activeSuggestion - 1); }
    else if (event.key === 'Enter' && activeSuggestion >= 0) { event.preventDefault(); choose(activeSuggestion); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (!suggestionBox.matches(':hover')) close();
  }, AUTOCOMPLETE_POLICY.blurDelayMs));
  suggestionBox.addEventListener('pointerdown', event => event.preventDefault());
  suggestionBox.addEventListener('click', event => {
    const option = event.target.closest('[data-title-suggestion]');
    if (option) choose(Number(option.dataset.titleSuggestion));
  });
  openButton.addEventListener('click', () => openExisting(Number(warning.dataset.gameId)));

  async function duplicateBeforeSave() {
    const title = input.value.trim();
    if (title.length < LOOKUP_MIN_TITLE_LENGTH) return null;
    try {
      const result = await api(`/api/titles/autocomplete?exact=1&q=${encodeURIComponent(title)}&platform=${encodeURIComponent(getPlatform())}`);
      existingMatches = Array.isArray(result.existing) ? result.existing : [];
      updateWarning(); return exactDuplicate();
    } catch { return null; }
  }

  return { close, reset, updateWarning, duplicateBeforeSave };
}
