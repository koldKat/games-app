import { $, $$ } from '../core/dom.js';

let ratingPicker;

function ratingValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0.5 && numeric <= 5 ? Math.round(numeric * 2) / 2 : null;
}

function paintRating(value, preview = false) {
  const rating = ratingValue(value);
  const label = rating == null ? 'Not rated' : `${rating.toFixed(1)} / 5`;
  ratingPicker.classList.toggle('previewing', preview);
  ratingPicker.dataset.rating = rating == null ? '' : String(rating);
  ratingPicker.setAttribute('aria-label', `${preview ? 'Rating preview' : 'Your rating'}: ${label}`);
  $('#game-rating-label').textContent = label;
  $$('#game-rating-picker .rating-star').forEach(star => {
    const position = Number(star.dataset.ratingStar);
    star.classList.toggle('on', rating != null && rating >= position);
    star.classList.toggle('half', rating != null && rating === position - 0.5);
    star.setAttribute('aria-label', `Rate ${position === 1 ? '1 star' : `${position} stars`}`);
  });
}

function setRating(value) {
  const rating = ratingValue(value);
  $('#game-rating').value = rating == null ? '' : String(rating);
  paintRating(rating);
}

function ratingAtPointer(event) {
  const star = event.target.closest('[data-rating-star]');
  if (!star) return null;
  const bounds = star.getBoundingClientRect();
  const position = Number(star.dataset.ratingStar);
  return position - (event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 0);
}

export function initializeEditorRating() {
  ratingPicker = $('#game-rating-picker');
  ratingPicker.addEventListener('pointermove', event => {
    const rating = ratingAtPointer(event);
    if (rating != null) paintRating(rating, true);
    else if (ratingPicker.classList.contains('previewing')) paintRating($('#game-rating').value);
  });
  ratingPicker.addEventListener('pointerleave', () => setRating($('#game-rating').value));
  ratingPicker.addEventListener('click', event => {
    const clear = event.target.closest('[data-rating-clear]');
    if (clear) return setRating(null);
    const star = event.target.closest('[data-rating-star]');
    if (!star) return;
    const position = Number(star.dataset.ratingStar);
    setRating(event.detail === 0 ? position : ratingAtPointer(event));
  });
  ratingPicker.addEventListener('keydown', event => {
    const current = Number($('#game-rating').value) || 0;
    const next = { ArrowLeft: current - 0.5, ArrowDown: current - 0.5, ArrowRight: current + 0.5, ArrowUp: current + 0.5, Home: 0, End: 5 }[event.key];
    if (next === undefined && event.key !== 'Backspace' && event.key !== 'Delete') return;
    event.preventDefault(); setRating(event.key === 'Backspace' || event.key === 'Delete' ? null : Math.max(0, Math.min(5, next)));
  });
}
export { ratingValue, setRating };
