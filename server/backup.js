'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { db } = require('./db');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
let activeBackup = null;
let started = false;

function pad(value) { return String(value).padStart(2, '0'); }
function dailyName(now = new Date()) {
  return `backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
}
function validName(filename) { return /^backup-\d{4}-\d{2}-\d{2}(?:_\d{2}h)?\.zip$/.test(filename); }

function zipFile(source, destination) {
  return new Promise((resolve, reject) => {
    execFile('zip', ['-j', '-q', destination, source], error => error ? reject(error) : resolve());
  });
}

function prune(now = Date.now()) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const cutoff = Number(now) - KEEP_DAYS * DAY_MS;
  let deleted = 0;
  for (const filename of fs.readdirSync(BACKUP_DIR)) {
    if (!validName(filename)) continue;
    const fullPath = path.join(BACKUP_DIR, filename);
    try {
      fs.chmodSync(fullPath, 0o600);
      if (fs.statSync(fullPath).mtimeMs < cutoff) { fs.unlinkSync(fullPath); deleted++; }
    } catch {}
  }
  return deleted;
}

async function performBackup(now = new Date()) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = dailyName(now);
  const archivePath = path.join(BACKUP_DIR, name);
  prune(now.getTime());
  if (fs.existsSync(archivePath)) return { name, created: false };

  const workToken = `${process.pid}-${Date.now()}`;
  const workDirectory = path.join(BACKUP_DIR, `.${name.slice(0, -4)}-${workToken}`);
  const snapshotPath = path.join(workDirectory, 'games.db');
  const temporaryArchive = path.join(BACKUP_DIR, `.${name.slice(0, -4)}-${workToken}.zip`);
  try {
    fs.mkdirSync(workDirectory);
    await db.backup(snapshotPath);
    await zipFile(snapshotPath, temporaryArchive);
    fs.renameSync(temporaryArchive, archivePath);
    fs.chmodSync(archivePath, 0o600);
  } catch (error) {
    try { fs.unlinkSync(temporaryArchive); } catch {}
    throw error;
  } finally {
    try { fs.unlinkSync(snapshotPath); } catch {}
    try { fs.rmdirSync(workDirectory); } catch {}
  }
  return { name, created: true };
}

function runBackup(now = new Date()) {
  if (activeBackup) return activeBackup;
  activeBackup = performBackup(now).finally(() => { activeBackup = null; });
  return activeBackup;
}

function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs.readdirSync(BACKUP_DIR).filter(validName).map(name => {
    const fullPath = path.join(BACKUP_DIR, name); fs.chmodSync(fullPath, 0o600);
    const stat = fs.statSync(fullPath);
    return { name, bytes: stat.size, createdAt: stat.mtime.toISOString() };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function deleteBackup(name) {
  if (!validName(name)) return false;
  try { fs.unlinkSync(path.join(BACKUP_DIR, name)); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function millisecondsUntilNextDay(now = new Date()) {
  const next = new Date(now); next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function start() {
  if (started) return;
  started = true;
  runBackup().then(result => console.log(`[backup] ${result.created ? 'created' : 'current'} ${result.name}`)).catch(error => console.error('[backup] startup run failed:', error.message));
  const first = setTimeout(function tick() {
    runBackup().then(result => console.log(`[backup] ${result.created ? 'created' : 'current'} ${result.name}`)).catch(error => console.error('[backup] scheduled run failed:', error.message));
    const next = setTimeout(tick, millisecondsUntilNextDay()); next.unref();
  }, millisecondsUntilNextDay());
  first.unref();
}

module.exports = { BACKUP_DIR, KEEP_DAYS, deleteBackup, dailyName, listBackups, millisecondsUntilNextDay, prune, runBackup, start, validName };
