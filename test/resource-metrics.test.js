const test = require('node:test');
const assert = require('node:assert/strict');

const { getResourceAverages, sampleResourceUsage } = require('../server/resource-metrics');

test('resource sampler exposes real running session means', () => {
  sampleResourceUsage();
  const metrics = getResourceAverages();
  assert.ok(metrics.avgSamples >= 1);
  for (const key of ['avgCpu', 'avgHeapUsed', 'avgHeapTotal', 'avgRss']) {
    assert.equal(Number.isFinite(metrics[key]), true);
    assert.ok(metrics[key] >= 0);
  }
  assert.ok(metrics.avgHeapTotal >= metrics.avgHeapUsed);
  assert.ok(metrics.avgRss >= metrics.avgHeapUsed);
});
