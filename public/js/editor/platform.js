import { $ } from '../core/dom.js';
import { platformGroups, platformDisplayName, CUSTOM_PLATFORM, knownPlatforms } from '../library/platforms.js';
import { escapeHtml } from '../core/api.js';

function renderPlatformChoices() {
  $('#game-platform').innerHTML = Object.entries(platformGroups).map(([group, platforms]) => `<optgroup label="${escapeHtml(group)}">${platforms.map(platform => `<option value="${escapeHtml(platform)}">${escapeHtml(platformDisplayName(platform))}</option>`).join('')}</optgroup>`).join('') + `<optgroup label="Other"><option value="${CUSTOM_PLATFORM}">Custom…</option></optgroup>`;
}

function toggleCustomPlatform(focus = true) {
  const custom = $('#game-platform').value === CUSTOM_PLATFORM;
  $('#game-platform-custom-label').hidden = !custom;
  $('#game-platform-custom').required = custom;
  if (custom && focus) setTimeout(() => $('#game-platform-custom').focus(), 0);
}

function setPlatformValue(platform) {
  const value = String(platform || '').trim();
  if (knownPlatforms.has(value)) { $('#game-platform').value = value; $('#game-platform-custom').value = ''; }
  else { $('#game-platform').value = CUSTOM_PLATFORM; $('#game-platform-custom').value = value; }
  toggleCustomPlatform(false);
}

function selectedPlatform() { return $('#game-platform').value === CUSTOM_PLATFORM ? $('#game-platform-custom').value.trim() : $('#game-platform').value; }

export function initializeEditorPlatform() {
  renderPlatformChoices();
  $('#game-platform').addEventListener('change', () => toggleCustomPlatform());
}
export { setPlatformValue, selectedPlatform };
