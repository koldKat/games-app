// Keep Signal cover and player previews inside the viewport without adding page overflow.
let bound = false;
let active = null;

function position(trigger) {
  const image = trigger.querySelector(':scope > img');
  const profile = trigger.querySelector(':scope > .activity-preview-profile');
  const rect = trigger.getBoundingClientRect();
  const imageHeight = image?.getBoundingClientRect().height || 0;
  const profileHeight = profile?.getBoundingClientRect().height || 0;
  const width = Math.max(image?.getBoundingClientRect().width || 0, profile?.getBoundingClientRect().width || 0);
  const height = imageHeight + profileHeight + (image && profile ? 6 : 0);
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const avatar = trigger.classList.contains('activity-preview-trigger--avatar');
  const left = Math.max(8, Math.min(avatar ? rect.right + 8 : rect.left, viewportWidth - width - 8));
  const top = Math.max(8, Math.min(avatar ? rect.bottom + 8 : rect.top - height - 8, viewportHeight - height - 12));
  trigger.style.setProperty('--activity-preview-left', `${left}px`);
  trigger.style.setProperty('--activity-profile-top', `${top}px`);
  trigger.style.setProperty('--activity-image-top', `${top + (profile ? profileHeight + 6 : 0)}px`);
}

export function bindActivityPreviews() {
  if (bound) return;
  bound = true;
  const open = event => {
    const trigger = event.target.closest?.('.activity-preview-trigger');
    if (!trigger) return;
    active = trigger;
    position(trigger);
  };
  document.addEventListener('pointerover', open);
  document.addEventListener('focusin', open);
  const reposition = () => {
    if (!active?.isConnected || !active.matches(':hover, :focus-within')) { active = null; return; }
    position(active);
  };
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });
}
