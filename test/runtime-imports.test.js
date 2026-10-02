const test = require('node:test');
const assert = require('node:assert/strict');
const { createLibraryImportRunner } = require('../server/runtime/library-imports');

function fixture() {
  const events = [];
  const chunks = [];
  const runner = createLibraryImportRunner({
    progression: {
      info: () => ({ xp: 0 }),
      recordImportedGames(userId, games, options) {
        chunks.push({ userId, count: games.length, milestones: options.milestones });
        return { awards: [], progress: { xp: games.length } };
      },
    },
    events: { publish: (...event) => events.push(event) },
    publishProgression() {},
  });
  return { runner, events, chunks };
}

test('large import postprocessing yields and emits scoped progress in bounded chunks', async () => {
  const app = fixture();
  const games = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, title: `Game ${index}` }));
  let yielded = false; setImmediate(() => { yielded = true; });
  const result = await app.runner({ userId: 1, provider: 'Steam', ids: [], progressEvent: 'steam-import-progress',
    service: { importSelection: async () => ({ xpGames: games, created: games, linked: [] }) } });
  assert.equal(yielded, true);
  assert.deepEqual(app.chunks.map(chunk => chunk.count), [5, 5, 2, 0]);
  assert.equal(app.chunks.at(-1).milestones, true);
  assert.equal(result.created.length, 12); assert.equal(result.xpGames, undefined);
  assert.equal(app.events.at(-1)[1], 'games-imported');
  assert.ok(app.events.every(event => event[0] === 1));
});

test('duplicate imports are blocked while running and locks clear after failure', async () => {
  const app = fixture(); let rejectImport;
  const options = { userId: 1, provider: 'GOG', ids: [], progressEvent: 'gog-import-progress',
    service: { importSelection: () => new Promise((_, reject) => { rejectImport = reject; }) } };
  const first = app.runner(options);
  const failed = assert.rejects(first, /Provider failed/);
  await assert.rejects(app.runner(options), error => error.status === 409);
  rejectImport(new Error('Provider failed')); await failed;
  const result = await app.runner({ ...options, service: { importSelection: async () => ({ xpGames: [], created: [], linked: [] }) } });
  assert.deepEqual(result.created, []);
});

test('separate runtime instances do not share active-import locks', async () => {
  const first = fixture(); const second = fixture(); let finish;
  const result = { xpGames: [], created: [], linked: [] };
  const options = { userId: 1, provider: 'Steam', ids: [], progressEvent: 'steam-import-progress' };
  const running = first.runner({ ...options, service: { importSelection: () => new Promise(resolve => { finish = resolve; }) } });
  await second.runner({ ...options, service: { importSelection: async () => result } });
  finish(result); await running;
});
