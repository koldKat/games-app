import { api, busy, cell, confirmAction, emptyRow, formatBytes, formatDate, toast } from './core.js';

export async function loadVersion() {
  try { const data = await api('GET', '/api/admin/version'); document.getElementById('version-input').value = data.version; document.getElementById('header-version').textContent = data.version; }
  catch (error) { toast(error.message, true); }
}

export async function loadBackups() {
  const body = document.getElementById('backups-body'); body.replaceChildren();
  try {
    const backups = await api('GET', '/api/admin/backups');
    if (!backups.length) return emptyRow(body, 4, 'No local backups.');
    backups.forEach(backup => {
      const row = body.insertRow(); cell(row, backup.name, 'cell-title'); cell(row, formatBytes(backup.bytes)); cell(row, formatDate(backup.createdAt));
      const actions = cell(row, '', 'row-actions');
      const remove = document.createElement('button'); remove.className = 'button danger'; remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        if (!await confirmAction({ title: 'Delete backup?', message: `${backup.name} will be permanently removed.`, confirmLabel: 'Delete backup', kicker: 'DESTRUCTIVE // BACKUP' })) return;
        await busy(remove, async () => { await api('DELETE', `/api/admin/backups/${encodeURIComponent(backup.name)}`); toast('Backup deleted.'); await loadBackups(); });
      }); actions.append(remove);
    });
  } catch (error) { emptyRow(body, 4, error.message); toast(error.message, true); }
}

document.getElementById('version-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.currentTarget.querySelector('button');
  await busy(submit, async () => {
    try { const data = await api('PUT', '/api/admin/version', { version: document.getElementById('version-input').value }); document.getElementById('header-version').textContent = data.version; toast(`Version written: ${data.version}`); }
    catch (error) { toast(error.message, true); }
  });
});

document.querySelectorAll('[data-db-action]').forEach(control => control.addEventListener('click', async () => {
  const action = control.dataset.dbAction;
  if (action === 'vacuum' && !await confirmAction({ title: 'Vacuum database?', message: 'SQLite will rebuild the database file and may briefly block requests.', confirmLabel: 'Run vacuum', kicker: 'DATABASE // MAINTENANCE' })) return;
  await busy(control, async () => {
    try { await api('POST', `/api/admin/database/${action}`); toast(`Database ${action} complete.`); }
    catch (error) { toast(error.message, true); }
  });
}));

document.getElementById('create-backup').addEventListener('click', async event => {
  await busy(event.currentTarget, async () => {
    try { const result = await api('POST', '/api/admin/backups'); toast(result.created ? `Created ${result.name}` : `${result.name} already protects this hour.`); await loadBackups(); }
    catch (error) { toast(error.message, true); }
  });
});
