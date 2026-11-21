// Role metadata comes from the server; usernames never grant client privileges.
export function roleBadgesMarkup(user) {
  const badges=Array.isArray(user?.badges)?user.badges:[];
  const icons={admin:{name:'Gamekeeper',icon:'gamekeeper'},sidekick:{name:'Sidekick',icon:'sidekick'}};
  return ['admin','sidekick'].filter(key=>badges.includes(key)).map(key=>{
    const item=icons[key];
    return `<span class="role-badge role-badge--${key}" aria-label="${item.name}" role="img" tabindex="0"><svg aria-hidden="true" viewBox="0 0 20 20"><use href="/assets/role-icons.svg#${item.icon}"></use></svg><span class="role-badge-tooltip" role="tooltip" aria-hidden="true">${item.name}</span></span>`;
  }).join('');
}

export function renderIdentityName(element, user) {
  element.textContent = user?.username || '';
  element.insertAdjacentHTML('beforeend', roleBadgesMarkup(user));
}
