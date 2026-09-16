import { LOOKUP_MIN_TITLE_LENGTH, UI_LOCALE } from './ui-policy.js';

const fields = Object.freeze(['igdbId', 'igdbSlug', 'igdbUrl', 'igdbRating', 'igdbRatingCount', 'igdbCriticRating',
  'igdbCriticRatingCount', 'igdbGenres', 'igdbThemes', 'igdbDevelopers', 'igdbUpdatedAt']);

function metadataFrom(game = {}) {
  const source = game || {};
  return Object.fromEntries(fields.map(key => [key, Array.isArray(source[key]) ? [...source[key]] : source[key] ?? (key.endsWith('s') ? [] : '')]));
}
function resultMetadata(result = {}) {
  return {
    igdbId: result.igdbId || '', igdbSlug: result.slug || '', igdbUrl: result.sourceUrl || '',
    igdbRating: result.rating ?? '', igdbRatingCount: result.ratingCount || 0,
    igdbCriticRating: result.criticRating ?? '', igdbCriticRatingCount: result.criticRatingCount || 0,
    igdbGenres: result.genres || [], igdbThemes: result.themes || [], igdbDevelopers: result.developers || [],
    igdbUpdatedAt: new Date().toISOString(),
  };
}
function score(value, count) {
  return value == null || value === '' ? 'Not rated' : `${Number(value).toFixed(1)} / 100 · ${Number(count || 0).toLocaleString(UI_LOCALE)}`;
}
function safeHttpsUrl(value) {
  try { const parsed = new URL(String(value || '')); return parsed.protocol === 'https:' ? parsed.href : ''; }
  catch { return ''; }
}

export function igdbDetailsMarkup(game, escapeHtml) {
  if (!game?.igdbId) return '';
  const tags = [...(game.igdbGenres || []), ...(game.igdbThemes || [])].slice(0, 12);
  const sourceUrl = safeHttpsUrl(game.igdbUrl);
  const link = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">View source on IGDB ↗</a>` : '';
  return `<section class="game-detail-section game-detail-igdb"><header><span>DATABASE // IGDB</span><h3>IGDB information</h3></header>
    <div class="igdb-score-grid"><div><span>IGDB users</span><strong>${escapeHtml(score(game.igdbRating, game.igdbRatingCount))}</strong></div><div><span>Critics</span><strong>${escapeHtml(score(game.igdbCriticRating, game.igdbCriticRatingCount))}</strong></div></div>
    ${game.igdbDevelopers?.length ? `<p><b>Developer</b> ${escapeHtml(game.igdbDevelopers.join(' · '))}</p>` : ''}
    ${tags.length ? `<div class="game-detail-chips">${tags.map(tag => `<span class="badge descriptor">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}${link}</section>`;
}

export function createIgdbLookup({ $, api, escapeHtml, toast, selectedPlatform, setPlatformValue, platformFromReleaseText, isPcStorefront, renderCoverSelection }) {
  const form = $('#game-form'); const resultsBox = $('#igdb-results');
  function renderMatch() {
    const metadata = form._igdbMetadata || metadataFrom(); const panel = $('#game-igdb-details'); const linked = Number(metadata.igdbId) > 0;
    panel.hidden = !linked;
    if (!linked) return;
    $('#game-igdb-match-title').textContent = form.dataset.igdbTitle || $('#game-title').value || `IGDB #${metadata.igdbId}`;
    $('#game-igdb-user-score').textContent = score(metadata.igdbRating, metadata.igdbRatingCount);
    $('#game-igdb-critic-score').textContent = score(metadata.igdbCriticRating, metadata.igdbCriticRatingCount);
    $('#game-igdb-tags').textContent = [...(metadata.igdbGenres || []), ...(metadata.igdbThemes || [])].join(' · ') || 'No genres or themes supplied.';
    $('#game-igdb-source').href = safeHttpsUrl(metadata.igdbUrl) || 'https://www.igdb.com/';
  }
  function load(game = null) {
    form._igdbMetadata = metadataFrom(game); form.dataset.igdbTitle = game?.title || ''; renderMatch();
    resultsBox.hidden = true; resultsBox.replaceChildren();
  }
  function payload() { return form._igdbMetadata || metadataFrom(); }
  function apply(result) {
    if (!result?.igdbId) return;
    form._igdbMetadata = resultMetadata(result); form.dataset.igdbTitle = result.title || '';
    $('#game-title').value = result.title || $('#game-title').value;
    if (!$('#game-publisher').value) $('#game-publisher').value = result.publisher || '';
    if (!$('#game-year').value) $('#game-year').value = result.releaseYear || '';
    if (!$('#game-description').value && result.description) {
      $('#game-description').value = result.description; form.dataset.descriptionInitial = result.description;
      form.dataset.descriptionSource = 'IGDB'; form.dataset.descriptionSourceUrl = result.sourceUrl || '';
    }
    const mappedPlatforms = [...new Set((result.platforms || []).map(platformFromReleaseText).filter(Boolean))];
    const current = selectedPlatform();
    const currentIsRepresented = mappedPlatforms.includes(current) || (isPcStorefront(current) && mappedPlatforms.includes('PC (Windows)'));
    if (!currentIsRepresented && mappedPlatforms[0]) setPlatformValue(mappedPlatforms[0]);
    if (!form.dataset.coverUrl && !form.dataset.coverUpload && result.coverUrl) {
      form.dataset.coverUrl = result.coverUrl; form.dataset.coverSource = 'igdb'; form.dataset.coverMatchTitle = result.title || '';
      renderCoverSelection();
    }
    resultsBox.hidden = true; renderMatch(); toast('IGDB information applied. Save the game to keep it.');
  }
  function resultMarkup(result, index) {
    const details = [result.releaseYear, (result.platforms || []).slice(0, 3).join(', '), result.gameType].filter(Boolean).join(' · ');
    const cover = result.thumbnailUrl ? `<img src="${escapeHtml(result.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
    return `<button type="button" class="pegi-result igdb-result" data-igdb-index="${index}">${cover}<span><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml(details || 'IGDB')}</small></span></button>`;
  }
  async function search() {
    const title = $('#game-title').value.trim(); resultsBox.hidden = false;
    if (title.length < LOOKUP_MIN_TITLE_LENGTH) { resultsBox.innerHTML = '<p class="pegi-message">Type at least two title characters first.</p>'; return; }
    resultsBox.innerHTML = '<p class="pegi-message">Querying IGDB…</p>';
    try {
      const results = await api(`/api/igdb/search?q=${encodeURIComponent(title)}`); resultsBox._results = results;
      resultsBox.innerHTML = results.length ? results.map(resultMarkup).join('') : '<p class="pegi-message">No IGDB match found. Keep entering the game manually.</p>';
    } catch (error) { resultsBox.innerHTML = `<p class="pegi-message">${escapeHtml(error.message)} You can keep entering the game manually.</p>`; }
  }
  $('#igdb-search-button').addEventListener('click', () => void search());
  resultsBox.addEventListener('click', event => {
    const button = event.target.closest('[data-igdb-index]'); if (!button) return;
    apply(resultsBox._results?.[Number(button.dataset.igdbIndex)]);
  });
  $('#game-igdb-remove').addEventListener('click', () => { form._igdbMetadata = metadataFrom(); form.dataset.igdbTitle = ''; renderMatch(); });
  return { apply, load, payload };
}
