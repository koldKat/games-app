'use strict';

const data = require('./db');
const coverStorage = require('./cover-storage');
const { createKatalogCoverStore } = require('./katalog-cover-store');
const { createKatalogService } = require('./katalog-service');
const { createKatalogStore } = require('./katalog-store');

const store = createKatalogStore(data.db);
const covers = createKatalogCoverStore({
  coverDirectory: coverStorage.COVER_DIR,
  localFilename: coverStorage.localFilename,
  removeLocal: coverStorage.removeLocal,
  storeRemote: coverStorage.storeRemote,
});

module.exports = createKatalogService({ data, store, covers });
