'use strict';

const { BULK_JOB } = require('./constants');

const normalize = value => String(value || '').replace(/[™®©]/g, '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLocaleLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

function bestExactHltb(title, results) {
  const wanted = normalize(title);
  const exact = (results || []).filter(result => normalize(result.title) === wanted);
  return exact.length === 1 ? exact[0] : null;
}

function needsHltb(game) { return Boolean(game) && !game.hltbId; }
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function createHltbBulkManager({ data, lookup, pause = wait, notify = () => {} }) {
  const jobs = new Map();

  async function run(userId) {
    const games = data.gamesMissingHltb(userId);
    const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0,
      skipped: 0, errors: 0, current: '', startedAt: new Date().toISOString() };
    jobs.set(userId, job); notify(userId, 'hltb-job', { job });
    let consecutiveErrors = 0;
    for (const game of games) {
      const current = typeof data.getGame === 'function' ? data.getGame(userId, game.id) : game;
      if (!needsHltb(current)) {
        job.current = ''; job.skipped++; job.processed++; notify(userId, 'hltb-job', { job }); continue;
      }
      job.current = current.title;
      try {
        const match = bestExactHltb(current.title, await lookup(current.title));
        if (match) {
          const updated = data.updateGameHltb(userId, current.id, match);
          if (updated) { job.matched++; notify(userId, 'game-updated', { source: 'hltb', game: updated }); }
          else job.skipped++;
        } else job.unmatched++;
        consecutiveErrors = 0;
      } catch (error) {
        job.errors++; job.lastError = error.message; consecutiveErrors++;
        if (consecutiveErrors >= BULK_JOB.maxConsecutiveErrors) {
          job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString();
          notify(userId, 'hltb-job', { job }); return job;
        }
      }
      job.processed++; notify(userId, 'hltb-job', { job });
      await pause(BULK_JOB.hltbDelayMs);
    }
    job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString();
    notify(userId, 'hltb-job', { job }); return job;
  }

  function status(userId) { return { missing: data.gamesMissingHltb(userId).length, job: jobs.get(userId) || null }; }
  function start(userId) {
    if (jobs.get(userId)?.state === 'running') throw new Error('An HLTB scan is already running.');
    const missing = data.gamesMissingHltb(userId).length;
    run(userId).catch(error => {
      const previous = jobs.get(userId) || {};
      const job = { ...previous, state: 'failed', total: previous.total ?? missing, processed: previous.processed ?? 0,
        matched: previous.matched ?? 0, unmatched: previous.unmatched ?? 0, skipped: previous.skipped ?? 0,
        errors: (previous.errors ?? 0) + 1, error: error.message, lastError: error.message,
        current: '', finishedAt: new Date().toISOString() };
      jobs.set(userId, job); notify(userId, 'hltb-job', { job });
    });
    return { started: true, missing };
  }

  return { run, start, status };
}

module.exports = { bestExactHltb, createHltbBulkManager, needsHltb, normalize };
