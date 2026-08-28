'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function createCatalogueCoverStore({ coverDirectory, localFilename, removeLocal, storeRemote }) {
  function copy(publicUrl) {
    const filename = localFilename(publicUrl);
    if (!filename) throw new Error('Catalogue covers must already be stored locally.');
    const source = path.join(coverDirectory, filename);
    const extension = path.extname(filename).toLowerCase();
    const nextFilename = `${crypto.randomBytes(16).toString('hex')}${extension}`;
    const destination = path.join(coverDirectory, nextFilename);
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    return `/covers/${nextFilename}`;
  }

  return { copy, remove: removeLocal, storeRemote };
}

module.exports = { createCatalogueCoverStore };
