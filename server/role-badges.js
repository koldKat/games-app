// Render public role badges from server-provided role metadata using shared SVG artwork.
function roleBadgesMarkup(badges=[]) {
  const roles={admin:{name:'Gamekeeper',icon:'gamekeeper'},sidekick:{name:'Sidekick',icon:'sidekick'}};
  return ['admin','sidekick'].filter(key=>badges.includes(key)).map(key=>{
    const role=roles[key];
    return `<span class="role-badge role-badge--${key}" aria-label="${role.name}" role="img" tabindex="0"><svg aria-hidden="true" viewBox="0 0 20 20"><use href="/assets/role-icons.svg#${role.icon}"></use></svg><span class="role-badge-tooltip" role="tooltip" aria-hidden="true">${role.name}</span></span>`;
  }).join('');
}
module.exports={roleBadgesMarkup};
