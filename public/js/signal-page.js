import { createActivityFeed } from './activity-feed.js';
import { openCatalogueGameDialog } from './catalogue-public.js';

createActivityFeed().start();
document.addEventListener('click', event => {
  const link = event.target.closest('.activity-game-link');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  void openCatalogueGameDialog(document, link.href, { returnUrl: '/signal' });
});
