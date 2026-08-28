import { loadDashboard } from './dashboard.js';
import { loadAccounts } from './accounts.js';
import { loadCatalogue } from './catalogue.js';
import { loadPublicCatalogue } from './public-catalogue.js';
import { loadVersion, loadBackups } from './tools.js';

const loaders = {
  dashboard: loadDashboard,
  accounts: loadAccounts,
  catalogue: loadCatalogue,
  'public-catalogue': loadPublicCatalogue,
  tools: async () => { await Promise.all([loadVersion(), loadBackups()]); },
};

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  const tab = button.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tab}`));
  loaders[tab]();
}));

loadDashboard();
