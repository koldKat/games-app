// Patch opens a private operator-support thread; Ping is its account inbox.
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const kindLabel = { bug: 'Bug', idea: 'Idea', game_data: 'Game data', other: 'Other' };
const formatDate = value => value ? new Date(`${value.replace(' ', 'T')}Z`).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '//';

function dialogMarkup() {
  return `<dialog id="patch-dialog" class="patch-dialog"><form class="modal-card patch-card" id="patch-form" novalidate><header class="modal-head"><div><p class="kicker">OPERATOR LINK</p><h2>Send a Patch</h2></div><button class="close-button" type="button" data-patch-close aria-label="Close">×</button></header><p class="patch-copy">Report a bug, correct game facts, or send an idea directly to the Kat·a·log operator.</p><div id="patch-identity" class="form-grid"><label><span>Name</span><input id="patch-name" maxlength="64" autocomplete="name"></label><label><span>Email (optional)</span><input id="patch-email" type="email" maxlength="254" autocomplete="email"></label></div><div class="form-grid"><label><span>Type</span><select id="patch-kind"><option value="bug">Bug</option><option value="game_data">Game data correction</option><option value="idea">Idea</option><option value="other">Other</option></select></label><label class="span-2"><span>Message</span><textarea id="patch-body" maxlength="4000" required placeholder="What should be fixed, added, or corrected?"></textarea></label></div><p id="patch-error" class="form-error" hidden></p><footer class="modal-actions"><button class="button ghost" type="button" data-patch-close>Cancel</button><button class="button primary" type="submit">Send Patch</button></footer></form></dialog><dialog id="ping-dialog" class="patch-dialog ping-dialog"><section class="modal-card patch-card"><header class="modal-head"><div><p class="kicker">PRIVATE // SUPPORT</p><h2>Ping</h2></div><button class="close-button" type="button" data-ping-close aria-label="Close">×</button></header><div id="ping-list-view"><p class="patch-copy">Replies to your Patch conversations appear here.</p><div id="ping-list" class="ping-list"></div></div><div id="ping-thread-view" hidden><button class="text-button patch-back" type="button" data-ping-back>← All Ping threads</button><div id="ping-messages" class="ping-messages"></div><form id="ping-reply-form" class="ping-reply" novalidate><textarea id="ping-reply-body" rows="6" maxlength="4000" required placeholder="Reply to this thread"></textarea><p id="ping-error" class="form-error" hidden></p><footer class="modal-actions"><button id="ping-delete" class="button danger-text" type="button">Delete</button><button class="button primary" type="submit">Send reply</button></footer></form></div></section></dialog>`;
}
function navIcon(kind) {
  const path = kind === 'patch'
    ? '<path d="M5 5h8l6 6-8 8-6-6V5Z"/><path d="m9 9 .01 0"/>'
    : '<path d="M5 7h14v10H9l-4 3V7Z"/><path d="M8 11h8M8 14h5"/>';
  return `<svg class="header-nav-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}
function mountHeaderButtons() {
  for (const [selector, kind, label] of [['.top-actions [data-patch-open]', 'patch', 'Patch'], ['.top-actions [data-ping-open]', 'ping', 'Ping']]) {
    document.querySelectorAll(selector).forEach(button => {
      const badge = button.querySelector('[data-ping-badge]'); button.replaceChildren();
      button.setAttribute('aria-label', label); button.insertAdjacentHTML('beforeend', navIcon(kind));
      const text = document.createElement('span'); text.className = 'header-nav-label'; text.textContent = label; button.append(text);
      if (badge) button.append(badge);
    });
  }
}
function closeFromTrueBackdrop(dialog, close) {
  let began = false;
  dialog.addEventListener('pointerdown', event => { began = event.target === dialog; });
  dialog.addEventListener('pointerup', event => { if (began && event.target === dialog) close(); began = false; });
  dialog.addEventListener('pointercancel', () => { began = false; });
}
export function createPatchUi({ api, toast, getUser }) {
  mountHeaderButtons();
  document.body.insertAdjacentHTML('beforeend', dialogMarkup());
  const patchDialog = document.getElementById('patch-dialog'); const pingDialog = document.getElementById('ping-dialog');
  let threads = []; let currentId = null;
  const patchError = document.getElementById('patch-error'); const pingError = document.getElementById('ping-error');
  const closePatch = () => patchDialog.close(); const closePing = () => pingDialog.close();
  closeFromTrueBackdrop(patchDialog, closePatch); closeFromTrueBackdrop(pingDialog, closePing);
  document.querySelectorAll('[data-patch-close]').forEach(button => button.addEventListener('click', closePatch));
  document.querySelectorAll('[data-ping-close]').forEach(button => button.addEventListener('click', closePing));
  patchDialog.addEventListener('cancel', event => { event.preventDefault(); closePatch(); });
  pingDialog.addEventListener('cancel', event => { event.preventDefault(); closePing(); });
  function updateBadge(unread = 0) {
    document.querySelectorAll('[data-ping-badge]').forEach(item => { item.textContent = unread ? String(unread) : ''; item.hidden = !unread; });
    document.querySelectorAll('[data-ping-open]').forEach(item => item.classList.toggle('ping-attention', Boolean(unread)));
  }
  function updateAvailability(count = 0) {
    document.querySelectorAll('[data-ping-open]').forEach(button => {
      const empty = Number(count) === 0; button.disabled = empty; button.setAttribute('aria-disabled', String(empty)); button.title = empty ? 'No Ping conversations yet.' : 'Open Ping';
    });
  }
  updateAvailability(0);
  function renderList() {
    const host = document.getElementById('ping-list');
    if (!threads.length) { host.innerHTML = '<p class="patch-empty">No conversations yet.</p>'; return; }
    host.innerHTML = threads.map(item => {
      const last = item.messages?.at(-1); const preview = last?.body ? `${last.body.slice(0, 110)}${last.body.length > 110 ? '…' : ''}` : '';
      return `<button class="ping-item${item.userUnread ? ' unread' : ''}" type="button" data-ping-thread="${item.id}"><span><b>${escapeHtml(kindLabel[item.kind] || 'Patch')}</b><small>${escapeHtml(preview)}</small></span><time>${escapeHtml(formatDate(last?.createdAt || item.createdAt))}</time></button>`;
    }).join('');
    host.querySelectorAll('[data-ping-thread]').forEach(button => button.addEventListener('click', () => openThread(Number(button.dataset.pingThread))));
  }
  function renderThread(item) {
    document.getElementById('ping-messages').innerHTML = (item.messages || []).map(message => `<article class="ping-message ping-message--${message.sender}"><span>${message.sender === 'admin' ? 'KAT·A·LOG' : 'YOU'}</span><p>${escapeHtml(message.body).replace(/\n/g, '<br>')}</p><time>${escapeHtml(formatDate(message.createdAt))}</time></article>`).join('');
    const messages = document.getElementById('ping-messages'); requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  }
  async function openThread(id) {
    const item = threads.find(thread => thread.id === id); if (!item) return;
    currentId = id; item.userUnread = 0; updateBadge(threads.filter(thread => thread.userUnread).length); renderThread(item);
    document.getElementById('ping-list-view').hidden = true; document.getElementById('ping-thread-view').hidden = false; document.getElementById('ping-reply-body').value = ''; document.getElementById('ping-delete').dataset.confirm = ''; document.getElementById('ping-delete').textContent = 'Delete'; pingError.hidden = true;
    try { const result = await api(`/api/ping/${id}/read`, { method: 'POST' }); updateBadge(result.unread); } catch {}
  }
  async function openPing() {
    try {
      const result = await api('/api/ping'); threads = result.threads || []; updateBadge(result.unread); currentId = null;
      updateAvailability(threads.length);
      document.getElementById('ping-thread-view').hidden = true; document.getElementById('ping-list-view').hidden = false; renderList(); pingDialog.showModal();
    } catch (error) { toast(error.message); }
  }
  async function refreshUnread() {
    await refreshInboxState();
  }
  async function refreshInboxState() {
    if (!getUser()) return;
    try {
      const result = await api('/api/ping'); threads = result.threads || []; updateBadge(result.unread); updateAvailability(threads.length);
      if (!pingDialog.open) return;
      if (currentId) {
        const current = threads.find(item => item.id === currentId);
        if (current) renderThread(current);
        else document.querySelector('[data-ping-back]').click();
      } else renderList();
    } catch {}
  }
  function openPatch() {
    const user = getUser(); const identity = document.getElementById('patch-identity');
    identity.hidden = Boolean(user); document.getElementById('patch-name').required = !user;
    document.getElementById('patch-name').value = user?.username || ''; document.getElementById('patch-email').value = user?.email || '';
    document.getElementById('patch-kind').value = 'bug'; document.getElementById('patch-body').value = ''; patchError.hidden = true;
    patchDialog.showModal(); requestAnimationFrame(() => document.getElementById('patch-body').focus());
  }
  document.querySelectorAll('[data-patch-open]').forEach(button => button.addEventListener('click', openPatch));
  document.querySelectorAll('[data-ping-open]').forEach(button => button.addEventListener('click', openPing));
  document.getElementById('patch-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; const body = document.getElementById('patch-body').value.trim();
    if (!body) { patchError.textContent = 'Write a message before sending your Patch.'; patchError.hidden = false; return; }
    button.disabled = true;
    try { await api('/api/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.getElementById('patch-name').value, email: document.getElementById('patch-email').value, kind: document.getElementById('patch-kind').value, body }) }); closePatch(); if (getUser()) void refreshUnread(); toast(getUser() ? 'Patch sent. Replies will arrive in Ping.' : 'Patch sent. A reply will be emailed if you supplied an address.'); }
    catch (error) { patchError.textContent = error.message; patchError.hidden = false; } finally { button.disabled = false; }
  });
  document.querySelector('[data-ping-back]').addEventListener('click', () => { document.getElementById('ping-thread-view').hidden = true; document.getElementById('ping-list-view').hidden = false; renderList(); });
  document.getElementById('ping-reply-form').addEventListener('submit', async event => {
    event.preventDefault(); const body = document.getElementById('ping-reply-body').value.trim(); if (!body || !currentId) return;
    try { const result = await api(`/api/ping/${currentId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) }); const index = threads.findIndex(item => item.id === currentId); if (index >= 0) threads[index] = result.thread; document.getElementById('ping-reply-body').value = ''; renderThread(result.thread); }
    catch (error) { pingError.textContent = error.message; pingError.hidden = false; }
  });
  document.getElementById('ping-delete').addEventListener('click', async event => {
    const button = event.currentTarget;
    if (!currentId) return;
    if (button.dataset.confirm !== 'true') { button.dataset.confirm = 'true'; button.textContent = 'Confirm delete'; return; }
    const result = await api(`/api/ping/${currentId}`, { method: 'DELETE' }); button.dataset.confirm = ''; button.textContent = 'Delete'; threads = threads.filter(item => item.id !== currentId); updateBadge(result.unread); updateAvailability(threads.length); document.querySelector('[data-ping-back]').click();
  });
  return { openPatch, openPing, refreshUnread, handleEvent(event, data) { if (event === 'ping-updated') { updateBadge(data.unread); void refreshInboxState(); } } };
}
