import { bindCatalogueAddForm, bindCatalogueGameDialog, bindCatalogueSearch, openCatalogueGameDialog } from './catalogue-public.js';
import { bindForum } from './forum-page.js';

const CATALOGUE_PATH = /^\/(?:katalog|signal|forum(?:\/|$)|game\/)/;

function isPrimaryNavigation(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function loadCatalogueStyles(forum = false) {
  if (!document.querySelector('link[data-catalogue-styles]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet'; stylesheet.href = '/css/catalogue.css'; stylesheet.dataset.catalogueStyles = 'true';
    document.head.append(stylesheet);
  }
  if (forum && !document.querySelector('link[data-forum-styles]')) { const forumStylesheet = document.createElement('link'); forumStylesheet.rel = 'stylesheet'; forumStylesheet.href = '/css/forum.css'; forumStylesheet.dataset.forumStyles = 'true'; document.head.append(forumStylesheet); }
}

function pageFromResponse(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const main = parsed.querySelector('main.catalogue-main,main.forum-main');
  if (!main) throw new Error('The Kat·a·log response could not be displayed.');
  return { main, title: parsed.title };
}

export function createCatalogueNavigation({ onLibraryVisible = () => {}, onGameAdded = () => {}, onSignalVisible = () => {} } = {}) {
  const library = document.querySelector('#library-view');
  const catalogue = document.querySelector('#catalogue-view');
  const libraryButton = document.querySelector('.library-button');
  const catalogueButton = document.querySelector('.catalogue-button');
  const signal = document.querySelector('.signal-button');
  const forumButton = document.querySelector('.forum-button');
  const brand = document.querySelector('.brand');
  if (!library || !catalogue || !libraryButton || !catalogueButton || !brand) return { open: () => {}, showLibrary: () => {}, isOpen: () => false };

  let view = 'library';
  let request = null;
  let forumSource = null;
  let forumRefreshTimer = null;
  const libraryTitle = document.title;

  function stopForumLive() { clearTimeout(forumRefreshTimer); forumRefreshTimer = null; forumSource?.close(); forumSource = null; }
  function startForumLive() {
    if (forumSource) return;
    forumSource = new EventSource('/api/forum/stream');
    forumSource.addEventListener('forum-changed', () => {
      clearTimeout(forumRefreshTimer);
      forumRefreshTimer = setTimeout(() => { if (view === 'forum') void open(`${window.location.pathname}${window.location.search}`, { push: false }); }, 250);
    });
  }

  function setHeader(nextView) {
    const libraryOpen = nextView === 'library';
    const catalogueOpen = nextView === 'catalogue';
    libraryButton.classList.toggle('active', libraryOpen);
    catalogueButton.classList.toggle('active', catalogueOpen);
    libraryButton.setAttribute('aria-current', libraryOpen ? 'page' : 'false');
    catalogueButton.setAttribute('aria-current', catalogueOpen ? 'page' : 'false');
    signal?.classList.toggle('active', nextView === 'signal');
    signal?.setAttribute('aria-current', nextView === 'signal' ? 'page' : 'false');
    forumButton?.classList.toggle('active', nextView === 'forum');
    forumButton?.setAttribute('aria-current', nextView === 'forum' ? 'page' : 'false');
  }

  setHeader(view);

  function showLibrary({ push = true } = {}) {
    request?.abort(); request = null;
    stopForumLive();
    view = 'library'; library.hidden = false; catalogue.hidden = true;
    setHeader(view); document.title = libraryTitle;
    if (push && window.location.pathname !== '/') window.history.pushState({ appView: 'library' }, '', '/');
    onLibraryVisible();
  }

  async function open(url = '/katalog', { push = true, focusSearch = false } = {}) {
    const target = new URL(url, window.location.origin);
    if (!CATALOGUE_PATH.test(target.pathname)) return showLibrary({ push });
    request?.abort(); const controller = new AbortController(); request = controller;
    try {
      const response = await fetch(`${target.pathname}${target.search}`, { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error(`Kat·a·log request failed (${response.status}).`);
      const { main, title } = pageFromResponse(await response.text());
      if (request !== controller) return;
      const nextView = target.pathname === '/signal' ? 'signal' : target.pathname.startsWith('/forum') ? 'forum' : 'catalogue';
      if (nextView !== 'forum') stopForumLive();
      view = nextView; library.hidden = true; catalogue.hidden = false;
      setHeader(view); loadCatalogueStyles(view === 'forum');
      catalogue.replaceChildren(document.importNode(main, true));
      document.title = title || libraryTitle;
      if (view === 'signal') onSignalVisible();
      const destination = `${target.pathname}${target.search}${target.hash}`;
      if (push && `${window.location.pathname}${window.location.search}${window.location.hash}` !== destination) {
        window.history.pushState({ appView: 'catalogue' }, '', destination);
      }
      bindCatalogueAddForm(catalogue, { onAdded: game => onGameAdded(game), onOpenLibrary: () => showLibrary() });
      bindCatalogueGameDialog(catalogue, { onClose: () => {
        if (window.location.pathname.startsWith('/game/')) window.history.replaceState({ appView: 'catalogue' }, '', '/katalog');
        document.title = 'Public Kat·a·log // Game Kat·a·log';
      } });
      bindCatalogueSearch(catalogue, { navigate: targetUrl => void refreshResults(targetUrl) });
      if (view === 'forum') { bindForum(catalogue, { navigate: targetUrl => void open(targetUrl), refresh: () => void open(`${target.pathname}${target.search}`, { push: false }) }); startForumLive(); }
      if (focusSearch) {
        const input = catalogue.querySelector('.catalogue-search input[name="q"]');
        input?.focus(); input?.setSelectionRange(input.value.length, input.value.length);
      }
    } catch (error) {
      if (error.name === 'AbortError' || request !== controller) return;
      // Keep the current workspace intact if the public response cannot be loaded.
    } finally {
      if (request === controller) request = null;
    }
  }

  async function refreshResults(url) {
    const target = new URL(url, window.location.origin);
    if (target.pathname !== '/katalog' || view !== 'catalogue') return open(url);
    const current = catalogue.querySelector('.catalogue-results');
    if (!current) return open(url);
    request?.abort(); const controller = new AbortController(); request = controller;
    try {
      const response = await fetch(`${target.pathname}${target.search}`, { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error(`Kat·a·log request failed (${response.status}).`);
      const { main, title } = pageFromResponse(await response.text()); const next = main.querySelector('.catalogue-results');
      if (!next) throw new Error('Kat·a·log results could not be displayed.');
      if (request !== controller) return;
      current.replaceWith(document.importNode(next, true)); document.title = title || libraryTitle;
      window.history.replaceState({ appView: 'catalogue' }, '', `${target.pathname}${target.search}`);
    } catch (error) {
      if (error.name === 'AbortError' || request !== controller) return;
      void open(url);
    } finally {
      if (request === controller) request = null;
    }
  }

  catalogueButton.addEventListener('click', event => {
    if (!isPrimaryNavigation(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (view !== 'catalogue') void open('/katalog');
  }, { capture: true });
  libraryButton.addEventListener('click', event => {
    if (!isPrimaryNavigation(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (view !== 'library') showLibrary();
  }, { capture: true });
  signal?.addEventListener('click', event => {
    if (!isPrimaryNavigation(event)) return;
    event.preventDefault();
    if (view !== 'signal') void open('/signal');
  }, { capture: true });
  forumButton?.addEventListener('click', event => {
    if (!isPrimaryNavigation(event)) return;
    event.preventDefault();
    if (view !== 'forum') void open('/forum');
  }, { capture: true });
  brand.addEventListener('click', event => {
    if (view === 'library' || !isPrimaryNavigation(event)) return;
    event.preventDefault(); showLibrary();
  });
  catalogue.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || !isPrimaryNavigation(event) || link.target || link.hasAttribute('download')) return;
    const target = new URL(link.href, window.location.origin);
    if (target.origin === window.location.origin && link.dataset.catalogueDestination === 'library') {
      event.preventDefault(); showLibrary(); return;
    }
    if (target.origin !== window.location.origin || !CATALOGUE_PATH.test(target.pathname)) return;
    event.preventDefault();
    if (target.pathname.startsWith('/game/')) return void openCatalogueGameDialog(catalogue, `${target.pathname}${target.search}`);
    if (target.pathname === '/katalog' && view === 'catalogue') void refreshResults(`${target.pathname}${target.search}`);
    else void open(`${target.pathname}${target.search}${target.hash}`);
  });
  window.addEventListener('popstate', () => {
    if (CATALOGUE_PATH.test(window.location.pathname)) void open(`${window.location.pathname}${window.location.search}`, { push: false });
    else showLibrary({ push: false });
  });

  return { open, showLibrary, isOpen: () => view === 'catalogue' };
}
