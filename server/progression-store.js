'use strict';

const { XP_EVENTS, progressForXp, xpForLevel } = require('./progression-policy');

function createProgressionStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_progression (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, xp INTEGER NOT NULL DEFAULT 0, backfilled_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS progression_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, event TEXT NOT NULL, ref TEXT NOT NULL, amount INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,event,ref));
    CREATE TABLE IF NOT EXISTS progression_config (event TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount >= 0 AND amount <= 100000), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  if (!db.pragma('table_info(user_progression)').some(column => column.name === 'backfilled_at')) db.exec('ALTER TABLE user_progression ADD COLUMN backfilled_at TEXT');
  const seed = db.prepare('INSERT OR IGNORE INTO progression_config(event, amount) VALUES (?, ?)');
  for (const [event, definition] of Object.entries(XP_EVENTS)) seed.run(event, definition.amount);
  const ensure = db.prepare('INSERT OR IGNORE INTO user_progression(user_id) VALUES (?)');
  const getXp = db.prepare('SELECT xp FROM user_progression WHERE user_id=?');
  const isBackfilled = db.prepare('SELECT backfilled_at FROM user_progression WHERE user_id=?');
  const markBackfilled = db.prepare('UPDATE user_progression SET backfilled_at=CURRENT_TIMESTAMP WHERE user_id=?');
  const configRows = db.prepare('SELECT event, amount FROM progression_config ORDER BY event');
  const eventInsert = db.prepare('INSERT OR IGNORE INTO progression_events(user_id,event,ref,amount) VALUES (?,?,?,?)');
  const addXp = db.prepare('UPDATE user_progression SET xp=xp+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?');
  const recentRows = db.prepare('SELECT event, ref, amount, created_at AS createdAt FROM progression_events WHERE user_id=? ORDER BY id DESC LIMIT ?');
  const txAward = db.transaction((userId, event, ref) => {
    if (!XP_EVENTS[event]) throw new Error('Unknown progression event.');
    ensure.run(userId); const before = progressForXp(getXp.get(userId).xp); const amount = Number(configRows.all().find(row => row.event === event)?.amount ?? XP_EVENTS[event].amount);
    const result = eventInsert.run(userId, event, String(ref), amount);
    if (result.changes) addXp.run(amount, userId);
    const progress = progressForXp(getXp.get(userId).xp);
    const levels = result.changes ? Array.from({ length: Math.max(0, progress.level - before.level) }, (_, index) => {
      const level = before.level + index + 1; return { level, title: progressForXp(xpForLevel(level)).title, previousTitle: level ? progressForXp(xpForLevel(level - 1)).title : '' };
    }) : [];
    return { awarded: Boolean(result.changes), amount, progress, levels };
  });
  function info(userId) { ensure.run(userId); return { ...progressForXp(getXp.get(userId).xp), recent: recentRows.all(userId, 8).map(row => ({ ...row, label: XP_EVENTS[row.event]?.label || row.event })) }; }
  function config() { const saved = Object.fromEntries(configRows.all().map(row => [row.event, row.amount])); return Object.entries(XP_EVENTS).map(([event, definition]) => ({ event, label: definition.label, amount: saved[event] ?? definition.amount })); }
  function setConfig(values = {}) { const update = db.prepare('UPDATE progression_config SET amount=?, updated_at=CURRENT_TIMESTAMP WHERE event=?'); for (const [event, amount] of Object.entries(values)) if (XP_EVENTS[event]) { const clean = Math.max(0, Math.min(100000, Math.round(Number(amount)))); if (!Number.isFinite(clean)) throw new Error(`Invalid XP amount for ${event}.`); update.run(clean, event); } return config(); }
  return { award: txAward, info, config, setConfig, isBackfilled: userId => { ensure.run(userId); return Boolean(isBackfilled.get(userId).backfilled_at); }, markBackfilled: userId => { ensure.run(userId); markBackfilled.run(userId); } };
}
module.exports = { createProgressionStore };
