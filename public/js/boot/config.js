import { $ } from '../core/dom.js';

async function loadConfig() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    $('#app-version').textContent = config.version || 'dev';
  } catch { $('#app-version').textContent = 'dev'; }
}

export { loadConfig };
