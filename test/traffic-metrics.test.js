const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const dbPath = path.join('/tmp', `games-traffic-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const data = require('../server/db');
const { TRAFFIC_ACCOUNTING_VERSION, createTrafficMetrics } = require('../server/traffic-metrics');
const writeSetting = data.db.prepare(`INSERT INTO runtime_settings(key,value) VALUES (?,?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

function seedTraffic(trafficIn = 0, trafficOut = 0, version = TRAFFIC_ACCOUNTING_VERSION) {
  writeSetting.run('traffic_in', String(trafficIn));
  writeSetting.run('traffic_out', String(trafficOut));
  writeSetting.run('traffic_accounting_version', version);
}

test.after(() => {
  data.db.close();
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('an incompatible accounting epoch resets only the old traffic totals', () => {
  seedTraffic(999, 888, '1');
  const traffic = createTrafficMetrics(data.db);
  assert.deepEqual(traffic.stats(), { trafficIn: 0, trafficOut: 0 });
  assert.equal(data.db.prepare("SELECT value FROM runtime_settings WHERE key='traffic_accounting_version'").get().value, TRAFFIC_ACCOUNTING_VERSION);
  assert.equal(data.db.prepare("SELECT value FROM runtime_settings WHERE key='traffic_in'").get().value, '0');
  assert.equal(data.db.prepare("SELECT value FROM runtime_settings WHERE key='traffic_out'").get().value, '0');
});

test('traffic counters persist on their request cadence and survive reconstruction', () => {
  seedTraffic();
  const traffic = createTrafficMetrics(data.db, { flushEvery: 2 });
  traffic.recordTraffic(120, 450);
  assert.equal(data.db.prepare("SELECT value FROM runtime_settings WHERE key='traffic_in'").get().value, '0');
  traffic.recordTraffic(80, 50);
  assert.deepEqual(traffic.stats(), { trafficIn: 200, trafficOut: 500 });
  assert.equal(data.db.prepare("SELECT value FROM runtime_settings WHERE key='traffic_in'").get().value, '200');
  assert.deepEqual(createTrafficMetrics(data.db).stats(), { trafficIn: 200, trafficOut: 500 });
});

test('the first request includes bytes Node read before invoking the handler', () => {
  seedTraffic();
  const traffic = createTrafficMetrics(data.db, { flushEvery: 50 });
  const socket = { bytesRead: 1_000, bytesWritten: 0 };
  const response = new EventEmitter();
  traffic.trackRequest({ socket }, response);
  socket.bytesWritten += 512;
  response.emit('finish'); response.emit('close');
  assert.deepEqual(traffic.stats(), { trafficIn: 1_000, trafficOut: 512 });
});

test('keep-alive requests count only new socket bytes and finish exactly once', () => {
  seedTraffic();
  const traffic = createTrafficMetrics(data.db, { flushEvery: 50 });
  const socket = { bytesRead: 400, bytesWritten: 0 };
  const firstResponse = new EventEmitter();
  traffic.trackRequest({ socket }, firstResponse);
  socket.bytesWritten = 300;
  firstResponse.emit('finish'); firstResponse.emit('close');

  socket.bytesRead += 175;
  const secondResponse = new EventEmitter();
  traffic.trackRequest({ socket }, secondResponse);
  socket.bytesWritten += 225;
  secondResponse.emit('finish'); secondResponse.emit('close');

  assert.deepEqual(traffic.stats(), { trafficIn: 575, trafficOut: 525 });
});

test('stats and flush sample active long-lived sockets before they close', () => {
  seedTraffic();
  const traffic = createTrafficMetrics(data.db, { flushEvery: 50 });
  const socket = new EventEmitter();
  socket.bytesRead = 300;
  socket.bytesWritten = 0;
  const response = new EventEmitter();
  traffic.trackRequest({ socket }, response);

  socket.bytesWritten = 120;
  assert.deepEqual(traffic.stats(), { trafficIn: 300, trafficOut: 120 });
  socket.bytesWritten = 260;
  traffic.flush();
  assert.equal(data.db.prepare("SELECT value FROM runtime_settings WHERE key='traffic_out'").get().value, '260');

  socket.bytesRead += 25;
  socket.bytesWritten += 40;
  response.emit('finish');
  response.emit('close');
  assert.deepEqual(traffic.stats(), { trafficIn: 325, trafficOut: 300 });
});

test('closed sockets are sampled once and released from active accounting', () => {
  seedTraffic();
  const traffic = createTrafficMetrics(data.db, { flushEvery: 50 });
  const socket = new EventEmitter();
  socket.bytesRead = 90;
  socket.bytesWritten = 45;
  const response = new EventEmitter();
  traffic.trackRequest({ socket }, response);
  socket.emit('close');
  assert.deepEqual(traffic.stats(), { trafficIn: 90, trafficOut: 45 });

  socket.bytesRead += 100;
  socket.bytesWritten += 100;
  assert.deepEqual(traffic.stats(), { trafficIn: 90, trafficOut: 45 });
});
