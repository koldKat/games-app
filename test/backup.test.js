const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join(require('node:os').tmpdir(), `games-backup-test-${process.pid}.db`);
const backupDir = path.join(require('node:os').tmpdir(), `games-backup-test-${process.pid}`);
process.env.DB_PATH = dbPath;
process.env.BACKUP_DIR = backupDir;
const data = require('../server/db');
const backup = require('../server/backup');

test.after(() => {
  data.db.close();
  fs.rmSync(backupDir, { recursive: true, force: true });
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

test('daily backups are ZIP archives, deduplicated per day, and removable', async () => {
  const hour = new Date(2026, 7, 12, 3, 24, 0);
  const first = await backup.runBackup(hour);
  assert.equal(first.created, true);
  assert.equal(first.name, 'backup-2026-08-12.zip');
  const archive = path.join(backupDir, first.name);
  const archiveBytes = fs.readFileSync(archive);
  assert.equal(archiveBytes.subarray(0, 2).toString(), 'PK');
  assert.ok(archiveBytes.includes(Buffer.from('games.db')), 'archive stores the SQLite snapshot entry');
  assert.equal(fs.statSync(archive).mode & 0o777, 0o600);
  assert.equal(fs.statSync(dbPath).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(backupDir).some(name => name.endsWith('.sqlite')), false);

  const duplicate = await backup.runBackup(new Date(2026, 7, 12, 23, 59, 59));
  assert.equal(duplicate.created, false);
  assert.equal(backup.listBackups().length, 1);
  assert.equal(backup.deleteBackup(first.name), true);
  assert.equal(backup.listBackups().length, 0);
});

test('the scheduler calculates the next local midnight', () => {
  assert.equal(backup.millisecondsUntilNextDay(new Date(2026, 7, 12, 3, 24, 30, 250)), 74_129_750);
});

test('retention keeps 30 days and ignores files that are not database archives',()=>{
  const now=new Date(2026,10,21).getTime();
  for(const [name,days] of [['backup-2026-11-01.zip',20],['backup-2026-10-20_03h.zip',32],['backup.test.js',90]]){
    const file=path.join(backupDir,name);fs.writeFileSync(file,'test');
    const date=new Date(now-days*86400000);fs.utimesSync(file,date,date);
  }
  assert.equal(backup.KEEP_DAYS,30);assert.equal(backup.prune(now),1);
  assert.ok(fs.existsSync(path.join(backupDir,'backup-2026-11-01.zip')));
  assert.ok(fs.existsSync(path.join(backupDir,'backup.test.js')));
  assert.deepEqual(backup.listBackups().map(row=>row.name),['backup-2026-11-01.zip']);
});
