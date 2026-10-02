import { createCoverProviderSettings } from '../metadata/cover-provider-settings.js';
import { api, toast, showAccountError } from '../core/api.js';
import { state } from '../core/runtime.js';
import { setIgdbAvailability } from '../editor/lookups.js';
import { createProgressionUi } from '../progression/progression-ui.js';
import { createActivityFeed } from '../community/activity-feed.js';
import { createPatchUi } from '../community/patch-ui.js';
import { loadGames, loadStatsAndMeta } from '../library/data.js';
import { createSteamImporter } from '../imports/steam-import.js';
import { createGogImporter } from '../imports/gog-import.js';

let libraryImportRefresh;
let coverProviderSettings;
let progressionUi;
let activityFeed;
let patchUi;
let steamImporter;
let gogImporter;

function refreshAfterLibraryImport() {
  if (!libraryImportRefresh) {
    libraryImportRefresh = Promise.all([loadGames(), loadStatsAndMeta(), progressionUi.load()])
      .finally(() => { libraryImportRefresh = null; });
  }
  return libraryImportRefresh;
}

function applySaveProgress(result) {
  if (result?.progression?.awards?.length) progressionUi.handleEvent({ progress: result.progression.progress });
}

function endSessionResume() { document.documentElement.classList.remove('resuming-session'); }

export function initializeBootServices() {
  coverProviderSettings = createCoverProviderSettings({
    api, toast, showError: showAccountError,
    onStatus: (provider, status) => {
      if (provider !== 'igdb') return;
      state.integrations.igdb = Boolean(status.configured); setIgdbAvailability(state.integrations.igdb);
    },
  });
  progressionUi = createProgressionUi({ api });
  activityFeed = createActivityFeed();
  patchUi = createPatchUi({ api, toast, getUser: () => state.user });
  libraryImportRefresh = null;
  steamImporter = createSteamImporter({
    api, toast,
    onImported: refreshAfterLibraryImport,
  });
  gogImporter = createGogImporter({ api, toast, onImported: refreshAfterLibraryImport });
}
export {
  coverProviderSettings, endSessionResume, progressionUi, patchUi, refreshAfterLibraryImport,
  steamImporter, gogImporter, activityFeed, applySaveProgress,
};
