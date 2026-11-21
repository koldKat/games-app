import {openAccountEditor} from './account-editor.js';
import { api, button, cell, emptyRow, formatDate, geoLocation } from './core.js';

const ACCOUNT_COLUMN_COUNT = 12;
const STALE_AFTER_DAYS = 30;

function inactiveLabel(days) {
  if (days === 0) return 'Today';
  return days === 1 ? '1 day' : `${days} days`;
}

function renderAccount(body, account) {
  const row = body.insertRow();
  const temporaryLock = Number(account.lockedUntil || 0) > Math.floor(Date.now() / 1000);
  const access = account.protected ? 'PROTECTED' : account.adminLocked ? 'LOCKED' : temporaryLock ? 'TEMP LOCK' : 'ACTIVE';
  const accessClass = account.protected ? 'good' : account.adminLocked ? 'rejected' : temporaryLock ? 'warn' : 'good';
  cell(row, account.id); cell(row, account.username, 'cell-title'); cell(row, account.email || '//'); cell(row, access, `state ${accessClass}`); cell(row, account.games); cell(row, account.covered); cell(row, account.activeSessions);
  cell(row, '', 'location-cell').append(geoLocation(account.country, account.city));
  cell(row, formatDate(Number(account.lastActiveAt) * 1000), 'account-last-active');
  cell(row, inactiveLabel(Number(account.daysInactive)), Number(account.daysInactive) > STALE_AFTER_DAYS ? 'activity-stale' : Number(account.daysInactive) > 7 ? 'activity-mid' : 'activity-fresh');
  cell(row, formatDate(account.createdAt));
  const actions=cell(row,'','accounts-actions');
  actions.append(button('Details','',()=>openAccountEditor(account.id,loadAccounts)));

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
