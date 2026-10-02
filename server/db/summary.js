const { db } = require('./connection');
function stats(userId) {
  const total = db.prepare('SELECT COUNT(*) n FROM games WHERE user_id=? AND hidden=0').get(userId).n;
  const ownership = db.prepare('SELECT ownership label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 GROUP BY ownership').all(userId);
  const formatCounts = db.prepare(`SELECT
    COALESCE(SUM(format_physical=1),0) physical, COALESCE(SUM(format_digital=1),0) digital,
    COALESCE(SUM(format_physical=0 AND format_digital=0),0) unknown
    FROM games WHERE user_id=? AND hidden=0 AND ownership='owned'`).get(userId);
  const ownedFormats = ['physical', 'digital', 'unknown'].map(label => ({ label, count: Number(formatCounts[label]) || 0 })).filter(item => item.count);
  const platforms = db.prepare('SELECT platform label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 GROUP BY platform ORDER BY count DESC, platform').all(userId);
  const pegi = db.prepare("SELECT COALESCE(CAST(pegi AS TEXT), 'Unrated') label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 GROUP BY pegi ORDER BY pegi").all(userId);
  const play = db.prepare('SELECT play_status label, COUNT(*) count FROM games WHERE user_id=? AND hidden=0 GROUP BY play_status').all(userId);
  const favorites = db.prepare('SELECT COUNT(*) n FROM games WHERE user_id=? AND hidden=0 AND favorite=1').get(userId).n;
  return { total, favorites, ownership, ownedFormats, platforms, pegi, play };
}

function platformNames(userId) {
  return db.prepare('SELECT DISTINCT platform FROM games WHERE user_id=? ORDER BY platform COLLATE NOCASE').all(userId).map(row => row.platform);
}

module.exports = { stats, platformNames };
