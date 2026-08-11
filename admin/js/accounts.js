import { api, button, cell, confirmAction, emptyRow, formatDate, toast, busy } from './core.js';

export async function loadAccounts() {
  const body = document.getElementById('accounts-body'); body.replaceChildren();
  try {
    const accounts = await api('GET', '/api/admin/accounts');
    if (!accounts.length) return emptyRow(body, 8, 'No accounts.');
    accounts.forEach(account => {
      const row = body.insertRow();
      cell(row, account.id); cell(row, account.username, 'cell-title'); cell(row, account.email || '—'); cell(row, account.games); cell(row, account.covered); cell(row, account.activeSessions); cell(row, formatDate(account.createdAt));
      const actions = cell(row, '', 'row-actions');
      const revoke = button('Revoke sessions', '', async () => {
        if (!account.activeSessions || !await confirmAction({ title: 'Revoke active sessions?', message: `${account.username} will be signed out on every device.`, confirmLabel: 'Revoke sessions', kicker: 'IDENTITY CONTROL' })) return;
        await busy(revoke, async () => { const result = await api('DELETE', `/api/admin/accounts/${account.id}/sessions`); toast(`${result.cleared} session(s) revoked.`); await loadAccounts(); });
      });
      revoke.disabled = !account.activeSessions;
      const remove = button('Delete account', 'danger', async () => {
        const confirmed = await confirmAction({
          title: `Delete ${account.username}?`,
          message: `This permanently deletes the account, its avatar, active sessions, integrations, and all ${account.games} game(s). This cannot be undone.`,
          confirmLabel: 'Delete account', requiredText: account.username,
          inputCaption: `Type ${account.username} exactly to unlock deletion`, kicker: 'DESTRUCTIVE // ACCOUNT',
        });
        if (!confirmed) return;
        await busy(remove, async () => {
          const result = await api('DELETE', `/api/admin/accounts/${account.id}`);
          toast(`Deleted ${result.deleted.username} and ${result.deleted.games} game(s).`);
          await loadAccounts();
        });
      });
      actions.append(revoke, remove);
    });
  } catch (error) { emptyRow(body, 8, error.message); toast(error.message, true); }
}

document.getElementById('refresh-accounts').addEventListener('click', loadAccounts);
