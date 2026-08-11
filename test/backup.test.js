const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join('/tmp', `games-backup-test-${process.pid}.db`);
const backupDir = path.join('/tmp', `games-backup-test-${process.pid}`);
process.env.DB_PATH = dbPath;
process.env.BACKUP_DIR = backupDir;
const data = require('../server/db');
const backup = require('../server/backup');

test.after(() => {
  data.db.close();
  fs.rmSync(backupDir, { recursive: true, force: true });
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('hourly backups are ZIP archives, deduplicated per hour, and removable', async () => {
  const hour = new Date(2026, 7, 12, 3, 24, 0);
  const first = await backup.runBackup(hour);
  assert.equal(first.created, true);
  assert.equal(first.name, 'backup-2026-08-12_03h.zip');
  const archive = path.join(backupDir, first.name);
  assert.equal(fs.readFileSync(archive).subarray(0, 2).toString(), 'PK');
  assert.equal(fs.readdirSync(backupDir).some(name => name.endsWith('.sqlite')), false);

  const duplicate = await backup.runBackup(new Date(2026, 7, 12, 3, 59, 59));
  assert.equal(duplicate.created, false);
  assert.equal(backup.listBackups().length, 1);
  assert.equal(backup.deleteBackup(first.name), true);
  assert.equal(backup.listBackups().length, 0);
});

test('the scheduler calculates the next exact hour', () => {
  assert.equal(backup.millisecondsUntilNextHour(new Date(2026, 7, 12, 3, 24, 30, 250)), 2_129_750);
});
