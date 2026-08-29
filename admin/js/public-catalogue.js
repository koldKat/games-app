import { api, button, busy, cell, confirmAction, emptyRow, formatDate, toast } from './core.js';

const stateLabel = value => value === 'public' ? 'PUBLIC' : value === 'candidate' ? 'REVIEW' : 'REJECTED';
const editDialog = document.getElementById('catalogue-edit-dialog');
const editForm = document.getElementById('catalogue-edit-form');
const coverStatus = document.getElementById('catalogue-cover-status');

function formValue(name, value) { editForm.elements[name].value = value ?? ''; }
function openEditor(entry) {
  editForm.dataset.id = entry.id; document.getElementById('catalogue-edit-heading').textContent = `${entry.title} // ${entry.platform}`;
  for (const name of ['title', 'platform', 'publisher', 'pegi', 'releaseYear', 'pegiUrl', 'hltbId', 'hltbTitle', 'hltbUrl', 'hltbMainStory', 'hltbMainExtra', 'hltbCompletionist', 'hltbAllStyles', 'coverSource', 'coverMatchTitle', 'pegiAdvice', 'pegiOutline', 'pegiContentIssues', 'pegiOtherIssues']) formValue(name, entry[name]);
  formValue('pegiDescriptors', entry.pegiDescriptors?.join(', ')); formValue('pegiReleases', entry.pegiReleases?.join(', ')); formValue('coverRemoteUrl', '');
  coverStatus.textContent = entry.coverUrl ? `Current stored cover: ${entry.coverUrl}` : 'No cover is stored.';
  editDialog.showModal(); editForm.elements.title.focus();
}

async function changeStatus(entry, status, trigger) {
  await busy(trigger, async () => {
    await api('PATCH', `/api/admin/catalogue/${entry.id}`, { status });
    toast(status === 'public' ? 'Entry published.' : status === 'candidate' ? 'Entry returned to review.' : 'Entry rejected.');
    await loadPublicCatalogue();
  });
}

function actionsFor(row, entry) {
  const actions = cell(row, '', 'row-actions');
  actions.append(button('Edit', '', () => openEditor(entry)));
  if (entry.status === 'candidate') actions.append(button('Publish', 'primary', event => changeStatus(entry, 'public', event.currentTarget)));
  if (entry.status !== 'candidate') actions.append(button('Review', '', event => changeStatus(entry, 'candidate', event.currentTarget)));
  if (entry.status !== 'rejected') actions.append(button('Reject', '', event => changeStatus(entry, 'rejected', event.currentTarget)));
  const remove = button('Delete', 'danger', async () => {
    if (!await confirmAction({ title: 'Delete public Kat·a·log entry?', message: `Delete “${entry.title}” (${entry.platform}) and its Kat·a·log cover? Private library copies are unaffected.`, confirmLabel: 'Delete entry', kicker: 'DESTRUCTIVE // PUBLIC' })) return;
    await busy(remove, async () => { await api('DELETE', `/api/admin/catalogue/${entry.id}`); toast('Kat·a·log entry deleted.'); await loadPublicCatalogue(); });
  });
  actions.append(remove);
}

function closeEditor() { editDialog.close(); }
document.getElementById('catalogue-edit-close').addEventListener('click', closeEditor);
document.getElementById('catalogue-edit-cancel').addEventListener('click', closeEditor);
editDialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
editForm.addEventListener('submit', async event => {
  event.preventDefault();
  const save = editForm.querySelector('button[type="submit"]'); const data = Object.fromEntries(new FormData(editForm));
  delete data.coverRemoteUrl;
  await busy(save, async () => {
    await api('PATCH', `/api/admin/catalogue/${editForm.dataset.id}`, data);
    closeEditor(); toast('Public release updated.'); await loadPublicCatalogue();
  });
});
document.getElementById('catalogue-cover-replace').addEventListener('click', async event => {
  const url = editForm.elements.coverRemoteUrl.value.trim();
  if (!url) return toast('Enter a cover URL first.', true);
  await busy(event.currentTarget, async () => {
    const result = await api('PUT', `/api/admin/catalogue/${editForm.dataset.id}`, { url });
    editForm.elements.coverRemoteUrl.value = ''; coverStatus.textContent = `Current stored cover: ${result.entry.coverUrl}`;
    toast('Public cover replaced.'); await loadPublicCatalogue();
  });
});

export async function loadPublicCatalogue() {
  const body = document.getElementById('public-catalogue-body'); body.replaceChildren();
  const query = document.getElementById('public-catalogue-query').value.trim();
  const status = document.getElementById('public-catalogue-status').value;
  try {
    const result = await api('GET', `/api/admin/catalogue?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`);
    const { public: published = 0, candidate = 0, rejected = 0 } = result.counts;
    document.getElementById('public-catalogue-count').textContent = `${published} public · ${candidate} review · ${rejected} rejected`;
    if (!result.entries.length) return emptyRow(body, 8, 'No matching Kat·a·log entries.');
    result.entries.forEach(entry => {
      const row = body.insertRow();
      cell(row, entry.id); const title = cell(row, '', 'cell-title');
      if (entry.status === 'public') {
        const link = document.createElement('a'); link.href = `/game/${encodeURIComponent(entry.slug)}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = entry.title; title.append(link);
      } else title.textContent = entry.title;
      cell(row, entry.platform); cell(row, stateLabel(entry.status), `state ${entry.status === 'public' ? 'good' : entry.status}`);
      cell(row, `${entry.confidence}%`); cell(row, entry.reasons.length ? entry.reasons.join(', ') : 'exact', 'review-reasons'); cell(row, formatDate(entry.updatedAt));
      actionsFor(row, entry);
    });
  } catch (error) { emptyRow(body, 8, error.message); toast(error.message, true); }
}

document.getElementById('public-catalogue-search').addEventListener('submit', event => { event.preventDefault(); loadPublicCatalogue(); });
document.getElementById('public-catalogue-status').addEventListener('change', loadPublicCatalogue);
let publicCatalogueSearchTimer;
document.getElementById('public-catalogue-query').addEventListener('input', () => {
  clearTimeout(publicCatalogueSearchTimer); publicCatalogueSearchTimer = setTimeout(loadPublicCatalogue, 250);
});
