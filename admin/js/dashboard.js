import { api, formatBytes, formatDuration, formatNumber, toast } from './core.js';

function bars(id, rows) {
  const target = document.getElementById(id); target.replaceChildren();
  const max = Math.max(1, ...rows.map(row => row.count));
  rows.forEach(item => {
    const row = document.createElement('div'); row.className = 'bar';
    const label = document.createElement('span'); label.textContent = item.label;
    const track = document.createElement('div'); track.className = 'bar-track';
    const fill = document.createElement('div'); fill.className = 'bar-fill'; fill.style.width = `${item.count / max * 100}%`; track.append(fill);
    const count = document.createElement('b'); count.textContent = formatNumber(item.count);
    row.append(label, track, count); target.append(row);
  });
}

export async function loadDashboard() {
  try {
    const data = await api('GET', '/api/admin/stats');
    document.getElementById('metric-games').textContent = formatNumber(data.games);
    document.getElementById('metric-users').textContent = formatNumber(data.users);
    document.getElementById('metric-covers').textContent = formatNumber(data.covered);
    document.getElementById('metric-covers-sub').textContent = `${formatNumber(data.missingCovers)} missing`;
    document.getElementById('metric-descriptions').textContent = formatNumber(data.described);
    document.getElementById('metric-descriptions-sub').textContent = `${formatNumber(data.missingDescriptions)} missing`;
    document.getElementById('metric-pegi').textContent = formatNumber(data.pegiKnown);
    document.getElementById('metric-pegi-sub').textContent = `${formatNumber(data.missingPegi)} missing`;
    document.getElementById('metric-hltb').textContent = formatNumber(data.hltbKnown);
    document.getElementById('metric-hltb-sub').textContent = `${formatNumber(data.missingHltb)} missing`;
    document.getElementById('metric-ratings').textContent = formatNumber(data.rated);
    document.getElementById('metric-ratings-sub').textContent = data.rated ? `${Number(data.averageRating).toFixed(1)} / 5 average` : 'no ratings yet';
    document.getElementById('metric-sessions').textContent = formatNumber(data.activeSessions);
    document.getElementById('metric-favorites').textContent = formatNumber(data.favorites);
    document.getElementById('metric-database').textContent = formatBytes(data.databaseBytes);
    document.getElementById('metric-uptime').textContent = `${Number(data.uptimePercent).toFixed(2)}%`;
    document.getElementById('metric-uptime-sub').textContent = data.downtimeSeconds ? `${formatDuration(data.downtimeSeconds)} downtime` : 'no recorded downtime';
    document.getElementById('metric-version').textContent = data.version;
    document.getElementById('metric-public').textContent = formatNumber(data.catalogue.public);
    document.getElementById('metric-public-sub').textContent = `${formatNumber(data.catalogue.candidate)} to review`;
    document.getElementById('header-version').textContent = data.version;
    bars('ownership-bars', data.ownership); bars('format-bars', data.formats); bars('play-status-bars', data.playStatus); bars('pegi-bars', data.pegi); bars('platform-bars', data.platforms);
  } catch (error) { toast(error.message, true); }
}

let liveLoading = false;
export async function loadLive() {
  if (liveLoading) return;
  liveLoading = true;
  try {
    const data = await api('GET', '/api/admin/live');
    document.getElementById('metric-app-age').textContent = formatDuration(data.appAgeSeconds);
    document.getElementById('metric-session-uptime').textContent = formatDuration(data.sessionUptimeSeconds);
    document.getElementById('metric-heap').textContent = formatBytes(data.heapUsed);
    document.getElementById('metric-heap-sub').textContent = `${formatBytes(data.heapTotal)} total`;
    document.getElementById('metric-rss').textContent = formatBytes(data.rss);
    document.getElementById('metric-cpu').textContent = `${Number(data.cpuPct).toFixed(1)}% CPU`;
  } catch (error) { /* A one-second status poll should not interrupt admin work. */ }
  finally { liveLoading = false; }
}

document.getElementById('refresh-dashboard').addEventListener('click', loadDashboard);
