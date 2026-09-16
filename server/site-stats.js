'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { XP_EVENTS, computeLevel, titleForLevel } = require('./progression-policy');
const { CPU_RELEASE_DATES } = require('./hardware-policy');
const { getResourceAverages } = require('./resource-metrics');
const { stats: getTrafficStats } = require('./traffic-metrics');
const RUNTIME_POLICY = require('./runtime-policy');

const SOURCE_EXTENSIONS = new Set(['.js', '.css', '.html', '.md']);

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(target) : [target];
  });
}

function codeStats(root) {
  const files = [
    path.join(root, 'server.js'),
    ...['server', 'public/js', 'public/css', 'admin/js', 'test'].flatMap(directory => walkFiles(path.join(root, directory))),
    ...walkFiles(path.join(root, 'public')).filter(file => path.extname(file) === '.html'),
    ...walkFiles(path.join(root, 'admin')).filter(file => path.extname(file) === '.html'),
  ].filter((file, index, values) => SOURCE_EXTENSIONS.has(path.extname(file)) && values.indexOf(file) === index);
  return files.reduce((totals, file) => {
    try {
      const source = fs.readFileSync(file);
      totals.linesOfCode += source.toString('utf8').split('\n').length;
      totals.codeBytes += source.length;
      if (path.extname(file) === '.js') totals.jsModules += 1;
    } catch {}
    return totals;
  }, { linesOfCode: 0, codeBytes: 0, jsModules: 0 });
}

function storedCoverStats(root) {
  return walkFiles(path.join(root, 'public', 'covers')).reduce((totals, file) => {
    try { totals.coverBytes += fs.statSync(file).size; totals.storedCovers += 1; } catch {}
    return totals;
  }, { storedCovers: 0, coverBytes: 0 });
}

function cpuInfo(currentMs) {
  const cpus = os.cpus();
  const rawModel = String(cpus[0]?.model || 'Unknown processor');
  const clockMatch = rawModel.match(/@\s*([\d.]+)\s*GHz/i);
  const releaseKey = Object.keys(CPU_RELEASE_DATES).find(key => rawModel.includes(key));
  const releaseMs = releaseKey ? Date.parse(`${CPU_RELEASE_DATES[releaseKey]}T00:00:00Z`) : NaN;
  const model = rawModel
    .replace(/\(R\)|\(TM\)/gi, '').replace(/\s*CPU\s*@.*$/i, '').replace(/\s+/g, ' ').trim();
  return {
    cpuModel: model,
    cpuCores: cpus.length,
    cpuArch: os.arch(),
    cpuGhz: clockMatch ? Number(clockMatch[1]) : null,
    cpuAgeYears: Number.isFinite(releaseMs) ? Math.max(0, Math.floor((currentMs - releaseMs) / (365.25 * 86_400_000))) : null,
    totalRamBytes: os.totalmem(),
  };
}

