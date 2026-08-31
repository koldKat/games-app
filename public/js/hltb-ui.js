import { LOOKUP_MIN_TITLE_LENGTH } from './ui-policy.js';

function hoursLabel(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return '//';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${Number(hours.toFixed(1))}h`;
}

function metadataFrom(game = {}) {
  const source = game || {};
  return {
    hltbId: source.hltbId || null, hltbTitle: source.hltbTitle || '', hltbUrl: source.hltbUrl || '',
    hltbMainStory: source.hltbMainStory ?? null, hltbMainExtra: source.hltbMainExtra ?? null,
    hltbCompletionist: source.hltbCompletionist ?? null, hltbAllStyles: source.hltbAllStyles ?? null,
    hltbUpdatedAt: source.hltbUpdatedAt || null,
  };
}

function cardTimes(game, escapeHtml) {
  const items = [['Main', game.hltbMainStory], ['Main +', game.hltbMainExtra], ['100%', game.hltbCompletionist], ['Average', game.hltbAllStyles]];
  return `<dl class="card-hltb${game.hltbId ? '' : ' is-empty'}" aria-label="${game.hltbId ? 'HowLongToBeat estimates' : 'No HowLongToBeat estimates'}">${items.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(hoursLabel(value))}</dd></div>`).join('')}</dl>`;
}

function createHltbLookup({ $, api, escapeHtml, toast }) {
  const form = $('#game-form'); const results = $('#hltb-results');
  const searchButton = $('#hltb-search-button'); const titleInput = $('#game-title');
  let searchSequence = 0;

  function value() { return form._hltbMetadata || metadataFrom(); }
  function render() {
    const data = value(); const details = $('#game-hltb-details'); details.hidden = !data.hltbId;
    $('#hltb-remove-button').hidden = !data.hltbId;
    if (!data.hltbId) return;
    $('#game-hltb-title').textContent = data.hltbTitle || 'HowLongToBeat match';
    $('#game-hltb-source').href = data.hltbUrl || 'https://howlongtobeat.com/';
    const metrics = [['Main story', data.hltbMainStory], ['Main + sides', data.hltbMainExtra],
      ['Completionist', data.hltbCompletionist], ['All styles', data.hltbAllStyles]];
    $('#game-hltb-times').innerHTML = metrics.map(([label, hours]) => `<div><span>${label}</span><strong>${escapeHtml(hoursLabel(hours))}</strong></div>`).join('');
  }

  function resetSearch() {
    searchSequence++; results.hidden = true; results.innerHTML = ''; results._choices = [];
    searchButton.disabled = false; searchButton.textContent = 'Look up times';
  }
  function load(game) { form._hltbMetadata = metadataFrom(game); resetSearch(); render(); }
  function clear() { form._hltbMetadata = metadataFrom(); resetSearch(); render(); }

  searchButton.addEventListener('click', async () => {
    const title = titleInput.value.trim(); const sequence = ++searchSequence; results.hidden = false;
    if (title.length < LOOKUP_MIN_TITLE_LENGTH) { results.innerHTML = '<p class="pegi-message">Type at least two characters of the title first.</p>'; return; }
    searchButton.disabled = true; searchButton.textContent = 'Searching…';
    try {
      const choices = await api(`/api/hltb/search?q=${encodeURIComponent(title)}`);
      if (sequence !== searchSequence || titleInput.value.trim() !== title) return;
      results._choices = choices;
      results.innerHTML = choices.length ? choices.map((item, index) => `<button type="button" class="hltb-result" data-hltb-index="${index}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml([item.mainStory && `Main ${hoursLabel(item.mainStory)}`, item.mainExtra && `Main+ ${hoursLabel(item.mainExtra)}`, item.completionist && `100% ${hoursLabel(item.completionist)}`, item.allStyles && `All ${hoursLabel(item.allStyles)}`].filter(Boolean).join(' · ') || 'No submitted times')}</small></span><b>${Math.round(Number(item.similarity || 0) * 100)}%</b></button>`).join('') : '<p class="pegi-message">No HLTB matches found. You can keep the game without timing data.</p>';
    } catch (error) {
      if (sequence === searchSequence && titleInput.value.trim() === title) results.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)} <a href="https://howlongtobeat.com/" target="_blank" rel="noopener">Open HLTB ↗</a></p>`;
    } finally {
      if (sequence === searchSequence) { searchButton.disabled = false; searchButton.textContent = 'Look up times'; }
    }
  });

  titleInput.addEventListener('input', () => {
    if (results.hidden && !searchButton.disabled) return;
    resetSearch();
  });

  results.addEventListener('click', event => {
    const button = event.target.closest('[data-hltb-index]'); if (!button) return;
    const item = results._choices?.[Number(button.dataset.hltbIndex)]; if (!item) return;
    form._hltbMetadata = metadataFrom({ hltbId: item.id, hltbTitle: item.title, hltbUrl: item.url,
      hltbMainStory: item.mainStory, hltbMainExtra: item.mainExtra,
      hltbCompletionist: item.completionist, hltbAllStyles: item.allStyles, hltbUpdatedAt: new Date().toISOString() });
    results.hidden = true; render(); toast('HLTB times applied.');
  });
  $('#hltb-remove-button').addEventListener('click', clear);

  return { clear, load, payload: value, render };
}

export { cardTimes, createHltbLookup, hoursLabel, metadataFrom };
