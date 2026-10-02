import { createKatalogNavigation } from '../katalog/katalog-navigation.js';
import { loadGames, loadStatsAndMeta } from '../library/data.js';
import { openDetails } from '../details/dialog.js';
import { api, toast } from '../core/api.js';
import { activityFeed } from './services.js';
import { state } from '../core/runtime.js';
import { loadHeroCovers } from '../covers/decorations.js';

let katalogNavigation;

export function initializeBootNavigation() {
  katalogNavigation = createKatalogNavigation({
    onGameAdded: () => { void loadGames(); void loadStatsAndMeta(); },
    onLibraryGameOpen: async id => {
      try { openDetails(await api(`/api/games/${id}`)); }
      catch (error) { toast(error.message); }
    },
    onSignalVisible: () => { void activityFeed.load(); },
    onLibraryVisible: () => {
      const userId = state.user?.id;
      if (userId) void loadHeroCovers(() => state.user?.id === userId).catch(() => {});
    },
  });
}
export { katalogNavigation };
