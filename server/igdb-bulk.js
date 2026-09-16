'use strict';

const { BULK_JOB } = require('./constants');
const { wait } = require('./cover-provider-utils');

function createIgdbBulkManager({ data, lookup, saveCover = null, notify = () => {}, pause = wait }) {
  const jobs = new Map();
  async function run(userId, credentials) {
    const games = data.gamesMissingIgdb(userId);
    const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0, skipped: 0,
      errors: 0, current: '', startedAt: new Date().toISOString() };
    jobs.set(userId, job); notify(userId, 'igdb-job', { job }); let consecutiveErrors = 0;
    for (const queued of games) {
      const game = data.getGame(userId, queued.id);
      if (!game || game.playStatus === 'hidden' || game.igdbId) { job.skipped++; job.processed++; notify(userId, 'igdb-job', { job }); continue; }
      job.current = game.title;
      try {
        const match = await lookup(credentials, game.title, game.platform);
        if (!match) job.unmatched++;
        else {
          let cover = null;
          if (!game.coverUrl && match.coverUrl && saveCover) cover = await saveCover(userId, game, { url: match.coverUrl, gameTitle: match.title }, 'igdb');
          const updated = data.updateGameIgdb(userId, game.id, match);
          if (updated) { job.matched++; notify(userId, 'game-updated', { source: 'igdb', game: cover ? { ...updated, coverUrl: cover.coverUrl, coverSource: cover.coverSource, coverMatchTitle: cover.coverMatchTitle } : updated }); }
          else job.skipped++;
        }
        consecutiveErrors = 0;
      } catch (error) {
        job.errors++; job.lastError = error.message; consecutiveErrors++;
        if (consecutiveErrors >= BULK_JOB.maxConsecutiveErrors) {
          job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString(); notify(userId, 'igdb-job', { job }); return job;
        }
      }
      job.processed++; notify(userId, 'igdb-job', { job }); await pause(BULK_JOB.igdbDelayMs);
    }
    job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString(); notify(userId, 'igdb-job', { job }); return job;
  }
  function status(userId) { return { missing: data.gamesMissingIgdb(userId).length, job: jobs.get(userId) || null }; }
  function start(userId, credentials) {
    if (jobs.get(userId)?.state === 'running') throw new Error('An IGDB metadata scan is already running.');
    const missing = data.gamesMissingIgdb(userId).length;
    run(userId, credentials).catch(error => {
      const previous = jobs.get(userId) || {};
      const job = { ...previous, state: 'failed', total: previous.total ?? missing, processed: previous.processed ?? 0,
        matched: previous.matched ?? 0, unmatched: previous.unmatched ?? 0, skipped: previous.skipped ?? 0,
        errors: (previous.errors ?? 0) + 1, error: error.message, lastError: error.message, current: '', finishedAt: new Date().toISOString() };
      jobs.set(userId, job); notify(userId, 'igdb-job', { job });
    });
    return { started: true, missing };
  }
  return { run, start, status };
}

module.exports = { createIgdbBulkManager };
