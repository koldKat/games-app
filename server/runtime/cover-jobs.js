const { BULK_JOB } = require('../constants');
function createCoverJobRunner({ db, covers, coverJobs, storeMatchedCover, publishAppEvent }) {
  async function runCoverJob(userId, key) {
    const games = db.gamesMissingCovers(userId);
    const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0, skipped: 0, errors: 0, current: '', startedAt: new Date().toISOString() };
    coverJobs.set(userId, job);
    events.publish(userId, 'cover-job', { job });
    let consecutiveErrors = 0;
    for (const game of games) {
      const current = db.getGame(userId, game.id);
      if (!current || current.playStatus === 'hidden' || current.coverUrl) {
        job.current = ''; job.skipped++; job.processed++; events.publish(userId, 'cover-job', { job }); continue;
      }
      job.current = current.title;
      try {
        const match = await covers.bestExactCover(key, current.title);
        if (match) {
          const updated = await storeMatchedCover(userId, current, match, 'steamgriddb');
          if (updated) { job.matched++; publishAppEvent(userId, 'game-updated', { source: 'covers', game: updated }); }
          else job.skipped++;
        } else job.unmatched++;
        consecutiveErrors = 0;
      } catch (error) {
        job.errors++; job.lastError = error.message; consecutiveErrors++;
        if (consecutiveErrors >= BULK_JOB.maxConsecutiveErrors) { job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString(); events.publish(userId, 'cover-job', { job }); return; }
      }
      job.processed++;
      events.publish(userId, 'cover-job', { job });
      await covers.wait(BULK_JOB.coverDelayMs);
    }
    job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString();
    events.publish(userId, 'cover-job', { job });
  }

  return runCoverJob;
}
module.exports = { createCoverJobRunner };
