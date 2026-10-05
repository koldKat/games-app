import { escapeHtml } from '../core/api.js';
import { ratingValue } from '../editor/rating.js';
import { cardVersionControl } from '../editor/version-picker.js';
import { labels } from '../core/runtime.js';
import { pegiColors } from './platforms.js';
import { mediaFormatLabel } from './media-formats.js';
import { cardTimes } from '../metadata/hltb-ui.js';

function badge(text, className = '') { return `<span class="badge ${className}">${escapeHtml(text)}</span>`; }

function coverCredit(source) {
  const credits = {
    thegamesdb: ['TheGamesDB art ↗', 'https://thegamesdb.net/'], hltb: ['HLTB art ↗', 'https://howlongtobeat.com/'],
    igdb: ['IGDB art ↗', 'https://www.igdb.com/'],
  };
  const credit = credits[source];
  if (credit) return `<a class="badge source-credit" href="${credit[1]}" target="_blank" rel="noopener" data-card-link>${credit[0]}</a>`;
  return source === 'steamgriddb' ? badge('SGDB art') : '';
}

function isMissingPegiInfo(game) {
  return !game.pegiUrl
    && !(game.pegiDescriptors || []).length && !(game.pegiReleases || []).length
    && !game.pegiAdvice && !game.pegiOutline && !game.pegiContentIssues && !game.pegiOtherIssues;
}

function isMissingHltbInfo(game) { return !game.hltbId; }

function isMissingDescription(game) { return !String(game.description || '').trim(); }

function ratingStars(value) {
  return Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    return `<i class="rating-star ${value >= position ? 'on' : value >= position - 0.5 ? 'half' : ''}" aria-hidden="true">★</i>`;
  }).join('');
}

function personalRating(rating) {
  const value = Number(rating);
  return value ? `<span class="personal-rating" aria-label="Your rating: ${value} out of 5"><span class="rating-stars">${ratingStars(value)}</span><b>${value.toFixed(1)}</b></span>` : '';
}

function cardRatingControl(game) {
  const value = Number(game.rating) || 0;
  const stars = Array.from({ length: 5 }, (_, index) => {
    const position = index + 1; const stateClass = value >= position ? 'on' : value === position - 0.5 ? 'half' : '';
    return `<button type="button" class="rating-star ${stateClass}" data-action="rate" data-rating-star="${position}" aria-label="Rate ${position} star${position === 1 ? '' : 's'}">★</button>`;
  }).join('');
  const label = value ? `${value.toFixed(1)} / 5` : 'Not rated';
  return `<div class="rating-field card-rating-field"><div class="rating-picker card-rating-picker" data-card-rating="${value}" role="group" aria-label="Your rating: ${label}">${stars}<output>${label}</output></div></div>`;
}

function paintCardRating(picker, value, preview = false) {
  const rating = ratingValue(value); const label = rating == null ? 'Not rated' : `${rating.toFixed(1)} / 5`;
  picker.classList.toggle('previewing', preview); picker.setAttribute('aria-label', `${preview ? 'Rating preview' : 'Your rating'}: ${label}`);
  picker.querySelector('output').textContent = label;
  picker.querySelectorAll('[data-rating-star]').forEach(star => {
    const position = Number(star.dataset.ratingStar);
    star.classList.toggle('on', rating != null && rating >= position);
    star.classList.toggle('half', rating != null && rating === position - 0.5);
  });
}

function cardRatingAtPointer(event) {
  const star = event.target.closest('.card-rating-picker [data-rating-star]'); if (!star) return null;
  const bounds = star.getBoundingClientRect(); const position = Number(star.dataset.ratingStar);
  return position - (event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 0);
}

function gameCard(game) {
  const platform = cardVersionControl(game, escapeHtml, labels);
  const meta = [game.publisher, game.releaseYear, game.cartridgeNumber != null ? `Cartridge #${game.cartridgeNumber}` : ''].filter(Boolean).join(' · ');
  const pegiClass = game.pegi ? `pegi pegi-${game.pegi}` : '';
  const quick = game.ownership === 'wanted' ? '<button class="quick-button" data-action="own">Mark owned</button>' : '';
  const descriptorBadges = (game.pegiDescriptors || []).map(descriptor => badge(descriptor, /purchases|random items/i.test(descriptor) ? 'descriptor purchase' : 'descriptor')).join('');
  const cover = game.coverUrl ? `<img class="game-cover" src="${escapeHtml(game.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="game-cover-shade"></span>` : '';
  return `<article class="game-card ${game.coverUrl ? 'has-cover' : ''}" data-id="${game.id}" style="--rating-color:${pegiColors[game.pegi] || pegiColors.none}">${cover}
    <div class="card-top">${platform}<button class="favorite-button ${game.favorite ? 'on' : ''}" data-action="favorite" aria-label="${game.favorite ? 'Remove favorite' : 'Mark favorite'}">★</button></div>
    <h3 class="game-title">${escapeHtml(game.title)}</h3><div class="game-meta${meta ? ' themed-tooltip' : ''}"${meta ? ` data-tooltip="${escapeHtml(meta)}" tabindex="0"` : ''}>${escapeHtml(meta || mediaFormatLabel(game, labels))}</div>
    <div class="badges">${badge(game.pegi ? `PEGI ${game.pegi}` : 'Unrated', pegiClass)}${descriptorBadges}${badge(labels[game.ownership], game.ownership)}${badge(labels[game.playStatus], game.playStatus)}${game.favorite ? badge('Favorite') : ''}${coverCredit(game.coverSource)}</div>
    ${cardTimes(game, escapeHtml)}
    ${cardRatingControl(game)}<div class="card-actions"><button type="button" class="edit-button" data-action="edit">Edit details</button>${quick}</div>
  </article>`;
}

export {
  isMissingPegiInfo, isMissingHltbInfo, isMissingDescription, gameCard, badge,
  personalRating, cardRatingAtPointer, paintCardRating,
};
