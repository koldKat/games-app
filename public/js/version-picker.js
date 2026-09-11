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
    button.textContent = `${version.platform} · ${version.mediaFormat || 'copy'} · #${version.id}`;
    button.setAttribute('aria-pressed', String(version.id === game.id));
    button.disabled = version.id === game.id;
    button.addEventListener('click', () => onSelect(version));
    picker.append(button);
  }
  anchor.before(picker);
}
