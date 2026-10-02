import { uniqueArtworkUrls } from './artwork-url.js';
import { UI_TIMING } from '../core/ui-policy.js';
import { runtime, state } from '../core/runtime.js';
import { $, $$ } from '../core/dom.js';
import { api } from '../core/api.js';

async function applyDecorativeCovers(slots, covers, isCurrent = () => true) {
  const candidates = uniqueArtworkUrls(covers);
  if (!slots.length || !candidates.length) return;
  const loaded = [];
  const loadCandidate = url => new Promise(resolve => {
    const preload = new Image(); let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timeout); preload.onload = null; preload.onerror = null; resolve(value); };
    const timeout = setTimeout(() => finish(''), UI_TIMING.artworkLoadTimeoutMs);
    preload.onload = () => finish(url); preload.onerror = () => finish(''); preload.src = url;
  });
  for (const candidate of candidates) {
    if (!isCurrent() || loaded.length >= slots.length) break;
    const url = await loadCandidate(candidate);
    if (!url || !isCurrent()) continue;
    loaded.push(url);
  }
  if (!isCurrent() || !loaded.length) return;
  if (document.activeElement?.matches('select')) {
    await new Promise(resolve => document.activeElement.addEventListener('blur', resolve, { once: true }));
  }
  if (!isCurrent()) return;
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index]; const url = loaded[index % loaded.length];
    slot.style.backgroundImage = `url(${JSON.stringify(url)})`; slot.classList.add('has-art');
  }
}

async function loadAuthCovers() {
  const sequence = ++runtime.authDecorationSequence;
  const isCurrent = () => sequence === runtime.authDecorationSequence && !$('#auth-screen').hidden;
  try {
    const response = await fetch(`/api/showcase/covers?v=${Date.now()}`, { cache: 'no-store' });
    let covers = response.ok ? (await response.json()).covers || [] : [];
    if (!covers.length) {
      const fallback = await fetch(`/cover-showcase.json?v=${Date.now()}`, { cache: 'no-store' });
      if (fallback.ok) covers = (await fallback.json()).covers || [];
    }
    const slots = [...$$('.promo-cover-deck i'), $('.promo-loose-cover'), ...$$('#auth-screen .auth-cover-field i')].filter(Boolean);
    await applyDecorativeCovers(slots, covers, isCurrent);
  } catch {}
}

async function loadAppBackgroundCovers(isCurrent) {
  const libraryCovers = uniqueArtworkUrls(state.games.map(game => game.coverUrl));
  let showcaseCovers = [];
  try {
    const response = await fetch(`/api/showcase/covers?v=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) showcaseCovers = (await response.json()).covers || [];
  } catch {}
  const covers = uniqueArtworkUrls([...libraryCovers, ...showcaseCovers]);
  for (let index = covers.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [covers[index], covers[swap]] = [covers[swap], covers[index]];
  }
  await applyDecorativeCovers($$('.app-cover-field i'), covers, isCurrent);
}

async function loadHeroCovers(isCurrent) {
  const slots = $$('#library-view .hero-cover');
  const fan = $('#library-view .cover-fan');
  const poolKey = `owned:${state.user?.id || ''}`;
  if (fan?.dataset.coverPool !== poolKey) {
    slots.forEach(slot => { slot.style.removeProperty('background-image'); slot.classList.remove('has-art'); });
    if (fan) fan.dataset.coverPool = poolKey;
  }
  if (!slots.length || slots.every(slot => slot.classList.contains('has-art'))) return;
  const showcase = await api('/api/showcase/covers?scope=owned');
  if (!isCurrent()) return;
  const covers = uniqueArtworkUrls(showcase.covers || []);
  for (let index = covers.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [covers[index], covers[swap]] = [covers[swap], covers[index]];
  }
  await applyDecorativeCovers(slots, covers, isCurrent);
}

async function stageAppDecorations(userId) {
  const sequence = ++runtime.decorationSequence;
  const isCurrent = () => sequence === runtime.decorationSequence && state.user?.id === userId;
  await loadHeroCovers(isCurrent);
  await loadAppBackgroundCovers(isCurrent);
}

export { loadAuthCovers, stageAppDecorations, loadHeroCovers };
