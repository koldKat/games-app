import { $ } from '../core/dom.js';
import { escapeHtml } from '../core/api.js';

let pegiFields;

function formValue(game, key, fallback = '') { return game?.[key] ?? fallback; }

function pegiMetadata(game = {}) {
  const source = game || {};
  return Object.fromEntries(pegiFields.map(key => [key, Array.isArray(source[key]) ? [...source[key]] : String(source[key] || '')]));
}

function renderPegiDetails() {
  const metadata = $('#game-form')._pegiMetadata || pegiMetadata();
  const descriptors = metadata.pegiDescriptors || []; const releases = metadata.pegiReleases || [];
  const textFields = [metadata.pegiAdvice, metadata.pegiOutline, metadata.pegiContentIssues, metadata.pegiOtherIssues];
  const hasDetails = descriptors.length || releases.length || textFields.some(Boolean);
  const details = $('#game-pegi-details'); details.hidden = !hasDetails;
  if (!hasDetails) { details.open = false; return; }
  $('#game-pegi-summary').textContent = [descriptors.length ? `${descriptors.length} descriptor${descriptors.length === 1 ? '' : 's'}` : '', releases.length ? `${releases.length} release${releases.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  $('#game-pegi-descriptors').innerHTML = descriptors.map(value => `<span class="pegi-detail-tag ${/purchases|random items/i.test(value) ? 'purchase' : ''}">${escapeHtml(value)}</span>`).join('');
  const purchaseLabels = descriptors.filter(value => /purchases|random items/i.test(value));
  $('#game-pegi-purchase-warning').hidden = purchaseLabels.length === 0;
  $('#game-pegi-purchase-text').textContent = purchaseLabels.join(' · ');
  $('#game-pegi-releases').innerHTML = releases.map(value => `<li>${escapeHtml(value)}</li>`).join('');
  const sections = [
    ['#game-pegi-releases-section', releases.length], ['#game-pegi-advice-section', metadata.pegiAdvice],
    ['#game-pegi-outline-section', metadata.pegiOutline], ['#game-pegi-content-section', metadata.pegiContentIssues],
    ['#game-pegi-other-section', metadata.pegiOtherIssues],
  ];
  for (const [selector, value] of sections) $(selector).hidden = !value;
  $('#game-pegi-advice').textContent = metadata.pegiAdvice; $('#game-pegi-outline').textContent = metadata.pegiOutline;
  $('#game-pegi-content').textContent = metadata.pegiContentIssues; $('#game-pegi-other').textContent = metadata.pegiOtherIssues;
  const source = $('#game-form').dataset.pegiUrl; $('#game-pegi-source').hidden = !source; if (source) $('#game-pegi-source').href = source;
}

export function initializeEditorPegiDetails() {
  pegiFields = ['pegiDescriptors', 'pegiReleases', 'pegiAdvice', 'pegiOutline', 'pegiContentIssues', 'pegiOtherIssues'];
}
export { pegiMetadata, formValue, renderPegiDetails };
