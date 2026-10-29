// Role metadata comes from the server; usernames never grant client privileges.
const ADMIN_STAR = 'M10 0L13.09 7.64L20 7.64L14.41 12.36L16.18 20L10 15.28L3.82 20L5.59 12.36L0 7.64L6.91 7.64Z';

export function roleBadgesMarkup(user) {
  if (!Array.isArray(user?.badges) || !user.badges.includes('admin')) return '';
  return `<span class="role-badge role-badge--admin" aria-label="Admin" role="img" tabindex="0"><svg aria-hidden="true" viewBox="0 0 20 20"><path fill="currentColor" d="${ADMIN_STAR}"/></svg><span class="role-badge-tooltip" role="tooltip" aria-hidden="true">Admin</span></span>`;
}

export function renderIdentityName(element, user) {
  element.textContent = user?.username || '';
  element.insertAdjacentHTML('beforeend', roleBadgesMarkup(user));
}
