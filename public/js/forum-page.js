async function api(url, options = {}) { const response = await fetch(url, { credentials: 'same-origin', ...options }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Forum request failed.'); return body; }
function message(container, value = '') {
  if (!container) return;
  let target = container.querySelector?.('[data-forum-error]');
  if (!target && value) { target = document.createElement('p'); target.dataset.forumError = ''; target.className = 'forum-inline-error'; target.setAttribute('role', 'status'); container.append(target); }
  if (target) target.textContent = value;
}
function formData(form) { return Object.fromEntries(new FormData(form)); }
export function bindForum(root = document, { navigate = url => { window.location.href = url; }, refresh = () => window.location.reload() } = {}) {
  const composer = root.querySelector('[data-forum-inline-composer]');
  const openComposer = () => { if (!composer) return false; composer.hidden = false; composer.querySelector('[name="title"]')?.focus(); return true; };
  root.querySelectorAll('[data-forum-new-thread]').forEach(button => button.addEventListener('click', openComposer));
  root.querySelectorAll('[data-forum-inline-close]').forEach(button => button.addEventListener('click', () => { if (composer) composer.hidden = true; }));
  const threadForm = root.querySelector('[data-forum-thread-form]');
  threadForm?.addEventListener('submit', async event => { event.preventDefault(); const button = threadForm.querySelector('[type="submit"]'); button.disabled = true; message(threadForm); try { const item = await api('/api/forum/threads', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(formData(threadForm)) }); navigate(`/forum/thread/${item.thread.id}`); } catch (error) { message(threadForm, error.message); } finally { button.disabled = false; } });
  const replyForm = root.querySelector('[data-forum-reply-form]'); const threadId = root.querySelector('[data-forum-thread-id]')?.dataset.forumThreadId;
  replyForm?.addEventListener('submit', async event => { event.preventDefault(); const button = replyForm.querySelector('[type="submit"]'); button.disabled = true; message(replyForm); try { await api(`/api/forum/threads/${threadId}/posts`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(formData(replyForm)) }); refresh(); } catch (error) { message(replyForm, error.message); } finally { button.disabled = false; } });
  root.querySelectorAll('[data-forum-edit-thread],[data-forum-edit-post]').forEach(button => button.addEventListener('click', () => {
    const post = button.closest('[data-forum-thread],[data-forum-post]'); const body = post?.querySelector('[data-forum-body]'); if (!post || !body || post.querySelector('textarea')) return; const originalText = body.textContent.trim(); const isThread = button.hasAttribute('data-forum-edit-thread'); const title = isThread ? root.querySelector('.forum-hero h1')?.textContent || '' : ''; body.dataset.original = body.innerHTML; body.innerHTML = `${isThread ? `<input data-forum-edit-title maxlength="180" value="${title.replaceAll('&','&amp;').replaceAll('"','&quot;')}">` : ''}<textarea data-forum-edit-body rows="6"></textarea><div class="forum-edit-actions"><button type="button" data-forum-edit-save>Save</button><button type="button" data-forum-edit-cancel>Cancel</button></div>`; body.querySelector('textarea').value = originalText; body.querySelector('[data-forum-edit-cancel]').onclick = () => { body.innerHTML = body.dataset.original; }; body.querySelector('[data-forum-edit-save]').onclick = async () => { try { const id = isThread ? button.dataset.forumEditThread : button.dataset.forumEditPost; await api(isThread ? `/api/forum/threads/${id}` : `/api/forum/posts/${id}`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(isThread ? { title:body.querySelector('[data-forum-edit-title]').value, body:body.querySelector('[data-forum-edit-body]').value } : { body:body.querySelector('[data-forum-edit-body]').value }) }); refresh(); } catch (error) { message(post, error.message); } }; }));
  root.querySelectorAll('[data-forum-delete-thread],[data-forum-delete-post]').forEach(button => button.addEventListener('click', async () => { const isThread = button.hasAttribute('data-forum-delete-thread'); const article = button.closest('article'); const label = isThread ? 'Delete thread' : 'Delete reply'; if (!button.dataset.confirming) { button.dataset.confirming = 'true'; button.textContent = `Confirm ${label.toLowerCase()}`; window.setTimeout(() => { if (!button.isConnected || !button.dataset.confirming) return; delete button.dataset.confirming; button.textContent = label; }, 6000); return; } button.disabled = true; message(article); try { const id = isThread ? button.dataset.forumDeleteThread : button.dataset.forumDeletePost; await api(isThread ? `/api/forum/threads/${id}` : `/api/forum/posts/${id}`, { method:'DELETE' }); if (isThread) navigate('/forum'); else refresh(); } catch (error) { delete button.dataset.confirming; button.textContent = label; message(article, error.message); } finally { button.disabled = false; } }));
  return { refresh, openComposer };
}

if (document.querySelector('.forum-main')) {
  const controller = bindForum(document);
  const source = new EventSource('/api/forum/stream'); let timer;
  source.addEventListener('forum-changed', () => { clearTimeout(timer); timer = setTimeout(() => controller.refresh(), 300); });
  window.addEventListener('pagehide', () => source.close(), { once:true });
}
