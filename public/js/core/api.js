import { runtime, AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE } from './runtime.js';
import { showAuth } from '../account/session.js';
import { $ } from './dom.js';
import { UI_TIMING } from './ui-policy.js';

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

async function api(url, options) {
  const generation = runtime.sessionGeneration;
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && generation === runtime.sessionGeneration && !AUTH_ROUTES_WITHOUT_EXPIRY_NOTICE.has(url)) {
    runtime.sessionGeneration++;
    showAuth('Your session expired. Authenticate again.');
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), UI_TIMING.toastMs);
}

function showAccountError(message) { $('#account-error').textContent = message; $('#account-error').hidden = false; }

export { api, toast, showAccountError, escapeHtml };
