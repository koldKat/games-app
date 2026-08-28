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
    document.getElementById('metric-sessions').textContent = formatNumber(data.activeSessions);
    document.getElementById('metric-favorites').textContent = formatNumber(data.favorites);
    document.getElementById('metric-database').textContent = formatBytes(data.databaseBytes);
    document.getElementById('metric-uptime').textContent = formatDuration(data.uptimeSeconds);
    document.getElementById('metric-version').textContent = data.version;
    document.getElementById('metric-public').textContent = formatNumber(data.catalogue.public);
    document.getElementById('metric-public-sub').textContent = `${formatNumber(data.catalogue.candidate)} to review`;
    document.getElementById('header-version').textContent = data.version;
    bars('ownership-bars', data.ownership); bars('pegi-bars', data.pegi); bars('platform-bars', data.platforms);
  } catch (error) { toast(error.message, true); }
}

document.getElementById('refresh-dashboard').addEventListener('click', loadDashboard);
