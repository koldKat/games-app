function createProgressionBridge({ progression, katalog, activity, events }) {
  function isKatalogContribution(userId, game, result) {
    const entry = result?.entry;
    return entry?.status === 'public' && Number(entry.submittedByUserId) === Number(userId) && Number(entry.sourceGameId) === Number(game?.id);
  }
  function syncKatalogAndRecordProgress(userId, game, options) {
    const katalogResult = katalog.syncGameSafely(userId, game);
    return recordGameProgress(userId, game, { ...options, katalogContribution: isKatalogContribution(userId, game, katalogResult) });
  }
  function publishAppEvent(userId, event, payload) {
    if (event === 'game-updated' && payload?.game) syncKatalogAndRecordProgress(userId, payload.game);
    events.publish(userId, event, payload);
  }
  function publishProgression(userId, result, { compact = false } = {}) {
    if (!result?.awards?.length) return;
    const eventAwards = compact ? result.awards.filter(award => award.levels?.length || award.event === 'catalogue_contribution') : result.awards;
    events.publish(userId, 'progression-updated', { progress: result.progress, awards: eventAwards });
    let changed = false;
    for (const award of result.awards) {
      for (const level of award.levels || []) changed = activity.recordLevelUp(userId, level.level, level.title, level.previousTitle) || changed;
      if (award.event === 'catalogue_contribution') changed = activity.recordContribution(userId, award.ref || '') || changed;
    }
    if (changed) events.publishPublicActivity();
  }
  function recordGameProgress(userId, game, options) {
    const result = progression.recordGame(userId, game, options); publishProgression(userId, result); return result;
  }

  return { recordGameProgress, publishProgression, publishAppEvent, syncKatalogAndRecordProgress };
}
module.exports = { createProgressionBridge };
