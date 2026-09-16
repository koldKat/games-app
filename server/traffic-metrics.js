'use strict';

const { db } = require('./db');

const TRAFFIC_FLUSH_EVERY = 50;

function createTrafficMetrics(database, { flushEvery = TRAFFIC_FLUSH_EVERY } = {}) {
  const read = database.prepare('SELECT value FROM runtime_settings WHERE key=?');
  const write = database.prepare(`INSERT INTO runtime_settings(key,value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
  let trafficIn = Math.max(0, Number(read.get('traffic_in')?.value) || 0);
  let trafficOut = Math.max(0, Number(read.get('traffic_out')?.value) || 0);
  let dirtyRequests = 0;
  const persist = database.transaction(() => {
    write.run('traffic_in', String(trafficIn));
    write.run('traffic_out', String(trafficOut));
  });

  function flush() {
    persist();
    dirtyRequests = 0;
  }

  function recordTraffic(bytesIn, bytesOut) {
    trafficIn += Math.max(0, Math.round(Number(bytesIn) || 0));
    trafficOut += Math.max(0, Math.round(Number(bytesOut) || 0));
    dirtyRequests += 1;
    if (dirtyRequests >= Math.max(1, Number(flushEvery) || TRAFFIC_FLUSH_EVERY)) flush();
  }

  function trackRequest(request, response) {
    const socket = request.socket;
    const startedIn = Number(socket?.bytesRead) || 0;
    const startedOut = Number(socket?.bytesWritten) || 0;
    let recorded = false;
    const finish = () => {
      if (recorded) return;
      recorded = true;
      recordTraffic((Number(socket?.bytesRead) || 0) - startedIn, (Number(socket?.bytesWritten) || 0) - startedOut);
    };
    response.once('finish', finish);
    response.once('close', finish);
  }

  function stats() { return { trafficIn, trafficOut }; }

  return { flush, recordTraffic, stats, trackRequest };
}

const metrics = createTrafficMetrics(db);

module.exports = { TRAFFIC_FLUSH_EVERY, createTrafficMetrics, ...metrics };
