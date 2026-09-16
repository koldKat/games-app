'use strict';

const { db } = require('./db');

const TRAFFIC_FLUSH_EVERY = 50;
const TRAFFIC_ACCOUNTING_VERSION = '2';

function createTrafficMetrics(database, { flushEvery = TRAFFIC_FLUSH_EVERY } = {}) {
  const read = database.prepare('SELECT value FROM runtime_settings WHERE key=?');
  const write = database.prepare(`INSERT INTO runtime_settings(key,value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
  const accountingChanged = read.get('traffic_accounting_version')?.value !== TRAFFIC_ACCOUNTING_VERSION;
  let trafficIn = accountingChanged ? 0 : Math.max(0, Number(read.get('traffic_in')?.value) || 0);
  let trafficOut = accountingChanged ? 0 : Math.max(0, Number(read.get('traffic_out')?.value) || 0);
  let dirtyUpdates = 0;
  const socketTotals = new Map();
  const persist = database.transaction(() => {
    write.run('traffic_in', String(trafficIn));
    write.run('traffic_out', String(trafficOut));
    write.run('traffic_accounting_version', TRAFFIC_ACCOUNTING_VERSION);
  });
  if (accountingChanged) persist();

  function persistNow() {
    persist();
    dirtyUpdates = 0;
  }

  function recordTraffic(bytesIn, bytesOut) {
    const incoming = Math.max(0, Math.round(Number(bytesIn) || 0));
    const outgoing = Math.max(0, Math.round(Number(bytesOut) || 0));
    if (!incoming && !outgoing) return;
    trafficIn += incoming;
    trafficOut += outgoing;
    dirtyUpdates += 1;
    if (dirtyUpdates >= Math.max(1, Number(flushEvery) || TRAFFIC_FLUSH_EVERY)) persistNow();
  }

  function sampleSocket(socket, accounted) {
    const bytesRead = Math.max(0, Number(socket.bytesRead) || 0);
    const bytesWritten = Math.max(0, Number(socket.bytesWritten) || 0);
    const incoming = bytesRead - accounted.bytesRead;
    const outgoing = bytesWritten - accounted.bytesWritten;
    accounted.bytesRead = bytesRead;
    accounted.bytesWritten = bytesWritten;
    recordTraffic(incoming, outgoing);
  }

  function sampleSockets() {
    for (const [socket, accounted] of socketTotals) sampleSocket(socket, accounted);
  }

  function flush() {
    sampleSockets();
    persistNow();
  }

  function trackRequest(request, response) {
    const socket = request.socket;
    if (!socket) return;
    let accounted = socketTotals.get(socket);
    if (!accounted) {
      accounted = { bytesRead: 0, bytesWritten: 0 };
      socketTotals.set(socket, accounted);
      socket.once?.('close', () => {
        sampleSocket(socket, accounted);
        socketTotals.delete(socket);
      });
    }
    let recorded = false;
    const finish = () => {
      if (recorded) return;
      recorded = true;
      sampleSocket(socket, accounted);
    };
    response.once('finish', finish);
    response.once('close', finish);
  }

  function stats() {
    sampleSockets();
    return { trafficIn, trafficOut };
  }

  return { flush, recordTraffic, stats, trackRequest };
}

const metrics = createTrafficMetrics(db);

module.exports = { TRAFFIC_ACCOUNTING_VERSION, TRAFFIC_FLUSH_EVERY, createTrafficMetrics, ...metrics };
