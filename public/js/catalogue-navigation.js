import { bindCatalogueAddForm, bindCatalogueSearch } from './catalogue-public.js';
import { controllerLoaderMarkup } from './controller-loader.js';

const CATALOGUE_PATH = /^\/(?:catalogue|game\/)/;

function isPrimaryNavigation(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function loadCatalogueStyles() {
  if (document.querySelector('link[data-catalogue-styles]')) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = '/css/catalogue.css'; stylesheet.dataset.catalogueStyles = 'true';
  document.head.append(stylesheet);
}

function pageFromResponse(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const main = parsed.querySelector('main.catalogue-main');
  if (!main) throw new Error('The Kat·a·log response could not be displayed.');
  return { main, title: parsed.title };
}

export function createCatalogueNavigation({ onLibraryVisible = () => {}, onGameAdded = () => {} } = {}) {
  const library = document.querySelector('#library-view');
  const catalogue = document.querySelector('#catalogue-view');
  const toggle = document.querySelector('.catalogue-button');
  const brand = document.querySelector('.brand');
  if (!library || !catalogue || !toggle || !brand) return { open: () => {}, showLibrary: () => {}, isOpen: () => false };

  let view = 'library';
  let request = null;
  const libraryTitle = document.title;

  function setHeader(nextView) {
    const catalogueOpen = nextView === 'catalogue';
    toggle.textContent = catalogueOpen ? 'My Kat·a·log' : 'Kat·a·log';
    toggle.href = catalogueOpen ? '/' : '/catalogue';
    toggle.dataset.catalogueDestination = catalogueOpen ? 'library' : 'catalogue';
    toggle.setAttribute('aria-label', catalogueOpen ? 'Open my Kat·a·log' : 'Open public Kat·a·log');
  }

  function showLibrary({ push = true } = {}) {
    request?.abort(); request = null;
    view = 'library'; library.hidden = false; catalogue.hidden = true;
    setHeader(view); document.title = libraryTitle;
    if (push && window.location.pathname !== '/') window.history.pushState({ appView: 'library' }, '', '/');
    onLibraryVisible();
  }

  async function open(url = '/catalogue', { push = true, focusSearch = false } = {}) {
    const target = new URL(url, window.location.origin);
    if (!CATALOGUE_PATH.test(target.pathname)) return showLibrary({ push });
    request?.abort(); const controller = new AbortController(); request = controller;
    view = 'catalogue'; library.hidden = true; catalogue.hidden = false;
    setHeader(view); loadCatalogueStyles();
    catalogue.innerHTML = `<div class="catalogue-navigation-loading library-loader" role="status">${controllerLoaderMarkup('Loading public Kat·a·log…')}</div>`;
    if (push && `${window.location.pathname}${window.location.search}` !== `${target.pathname}${target.search}`) {
      window.history.pushState({ appView: 'catalogue' }, '', `${target.pathname}${target.search}`);
    }
    try {
      const response = await fetch(`${target.pathname}${target.search}`, { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error(`Kat·a·log request failed (${response.status}).`);
      const { main, title } = pageFromResponse(await response.text());
      if (request !== controller) return;
      catalogue.replaceChildren(document.importNode(main, true));
      document.title = title || libraryTitle;
      bindCatalogueAddForm(catalogue, { onAdded: game => onGameAdded(game) });
      bindCatalogueSearch(catalogue, { navigate: targetUrl => void refreshResults(targetUrl) });
      if (focusSearch) {
        const input = catalogue.querySelector('.catalogue-search input[name="q"]');
        input?.focus(); input?.setSelectionRange(input.value.length, input.value.length);
      }
    } catch (error) {
      if (error.name === 'AbortError' || request !== controller) return;
      catalogue.innerHTML = '<div class="catalogue-empty"><strong>Kat·a·log unavailable.</strong><span>Please try again.</span></div>';
    } finally {
      if (request === controller) request = null;
    }
  }

  async function refreshResults(url) {
    const target = new URL(url, window.location.origin);
    if (target.pathname !== '/catalogue' || view !== 'catalogue') return open(url);
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

  toggle.addEventListener('click', event => {
    if (!isPrimaryNavigation(event)) return;
    event.preventDefault();
    if (view === 'catalogue') showLibrary(); else void open('/catalogue');
  });
  brand.addEventListener('click', event => {
    if (view !== 'catalogue' || !isPrimaryNavigation(event)) return;
    event.preventDefault(); showLibrary();
  });
  catalogue.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || !isPrimaryNavigation(event) || link.target || link.hasAttribute('download')) return;
    const target = new URL(link.href, window.location.origin);
    if (target.origin !== window.location.origin || !CATALOGUE_PATH.test(target.pathname)) return;
    event.preventDefault();
    if (target.pathname === '/catalogue' && view === 'catalogue') void refreshResults(`${target.pathname}${target.search}`);
    else void open(`${target.pathname}${target.search}`);
  });
  window.addEventListener('popstate', () => {
    if (CATALOGUE_PATH.test(window.location.pathname)) void open(`${window.location.pathname}${window.location.search}`, { push: false });
    else showLibrary({ push: false });
  });

  return { open, showLibrary, isOpen: () => view === 'catalogue' };
}
