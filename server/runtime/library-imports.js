const LIBRARY_IMPORT_POSTPROCESS_CHUNK_SIZE = 5;

function createLibraryImportRunner({ progression, events, publishProgression }) {
  const activeLibraryImportRequests = new Set();
  async function completeLibraryImport(userId, provider, result, publishProgress) {
    publishProgress({ phase: 'processing', current: 0, total: result.xpGames.length });
    const progressionAwards = []; let importedProgress = progression.info(userId);
    for (let offset = 0; offset < result.xpGames.length; offset += LIBRARY_IMPORT_POSTPROCESS_CHUNK_SIZE) {
      const chunk = result.xpGames.slice(offset, offset + LIBRARY_IMPORT_POSTPROCESS_CHUNK_SIZE);
      const recorded = progression.recordImportedGames(userId, chunk, { milestones: false });
      progressionAwards.push(...recorded.awards); importedProgress = recorded.progress;
      publishProgress({ phase: 'processing', current: Math.min(offset + chunk.length, result.xpGames.length), total: result.xpGames.length });
      await new Promise(resolve => setImmediate(resolve));
    }
    const milestones = progression.recordImportedGames(userId, [], { milestones: true });
    progressionAwards.push(...milestones.awards); importedProgress = milestones.progress;
    publishProgression(userId, { progress: importedProgress, awards: progressionAwards }, { compact: true });
    publishProgress({ phase: 'complete', current: result.xpGames.length, total: result.xpGames.length });
    events.publish(userId, 'games-imported', { provider, created: result.created.length, linked: result.linked.length });
    const { xpGames, ...responseResult } = result;
    return {
      ...responseResult,
      created: result.created.map(game => ({ id: game.id, title: game.title })),
      linked: result.linked.map(game => ({ id: game.id, title: game.title })),
    };
  }

  async function runLibraryImport({ userId, provider, service, ids, progressEvent }) {
    const requestKey = `${provider}:${userId}`;
    if (activeLibraryImportRequests.has(requestKey)) {
      throw Object.assign(new Error(`A ${provider} import is already running for this account.`), { status: 409 });
    }
    activeLibraryImportRequests.add(requestKey);
    try {
      const publishProgress = progress => events.publish(userId, progressEvent, progress);
      const result = await service.importSelection(userId, ids, publishProgress);
      return await completeLibraryImport(userId, provider, result, publishProgress);
    } finally { activeLibraryImportRequests.delete(requestKey); }
  }

  return runLibraryImport;
}
module.exports = { createLibraryImportRunner };
