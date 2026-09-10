import { api, button, cell, confirmAction, emptyRow, formatDate, geoLocation, toast, busy } from './core.js';

const ACCOUNT_COLUMN_COUNT = 12;
const STALE_AFTER_DAYS = 30;

function inactiveLabel(days) {
  if (days === 0) return 'Today';
  return days === 1 ? '1 day' : `${days} days`;
}

function renderAccount(body, account) {
  const row = body.insertRow();
  const temporaryLock = Number(account.lockedUntil || 0) > Math.floor(Date.now() / 1000);
  const locked = Boolean(account.adminLocked) || temporaryLock;
  const access = account.protected ? 'PROTECTED' : account.adminLocked ? 'LOCKED' : temporaryLock ? 'TEMP LOCK' : 'ACTIVE';
  const accessClass = account.protected ? 'good' : account.adminLocked ? 'rejected' : temporaryLock ? 'warn' : 'good';
  cell(row, account.id); cell(row, account.username, 'cell-title'); cell(row, account.email || '//'); cell(row, access, `state ${accessClass}`); cell(row, account.games); cell(row, account.covered); cell(row, account.activeSessions);
  cell(row, '', 'location-cell').append(geoLocation(account.country, account.city));
  cell(row, formatDate(Number(account.lastActiveAt) * 1000), 'account-last-active');
  cell(row, inactiveLabel(Number(account.daysInactive)), Number(account.daysInactive) > STALE_AFTER_DAYS ? 'activity-stale' : Number(account.daysInactive) > 7 ? 'activity-mid' : 'activity-fresh');
  cell(row, formatDate(account.createdAt));
  const actions = cell(row, '', 'accounts-actions');
  const actionGroup = document.createElement('div'); actionGroup.className = 'row-actions';
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
  if (account.protected) {
    lock.textContent = 'Protected'; lock.classList.add('themed-tooltip'); lock.dataset.tooltip = 'This account cannot be locked.'; lock.removeAttribute('title');
  }
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
  if (account.protected) {
    remove.textContent = 'Protected'; remove.classList.add('themed-tooltip'); remove.dataset.tooltip = 'This account cannot be deleted.'; remove.removeAttribute('title');
  }
  actionGroup.append(revoke, lock, remove); actions.append(actionGroup);
}

export async function loadAccounts() {
  const body = document.getElementById('accounts-body'); body.replaceChildren();
  try {
    const accounts = await api('GET', '/api/admin/accounts');
    if (!accounts.length) return emptyRow(body, ACCOUNT_COLUMN_COUNT, 'No accounts.');
    const active = accounts.filter(account => Number(account.daysInactive) <= STALE_AFTER_DAYS);
    const inactive = accounts.filter(account => Number(account.daysInactive) > STALE_AFTER_DAYS);
    active.forEach(account => renderAccount(body, account));
    if (inactive.length) {
      const row = body.insertRow(); const container = cell(row, '', 'inactive-accounts-row'); container.colSpan = ACCOUNT_COLUMN_COUNT;
      const reveal = button(`Show ${inactive.length} inactive user${inactive.length === 1 ? '' : 's'} (31+ days)`, 'inactive-accounts-toggle', () => {
        row.remove(); inactive.forEach(account => renderAccount(body, account));
      });
      container.append(reveal);
    }
  } catch (error) { emptyRow(body, ACCOUNT_COLUMN_COUNT, error.message); toast(error.message, true); }
}

document.getElementById('refresh-accounts').addEventListener('click', loadAccounts);
