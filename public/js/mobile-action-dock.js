const MOBILE_ACTION_QUERY = '(max-width: 680px)';

const group = document.querySelector('.header-community-actions');

if (group) {
  const home = document.createComment('community-actions-home');
  const visibilityRoot = group.closest('#app-shell');
  group.before(home);
  const media = window.matchMedia(MOBILE_ACTION_QUERY);

  const placeActions = () => {
    if (media.matches && !visibilityRoot?.hidden) {
      group.classList.add('mobile-action-dock', 'top-actions');
      document.body.append(group);
      return;
    }
    group.classList.remove('mobile-action-dock', 'top-actions');
    home.after(group);
  };

  placeActions();
  media.addEventListener('change', placeActions);
  if (visibilityRoot) new MutationObserver(placeActions).observe(visibilityRoot, { attributes: true, attributeFilter: ['hidden'] });
}
