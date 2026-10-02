import { setAuthMode, showPasswordResetComplete } from '../account/authentication.js';
import { activityFeed } from './services.js';
import { loadConfig } from './config.js';
import { loadAuthCovers } from '../covers/decorations.js';
import { showAuth, enterApp } from '../account/session.js';
import { api } from '../core/api.js';

export function restoreSession() {
  (async function boot() {
    setAuthMode('login');
    activityFeed.start();
    loadConfig();
    loadAuthCovers();
    const resetToken = new URLSearchParams(window.location.search).get('reset');
    if (resetToken) { history.replaceState({}, '', window.location.pathname); showAuth(); showPasswordResetComplete(resetToken); return; }
    try { const result = await api('/api/auth/me'); await enterApp(result.user, result.preferences, result.progress); }
    catch { showAuth(); }
  })();
}
