import { UI_LOCALE } from './ui-policy.js';

const COMPACT_SUFFIXES = Object.freeze(['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']);

export function formatCount(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) < 10_000) return number.toLocaleString(UI_LOCALE);
  let scaled = Math.abs(number); let tier = 0;
  while (scaled >= 1_000 && tier < COMPACT_SUFFIXES.length - 1) { scaled /= 1_000; tier += 1; }
  if (tier < COMPACT_SUFFIXES.length - 1 && Number(scaled.toFixed(tier)) >= 1_000) { scaled /= 1_000; tier += 1; }
  return `${number < 0 ? '-' : ''}${scaled.toFixed(tier)}${COMPACT_SUFFIXES[tier]}`;
}

export function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let scaled = bytes; let tier = 0;
  while (scaled >= 1_024 && tier < units.length - 1) { scaled /= 1_024; tier += 1; }
  const precision = tier <= 1 ? 0 : Math.min(2, tier - 1);
  return `${scaled.toFixed(precision)} ${units[tier]}`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function formatPlaytime(value) {
  const totalHours = Math.max(0, Math.round(Number(value) || 0));
  const years = Math.floor(totalHours / 8_760);
  const days = Math.floor((totalHours % 8_760) / 24);
  const hours = totalHours % 24;
  const parts = [];
  if (years) parts.push(`${years.toLocaleString(UI_LOCALE)}y`);
  if (years || days) parts.push(`${days}d`);
  parts.push(`${hours}h`);
  return parts.join(' ');
}

export function formatPercent(value, fractionDigits = 1) {
  const digits = Math.max(0, Math.min(4, Math.floor(Number(fractionDigits) || 0)));
  return `${Math.max(0, Number(value) || 0).toLocaleString(UI_LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function formatDecimal(value, maximumFractionDigits = 1) {
  return (Number(value) || 0).toLocaleString(UI_LOCALE, { maximumFractionDigits });
}

export function coverage(count, total) {
  const numerator = Math.max(0, Number(count) || 0);
  const denominator = Math.max(0, Number(total) || 0);
  const percent = denominator ? Math.min(100, (numerator / denominator) * 100) : 0;
  return `${formatCount(numerator)} (${formatPercent(percent)})`;
}
