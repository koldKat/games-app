import { createLibraryImporter } from './library-import.js';
import { UI_LOCALE } from './ui-policy.js';

function playtime(minutes) {
  const value = Number(minutes) || 0;
  if (!value) return 'Never played';
  if (value < 60) return `${value} min`;
  return `${(value / 60).toLocaleString(UI_LOCALE, { maximumFractionDigits: 1 })} h`;
}

export function createSteamImporter(options) {
  return createLibraryImporter({ ...options, provider: {
    id: 'steam', label: 'Steam', identityKey: 'appId', selectionBodyKey: 'appIds', requiresConfiguration: true,
    connectionName: connection => connection.personaName || connection.steamId,
    connectionDetail: connection => `${connection.steamId}${connection.lastSyncedAt ? ` // last import ${new Date(connection.lastSyncedAt).toLocaleString(UI_LOCALE)}` : ''}`,
    itemMeta: item => playtime(item.playtimeMinutes),
  } });
}
