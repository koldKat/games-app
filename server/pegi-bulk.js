const { BULK_JOB, PC_STOREFRONT_VALUES } = require('./constants');

const normalize = value => String(value || '').replace(/[™®©]/g, '').normalize('NFKD').replace(/\p{M}/gu, '')
  .toLocaleLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const pcStorefrontKeys = new Set(PC_STOREFRONT_VALUES.map(normalize));

function platformKey(value) {
  const text = normalize(value);
  if (pcStorefrontKeys.has(text)) return 'pc';
  if (/nintendo switch 2/.test(text)) return 'switch-2';
  if (/nintendo switch/.test(text)) return 'switch';
  if (/playstation 5|ps5/.test(text)) return 'ps5';
  if (/playstation 4|ps4/.test(text)) return 'ps4';
  if (/playstation 3|ps3/.test(text)) return 'ps3';
  if (/playstation 2|ps2/.test(text)) return 'ps2';
  if (/playstation portable|psp/.test(text)) return 'psp';
  if (/playstation vita|ps vita/.test(text)) return 'vita';
  if (/xbox series/.test(text)) return 'xbox-series';
  if (/xbox one/.test(text)) return 'xbox-one';
  if (/xbox 360/.test(text)) return 'xbox-360';
  if (/pc windows|^pc$|windows/.test(text)) return 'pc';
  if (/nintendo 3ds/.test(text)) return '3ds';
  return text;
}

function matchesPlatform(gamePlatform, result) {
  const wanted = platformKey(gamePlatform);
  return (result.releases || []).some(release => platformKey(String(release).split(/\s+-\s+(?=\d{2}\/\d{2}\/\d{4})/)[0]) === wanted);
}

function bestExactPegi(game, results) {
  const wanted = normalize(game.title);
  const exact = (results || []).filter(result => normalize(result.title) === wanted);
  const platformExact = exact.filter(result => matchesPlatform(game.platform, result));
  if (platformExact.length === 1) return platformExact[0];
  if (platformExact.length > 1) return null;
  return exact.length === 1 ? exact[0] : null;
}

function needsPegiMetadata(game) {
  return Boolean(game) && !/^Evercade/i.test(String(game.platform || '')) && !game.pegiUrl
    && !(game.pegiDescriptors || []).length && !(game.pegiReleases || []).length
    && !game.pegiAdvice && !game.pegiOutline && !game.pegiContentIssues && !game.pegiOtherIssues;
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function createPegiBulkManager({ data, lookup, pause = wait, notify = () => {} }) {
  const jobs = new Map();

  async function run(userId) {
    const games = data.gamesMissingPegiMetadata(userId);
    const job = { state: 'running', total: games.length, processed: 0, matched: 0, unmatched: 0, skipped: 0, errors: 0, current: '', startedAt: new Date().toISOString() };
    jobs.set(userId, job);
    notify(userId, 'pegi-job', { job });
    let consecutiveErrors = 0;
    for (const game of games) {
      const current = typeof data.getGame === 'function' ? data.getGame(userId, game.id) : game;
      if (!needsPegiMetadata(current)) {
        job.current = ''; job.skipped++; job.processed++; notify(userId, 'pegi-job', { job }); continue;
      }
      job.current = current.title;
      try {
        const match = bestExactPegi(current, await lookup(current.title));
        if (match) {
          const updated = data.updateGamePegiMetadata(userId, game.id, match);
          if (updated) { job.matched++; notify(userId, 'game-updated', { source: 'pegi', game: updated }); }
          else job.skipped++;
        }
        else job.unmatched++;
        consecutiveErrors = 0;
      } catch (error) {
        job.errors++; job.lastError = error.message; consecutiveErrors++;
        if (consecutiveErrors >= BULK_JOB.maxConsecutiveErrors) { job.processed++; job.state = 'failed'; job.current = ''; job.finishedAt = new Date().toISOString(); notify(userId, 'pegi-job', { job }); return job; }
      }
      job.processed++;
      notify(userId, 'pegi-job', { job });
      await pause(BULK_JOB.pegiDelayMs);
    }
    job.state = 'complete'; job.current = ''; job.finishedAt = new Date().toISOString();
    notify(userId, 'pegi-job', { job });
    return job;
  }

  function status(userId) { return { missing: data.gamesMissingPegiMetadata(userId).length, job: jobs.get(userId) || null }; }
  function start(userId) {
    const active = jobs.get(userId);
    if (active?.state === 'running') throw new Error('A PEGI metadata scan is already running.');
    const missing = data.gamesMissingPegiMetadata(userId).length;
    run(userId).catch(error => {
      const previous = jobs.get(userId) || {};
      const job = { ...previous, state: 'failed', total: previous.total ?? missing, processed: previous.processed ?? 0,
        matched: previous.matched ?? 0, unmatched: previous.unmatched ?? 0, skipped: previous.skipped ?? 0, errors: (previous.errors ?? 0) + 1,
        error: error.message, lastError: error.message, current: '', finishedAt: new Date().toISOString() };
      jobs.set(userId, job); notify(userId, 'pegi-job', { job });
    });
    return { started: true, missing };
  }

  return { run, start, status };
}

module.exports = { bestExactPegi, createPegiBulkManager, matchesPlatform, needsPegiMetadata, normalize, platformKey };
