const { GAME_LIMITS } = require('../validation-policy');
const normalizeSearchText = value => String(value || '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const gameGroupTitleKey = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const searchPattern = value => `%${normalizeSearchText(value).replace(/[\\%_]/g, character => `\\${character}`)}%`;
const safeList = value => (Array.isArray(value) ? value : [])
  .map(item => String(item || '').trim().slice(0, GAME_LIMITS.metadataItemMax))
  .filter(Boolean).slice(0, GAME_LIMITS.metadataItemsMax);
const safeText = (value, limit = GAME_LIMITS.metadataTextMax) => String(value || '').trim().slice(0, limit);
const boundedText = (value, limit, label) => {
  const clean = String(value || '').trim();
  if (clean.length > limit) throw new Error(`${label} cannot exceed ${limit.toLocaleString('en-US')} characters.`);
  return clean;
};
const validReleaseYear = value => Number.isInteger(Number(value)) && Number(value) >= GAME_LIMITS.releaseYearMin && Number(value) <= GAME_LIMITS.releaseYearMax;
const hltbHours = value => {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= GAME_LIMITS.hltbHoursMax ? Math.round(number * 100) / 100 : null;
};
const sqlTextValues = values => values.map(value => `'${value.replaceAll("'", "''")}'`).join(', ');

module.exports = {
  normalizeSearchText, gameGroupTitleKey, searchPattern, safeList, safeText, boundedText,
  validReleaseYear, hltbHours, sqlTextValues,
};
