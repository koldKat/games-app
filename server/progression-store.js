'use strict';

const { XP_EVENTS, progressForXp, xpForLevel } = require("./progression-policy");
const { CREW_SHARED_EVENT, createCrewXp, isShareable } = require("./crew-xp");

const CREW_BACKFILL = "crew-shared-xp-v1";

function createProgressionStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_progression (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, xp INTEGER NOT NULL DEFAULT 0, backfilled_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS progression_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, event TEXT NOT NULL, ref TEXT NOT NULL, amount INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,event,ref));
    CREATE TABLE IF NOT EXISTS progression_config (event TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount >= 0 AND amount <= 100000), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS progression_backfills (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, migration TEXT NOT NULL, completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,migration));`);
  if (!db.pragma('table_info(user_progression)').some(column => column.name === 'backfilled_at')) db.exec('ALTER TABLE user_progression ADD COLUMN backfilled_at TEXT');
  const seed = db.prepare('INSERT OR IGNORE INTO progression_config(event, amount) VALUES (?, ?)');
  for (const [event, definition] of Object.entries(XP_EVENTS)) seed.run(event, definition.amount);
  const ensure = db.prepare('INSERT OR IGNORE INTO user_progression(user_id) VALUES (?)');
  const getXp = db.prepare('SELECT xp FROM user_progression WHERE user_id=?');
  const isBackfilled = db.prepare('SELECT backfilled_at FROM user_progression WHERE user_id=?');
  const markBackfilled = db.prepare('UPDATE user_progression SET backfilled_at=CURRENT_TIMESTAMP WHERE user_id=?');
  const hasMigration = db.prepare('SELECT 1 FROM progression_backfills WHERE user_id=? AND migration=?');
  const markMigration = db.prepare('INSERT OR IGNORE INTO progression_backfills(user_id,migration) VALUES (?,?)');
  const configRows = db.prepare('SELECT event, amount FROM progression_config ORDER BY event');
  let amountCache = null;
  function configuredAmounts() {
    if (!amountCache) amountCache = new Map(configRows.all().map(row => [row.event, row.amount]));
    return amountCache;
  }
  const eventInsert = db.prepare('INSERT OR IGNORE INTO progression_events(user_id,event,ref,amount) VALUES (?,?,?,?)');
  const addXp = db.prepare('UPDATE user_progression SET xp=xp+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?');
  const recentRows = db.prepare('SELECT event, ref, amount, created_at AS createdAt FROM progression_events WHERE user_id=? ORDER BY id DESC LIMIT ?');
  let splitCrewXp;
  function levelsBetween(before, progress) {
    return Array.from({ length: Math.max(0, progress.level - before.level) }, (_, index) => {
      const level = before.level + index + 1;
      return { level, title: progressForXp(xpForLevel(level)).title, previousTitle: progressForXp(xpForLevel(level - 1)).title };
    });
  }
  const crewEventInsert = db.prepare(`
    INSERT OR IGNORE INTO progression_events(user_id,event,ref,amount,created_at)
    VALUES (?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))
  `);
  function grantCrewShares(sourceId, userId, amount, when = null) {
    const ref = `award:${sourceId}`;
    return splitCrewXp(userId, amount, when).flatMap(share => {
      ensure.run(share.userId);
      const before = progressForXp(getXp.get(share.userId).xp);
      if (!crewEventInsert.run(share.userId, CREW_SHARED_EVENT, ref, share.amount, when).changes) return [];
      addXp.run(share.amount, share.userId);
      const progress = progressForXp(getXp.get(share.userId).xp);
      return [{ ...share, event: CREW_SHARED_EVENT, ref, levels: levelsBetween(before, progress) }];
    });
  }
  const txAward = db.transaction((userId, event, ref, { share = true } = {}) => {
    if (!XP_EVENTS[event]) throw new Error("Unknown progression event.");
    ensure.run(userId);
    const before = progressForXp(getXp.get(userId).xp);
    const amount = Number(configuredAmounts().get(event) ?? XP_EVENTS[event].amount);
    const result = eventInsert.run(userId, event, String(ref), amount);
    if (result.changes) addXp.run(amount, userId);
    const progress = progressForXp(getXp.get(userId).xp);
    const awarded = Boolean(result.changes);
    const crewShares = awarded && share && isShareable(event, amount) && splitCrewXp
      ? grantCrewShares(result.lastInsertRowid, userId, amount) : [];
    return { awarded, amount, progress, levels: awarded ? levelsBetween(before, progress) : [], crewShares };
  });
  function enableCrewSharing() {
    splitCrewXp = createCrewXp(db);
  }
  const txBackfillCrewXp = db.transaction(() => {
    if (db.prepare("SELECT 1 FROM runtime_settings WHERE key=?").get(CREW_BACKFILL)) return [];
    const pastAwards = db.prepare(`
      SELECT e.id, e.user_id AS userId, e.amount, e.created_at AS createdAt
      FROM progression_events AS e
      WHERE e.amount>0 AND e.event NOT IN (?, ?) AND EXISTS (
        SELECT 1 FROM crew_members AS self JOIN crew_members AS peer ON peer.crew_id=self.crew_id
        WHERE self.user_id=e.user_id AND peer.user_id<>self.user_id
          AND self.joined_at<=e.created_at AND peer.joined_at<=e.created_at
      )
      AND NOT EXISTS (SELECT 1 FROM progression_events AS bonus
        WHERE bonus.event='${CREW_SHARED_EVENT}' AND bonus.ref=('award:'||e.id))
      ORDER BY e.created_at, e.id
    `);
    const updates = new Map();
    for (const e of pastAwards.all("crew_joined", CREW_SHARED_EVENT)) {
      for (const { userId, ...award } of grantCrewShares(e.id, e.userId, e.amount, e.createdAt)) {
        if (!updates.has(userId)) updates.set(userId, []);
        updates.get(userId).push(award);
      }
    }
    db.prepare("INSERT INTO runtime_settings(key,value) VALUES(?,?)").run(CREW_BACKFILL, "1");
    return [...updates].map(([userId, awards]) => ({ userId, awards, progress: info(userId) }));
  });
  function info(userId) {
    ensure.run(userId);
    return { ...progressForXp(getXp.get(userId).xp), recent: recentRows.all(userId, 8).map(row => ({
      ...row, label: row.event === CREW_SHARED_EVENT ? "Crew XP" : XP_EVENTS[row.event]?.label || row.event,
    })) };
  }
  function config() { const saved = configuredAmounts(); return Object.entries(XP_EVENTS).map(([event, definition]) => ({ event, label: definition.label, amount: saved.get(event) ?? definition.amount })); }
  function setConfig(values = {}) { const update = db.prepare('UPDATE progression_config SET amount=?, updated_at=CURRENT_TIMESTAMP WHERE event=?'); for (const [event, amount] of Object.entries(values)) if (XP_EVENTS[event]) { const clean = Math.max(0, Math.min(100000, Math.round(Number(amount)))); if (!Number.isFinite(clean)) throw new Error(`Invalid XP amount for ${event}.`); update.run(clean, event); } amountCache = null; return config(); }
  return {
    award: txAward, info, config, setConfig, enableCrewSharing, backfillCrewXp: txBackfillCrewXp.immediate,
    isBackfilled: userId => { ensure.run(userId); return Boolean(isBackfilled.get(userId).backfilled_at); },
    markBackfilled: userId => { ensure.run(userId); markBackfilled.run(userId); },
    hasMigration: (userId, migration) => Boolean(hasMigration.get(userId, migration)),
    markMigration: (userId, migration) => markMigration.run(userId, migration),
  };
}
module.exports = { createProgressionStore };
