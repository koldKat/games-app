import { controllerLoaderMarkup } from './controller-loader.js';
import { coverage, formatBytes, formatCount, formatDecimal, formatDuration, formatPercent, formatPlaytime } from './stats-format.js';
import { platformDisplayName, platformThemeClass } from './platforms.js';

let dialog;
let returnFocus;
let requestController;

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function row(label, value) {
  const item = element('tr');
  const labelCell = element('td', 'stats-key');
  const valueCell = element('td', 'stats-value');
  labelCell.append(label instanceof Node ? label : document.createTextNode(label));
  valueCell.append(value instanceof Node ? value : document.createTextNode(value));
  item.append(labelCell, valueCell);
  return item;
}

function platformLabel(platform) {
  return element('span', `stats-platform platform-coded ${platformThemeClass(platform)}`, platformDisplayName(platform));
}

function section(definition) {
  const node = element('section', `stats-section stats-section--${definition.kind}`);
  node.append(element('h3', 'stats-section-label', definition.label));
  const table = element('table', 'stats-table');
  const body = document.createElement('tbody');
  for (const [label, value] of definition.rows) body.append(row(label, value));
  table.append(body); node.append(table);
  return node;
}

function ratingRows(stats) {
  const rows = [
    ['Ratings given', formatCount(stats.ratingsTotal)],
    ['Average rating', stats.ratingsTotal ? `${Number(stats.ratingAverage).toFixed(1)} / 5` : 'N/A'],
  ];
  for (const item of stats.ratingDistribution || []) rows.push([`${Number(item.rating).toFixed(1)} stars`, formatCount(item.count)]);
  return rows;
}

function sections(stats) {
  return [
    { kind: 'collectors', label: 'Collectors', rows: [
      ['Registered', formatCount(stats.users)], ['Active sessions', formatCount(stats.activeSessions)],
      ['Public profiles', formatCount(stats.publicProfiles)], ['With avatars', formatCount(stats.avatarUsers)],
      ['Public contributors', formatCount(stats.contributors)],
    ] },
    { kind: 'libraries', label: 'Private libraries', rows: [
      ['Library records', formatCount(stats.libraryRecords)], ['Unique titles', formatCount(stats.uniqueLibraryTitles)],
      ['Average library', formatDecimal(stats.averageLibrarySize)], ['Owned', formatCount(stats.owned)],
      ['Wishlisted', formatCount(stats.wishlisted)], ['Owned physical', formatCount(stats.physical)],
      ['Owned digital', formatCount(stats.digital)], ['Favorites', formatCount(stats.favorites)],
    ] },
    { kind: 'play', label: 'Play status', rows: [
      ['Backlog', formatCount(stats.backlog)], ['Playing', formatCount(stats.playing)],
      ['Completed', formatCount(stats.completed)], ['Paused', formatCount(stats.paused)],
      ['Abandoned', formatCount(stats.abandoned)], ['Hidden', formatCount(stats.hidden)],
    ] },
    { kind: 'katalog', label: 'Public Kat·a·log', rows: [
      ['Distinct titles', formatCount(stats.publicTitles)], ['Platform releases', formatCount(stats.publicReleases)],
      ['Platforms', formatCount(stats.publicPlatforms)], ['Multi-platform titles', formatCount(stats.multiPlatformTitles)],
      ['Linked library copies', formatCount(stats.catalogueLinks)], ['Awaiting review', formatCount(stats.candidates)],
    ] },
    { kind: 'metadata', label: 'Metadata coverage', rows: [
      ['Covers', coverage(stats.coverKnown, stats.libraryRecords)], ['PEGI ratings', coverage(stats.pegiKnown, stats.libraryRecords)],
      ['HLTB estimates', coverage(stats.hltbKnown, stats.libraryRecords)], ['Descriptions', coverage(stats.descriptionKnown, stats.libraryRecords)],
      ['Fully enriched', coverage(stats.fullyEnriched, stats.libraryRecords)],
    ] },
    { kind: 'playtime', label: 'Estimated playtime', rows: [
      ['Unique timed titles', formatCount(stats.hltbTitles)], ['Main story total', formatPlaytime(stats.hltbMainHours)],
      ['Main + sides total', formatPlaytime(stats.hltbExtraHours)], ['Completionist total', formatPlaytime(stats.hltbCompletionistHours)],
      ['All styles total', formatPlaytime(stats.hltbAllStylesHours)],
    ] },
    { kind: 'ratings', label: 'Ratings', rows: ratingRows(stats) },
    { kind: 'progression', label: 'XP & progression', rows: [
      ['Total XP earned', formatCount(stats.totalXp)], ['App level', `${formatCount(stats.appLevel)} // ${stats.appTitle}`],
      ['Average collector level', `${formatCount(Math.floor(Number(stats.averageLevel) || 0))} // ${stats.averageTitle}`],
      ['Total levels', formatCount(stats.totalLevels)], ['XP event types', formatCount(stats.xpEventTypes)],
      ['XP awards recorded', formatCount(stats.xpEvents)],
    ] },
    { kind: 'community', label: 'Forum & signal', rows: [
      ['Forum channels', formatCount(stats.forumCategories)], ['Threads', formatCount(stats.forumThreads)],
      ['Replies', formatCount(stats.forumReplies)], ['Pinned threads', formatCount(stats.forumPinnedThreads)],
      ['Signal events', formatCount(stats.signalEvents)], ['Last 30 days', formatCount(stats.signalLast30Days)],
      ['Published announcements', formatCount(stats.announcements)],
    ] },
    { kind: 'genres', label: 'Top public genres', rows: (stats.genres || []).map(item => [item.genre, formatCount(item.count)]) },
    { kind: 'platforms', label: 'Top public platforms', rows: (stats.platforms || []).map(item => [platformLabel(item.platform), formatCount(item.count)]) },
    { kind: 'server', label: 'Server', rows: [
      ['Processor', stats.cpuModel || 'Unknown'], ['CPU cores', formatCount(stats.cpuCores)],
      ['CPU age', stats.cpuAgeYears == null ? 'N/A' : `${formatCount(stats.cpuAgeYears)}y`],
      ['CPU clock', stats.cpuGhz == null ? 'N/A' : `${formatDecimal(stats.cpuGhz)} GHz`],
      ['Architecture', stats.cpuArch || 'Unknown'], ['System RAM', formatBytes(stats.totalRamBytes)],
      ['Process heap', formatBytes(stats.heapUsedBytes)], ['Process RSS', formatBytes(stats.rssBytes)],
    ] },
    { kind: 'app', label: 'The app', rows: [
      ['App age', formatDuration(stats.appAgeSeconds)], ['Session uptime', formatDuration(stats.sessionUptimeSeconds)],
      ['Total uptime', formatDuration(Math.max(0, stats.appAgeSeconds - stats.downtimeSeconds))],
      ['Uptime', formatPercent(stats.uptimePercent, 2)], ['Total downtime', formatDuration(stats.downtimeSeconds)],
      ['Lines of source', formatCount(stats.linesOfCode)], ['Source size', formatBytes(stats.codeBytes)],
      ['JavaScript modules', formatCount(stats.jsModules)], ['Database size', formatBytes(stats.databaseBytes)],
      ['Stored covers', formatCount(stats.storedCovers)], ['Cover storage', formatBytes(stats.coverBytes)],
      ['Traffic in', formatBytes(stats.trafficIn)], ['Traffic out', formatBytes(stats.trafficOut)],
      ...(Number(stats.avgSamples) > 0 ? [
        ['Avg CPU (session)', `${Number(stats.avgCpu || 0).toFixed(1)}%`],
        ['Avg heap used (session)', formatBytes(stats.avgHeapUsed)],
        ['Avg heap total (session)', formatBytes(stats.avgHeapTotal)],
        ['Avg RSS (session)', formatBytes(stats.avgRss)],
      ] : []),
    ] },
  ].filter(item => item.rows.length);
}

