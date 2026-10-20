let bound = false;
let tooltip = null;
let activeCard = null;

function hide() {
  if (tooltip) tooltip.hidden = true;
  activeCard?.querySelectorAll('a[aria-describedby="katalog-card-tooltip"]').forEach(link => link.removeAttribute('aria-describedby'));
  activeCard = null;
}

function show(card) {
  if (card === activeCard) return;
  hide();
  const preview = card.querySelector('template[data-katalog-preview]');
  if (!preview) return;
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'katalog-card-tooltip';
    tooltip.className = 'katalog-card-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.append(tooltip);
  }
  activeCard = card;
  tooltip.replaceChildren(preview.content.cloneNode(true));
  tooltip.hidden = false;
  tooltip.style.visibility = 'hidden';
  const anchor = card.getBoundingClientRect();
  const box = tooltip.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  const left = Math.max(8, Math.min(anchor.left + (anchor.width - box.width) / 2, width - box.width - 8));
  let top = anchor.top - box.height - 10;
  if (top < 8) top = anchor.bottom + 10;
  top = Math.max(8, Math.min(top, height - box.height - 8));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.visibility = '';
  card.querySelectorAll('a').forEach(link => link.setAttribute('aria-describedby', tooltip.id));
}

export function bindCardTooltips() {
  if (activeCard && !activeCard.isConnected) hide();
  if (bound) return;
  bound = true;
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    const card = event.target.closest?.('.katalog-card');
    if (card) show(card);
  });
  document.addEventListener('pointerout', event => {
    if (activeCard && !activeCard.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('focusin', event => {
    const card = event.target.closest?.('.katalog-card');
    if (card) show(card);
  });
  document.addEventListener('focusout', event => {
    if (activeCard && !activeCard.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('click', hide);
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('resize', hide, { passive: true });
}
