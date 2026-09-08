const STAT_LABELS = Object.freeze([
  ['total', 'Games'], ['owned', 'Owned'], ['physical', 'Physical'], ['digital', 'Digital'], ['wishlisted', 'Wishlisted'],
  ['completed', 'Completed'], ['playing', 'Playing'], ['favorites', 'Favorites'], ['platforms', 'Platforms'], ['contributions', 'Contributed'],
]);

let dialog;
let request;

function element(name, className = '', text = '') {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function closeDialog() {
  request?.abort(); request = null;
  if (dialog?.open) dialog.close();
}

function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = element('dialog', 'public-profile-dialog');
  dialog.setAttribute('aria-labelledby', 'public-profile-title');
  const card = element('section', 'modal-card public-profile-card');
  const header = element('header', 'modal-head public-profile-head');
  const heading = element('div');
  const title = element('h2', '', 'Collector profile'); title.id = 'public-profile-title';
  heading.append(element('p', 'kicker', 'PUBLIC // CURATOR'), title);
  const close = element('button', 'close-button', '×');
  close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.addEventListener('click', closeDialog);
  header.append(heading, close);
  const body = element('div', 'public-profile-body'); body.setAttribute('aria-live', 'polite');
  card.append(header, body);
  dialog.append(card); document.body.append(dialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('pointerup', event => {
    const shouldClose = pressedBackdrop && event.target === dialog;
    pressedBackdrop = false;
    if (shouldClose) closeDialog();
  });
  dialog.addEventListener('pointercancel', () => { pressedBackdrop = false; });
  return dialog;
}

function avatar(profile) {
  if (!profile.avatarUrl) return element('span', 'public-profile-avatar public-profile-avatar--initial', profile.username.slice(0, 1).toLocaleUpperCase());
  const image = element('img', 'public-profile-avatar');
  image.src = profile.avatarUrl; image.alt = `${profile.username}'s avatar`;
  return image;
}

function memberSince(value) {
  const date = new Date(`${String(value || '').replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
}

function render(profile) {
  const body = dialog.querySelector('.public-profile-body');
  const identity = element('section', 'public-profile-identity');
  const copy = element('div');
  copy.append(element('strong', '', profile.username), element('span', '', `LV ${profile.level} // ${profile.title}`));
  const joined = memberSince(profile.memberSince);
  if (joined) copy.append(element('small', '', `Curating since ${joined}`));
  identity.append(avatar(profile), copy);

  const stats = element('section', 'public-profile-stats');
  for (const [key, label] of STAT_LABELS) {
    const stat = element('div', 'public-profile-stat');
    stat.append(element('strong', '', Number(profile.stats?.[key] || 0).toLocaleString()), element('span', '', label));
    stats.append(stat);
  }

  const platforms = element('section', 'public-profile-platforms');
  platforms.append(element('h3', '', 'Top platforms'));
  const list = element('div');
  for (const item of profile.topPlatforms || []) {
    const row = element('span');
    row.append(element('b', '', item.platform), element('small', '', Number(item.count || 0).toLocaleString()));
    list.append(row);
  }
  if (!list.childElementCount) list.append(element('p', '', 'No platforms cataloged yet.'));
  platforms.append(list);
  body.replaceChildren(identity, stats, platforms);
}

function renderStatus(message, error = false) {
  const status = element('p', `public-profile-status${error ? ' public-profile-status--error' : ''}`, message);
  status.setAttribute('role', error ? 'alert' : 'status');
  dialog.querySelector('.public-profile-body').replaceChildren(status);
}

export async function openPublicProfile(username) {
  const clean = String(username || '').trim();
  if (!clean) return;
  ensureDialog(); request?.abort();
  const controller = new AbortController(); request = controller;
  renderStatus('Reading curator signal…');
  if (!dialog.open) dialog.showModal();
  try {
    const response = await fetch(`/api/public/user/${encodeURIComponent(clean)}`, { cache: 'no-store', signal: controller.signal });
    const profile = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(profile.error || 'Public profile unavailable.');
    render(profile);
  } catch (error) {
    if (error.name !== 'AbortError') renderStatus(error.message || 'Public profile unavailable.', true);
  } finally { if (request === controller) request = null; }
}
