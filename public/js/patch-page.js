import { createPatchUi } from './patch-ui.js';
import { openEventStream } from './events.js';

async function api(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
function toast(message) {
  let node = document.getElementById('toast');
  if (!node) { node = document.createElement('div'); node.id = 'toast'; node.className = 'toast'; node.setAttribute('role', 'status'); document.body.append(node); }
  node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}
const patchUi = createPatchUi({ api, toast, getUser: () => document.body.dataset.signedIn === 'true' ? {} : null });
void patchUi.refreshUnread();
let stopEvents = null;
function startEvents() {
  stopEvents?.();
  stopEvents = document.body.dataset.signedIn === 'true'
    ? openEventStream({ onEvent(event, data) { if (event === 'ping-updated') patchUi.handleEvent(event, data); } })
    : null;
}
startEvents();
window.addEventListener('pagehide', () => { stopEvents?.(); stopEvents = null; });
window.addEventListener('pageshow', event => { if (event.persisted) startEvents(); });
