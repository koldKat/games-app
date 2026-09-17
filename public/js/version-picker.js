import { platformDisplayName, platformThemeClass } from './platforms.js';

export function renderVersionPicker(host, game, games, groupGames, onSelect, anchor) {
  if (!host || !anchor) return;
  host.querySelector('[data-version-picker]')?.remove();
  if (!game) return;
  const group = groupGames(games).find(item => item.versions.some(version => version.id === game.id));
  if (!group || group.versions.length < 2) return;
  const picker = document.createElement('div');
  picker.dataset.versionPicker = 'true';
  picker.className = 'game-versions';
  picker.setAttribute('aria-label', 'Choose your copy');
  for (const version of group.versions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add(platformThemeClass(version.platform));
    button.textContent = `${platformDisplayName(version.platform)} · ${version.mediaFormat || 'copy'} · #${version.id}`;
    button.setAttribute('aria-pressed', String(version.id === game.id));
    button.disabled = version.id === game.id;
    button.addEventListener('click', () => onSelect(version));
    picker.append(button);
  }
  anchor.before(picker);
}

function platformLabel(version, versions) {
  const duplicatePlatform = versions.filter(copy => copy.platform === version.platform).length > 1;
  return `${platformDisplayName(version.platform)}${duplicatePlatform ? ` · #${version.id}` : ''}`;
}

export function cardVersionControl(game, escapeHtml, formatLabels) {
  const versions = game.versions || [game];
  const current = platformLabel(game, versions);
  const currentTheme = platformThemeClass(game.platform);
  if (versions.length < 2) {
    return `<span class="platform-tag ${currentTheme}"><span class="platform-tag-label">${escapeHtml(current)}</span></span>`;
  }
  const menuId = `card-version-menu-${game.id}`;
  const options = versions.map(version => {
    const label = platformLabel(version, versions);
    const format = formatLabels[version.mediaFormat] || version.mediaFormat || 'Unknown format';
    return `<button type="button" class="${platformThemeClass(version.platform)}" role="menuitemradio" aria-checked="${version.id === game.id}" data-action="version" data-game-id="${version.id}"><span>${escapeHtml(label)}</span><small>${escapeHtml(format)} // #${version.id}</small></button>`;
  }).join('');
  return `<div class="platform-picker"><button type="button" class="platform-tag platform-switch ${currentTheme}" data-action="version-menu" aria-expanded="false" aria-haspopup="menu" aria-controls="${menuId}"><span class="platform-tag-label">${escapeHtml(current)}</span><span class="platform-switch-indicator" aria-hidden="true"></span></button><div class="platform-version-menu" id="${menuId}" role="menu" aria-label="Choose a recorded copy" hidden>${options}</div></div>`;
}

export function closeCardVersionMenus(root, { restoreFocus = false } = {}) {
  const open = root?.querySelector('.platform-picker.is-open');
  if (!open) return false;
  const trigger = open.querySelector('.platform-switch');
  const menu = open.querySelector('.platform-version-menu');
  open.classList.remove('is-open', 'opens-up');
  open.closest('.game-card')?.classList.remove('version-menu-open');
  trigger?.setAttribute('aria-expanded', 'false');
  if (menu) menu.hidden = true;
  if (restoreFocus) trigger?.focus({ preventScroll: true });
  return true;
}

export function toggleCardVersionMenu(root, picker) {
  const menu = picker?.querySelector('.platform-version-menu');
  const trigger = picker?.querySelector('.platform-switch');
  if (!menu || !trigger) return;
  const opening = menu.hidden;
  closeCardVersionMenus(root);
  if (!opening) return;
  menu.hidden = false;
  picker.classList.add('is-open');
  picker.closest('.game-card')?.classList.add('version-menu-open');
  trigger.setAttribute('aria-expanded', 'true');
  const bounds = menu.getBoundingClientRect();
  if (bounds.bottom > window.innerHeight - 8 && bounds.top > menu.offsetHeight + 8) picker.classList.add('opens-up');
}

export function handleCardVersionMenuKeydown(event, root) {
  const picker = event.target.closest('.platform-picker');
  if (!picker) return false;
  const menu = picker.querySelector('.platform-version-menu');
  const options = [...(menu?.querySelectorAll('[role="menuitemradio"]') || [])];
  if (event.target.matches('.platform-switch') && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    if (menu.hidden) toggleCardVersionMenu(root, picker);
    const target = event.key === 'ArrowUp' ? options.at(-1) : options[0];
    target?.focus();
    return true;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCardVersionMenus(root, { restoreFocus: true });
    return true;
  }
  if (!options.includes(event.target) || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return false;
  event.preventDefault();
  const current = options.indexOf(event.target);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
    : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[next]?.focus();
  return true;
}

export function handleCardVersionMenuFocusin(event, root) {
  const open = root?.querySelector('.platform-picker.is-open');
  if (open && !open.contains(event.target)) closeCardVersionMenus(root);
}
