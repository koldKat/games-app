'use strict';

const PUBLIC_STATUS = 'public';
const CANDIDATE_STATUS = 'candidate';

function normalizeCatalogueText(value) {
  return String(value || '')
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function hasPegiMetadata(game = {}) {
  return [3, 7, 12, 16, 18].includes(Number(game.pegi)) && Boolean(
    String(game.pegiUrl || '').trim()
    || (Array.isArray(game.pegiDescriptors) && game.pegiDescriptors.length)
    || (Array.isArray(game.pegiReleases) && game.pegiReleases.length)
    || String(game.pegiAdvice || '').trim()
    || String(game.pegiOutline || '').trim()
    || String(game.pegiContentIssues || '').trim()
    || String(game.pegiOtherIssues || '').trim()
  );
}

function hasHltbMetadata(game = {}) {
  return Number(game.hltbId) > 0 && [
    game.hltbMainStory,
    game.hltbMainExtra,
    game.hltbCompletionist,
    game.hltbAllStyles,
  ].some(value => Number(value) > 0);
}

function hasDurableCover(game = {}) {
  return /^\/covers\/[a-f0-9]{32}\.(?:jpg|png|webp)$/i.test(String(game.coverUrl || ''));
}

function exactMatch(left, right) {
  const normalizedLeft = normalizeCatalogueText(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeCatalogueText(right);
}

function evaluateCatalogueGame(game = {}) {
  const title = String(game.title || '').trim();
  const platform = String(game.platform || '').trim();
  const cover = hasDurableCover(game);
  const pegi = hasPegiMetadata(game);
  const hltb = hasHltbMetadata(game);
  const coverExact = cover && exactMatch(title, game.coverMatchTitle);
  const hltbExact = hltb && exactMatch(title, game.hltbTitle);
  const complete = Boolean(title && platform && cover && pegi && hltb);
  const reasons = [];
  if (!title) reasons.push('missing-title');
  if (!platform) reasons.push('missing-platform');
  if (!cover) reasons.push('missing-cover');
  if (!pegi) reasons.push('missing-pegi');
  if (!hltb) reasons.push('missing-hltb');
  if (cover && !coverExact) reasons.push('cover-title-ambiguous');
  if (hltb && !hltbExact) reasons.push('hltb-title-ambiguous');
  const confidence = Math.min(100,
    (title ? 5 : 0) + (platform ? 5 : 0)
    + (cover ? 20 : 0) + (coverExact ? 15 : 0)
    + (pegi ? 25 : 0)
    + (hltb ? 15 : 0) + (hltbExact ? 15 : 0));
  return {
    eligible: complete,
    status: complete && coverExact && hltbExact ? PUBLIC_STATUS : complete ? CANDIDATE_STATUS : null,
    confidence,
    reasons,
    identity: {
      titleKey: normalizeCatalogueText(title),
      platformKey: normalizeCatalogueText(platform),
    },
  };
}

module.exports = {
  CANDIDATE_STATUS,
  PUBLIC_STATUS,
  evaluateCatalogueGame,
  exactMatch,
  hasDurableCover,
  hasHltbMetadata,
  hasPegiMetadata,
  normalizeCatalogueText,
};