function close() {
  if (!dialog?.open) return;
  requestController?.abort(); requestController = null;
  dialog.close();
  returnFocus?.focus?.();
}

function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = element('dialog', 'stats-dialog');
  dialog.setAttribute('aria-labelledby', 'stats-title');
  const card = element('section', 'stats-card modal-card');
  const header = element('header', 'stats-head');
  const heading = element('div');
  heading.append(element('p', 'kicker', 'PUBLIC // TELEMETRY'), element('h2', '', 'Stats for Nerds'));
  heading.querySelector('h2').id = 'stats-title';
  const closeButton = element('button', 'close-button stats-close');
  closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Close');
  closeButton.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><use href="/assets/ui-icons.svg#close"></use></svg>';
  closeButton.addEventListener('click', close);
  header.append(heading, closeButton);
  const body = element('div', 'stats-body'); body.dataset.statsBody = ''; body.setAttribute('aria-live', 'polite');
  card.append(header, body); dialog.append(card); document.body.append(dialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('pointerup', event => { const shouldClose = pressedBackdrop && event.target === dialog; pressedBackdrop = false; if (shouldClose) close(); });
  dialog.addEventListener('pointercancel', () => { pressedBackdrop = false; });
  return dialog;
}

async function open(trigger) {
  const modal = ensureDialog(); const body = modal.querySelector('[data-stats-body]');
  requestController?.abort(); requestController = new AbortController();
  const controller = requestController;
  returnFocus = trigger || document.activeElement;
  body.className = 'stats-body stats-body--loading';
  body.innerHTML = controllerLoaderMarkup('Crunching the numbers...');
  if (!modal.open) modal.showModal();
  try {
    const response = await fetch('/api/site-stats', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Stats unavailable.');
    const stats = await response.json();
    if (controller !== requestController || !modal.open) return;
    body.className = 'stats-body';
    body.replaceChildren(...sections(stats).map(section));
  } catch (error) {
    if (error.name === 'AbortError' || controller !== requestController || !modal.open) return;
    body.className = 'stats-body stats-body--message';
    body.replaceChildren(element('p', '', 'The numbers could not be loaded. Try again shortly.'));
  } finally {
    if (controller === requestController) requestController = null;
  }
}

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-stats-open]');
  if (!trigger) return;
  event.preventDefault();
  void open(trigger);
});

export { close as closeStats, open as openStats };
