const fs = require('node:fs');
const path = require('node:path');
const { PUBLIC_URL } = require('../site-config');
const RUNTIME_POLICY = require('../runtime-policy');
const db = require('../db');
const { searchPegi } = require('../pegi');
const { createPegiBulkManager } = require('../pegi-bulk');
const hltb = require('../hltb');
const { createHltbBulkManager } = require('../hltb-bulk');
const covers = require('../covers');
const thegamesdb = require('../thegamesdb');
const igdb = require('../igdb');
const steamStore = require('../steam-store');
const steamLibrary = require('../steam-library');
const { createSteamImportService } = require('../steam-import');
const gogLibrary = require('../gog-library');
const { createGogImportService } = require('../gog-import');
const { createDescriptionBulkManager } = require('../description-bulk');
const { createCoverProviderBulkManager } = require('../cover-provider-bulk');
const { createIgdbBulkManager } = require('../igdb-bulk');
const coverStorage = require('../cover-storage');
const imagePolicy = require('../image-policy');
const showcaseCovers = require('../showcase-covers');
const events = require('../events');
const activity = require('../activity');
const auth = require('../auth');
const userLocation = require('../user-location');
const userActivity = require('../user-activity');
const preferences = require('../preferences');
const katalog = require('../katalog-runtime');
const { createShowcasePool } = require('../showcase-pool');
const publicProfiles = require('../public-profiles');
const { createSiteStats } = require('../site-stats');
const { readVersion } = require('../version');
const mailer = require('../mailer');
const { createProgressionService } = require('../progression-service');
const { TITLE_AUTOCOMPLETE_MIN_LENGTH } = require('../constants');
const appIntegrations = require('../app-integrations');

const ROOT = path.resolve(__dirname, '..', '..');
const AVATARS_DIR = path.join(ROOT, 'public', 'avatars');
const { readJson, readRaw } = require('../http/body');
const { sendJson, sendCoverPreview } = require('../http/responses');
const { prepareGameCover, finishGameCoverChange, storeMatchedCover } = require('./cover-changes');
const { createProgressionBridge } = require('./progression');
const { createLibraryImportRunner } = require('./library-imports');
const { createCoverJobRunner } = require('./cover-jobs');

function createRuntime() {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  const coverJobs = new Map();
  const progression = createProgressionService({ store: db.progression, data: db });
  const showcasePool = createShowcasePool(db.db);
  const siteStats = createSiteStats(db.db, { root: ROOT });
  const externalCoverProviders = Object.freeze({
    thegamesdb: {
      label: 'TheGamesDB', client: thegamesdb,
      environment: () => process.env.THEGAMESDB_API_KEY ? { apiKey: process.env.THEGAMESDB_API_KEY } : null,
    },
    igdb: {
      label: 'IGDB', client: igdb,
    },
  });
  const providerCredentials = (userId, provider) => provider === 'igdb' ? appIntegrations.credentials('igdb')
    : db.coverProviderCredentials(userId, provider) || externalCoverProviders[provider]?.environment?.() || null;
  const steamGridKey = () => appIntegrations.credentials('steamgriddb')?.apiKey || '';

  const { recordGameProgress, publishProgression, publishAppEvent, syncKatalogAndRecordProgress } = createProgressionBridge({ progression, katalog, activity, events });
  const externalCoverJobs = {
    thegamesdb: createCoverProviderBulkManager({ data: db, provider: 'thegamesdb', label: 'TheGamesDB', lookup: thegamesdb.bestExactCover,
      saveCover: storeMatchedCover, notify: publishAppEvent }),
  };
  const igdbJobs = createIgdbBulkManager({ data: db, lookup: igdb.exactGame, saveCover: storeMatchedCover, notify: publishAppEvent });
  const pegiJobs = createPegiBulkManager({ data: db, lookup: searchPegi, notify: publishAppEvent });
  const hltbJobs = createHltbBulkManager({ data: db, lookup: hltb.search, notify: publishAppEvent });
  const descriptionJobs = createDescriptionBulkManager({ data: db, lookups: { steam: steamStore.bestExactDescription, thegamesdb: thegamesdb.bestExactDescription }, notify: publishAppEvent });
  const steamImports = createSteamImportService({ database: db.db, data: db, integrations: appIntegrations, steam: steamLibrary });
  const gogImports = createGogImportService({ database: db.db, data: db, gog: gogLibrary });

  const runLibraryImport = createLibraryImportRunner({ progression, events, publishProgression });
  const runCoverJob = createCoverJobRunner({ db, covers, coverJobs, storeMatchedCover, publishAppEvent });
  return {
    showcasePool,
    siteStats,
    sendJson,
    RUNTIME_POLICY,
    covers,
    events,
    activity,
    auth,
    publicProfiles,
    readVersion,
    progression,
    readJson,
    PUBLIC_URL,
    userLocation,
    userActivity,
    preferences,
    mailer,
    publishProgression,
    AVATARS_DIR,
    readRaw,
    imagePolicy,
    steamImports,
    gogImports,
    runLibraryImport,
    coverJobs,
    externalCoverProviders,
    providerCredentials,
    steamGridKey,
    externalCoverJobs,
    igdbJobs,
    sendCoverPreview,
    runCoverJob,
    db,
    hltb,
    thegamesdb,
    igdb,
    coverStorage,
    katalog,
    TITLE_AUTOCOMPLETE_MIN_LENGTH,
    syncKatalogAndRecordProgress,
    prepareGameCover,
    finishGameCoverChange,
    pegiJobs,
    hltbJobs,
    descriptionJobs,
    searchPegi,
    steamStore,
    recordGameProgress,
    publishAppEvent,
  };
}
module.exports = { createRuntime };
