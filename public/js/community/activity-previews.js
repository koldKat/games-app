// Keep Signal cover and player previews inside the viewport without adding page overflow.
let bound = false;
let active = null;

function position(trigger) {
  const image = trigger.querySelector(':scope > img');
  const profile = trigger.querySelector(':scope > .activity-preview-profile');
  const rect = trigger.getBoundingClientRect();
  const imageRect = image?.getBoundingClientRect();
  const profileRect = profile?.getBoundingClientRect();
  const imageHeight = imageRect?.height || 0;
  const profileHeight = profileRect?.height || 0;
  const width = Math.max(imageRect?.width || 0, profileRect?.width || 0);
  const gap = image && profile ? 3 : 0;
  const height = imageHeight + profileHeight + gap;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const avatar = trigger.classList.contains('activity-preview-trigger--avatar');
  const left = Math.max(8, Math.min(avatar ? rect.right + 8 : rect.left, viewportWidth - width - 8));
  const top = Math.max(8, Math.min(avatar ? rect.bottom + 8 : rect.top - height - 8, viewportHeight - height - 12));
  // Match the Gamebooks player preview: avatar first, centered caption below.
  trigger.style.setProperty('--activity-image-left', `${left + (width - (imageRect?.width || width)) / 2}px`);
  trigger.style.setProperty('--activity-profile-left', `${left + (width - (profileRect?.width || width)) / 2}px`);
  trigger.style.setProperty('--activity-image-top', `${top}px`);
  trigger.style.setProperty('--activity-profile-top', `${top + imageHeight + gap}px`);
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
