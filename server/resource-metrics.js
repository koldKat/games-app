'use strict';

const os = require('node:os');

let lastSampleAt = Date.now();
let lastCpuUsage = process.cpuUsage();
let sampleCount = 0;
let averageCpu = 0;
let averageHeapUsed = 0;
let averageHeapTotal = 0;
let averageRss = 0;

function sampleResourceUsage() {
  const sampledAt = Date.now();
  const cpuUsage = process.cpuUsage();
  const elapsedMicroseconds = Math.max(1, (sampledAt - lastSampleAt) * 1_000);
  const usedMicroseconds = (cpuUsage.user - lastCpuUsage.user) + (cpuUsage.system - lastCpuUsage.system);
  const cpuPercent = Math.max(0, usedMicroseconds / (elapsedMicroseconds * Math.max(1, os.cpus().length)) * 100);
  const memory = process.memoryUsage();
  lastSampleAt = sampledAt;
  lastCpuUsage = cpuUsage;
  sampleCount += 1;
  averageCpu += (cpuPercent - averageCpu) / sampleCount;
  averageHeapUsed += (memory.heapUsed - averageHeapUsed) / sampleCount;
  averageHeapTotal += (memory.heapTotal - averageHeapTotal) / sampleCount;
  averageRss += (memory.rss - averageRss) / sampleCount;
}

function getResourceAverages() {
  return {
    avgCpu: Math.round(averageCpu * 10) / 10,
    avgHeapUsed: Math.round(averageHeapUsed),
    avgHeapTotal: Math.round(averageHeapTotal),
    avgRss: Math.round(averageRss),
    avgSamples: sampleCount,
  };
}

const sampler = setInterval(sampleResourceUsage, 1_000);
sampler.unref();

module.exports = { getResourceAverages, sampleResourceUsage };
