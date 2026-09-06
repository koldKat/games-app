import { loadDashboard, loadLive } from './dashboard.js';
import { loadAccounts } from './accounts.js';
import { loadKatalog } from './katalog.js';
import { loadPublicKatalog } from './public-katalog.js';
import { loadVersion, loadBackups } from './tools.js';
import { loadMailSettings } from './mail.js';
import { loadProgression } from './progression.js';
import { loadAnnouncements } from './announcements.js';
import { loadForum } from './forum.js';
import { loadPatch } from './patch.js';

const loaders = {
  dashboard: loadDashboard,
  accounts: loadAccounts,
  katalog: loadKatalog,
  'public-katalog': loadPublicKatalog,
  progression: loadProgression,
  announcements: loadAnnouncements,
  forum: loadForum,
  patch: loadPatch,
  tools: async () => { await Promise.all([loadVersion(), loadBackups(), loadMailSettings()]); },
};

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  const tab = button.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tab}`));
  loaders[tab]();
}));

loadDashboard();
loadLive();
document.getElementById('refresh-patch')?.addEventListener('click', loadPatch);
setInterval(loadLive, 1_000);
setInterval(loadDashboard, 60_000);
