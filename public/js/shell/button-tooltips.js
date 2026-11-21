// Keep single-line action hints inside the viewport without a polling loop.
function positionButtonTooltip(event) {
  const button = event.target.closest?.('button.themed-tooltip, a.themed-tooltip');
  if (!button) return;
  const tooltip = getComputedStyle(button, '::after');
  if (tooltip.display === 'none') return;
  const width = parseFloat(tooltip.width);
  if (!Number.isFinite(width)) return;
  const bounds = button.getBoundingClientRect();
  const left = bounds.left + bounds.width / 2 - width / 2;
  const clamped = Math.max(8, Math.min(left, document.documentElement.clientWidth - width - 8));
  button.style.setProperty('--button-tooltip-offset', `${clamped - left}px`);
}

document.addEventListener('pointerover', positionButtonTooltip);
document.addEventListener('focusin', positionButtonTooltip);
