import { initializeBootShell } from './shell.js';
import { initializeCoreRuntime } from '../core/runtime.js';
import { initializeBootServices } from './services.js';
import { initializeAccountAuthentication } from '../account/authentication.js';
import { initializeEditorPlatform } from '../editor/platform.js';
import { initializeLibraryFilters } from '../library/filters.js';
import { initializeLibraryRender } from '../library/render.js';
import { initializeEditorForm } from '../editor/form.js';
import { initializeDetailsDialog } from '../details/dialog.js';
import { initializeEditorRating } from '../editor/rating.js';
import { initializeEditorPegiDetails } from '../editor/pegi-details.js';
import { bindEditorDialog } from '../editor/form.js';
import { initializeBootNavigation } from './navigation.js';
import { initializeIgdbLookup } from '../editor/lookups.js';
import { initializeTitleAutocomplete } from '../editor/form.js';
import { initializeHltbLookup } from '../editor/lookups.js';
import { bindEditorMutations } from '../editor/form.js';
import { initializeLibraryActions } from '../library/actions.js';
import { bindMetadataLookups } from '../editor/lookups.js';
import { initializeEditorCovers } from '../editor/covers.js';
import { initializeAccountProfile } from '../account/profile.js';
import { initializeMetadataBulkUi } from '../metadata/bulk-ui.js';
import { bindProfileMutationsAndLifecycle } from '../account/profile.js';
import { restoreSession } from './start.js';

let initialized = false;

// Bind dependent features before restoring the session.
export function initializeApp() {
  if (initialized) return;
  initialized = true;
  initializeBootShell();
  initializeCoreRuntime();
  initializeBootServices();
  initializeAccountAuthentication();
  initializeEditorPlatform();
  initializeLibraryFilters();
  initializeLibraryRender();
  initializeEditorForm();
  initializeDetailsDialog();
  initializeEditorRating();
  initializeEditorPegiDetails();
  bindEditorDialog();
  initializeBootNavigation();
  initializeIgdbLookup();
  initializeTitleAutocomplete();
  initializeHltbLookup();
  bindEditorMutations();
  initializeLibraryActions();
  bindMetadataLookups();
  initializeEditorCovers();
  initializeAccountProfile();
  initializeMetadataBulkUi();
  bindProfileMutationsAndLifecycle();
  restoreSession();
}
