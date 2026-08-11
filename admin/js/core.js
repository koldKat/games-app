export async function api(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch(path, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `${method} ${path} failed (${response.status})`);
  return result;
}

export function formatNumber(value) { return Number(value || 0).toLocaleString(); }
export function formatBytes(value) {
  let size = Number(value || 0); const units = ['B', 'KB', 'MB', 'GB']; let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${unit ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}
export function formatDuration(seconds) {
  let value = Number(seconds || 0); const days = Math.floor(value / 86400); value %= 86400;
  const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
export function formatDate(value) { return value ? new Date(value).toLocaleString() : '—'; }
export function button(label, className, handler) {
  const element = document.createElement('button'); element.className = `button ${className || ''}`; element.textContent = label; element.addEventListener('click', handler); return element;
}
export function cell(row, value, className = '') { const td = row.insertCell(); td.className = className; td.textContent = value ?? '—'; return td; }
export function emptyRow(body, columns, message) { const row = body.insertRow(); const td = cell(row, message, 'empty'); td.colSpan = columns; }
export function confirmAction({ title = 'Confirm action', message = '', confirmLabel = 'Confirm', requiredText = '', inputCaption = '', kicker = 'CONFIRM ACTION' } = {}) {
  const dialog = document.getElementById('confirm-dialog');
  if (dialog.open) return Promise.resolve(false);
  const inputLabel = document.getElementById('confirm-input-label');
  const input = document.getElementById('confirm-input');
  const accept = document.getElementById('confirm-accept');
  const requiresInput = Boolean(requiredText);
  document.getElementById('confirm-kicker').textContent = kicker;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-input-caption').textContent = inputCaption || `Type ${requiredText} to confirm`;
  inputLabel.hidden = !requiresInput; input.value = ''; accept.textContent = confirmLabel; accept.disabled = requiresInput;

  return new Promise(resolve => {
    let pointerStartedOnBackdrop = false; let settled = false;
    const finish = value => {
      if (settled) return; settled = true;
      dialog.oncancel = null; dialog.onpointerdown = null; dialog.onpointerup = null; dialog.onpointercancel = null;
      input.oninput = null; document.getElementById('confirm-cancel').onclick = null; document.getElementById('confirm-close').onclick = null; accept.onclick = null;
      dialog.close(); resolve(value);
    };
    input.oninput = () => { accept.disabled = input.value !== requiredText; };
    document.getElementById('confirm-cancel').onclick = () => finish(false);
    document.getElementById('confirm-close').onclick = () => finish(false);
    accept.onclick = () => { if (!requiresInput || input.value === requiredText) finish(true); };
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    dialog.onpointerdown = event => { pointerStartedOnBackdrop = event.target === dialog; };
    dialog.onpointerup = event => { if (pointerStartedOnBackdrop && event.target === dialog) finish(false); pointerStartedOnBackdrop = false; };
    dialog.onpointercancel = () => { pointerStartedOnBackdrop = false; };
    dialog.showModal(); requestAnimationFrame(() => (requiresInput ? input : accept).focus());
  });
}
export function toast(message, error = false) {
  const element = document.getElementById('toast'); element.textContent = message; element.classList.toggle('error', error); element.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}
export async function busy(element, task) {
  const old = element.textContent; element.disabled = true; element.textContent = 'Working…';
  try { return await task(); }
  catch (error) { toast(error.message || 'Operation failed.', true); return null; }
  finally { element.disabled = false; element.textContent = old; }
}
