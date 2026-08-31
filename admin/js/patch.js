import { api, confirmAction, toast } from './core.js';

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const kinds = { bug: 'BUG', idea: 'IDEA', game_data: 'GAME DATA', other: 'OTHER' };
const date = value => value ? new Date(`${value.replace(' ', 'T')}Z`).toLocaleString() : '//';

export async function loadPatch() {
  const meta = document.getElementById('patch-meta'); const host = document.getElementById('patch-list');
  try {
    const result = await api('GET', '/api/admin/patch'); const threads = result.threads || [];
    meta.textContent = `${threads.length} thread${threads.length === 1 ? '' : 's'}${result.unread ? ` // ${result.unread} unread` : ''}`;
    host.innerHTML = threads.length ? threads.map(thread => {
      const last = thread.messages?.at(-1); const messages = (thread.messages || []).map(message => `<article class="admin-patch-message admin-patch-message--${message.sender}"><span>${message.sender === 'admin' ? 'OPERATOR' : esc(thread.username || 'ANONYMOUS')}</span><p>${esc(message.body).replace(/\n/g, '<br>')}</p><time>${esc(date(message.createdAt))}</time></article>`).join('');
      return `<article class="admin-patch-card${thread.adminUnread ? ' unread' : ''}" data-admin-patch="${thread.id}"><header><button class="admin-patch-toggle" type="button" aria-expanded="false"><span><b>${esc(kinds[thread.kind] || 'PATCH')} // ${esc(thread.username || 'ANONYMOUS')}</b><small>${esc(last?.body?.slice(0, 130) || '')}</small></span><time>${esc(date(last?.createdAt || thread.createdAt))}</time></button></header><div class="admin-patch-body" hidden><div class="admin-patch-contact">${thread.email ? esc(thread.email) : 'No email supplied'} // ${thread.messages?.length || 0} message${thread.messages?.length === 1 ? '' : 's'}</div><div class="admin-patch-messages">${messages}</div><form class="admin-patch-reply"><textarea maxlength="4000" placeholder="Reply through Ping"></textarea><footer><button class="button primary" type="submit">Send reply</button><button class="button danger" type="button" data-admin-patch-delete>Remove from queue</button></footer></form></div></article>`;
    }).join('') : '<p class="panel-note">No Patch threads yet.</p>';
    host.querySelectorAll('[data-admin-patch]').forEach(card => {
      const id = Number(card.dataset.adminPatch); const toggle = card.querySelector('.admin-patch-toggle'); const body = card.querySelector('.admin-patch-body');
      toggle.addEventListener('click', async () => { const open = body.hidden; body.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if (open && card.classList.contains('unread')) { card.classList.remove('unread'); api('POST', `/api/admin/patch/${id}/read`).catch(() => {}); } });
      card.querySelector('.admin-patch-reply').addEventListener('submit', async event => { event.preventDefault(); const input = card.querySelector('textarea'); const bodyText = input.value.trim(); if (!bodyText) return; try { await api('POST', `/api/admin/patch/${id}/reply`, { body: bodyText }); toast('Reply delivered to Ping.'); loadPatch(); } catch (error) { toast(error.message, true); } });
      card.querySelector('[data-admin-patch-delete]').addEventListener('click', async () => { if (!await confirmAction({ title: 'Remove from Patch queue', message: 'This removes the thread from the admin queue. The sender can still retain their copy.', confirmLabel: 'Remove', kicker: 'PATCH // QUEUE' })) return; try { await api('DELETE', `/api/admin/patch/${id}`); loadPatch(); } catch (error) { toast(error.message, true); } });
    });
  } catch (error) { meta.textContent = error.message; host.innerHTML = ''; }
}
