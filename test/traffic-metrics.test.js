const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const dbPath = path.join('/tmp', `games-traffic-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const { createTrafficMetrics } = require('../server/traffic-metrics');

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('traffic counters persist on their request cadence and survive reconstruction', () => {
  const traffic = createTrafficMetrics(data.db, { flushEvery: 2 });
  traffic.recordTraffic(120, 450);
  assert.equal(data.db.prepare("SELECT value FROM runtime_settings WHERE key='traffic_in'").get(), undefined);
  traffic.recordTraffic(80, 50);
  assert.deepEqual(traffic.stats(), { trafficIn: 200, trafficOut: 500 });
  assert.equal(data.db.prepare("SELECT value FROM runtime_settings WHERE key='traffic_in'").get().value, '200');
  assert.deepEqual(createTrafficMetrics(data.db).stats(), { trafficIn: 200, trafficOut: 500 });
});

test('a request records socket deltas exactly once across finish and close', () => {
  const traffic = createTrafficMetrics(data.db, { flushEvery: 50 });
  const socket = { bytesRead: 1_000, bytesWritten: 2_000 };
  const response = new EventEmitter();
  traffic.trackRequest({ socket }, response);
  socket.bytesRead += 64; socket.bytesWritten += 512;
  response.emit('finish'); response.emit('close');
  assert.deepEqual(traffic.stats(), { trafficIn: 264, trafficOut: 1_012 });
});
