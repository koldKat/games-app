'use strict';

const { db } = require('./db');
const { progressForXp } = require('./progression-policy');

const profileAccount = db.prepare(`SELECT u.id, u.username, u.avatar_path AS avatarPath, u.created_at AS createdAt,
    COALESCE(up.xp, 0) AS xp
  FROM users u LEFT JOIN user_progression up ON up.user_id=u.id
  WHERE u.username=? COLLATE NOCASE AND u.public_profile=1 AND u.admin_locked=0`);
const collectionStats = db.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(ownership='owned'), 0) AS owned,
    COALESCE(SUM(ownership='owned' AND media_format='physical'), 0) AS physical,
    COALESCE(SUM(ownership='owned' AND media_format='digital'), 0) AS digital,
    COALESCE(SUM(ownership='wanted'), 0) AS wishlisted,
    COALESCE(SUM(play_status='completed'), 0) AS completed,
    COALESCE(SUM(play_status='playing'), 0) AS playing,
    COALESCE(SUM(favorite=1), 0) AS favorites,
    COUNT(DISTINCT platform) AS platforms
  FROM games WHERE user_id=?`);
const publicContributions = db.prepare(`SELECT COUNT(DISTINCT id) AS count FROM catalogue_entries
  WHERE submitted_by_user_id=? AND status='public'`);
const topPlatforms = db.prepare(`SELECT platform, COUNT(*) AS count FROM games WHERE user_id=?
  GROUP BY platform ORDER BY count DESC, platform COLLATE NOCASE LIMIT 5`);

function get(username) {
  const account = profileAccount.get(String(username || '').trim());
  if (!account) return null;
  const progress = progressForXp(account.xp);
  const stats = collectionStats.get(account.id);
  return {
    username: account.username,
    avatarUrl: account.avatarPath ? `/avatars/${account.avatarPath}` : null,
    memberSince: account.createdAt,
    level: progress.level,
    title: progress.title,
    stats: {
      total: Number(stats.total), owned: Number(stats.owned), physical: Number(stats.physical), digital: Number(stats.digital),
      wishlisted: Number(stats.wishlisted), completed: Number(stats.completed), playing: Number(stats.playing),
      favorites: Number(stats.favorites), platforms: Number(stats.platforms), contributions: Number(publicContributions.get(account.id).count),
    },
    topPlatforms: topPlatforms.all(account.id).map(row => ({ platform: row.platform, count: Number(row.count) })),
  };
}

module.exports = { get };
