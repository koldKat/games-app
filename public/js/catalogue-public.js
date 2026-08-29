export function bindCatalogueAddForm(root = document, { onAdded = () => {}, onOpenLibrary = () => window.location.assign('/') } = {}) {
  const form = root.querySelector('[data-catalogue-add]');
  if (!form || form.dataset.catalogueBound === 'true') return;
  form.dataset.catalogueBound = 'true';
  const button = form.querySelector('button[type="submit"]');
  const message = form.querySelector('[data-add-message]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.added === 'true') {
      onOpenLibrary();
      return;
    }
    button.disabled = true;
    button.textContent = 'Adding…';
    message.textContent = '';
    message.classList.remove('error', 'success');
    try {
      const response = await fetch(`/api/catalogue/${form.dataset.catalogueAdd}/library`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const body = await response.json().catch(() => ({}));
      const existing = response.status === 409 && body.existing;
      if (!response.ok && !existing) throw new Error(body.error || 'Could not add this game.');
      message.textContent = existing ? 'Already in your library.' : 'Added to your library.';
      message.classList.add('success');
      form.dataset.added = 'true';
      button.textContent = 'Open my Kat·a·log';
      button.disabled = false;
      onAdded(existing || body.game);
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('error');
      button.disabled = false;
      button.textContent = 'Add to my Kat·a·log';
    }
  });
}

export function bindCatalogueGameDialog(root = document, { onClose = null } = {}) {
  const dialog = root.querySelector('[data-catalogue-game-dialog]');
  if (!dialog || dialog.dataset.catalogueGameBound === 'true') return;
  dialog.dataset.catalogueGameBound = 'true';
  const close = () => dialog.close();
  dialog.querySelector('[data-catalogue-game-close]')?.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => {
    if (onClose) onClose();
    else if (window.location.pathname.startsWith('/game/')) {
      window.history.replaceState({ catalogue: true }, '', '/katalog');
      document.title = 'Public Kat·a·log | Game Kat·a·log';
    }
  });
  if (dialog.open) dialog.close();
  dialog.showModal();
}

let catalogueSearchSequence = 0;
export function bindCatalogueSearch(root = document, { navigate } = {}) {
  const form = root.querySelector('.catalogue-search');
  if (!form || form.dataset.catalogueSearchBound === 'true') return;
  form.dataset.catalogueSearchBound = 'true'; let timer;
  const urlForForm = () => {
    const data = new FormData(form); const params = new URLSearchParams();
    for (const [key, value] of data) if (String(value).trim()) params.set(key, String(value).trim());
    return `/katalog${params.size ? `?${params}` : ''}`;
  };
  const update = () => {
    clearTimeout(timer); timer = setTimeout(() => {
      const target = urlForForm();
      if (navigate) navigate(target); else void navigateCatalogue(target);
    }, 250);
  };
  form.addEventListener('submit', event => {
    event.preventDefault(); clearTimeout(timer); const target = urlForForm();
    if (navigate) navigate(target); else void navigateCatalogue(target);
  });
  form.querySelector('input[name="q"]')?.addEventListener('input', update);
  form.querySelector('select[name="platform"]')?.addEventListener('change', () => { clearTimeout(timer); const target = urlForForm(); if (navigate) navigate(target); else void navigateCatalogue(target); });
  form.closest('main.catalogue-main')?.addEventListener('click', event => {
    const link = event.target.closest('.catalogue-results a[href]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
    const target = new URL(link.href, window.location.origin);
    if (target.origin !== window.location.origin || target.pathname !== '/katalog') return;
    event.preventDefault(); event.stopPropagation(); clearTimeout(timer);
    if (navigate) navigate(`${target.pathname}${target.search}`); else void navigateCatalogue(`${target.pathname}${target.search}`);
  });
}

async function navigateCatalogue(url) {
  const sequence = ++catalogueSearchSequence;
  try {
    const response = await fetch(url, { credentials: 'same-origin' }); if (!response.ok) throw new Error('Search failed.');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html'); const next = parsed.querySelector('.catalogue-results');
    const current = document.querySelector('.catalogue-results'); if (!next || !current) throw new Error('Search failed.');
    if (sequence !== catalogueSearchSequence) return;
    current.replaceWith(next); history.replaceState({ catalogue: true }, '', url);
  } catch { window.location.assign(url); }
}

bindCatalogueAddForm();
bindCatalogueSearch();
bindCatalogueGameDialog();
