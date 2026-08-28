'use strict';

const { BULK_JOB } = require('./constants');
const { wait } = require('./cover-provider-utils');

function isQuotaError(error) { return Number(error?.status) === 403 || Number(error?.status) === 429; }
function createDescriptionBulkManager({ data, lookups, pause = wait, notify = () => {} }) {
  const jobs = new Map();
  async function run(userId, credentials) {
    const games = data.gamesMissingDescriptions(userId);
    const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0, skipped: 0, errors: 0, current: '', startedAt: new Date().toISOString() };
    jobs.set(userId, job); notify(userId, 'description-job', { job }); let consecutiveErrors = 0;
    for (const queued of games) {
      const game = data.getGame(userId, queued.id);
      if (!game || game.description) { job.skipped++; job.processed++; notify(userId, 'description-job', { job }); continue; }
      job.current = game.title;
      try {
        let match = null; let steamError = null;
        try { match = await lookups.steam(game.title); } catch (error) { steamError = error; }
        try { if (!match && credentials) match = await lookups.thegamesdb(credentials, game.title, game.platform); }
        catch (error) { throw error; }
        if (!match && steamError) throw steamError;
        if (match) {
          const updated = data.updateGameDescription(userId, game.id, match);
          if (updated) { job.matched++; notify(userId, 'game-updated', { source: 'description', game: updated }); } else job.skipped++;
        } else job.unmatched++;
        consecutiveErrors = 0;
      } catch (error) {
        job.errors++; job.lastError = error.message; consecutiveErrors++;
        if (isQuotaError(error) || consecutiveErrors >= BULK_JOB.maxConsecutiveErrors) {
          job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString();
          notify(userId, 'description-job', { job }); return job;
        }
      }
      job.processed++; notify(userId, 'description-job', { job }); await pause(BULK_JOB.descriptionDelayMs);
    }
    job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString(); notify(userId, 'description-job', { job }); return job;
  }
  function status(userId) { return { missing: data.gamesMissingDescriptions(userId).length, job: jobs.get(userId) || null }; }
  function start(userId, credentials) {
    if (jobs.get(userId)?.state === 'running') throw new Error('A description scan is already running.');
    const missing = data.gamesMissingDescriptions(userId).length;
    run(userId, credentials).catch(error => { const previous = jobs.get(userId) || {};
      const job = { ...previous, state: 'failed', total: previous.total ?? missing, processed: previous.processed ?? 0, matched: previous.matched ?? 0, unmatched: previous.unmatched ?? 0, skipped: previous.skipped ?? 0, errors: (previous.errors ?? 0) + 1, error: error.message, lastError: error.message, current: '', finishedAt: new Date().toISOString() };
      jobs.set(userId, job); notify(userId, 'description-job', { job }); });
    return { started: true, missing };
  }
  return { run, start, status };
}
module.exports = { createDescriptionBulkManager, isQuotaError };
