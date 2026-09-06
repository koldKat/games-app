'use strict';

const { evaluateKatalogGame } = require('./katalog-policy');

function katalogGameInput(entry, personal = {}) {
  return {
    title: entry.title,
    platform: entry.platform,
    pegi: entry.pegi,
    publisher: entry.publisher,
    releaseYear: entry.releaseYear,
    pegiUrl: entry.pegiUrl,
    pegiDescriptors: entry.pegiDescriptors,
    pegiReleases: entry.pegiReleases,
    pegiAdvice: entry.pegiAdvice,
    pegiOutline: entry.pegiOutline,
    pegiContentIssues: entry.pegiContentIssues,
    pegiOtherIssues: entry.pegiOtherIssues,
    hltbId: entry.hltbId,
    hltbTitle: entry.hltbTitle,
    hltbUrl: entry.hltbUrl,
    hltbMainStory: entry.hltbMainStory,
    hltbMainExtra: entry.hltbMainExtra,
    hltbCompletionist: entry.hltbCompletionist,
    hltbAllStyles: entry.hltbAllStyles,
    coverSource: entry.coverSource,
    coverMatchTitle: entry.coverMatchTitle,
    description: entry.description,
    descriptionSource: entry.descriptionSource,
    descriptionSourceUrl: entry.descriptionSourceUrl,
    ownership: personal.ownership || 'owned',
    mediaFormat: personal.mediaFormat || 'physical',
    playStatus: personal.playStatus || 'backlog',
    favorite: false,
    notes: '',
    cartridgeNumber: null,
  };
}

function createKatalogService({ data, store, covers, logger = console }) {
  function syncGame(userId, game) {
    const evaluation = evaluateKatalogGame(game);
    if (!evaluation.eligible) return { state: 'ineligible', evaluation };
    const existing = store.findByIdentity(evaluation.identity.titleKey, evaluation.identity.platformKey);
    if (existing?.status === 'public') {
      store.link(existing.id, game.id, userId);
      return { state: 'linked', entry: store.addDescriptionIfMissing?.(existing.id, game) || existing, evaluation };
    }
    let katalogCoverUrl = '';
    try {
      katalogCoverUrl = covers.copy(game.coverUrl);
      const result = store.upsertFromGame(userId, game, evaluation, katalogCoverUrl);
      if (!result.usedCover) covers.remove(katalogCoverUrl);
      if (result.previousCoverUrl && result.previousCoverUrl !== result.entry.coverUrl) covers.remove(result.previousCoverUrl);
      return { state: result.entry.status, entry: result.entry, evaluation };
    } catch (error) {
      if (katalogCoverUrl) covers.remove(katalogCoverUrl);
      throw error;
    }
  }

  function syncGameSafely(userId, game) {
    try { return syncGame(userId, game); }
    catch (error) {
      logger.error?.(`[katalog] could not synchronize game ${game?.id || '?'}: ${error.message}`);
      return { state: 'error', error };
    }
  }

  function syncAll(games = []) {
    const summary = { total: games.length, public: 0, candidate: 0, linked: 0, ineligible: 0, errors: 0 };
    for (const game of games) {
      const result = syncGameSafely(game.userId, game);
      if (result.state === 'error') summary.errors++;
      else if (Object.hasOwn(summary, result.state)) summary[result.state]++;
    }
    return summary;
  }

  function addToLibrary(userId, katalogId, personal = {}) {
    const entry = store.getPublicById(katalogId);
    if (!entry) throw Object.assign(new Error('Katalog game not found.'), { status: 404 });
    const duplicates = data.findDuplicateGames(userId, entry.title, entry.platform);
    if (duplicates.length) throw Object.assign(new Error('This release is already in your library.'), { status: 409, existing: duplicates[0] });
    let libraryCoverUrl = '';
    let game = null;
    try {
      libraryCoverUrl = covers.copy(entry.coverUrl);
      game = data.createGame(userId, { ...katalogGameInput(entry, personal), coverUrl: libraryCoverUrl });
      store.link(entry.id, game.id, userId);
      return game;
    } catch (error) {
      if (game) data.deleteGame(userId, game.id);
      if (libraryCoverUrl) covers.remove(libraryCoverUrl);
      throw error;
    }
  }

  function libraryCopy(userId, katalogId) {
    const entry = store.getPublicById(katalogId);
    if (!entry) return null;
    return data.findDuplicateGames(userId, entry.title, entry.platform)[0] || null;
  }

  function removeEntry(id) {
    const entry = store.remove(id);
    if (entry?.coverUrl) covers.remove(entry.coverUrl);
    return entry;
  }

  async function replaceCover(id, sourceUrl) {
    const existing = store.getById(id);
    if (!existing) return null;
    const nextUrl = await covers.storeRemote(sourceUrl);
    const entry = store.replaceCover(id, nextUrl);
    if (!entry) { covers.remove(nextUrl); return null; }
    covers.remove(existing.coverUrl);
    return entry;
  }

  return {
    addToLibrary,
    contributionSources: store.contributionSources,
    libraryCopy,
    counts: store.counts,
    getById: store.getById,
    getPublicById: store.getPublicById,
    getPublicBySlug: store.getPublicBySlug,
    listAdmin: store.listAdmin,
    listPublic: store.listPublic,
    publicPlatforms: store.publicPlatforms,
    removeEntry,
    replaceCover,
    searchPublic: store.searchPublic,
    setStatus: store.setStatus,
    sitemapEntries: store.sitemapEntries,
    syncAll,
    syncGame,
    syncGameSafely,
    updateAdmin: store.updateAdmin,
  };
}

module.exports = { katalogGameInput, createKatalogService };
