import { api, button, confirmAction, toast } from './core.js';
import { formatAnnouncementBody } from '/js/announcement-format.js';

let editingId = null;
let editingDraft = false;

const $ = selector => document.querySelector(selector);
const cleanBody = value => String(value || '').split('\n').map(line => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const date = value => value ? new Date(String(value).replace(' ', 'T') + 'Z').toLocaleString() : '//';

function resetComposer() {
  editingId = null; editingDraft = false;
  $('#announcement-form').reset(); $('#announcement-error').hidden = true;
  $('#announcement-form-mode').textContent = 'NEW ANNOUNCEMENT';
  $('#announcement-cancel-edit').hidden = true;
}

function startEdit(item) {
  editingId = item.id; editingDraft = item.draft;
  $('#announcement-title').value = item.title; $('#announcement-body').value = item.body;
  $('#announcement-error').hidden = true;
  $('#announcement-form-mode').textContent = item.draft ? 'EDIT DRAFT' : 'EDIT PUBLISHED ANNOUNCEMENT';
  $('#announcement-cancel-edit').hidden = false;
  $('#announcement-title').focus();
  $('#panel-announcements').scrollIntoView({ block: 'start' });
}

function card(item, refresh) {
  const element = document.createElement('article'); element.className = `announcement-card${item.pinned ? ' pinned' : ''}`;
  const meta = item.draft ? `Created ${date(item.createdAt)}` : `Published ${date(item.publishedAt)}`;
  element.innerHTML = `<header><strong>${item.title}</strong>${item.pinned ? '<span>PINNED</span>' : ''}</header><div class="announcement-card-body">${formatAnnouncementBody(item.body)}</div><small>${meta}</small><footer></footer>`;
  const actions = element.querySelector('footer');
  actions.append(button('Edit', '', () => startEdit(item)));
  if (item.draft) actions.append(button('Publish', 'primary', async () => { await api('POST', `/api/admin/announcements/${item.id}/publish`); toast('Announcement published.'); await refresh(); }));
  else {
    actions.append(button(item.pinned ? 'Unpin' : 'Pin', '', async () => { await api('POST', `/api/admin/announcements/${item.id}/${item.pinned ? 'unpin' : 'pin'}`); await refresh(); }));
    actions.append(button('Unpublish', '', async () => { await api('POST', `/api/admin/announcements/${item.id}/unpublish`); await refresh(); }));
  }
  actions.append(button('Delete', 'danger', async () => {
    if (!await confirmAction({ title: 'Delete announcement?', message: 'This removes the notice permanently from the control plane and Signal.', confirmLabel: 'Delete', kicker: 'IRREVERSIBLE' })) return;
    await api('DELETE', `/api/admin/announcements/${item.id}`); if (editingId === item.id) resetComposer(); await refresh();
  }));
  return element;
}

export async function loadAnnouncements() {
  const rows = await api('GET', '/api/admin/announcements');
  const drafts = rows.filter(item => item.draft); const published = rows.filter(item => !item.draft);
  $('#announcement-draft-count').textContent = String(drafts.length); $('#announcement-published-count').textContent = String(published.length);
  for (const [host, items, empty] of [[ $('#announcement-drafts'), drafts, 'No drafts waiting.' ], [ $('#announcement-published'), published, 'No published notices.' ]]) {
    host.replaceChildren();
    if (!items.length) { const message = document.createElement('p'); message.className = 'announcement-empty'; message.textContent = empty; host.append(message); }
    else for (const item of items) host.append(card(item, loadAnnouncements));
  }
}

$('#announcement-form').addEventListener('submit', async event => {
  event.preventDefault();
  const title = $('#announcement-title').value.trim(); const body = cleanBody($('#announcement-body').value);
  const error = $('#announcement-error');
  if (!title || !body) { error.textContent = 'Title and message are required.'; error.hidden = false; return; }
  error.hidden = true;
  const publish = event.submitter?.dataset.announcementIntent === 'publish';
  try {
    if (editingId) {
      await api('PATCH', `/api/admin/announcements/${editingId}`, { title, body });
      if (publish && editingDraft) await api('POST', `/api/admin/announcements/${editingId}/publish`);
    } else {
      const { announcement } = await api('POST', '/api/admin/announcements', { title, body });
      if (publish) await api('POST', `/api/admin/announcements/${announcement.id}/publish`);
    }
    toast(publish ? 'Announcement published to Signal.' : 'Draft saved.'); resetComposer(); await loadAnnouncements();
  } catch (problem) { error.textContent = problem.message || 'Announcement could not be saved.'; error.hidden = false; }
});

$('#announcement-cancel-edit').addEventListener('click', resetComposer);
