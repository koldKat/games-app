const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(api = async () => ({})) {
  const fields = new Map(); const frames = new Map(); let sequence = 0;
  const header = { hidden: true, querySelector(selector) {
    if (!fields.has(selector)) fields.set(selector, { textContent: '', style: {} });
    return fields.get(selector);
  } };
  const source = fs.readFileSync(require.resolve('../public/js/progression/progression-ui.js'), 'utf8')
    .replace(/^import[^\n]*\n/, '').replace(/^export /gm, '');
  const factory = vm.runInNewContext(source + '\ncreateProgressionUi', {
    UI_LOCALE: 'en-US', UI_TIMING: { progressionMsPerLevel: 100, progressionRetryMs: 10 },
    document: { getElementById: id => id === 'header-progression' ? header : null },
    performance: { now: () => 0 }, setTimeout, clearTimeout,
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  return { ui: factory({ api }), header, fields, frames };
}
const progress = xp => ({ xp, level: 1, title: 'Collector', currentLevelXp: 1000, nextLevelXp: 3000, progress: 25 });

test('restoring a new session cancels old XP animation, including a queued callback', () => {
  const app = fixture(); app.ui.hydrate(progress(1500));
  app.ui.handleEvent({ progress: progress(1600) });
  const stale = [...app.frames.values()][0]; assert.equal(typeof stale, 'function');
  app.ui.reset(); assert.equal(app.frames.size, 0); assert.equal(app.header.hidden, true);
  app.ui.hydrate(progress(2000)); stale(100);
  assert.equal(app.fields.get('[data-header-progress-xp]').textContent, '2,000 XP');
});

test('a late progression response cannot overwrite the next session or a newer live award', async () => {
  let resolve; const app = fixture(() => new Promise(done => { resolve = done; }));
  const pending = app.ui.load(); app.ui.reset(); app.ui.hydrate(progress(2000));
  resolve(progress(1500)); await pending;
  assert.equal(app.fields.get('[data-header-progress-xp]').textContent, '2,000 XP');
  const next = app.ui.load(); app.ui.handleEvent({ progress: progress(2100) });
  resolve(progress(2000)); await next;
  assert.equal(app.frames.size, 1);
});
