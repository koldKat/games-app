import { api, button, cell, confirmAction, emptyRow, toast, busy } from './core.js';

export async function loadCatalogue() {
  const body = document.getElementById('catalogue-body'); body.replaceChildren();
  const query = document.getElementById('catalogue-query').value.trim();
  try {
    const games = await api('GET', `/api/admin/games?q=${encodeURIComponent(query)}`);
    document.getElementById('catalogue-count').textContent = `${games.length}${games.length === 250 ? '+' : ''} rows`;
    if (!games.length) return emptyRow(body, 8, 'No matching games.');
    games.forEach(game => {
      const row = body.insertRow();
      cell(row, game.id); cell(row, game.title, 'cell-title'); cell(row, game.platform); cell(row, game.pegi ?? '//'); cell(row, game.ownership); cell(row, game.username || 'UNASSIGNED');
      const cover = cell(row, game.hasCover ? 'YES' : 'NO', `state ${game.hasCover ? 'good' : 'warn'}`); cover.textContent = game.hasCover ? 'YES' : 'NO';
      const actions = cell(row, '', 'row-actions');
      const remove = button('Delete', 'danger', async () => {
        if (!await confirmAction({ title: 'Delete library entry?', message: `Permanently delete “${game.title}” from ${game.username || 'the unassigned pool'}?`, confirmLabel: 'Delete game', kicker: 'DESTRUCTIVE // GAME' })) return;
        await busy(remove, async () => { await api('DELETE', `/api/admin/games/${game.id}`); toast('Game deleted.'); await loadCatalogue(); });
      });
      actions.append(remove);
    });
  } catch (error) { emptyRow(body, 8, error.message); toast(error.message, true); }
}

document.getElementById('catalogue-search').addEventListener('submit', event => { event.preventDefault(); loadCatalogue(); });
let catalogueSearchTimer;
document.getElementById('catalogue-query').addEventListener('input', () => {
  clearTimeout(catalogueSearchTimer); catalogueSearchTimer = setTimeout(loadCatalogue, 250);
});
