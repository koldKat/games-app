'use strict';

const data = require('./db');
const coverStorage = require('./cover-storage');
const { createCatalogueCoverStore } = require('./catalogue-cover-store');
const { createCatalogueService } = require('./catalogue-service');
const { createCatalogueStore } = require('./catalogue-store');

const store = createCatalogueStore(data.db);
const covers = createCatalogueCoverStore({
  coverDirectory: coverStorage.COVER_DIR,
  localFilename: coverStorage.localFilename,
  removeLocal: coverStorage.removeLocal,
  storeRemote: coverStorage.storeRemote,
});

module.exports = createCatalogueService({ data, store, covers });
