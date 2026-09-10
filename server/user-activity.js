'use strict';

const { db } = require('./db');

const ACTIVE_REFRESH_SECONDS = 60;

function record(userId, { force = false, now = Math.floor(Date.now() / 1000) } = {}) {
  const id = Number(userId);
  const account = db.prepare('SELECT last_active_at AS lastActiveAt FROM users WHERE id=?').get(id);
  if (!account || (!force && account.lastActiveAt && now - Number(account.lastActiveAt) < ACTIVE_REFRESH_SECONDS)) return false;
  return db.prepare('UPDATE users SET last_active_at=? WHERE id=?').run(now, id).changes > 0;
}

module.exports = { ACTIVE_REFRESH_SECONDS, record };