function createSiteStats(database, { root = path.join(__dirname, '..'), now = () => Date.now(), resourceAverages = getResourceAverages, trafficStats = getTrafficStats } = {}) {
  const source = codeStats(root);
  const scalar = (sql, params = []) => Number(database.prepare(sql).get(...params)?.n || 0);
  const setting = key => database.prepare('SELECT value FROM runtime_settings WHERE key=?').get(key)?.value || '';
  let cached = null; let cachedAt = 0;

  function computeSnapshot(currentMs = now()) {
    const currentSeconds = Math.floor(currentMs / 1000);
    const birth = database.prepare(`SELECT MIN(created_at) AS createdAt FROM (
      SELECT created_at FROM users UNION ALL SELECT created_at FROM games UNION ALL SELECT created_at FROM catalogue_entries
    )`).get()?.createdAt;
    const birthMs = birth ? Date.parse(`${String(birth).replace(' ', 'T')}Z`) : currentMs;
    const appAgeSeconds = Math.max(0, Math.floor((currentMs - (Number.isFinite(birthMs) ? birthMs : currentMs)) / 1000));
    const downtimeSeconds = Math.max(0, Number(setting('server_total_downtime_s')) || 0);
    const sessionStarted = Number(setting('server_session_start_at')) || currentSeconds;
    const users = scalar('SELECT COUNT(*) n FROM users');
    const libraryRecords = scalar('SELECT COUNT(*) n FROM games');
    const xpRows = database.prepare('SELECT xp FROM user_progression').all();
    const totalXp = xpRows.reduce((sum, row) => sum + Math.max(0, Number(row.xp) || 0), 0);
    const levels = xpRows.map(row => computeLevel(row.xp));
    const appLevelScale = Math.max(1, users * 1_000);
    const appLevel = totalXp > 0 ? Math.floor((-1 + Math.sqrt(1 + (8 * totalXp) / appLevelScale)) / 2) : 0;
    const avgLevel = users ? levels.reduce((sum, level) => sum + level, 0) / users : 0;
    const hltbRows = database.prepare(`SELECT MAX(hltb_main_story) mainStory, MAX(hltb_main_extra) mainExtra,
      MAX(hltb_completionist) completionist, MAX(hltb_all_styles) allStyles
      FROM games WHERE hltb_id IS NOT NULL GROUP BY lower(trim(title))`).all();
    const hltbTotal = key => Math.round(hltbRows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) * 10) / 10;
    const pageCount = database.pragma('page_count', { simple: true });
    const pageSize = database.pragma('page_size', { simple: true });
    const memory = process.memoryUsage();
    const covers = storedCoverStats(root);
    const publicReleases = scalar("SELECT COUNT(*) n FROM catalogue_entries WHERE status='public'");
    const publicTitles = scalar("SELECT COUNT(DISTINCT title_key) n FROM catalogue_entries WHERE status='public'");

    return {
      users,
      activeSessions: scalar("SELECT COUNT(*) n FROM sessions WHERE expires_at>strftime('%s','now')"),
      publicProfiles: scalar('SELECT COUNT(*) n FROM users WHERE public_profile=1 AND admin_locked=0'),
      avatarUsers: scalar("SELECT COUNT(*) n FROM users WHERE avatar_path IS NOT NULL AND trim(avatar_path)<>''"),
      contributors: scalar("SELECT COUNT(DISTINCT submitted_by_user_id) n FROM catalogue_entries WHERE status='public' AND submitted_by_user_id IS NOT NULL"),
      libraryRecords,
      uniqueLibraryTitles: scalar('SELECT COUNT(DISTINCT lower(trim(title))) n FROM games'),
      averageLibrarySize: users ? libraryRecords / users : 0,
      owned: scalar("SELECT COUNT(*) n FROM games WHERE ownership='owned'"),
      wishlisted: scalar("SELECT COUNT(*) n FROM games WHERE ownership='wanted'"),
      physical: scalar("SELECT COUNT(*) n FROM games WHERE ownership='owned' AND media_format='physical'"),
      digital: scalar("SELECT COUNT(*) n FROM games WHERE ownership='owned' AND media_format='digital'"),
      favorites: scalar('SELECT COUNT(*) n FROM games WHERE favorite=1'),
      backlog: scalar("SELECT COUNT(*) n FROM games WHERE hidden=0 AND play_status='backlog'"),
      playing: scalar("SELECT COUNT(*) n FROM games WHERE hidden=0 AND play_status='playing'"),
      completed: scalar("SELECT COUNT(*) n FROM games WHERE hidden=0 AND play_status='completed'"),
      paused: scalar("SELECT COUNT(*) n FROM games WHERE hidden=0 AND play_status='paused'"),
      abandoned: scalar("SELECT COUNT(*) n FROM games WHERE hidden=0 AND play_status='abandoned'"),
      hidden: scalar('SELECT COUNT(*) n FROM games WHERE hidden=1'),
      publicReleases,
      publicTitles,
      publicPlatforms: scalar("SELECT COUNT(DISTINCT platform_key) n FROM catalogue_entries WHERE status='public'"),
      multiPlatformTitles: scalar("SELECT COUNT(*) n FROM (SELECT title_key FROM catalogue_entries WHERE status='public' GROUP BY title_key HAVING COUNT(*)>1)"),
      catalogueLinks: scalar('SELECT COUNT(*) n FROM catalogue_game_links'),
      candidates: scalar("SELECT COUNT(*) n FROM catalogue_entries WHERE status='candidate'"),
      coverKnown: scalar("SELECT COUNT(*) n FROM games WHERE trim(cover_url)<>''"),
      pegiKnown: scalar('SELECT COUNT(*) n FROM games WHERE pegi IS NOT NULL'),
      hltbKnown: scalar('SELECT COUNT(*) n FROM games WHERE hltb_id IS NOT NULL'),
      descriptionKnown: scalar("SELECT COUNT(*) n FROM games WHERE trim(description)<>''"),
      fullyEnriched: scalar("SELECT COUNT(*) n FROM games WHERE trim(cover_url)<>'' AND pegi IS NOT NULL AND hltb_id IS NOT NULL AND trim(description)<>''"),
      hltbTitles: hltbRows.length,
      hltbMainHours: hltbTotal('mainStory'),
      hltbExtraHours: hltbTotal('mainExtra'),
      hltbCompletionistHours: hltbTotal('completionist'),
      hltbAllStylesHours: hltbTotal('allStyles'),
      ratingsTotal: scalar('SELECT COUNT(*) n FROM games WHERE rating IS NOT NULL'),
      ratingAverage: Number(database.prepare('SELECT AVG(rating) n FROM games WHERE rating IS NOT NULL').get()?.n || 0),
      ratingDistribution: database.prepare('SELECT rating, COUNT(*) count FROM games WHERE rating IS NOT NULL GROUP BY rating ORDER BY rating DESC').all(),
      totalXp,
      appLevel,
      appTitle: titleForLevel(appLevel),
      averageLevel: avgLevel,
      averageTitle: titleForLevel(Math.floor(avgLevel)),
      totalLevels: levels.reduce((sum, level) => sum + level, 0),
      xpEventTypes: Object.keys(XP_EVENTS).length,
      xpEvents: scalar('SELECT COUNT(*) n FROM progression_events'),
      forumCategories: scalar('SELECT COUNT(*) n FROM forum_categories'),
      forumThreads: scalar('SELECT COUNT(*) n FROM forum_threads'),
      forumReplies: scalar('SELECT COUNT(*) n FROM forum_posts WHERE is_deleted=0'),
      forumPinnedThreads: scalar('SELECT COUNT(*) n FROM forum_threads WHERE is_pinned=1'),
      signalEvents: scalar('SELECT COUNT(*) n FROM activity_events'),
      signalLast30Days: scalar("SELECT COUNT(*) n FROM activity_events WHERE created_at>=datetime('now','-30 days')"),
      announcements: scalar('SELECT COUNT(*) n FROM announcements WHERE is_draft=0'),
      platforms: database.prepare("SELECT platform, COUNT(*) count FROM catalogue_entries WHERE status='public' GROUP BY platform_key ORDER BY count DESC, platform COLLATE NOCASE LIMIT 8").all(),
      ...cpuInfo(currentMs),
      ...resourceAverages(),
      ...trafficStats(),
      ...source,
      ...covers,
      databaseBytes: pageCount * pageSize,
      heapUsedBytes: memory.heapUsed,
      rssBytes: memory.rss,
      appAgeSeconds,
      sessionUptimeSeconds: Math.max(0, currentSeconds - sessionStarted),
      downtimeSeconds,
      uptimePercent: appAgeSeconds ? Math.max(0, Math.min(100, ((appAgeSeconds - downtimeSeconds) / appAgeSeconds) * 100)) : 100,
    };
  }

  function snapshot() {
    const current = now();
    if (cached && current - cachedAt < RUNTIME_POLICY.siteStatsCacheMs) return cached;
    cached = computeSnapshot(current); cachedAt = current;
    return cached;
  }

  return { snapshot };
}

module.exports = { createSiteStats };
