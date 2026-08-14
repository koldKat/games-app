'use strict';

const { BULK_JOB } = require('./constants');
const { wait } = require('./cover-provider-utils');

function createCoverProviderBulkManager({ data, provider, label = provider, lookup, saveCover, delayMs = 250, pause = wait, notify = () => {} }) {
  const jobs = new Map(); const eventName = `${provider}-job`;
  const persist = saveCover || (async (userId, game, match) => data.updateGameCover(userId, game.id,
    { url: match.url, source: provider, matchTitle: match.gameTitle }));
  async function run(userId, credentials) {
    const games = data.gamesMissingCovers(userId);
    const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0, skipped: 0,
      errors: 0, current: '', startedAt: new Date().toISOString() };
    jobs.set(userId, job); notify(userId, eventName, { job }); let consecutiveErrors = 0;
    for (const queued of games) {
      const game = data.getGame(userId, queued.id);
      if (!game || game.coverUrl) { job.skipped++; job.processed++; notify(userId, eventName, { job }); continue; }
      job.current = game.title;
      try {
        const match = await lookup(credentials, game.title, game.platform);
        if (match) {
          const updated = await persist(userId, game, match, provider);
          if (updated) { job.matched++; notify(userId, 'game-updated', { source: provider, game: updated }); } else job.skipped++;
        } else job.unmatched++;
        consecutiveErrors = 0;
      } catch (error) {
        job.errors++; job.lastError = error.message; consecutiveErrors++;
        if (consecutiveErrors >= BULK_JOB.maxConsecutiveErrors) {
          job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString();
          notify(userId, eventName, { job }); return job;
        }
      }
      job.processed++; notify(userId, eventName, { job }); await pause(delayMs);
    }
    job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString(); notify(userId, eventName, { job }); return job;
  }
  function status(userId) { return { missing: data.gamesMissingCovers(userId).length, job: jobs.get(userId) || null }; }
  function start(userId, credentials) {
    if (jobs.get(userId)?.state === 'running') throw new Error(`A ${label} cover scan is already running.`);
    const missing = data.gamesMissingCovers(userId).length;
    run(userId, credentials).catch(error => {
      const previous = jobs.get(userId) || {};
      const job = { ...previous, state: 'failed', total: previous.total ?? missing, processed: previous.processed ?? 0,
        matched: previous.matched ?? 0, unmatched: previous.unmatched ?? 0, skipped: previous.skipped ?? 0,
        errors: (previous.errors ?? 0) + 1, error: error.message, lastError: error.message, current: '', finishedAt: new Date().toISOString() };
      jobs.set(userId, job); notify(userId, eventName, { job });
    });
    return { started: true, missing };
  }
  return { run, start, status };
}

module.exports = { createCoverProviderBulkManager };
