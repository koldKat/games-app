import { api, button, cell, confirmAction, emptyRow, formatDate, toast, busy } from './core.js';

export async function loadAccounts() {
  const body = document.getElementById('accounts-body'); body.replaceChildren();
  try {
    const accounts = await api('GET', '/api/admin/accounts');
    if (!accounts.length) return emptyRow(body, 9, 'No accounts.');
    accounts.forEach(account => {
      const row = body.insertRow();
      const temporaryLock = Number(account.lockedUntil || 0) > Math.floor(Date.now() / 1000);
      const locked = Boolean(account.adminLocked) || temporaryLock;
      const access = account.protected ? 'PROTECTED' : account.adminLocked ? 'LOCKED' : temporaryLock ? 'TEMP LOCK' : 'ACTIVE';
      const accessClass = account.protected ? 'good' : account.adminLocked ? 'rejected' : temporaryLock ? 'warn' : 'good';
      cell(row, account.id); cell(row, account.username, 'cell-title'); cell(row, account.email || '—'); cell(row, access, `state ${accessClass}`); cell(row, account.games); cell(row, account.covered); cell(row, account.activeSessions); cell(row, formatDate(account.createdAt));
      const actions = cell(row, '', 'row-actions');
      const revoke = button('Revoke sessions', '', async () => {
        if (!account.activeSessions || !await confirmAction({ title: 'Revoke active sessions?', message: `${account.username} will be signed out on every device.`, confirmLabel: 'Revoke sessions', kicker: 'IDENTITY CONTROL' })) return;
        await busy(revoke, async () => { const result = await api('DELETE', `/api/admin/accounts/${account.id}/sessions`); toast(`${result.cleared} session(s) revoked.`); await loadAccounts(); });
      });
      revoke.disabled = !account.activeSessions;
      const lock = button(locked ? 'Unlock account' : 'Lock account', locked ? '' : 'danger', async () => {
        const locking = !locked;
        if (!await confirmAction({
          title: `${locking ? 'Lock' : 'Unlock'} ${account.username}?`,
          message: locking ? `${account.username} will be signed out on every device and cannot sign in until unlocked.` : `${account.username} can sign in again.`,
          confirmLabel: locking ? 'Lock account' : 'Unlock account', kicker: 'IDENTITY CONTROL',
        })) return;
        await busy(lock, async () => { await api('PATCH', `/api/admin/accounts/${account.id}/lock`, { locked: locking }); toast(locking ? 'Account locked and sessions revoked.' : 'Account unlocked.'); await loadAccounts(); });
      });
      lock.disabled = Boolean(account.protected);
      if (account.protected) { lock.textContent = 'Protected'; lock.title = 'The koldKat account cannot be locked.'; }
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
      remove.disabled = Boolean(account.protected);
      if (account.protected) { remove.textContent = 'Protected'; remove.title = 'The koldKat account cannot be deleted.'; }
      actions.append(revoke, lock, remove);
    });
  } catch (error) { emptyRow(body, 9, error.message); toast(error.message, true); }
}

document.getElementById('refresh-accounts').addEventListener('click', loadAccounts);
