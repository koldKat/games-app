import { loadDashboard, loadLive } from './dashboard.js';
import { loadAccounts } from './accounts.js';
import { loadCatalogue } from './catalogue.js';
import { loadPublicCatalogue } from './public-catalogue.js';
import { loadVersion, loadBackups } from './tools.js';
import { loadMailSettings } from './mail.js';
import { loadProgression } from './progression.js';

const loaders = {
  dashboard: loadDashboard,
  accounts: loadAccounts,
  catalogue: loadCatalogue,
  'public-catalogue': loadPublicCatalogue,
  progression: loadProgression,
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
setInterval(loadLive, 1_000);
setInterval(loadDashboard, 60_000);
