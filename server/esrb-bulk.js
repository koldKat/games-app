'use strict';
const { BULK_JOB } = require('./constants');
const { normalize, platformKey } = require('./pegi-bulk');

function matchesPlatform(gamePlatform, result) {
  const wanted = platformKey(gamePlatform);
  const platforms = (result.platforms || []).join(' ').toLocaleLowerCase();
  if (!platforms) return false;
  const aliases = {
    'switch-2': /nintendo\s+switch\s*2/, switch: /nintendo\s+switch(?!\s*2)/,
    ps5: /playstation\s*5|\bps5\b/, ps4: /playstation\s*4|\bps4\b/,
    'xbox-series': /xbox\s+series/, 'xbox-one': /xbox\s+one/,
    pc: /\bpc\b|windows|computer/,
  };
  return aliases[wanted]?.test(platforms) || (wanted === platformKey(platforms));
}
function factsKey(result) {
  return [result.esrbRating, ...(result.descriptors || []), ...(result.interactiveElements || []), result.summary]
    .map(value => normalize(value)).join('\u0000');
}
function bestExactEsrb(game, results) {
  const exact = (results || []).filter(result => normalize(result.title) === normalize(game.title));
  const platformExact = exact.filter(result => matchesPlatform(game.platform, result));
  if (platformExact.length === 1) return platformExact[0];
  if (exact.length === 1) return exact[0];
  // ESRB commonly returns one record per platform despite the same US rating.
  // A shared factual fingerprint is safe to apply; conflicting editions remain manual.
  const equivalent = new Map(exact.map(result => [factsKey(result), result]));
  return equivalent.size === 1 ? exact[0] : null;
}
function needsEsrbMetadata(game) { return Boolean(game) && !game.esrbUrl && !game.esrbRating && !(game.esrbDescriptors || []).length && !(game.esrbInteractiveElements || []).length && !game.esrbSummary; }
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function createEsrbBulkManager({ data, lookup, pause = wait, notify = () => {} }) {
  const jobs = new Map();
  async function run(userId) {
    const games = data.gamesMissingEsrbMetadata(userId); const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0, skipped: 0, errors: 0, current: '', startedAt: new Date().toISOString() };
    jobs.set(userId, job); notify(userId, 'esrb-job', { job }); let consecutiveErrors = 0;
    for (const game of games) {
      const current = data.getGame?.(userId, game.id) || game;
      if (!needsEsrbMetadata(current)) { job.skipped++; job.processed++; notify(userId, 'esrb-job', { job }); continue; }
      job.current = current.title;
      try { const match = bestExactEsrb(current, await lookup(current.title)); if (match) { const updated = data.updateGameEsrbMetadata(userId, game.id, match); if (updated) { job.matched++; notify(userId, 'game-updated', { source: 'esrb', game: updated }); } else job.skipped++; } else job.unmatched++; consecutiveErrors = 0; }
      catch (error) { job.errors++; job.lastError = error.message; if (++consecutiveErrors >= BULK_JOB.maxConsecutiveErrors) { job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString(); notify(userId, 'esrb-job', { job }); return job; } }
      job.processed++; notify(userId, 'esrb-job', { job }); await pause(BULK_JOB.esrbDelayMs);
    }
    job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString(); notify(userId, 'esrb-job', { job }); return job;
  }
  function status(userId) { return { missing: data.gamesMissingEsrbMetadata(userId).length, job: jobs.get(userId) || null }; }
  function start(userId) {
    if (jobs.get(userId)?.state === 'running') throw new Error('An ESRB metadata scan is already running.');
    const missing = status(userId).missing;
    run(userId).catch(error => {
      const previous = jobs.get(userId) || {};
      const job = { ...previous, state: 'failed', total: previous.total ?? missing, processed: previous.processed ?? 0,
        matched: previous.matched ?? 0, unmatched: previous.unmatched ?? 0, skipped: previous.skipped ?? 0,
        errors: (previous.errors ?? 0) + 1, lastError: error.message, current: '', finishedAt: new Date().toISOString() };
      jobs.set(userId, job); notify(userId, 'esrb-job', { job });
    });
    return { started: true, missing };
  }
  return { run, start, status };
}
module.exports = { bestExactEsrb, createEsrbBulkManager, needsEsrbMetadata };
