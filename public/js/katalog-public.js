import { mountThemedSearchClears } from './search-clears.js';

export function bindKatalogAddForm(root = document, { onAdded = () => {}, onOpenLibrary = () => window.location.assign('/') } = {}) {
  const form = root.querySelector('[data-katalog-add]');
  if (!form || form.dataset.katalogBound === 'true') return;
  form.dataset.katalogBound = 'true';
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
      const response = await fetch(`/api/catalogue/${form.dataset.katalogAdd}/library`, {
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

let titleResizeTimer = null;
let titleResizeBound = false;
function updateKatalogTitleTooltips(root = document) {
  root.querySelectorAll('[data-katalog-title]').forEach(title => {
    const text = title.firstElementChild;
    title.dataset.truncated = String(Boolean(text && text.scrollWidth > text.clientWidth));
  });
}
export function bindKatalogTitleTooltips(root = document) {
  requestAnimationFrame(() => updateKatalogTitleTooltips(root));
  if (titleResizeBound) return;
  titleResizeBound = true;
  window.addEventListener('resize', () => {
    clearTimeout(titleResizeTimer);
    titleResizeTimer = setTimeout(() => updateKatalogTitleTooltips(), 120);
  }, { passive: true });
}

async function loadPublicBackgroundCovers() {
  if (!document.body.classList.contains('katalog-document')) return;
  const slots = [...document.querySelectorAll('.app-cover-field i')];
  if (!slots.length) return;
  try {
    const response = await fetch('/api/showcase/covers', { cache: 'no-store' });
    const covers = response.ok ? (await response.json()).covers || [] : [];
    for (let index = 0; index < slots.length && covers.length; index++) {
      const url = String(covers[index % covers.length] || '');
      if (!url) continue;
      await new Promise(resolve => {
        const image = new Image();
        image.onload = () => { slots[index].style.backgroundImage = `url(${JSON.stringify(url)})`; slots[index].classList.add('has-art'); resolve(); };
        image.onerror = () => resolve();
        image.src = url;
      });
    }
  } catch {}
}

export function bindKatalogGameDialog(root = document, { onClose = null } = {}) {
  const dialog = root.querySelector('[data-katalog-game-dialog]');
  if (!dialog || dialog.dataset.katalogGameBound === 'true') return;
  dialog.dataset.katalogGameBound = 'true';
  const close = () => dialog.close();
  dialog.querySelector('[data-katalog-game-close]')?.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => {
    if (dialog.dataset.skipCloseNavigation === 'true') { delete dialog.dataset.skipCloseNavigation; return; }
    if (onClose) onClose();
    else if (window.location.pathname.startsWith('/game/')) {
      window.history.replaceState({ katalog: true }, '', '/katalog');
      document.title = 'Public Kat·a·log // Game Kat·a·log';
    }
  });
  if (dialog.open) dialog.close();
  dialog.showModal();
}

let katalogGameSequence = 0;
export async function openKatalogGameDialog(root = document, url, { returnUrl = window.location.pathname === '/signal' ? '/signal' : '/katalog' } = {}) {
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin || !target.pathname.startsWith('/game/')) return;
  const sequence = ++katalogGameSequence;
  try {
    const response = await fetch(`${target.pathname}${target.search}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Game details could not be loaded.');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const next = parsed.querySelector('[data-katalog-game-dialog]');
    const main = root.querySelector('main.katalog-main');
    if (!next || !main || sequence !== katalogGameSequence) throw new Error('Game details could not be displayed.');
    main.querySelector('[data-katalog-game-dialog]')?.remove();
    main.append(document.importNode(next, true));
    window.history.pushState({ katalog: true }, '', `${target.pathname}${target.search}`);
    bindKatalogGameDialog(root, { onClose: () => {
      window.history.replaceState({ katalog: true }, '', returnUrl);
      document.title = returnUrl === '/signal' ? 'Kat·a·log Signal // Game Kat·a·log' : 'Public Kat·a·log // Game Kat·a·log';
    } });
    bindKatalogAddForm(root);
  } catch {
    window.location.assign(`${target.pathname}${target.search}`);
  }
}

let katalogSearchSequence = 0;
export function bindKatalogSearch(root = document, { navigate } = {}) {
  const form = root.querySelector('.katalog-search');
  if (!form || form.dataset.katalogSearchBound === 'true') return;
  form.dataset.katalogSearchBound = 'true'; let timer;
  const urlForForm = () => {
    const data = new FormData(form); const params = new URLSearchParams();
    for (const [key, value] of data) if (String(value).trim()) params.set(key, String(value).trim());
    return `/katalog${params.size ? `?${params}` : ''}`;
  };
  const update = () => {
    clearTimeout(timer); timer = setTimeout(() => {
      const target = urlForForm();
      if (navigate) navigate(target); else void navigateKatalog(target);
    }, 250);
  };
  form.addEventListener('submit', event => {
    event.preventDefault(); clearTimeout(timer); const target = urlForForm();
    if (navigate) navigate(target); else void navigateKatalog(target);
  });
  form.querySelector('input[name="q"]')?.addEventListener('input', update);
  form.querySelector('select[name="platform"]')?.addEventListener('change', () => { clearTimeout(timer); const target = urlForForm(); if (navigate) navigate(target); else void navigateKatalog(target); });
  form.closest('main.katalog-main')?.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
    const target = new URL(link.href, window.location.origin);
    if (target.origin !== window.location.origin) return;
    if (target.pathname.startsWith('/game/')) {
      event.preventDefault(); event.stopPropagation(); void openKatalogGameDialog(root, `${target.pathname}${target.search}`); return;
    }
    if (!link.closest('.katalog-results') || target.pathname !== '/katalog') return;
    event.preventDefault(); event.stopPropagation(); clearTimeout(timer);
    if (navigate) navigate(`${target.pathname}${target.search}`); else void navigateKatalog(`${target.pathname}${target.search}`);
  });
}

async function navigateKatalog(url) {
  const sequence = ++katalogSearchSequence;
  try {
    const response = await fetch(url, { credentials: 'same-origin' }); if (!response.ok) throw new Error('Search failed.');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html'); const next = parsed.querySelector('.katalog-results');
    const current = document.querySelector('.katalog-results'); if (!next || !current) throw new Error('Search failed.');
    if (sequence !== katalogSearchSequence) return;
    current.replaceWith(next); bindKatalogTitleTooltips(); history.replaceState({ katalog: true }, '', url);
  } catch { window.location.assign(url); }
}

bindKatalogAddForm();
bindKatalogSearch();
bindKatalogGameDialog();
bindKatalogTitleTooltips();
mountThemedSearchClears();
void loadPublicBackgroundCovers();
