const db = require('../db');
const coverStorage = require('../cover-storage');
async function storeMatchedCover(userId, game, match, source) {
  const localUrl = await coverStorage.storeRemote(match.url);
  try {
    const updated = db.updateGameCover(userId, game.id, { url: localUrl, source, matchTitle: match.gameTitle });
    if (!updated) coverStorage.removeLocal(localUrl);
    return updated;
  } catch (error) { coverStorage.removeLocal(localUrl); throw error; }
}
async function prepareGameCover(input, existing = null) {
  const requested = String(input?.coverUrl || '').trim();
  const uploaded = String(input?.coverUpload || '');
  if (uploaded) {
    const match = uploaded.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) throw new Error('Uploaded cover must be a JPEG, PNG, or WebP image.');
    const source = Buffer.from(match[1], 'base64');
    if (!source.length || source.toString('base64') !== match[1]) throw new Error('Uploaded cover data is invalid.');
    const createdUrl = await coverStorage.storeUpload(source);
    return { input: { ...input, coverUpload: undefined, coverUrl: createdUrl, coverSource: 'upload', coverMatchTitle: String(input.coverMatchTitle || 'Uploaded cover') }, createdUrl };
  }
  if (!requested || (requested === existing?.coverUrl && coverStorage.localFilename(requested))) return { input, createdUrl: '' };
  if (coverStorage.localFilename(requested)) throw new Error('Saved cover paths cannot be assigned manually. Request the cover again.');
  const createdUrl = await coverStorage.storeRemote(requested);
  return { input: { ...input, coverUrl: createdUrl }, createdUrl };
}

function finishGameCoverChange(existing, game) {
  if (existing?.coverUrl && existing.coverUrl !== game?.coverUrl) coverStorage.removeLocal(existing.coverUrl);
}

module.exports = { prepareGameCover, finishGameCoverChange, storeMatchedCover };
