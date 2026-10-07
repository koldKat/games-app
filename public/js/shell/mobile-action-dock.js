const MOBILE_ACTION_QUERY = '(max-width: 680px)';

const group = document.querySelector('.header-community-actions');

if (group) {
  const home = document.createComment('community-actions-home');
  const visibilityRoot = group.closest('#app-shell');
  group.before(home);
  const media = window.matchMedia(MOBILE_ACTION_QUERY);
  const viewport = window.visualViewport;
  const root = document.documentElement;
  const viewportProperties = ['--mobile-viewport-bottom', '--mobile-viewport-left', '--mobile-viewport-right', '--mobile-viewport-width'];
  let frame;

  const syncViewport = () => {
    if (!media.matches || visibilityRoot?.hidden) {
      viewportProperties.forEach(property => root.style.removeProperty(property));
      return;
    }
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    root.style.setProperty('--mobile-viewport-bottom', `${Math.max(0, window.innerHeight - height - top)}px`);
    root.style.setProperty('--mobile-viewport-left', `${left}px`);
    root.style.setProperty('--mobile-viewport-right', `${Math.max(0, window.innerWidth - width - left)}px`);
    root.style.setProperty('--mobile-viewport-width', `${width}px`);
  };

  const settleViewport = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      syncViewport();
      frame = requestAnimationFrame(syncViewport);
    });
  };

  const placeActions = () => {
    syncViewport();
    if (media.matches && !visibilityRoot?.hidden) {
      group.classList.add('mobile-action-dock', 'top-actions');
      document.body.append(group);
      settleViewport();
      return;
    }
    group.classList.remove('mobile-action-dock', 'top-actions');
    home.after(group);
  };

  placeActions();
  media.addEventListener('change', placeActions);
  window.addEventListener('resize', syncViewport, { passive: true });
  viewport?.addEventListener('resize', syncViewport, { passive: true });
  viewport?.addEventListener('scroll', syncViewport, { passive: true });
  window.addEventListener('pageshow', settleViewport);
  new MutationObserver(settleViewport).observe(root, { attributes: true, attributeFilter: ['class'] });
  if (visibilityRoot) new MutationObserver(placeActions).observe(visibilityRoot, { attributes: true, attributeFilter: ['hidden'] });
}
