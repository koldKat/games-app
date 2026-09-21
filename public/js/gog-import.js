import { createLibraryImporter } from './library-import.js';
import { UI_LOCALE } from './ui-policy.js';

export function createGogImporter(options) {
  return createLibraryImporter({ ...options, provider: {
    id: 'gog', label: 'GOG', identityKey: 'productId', selectionBodyKey: 'productIds', requiresConfiguration: false,
    connectionBodyKey: 'authorization', connectLabel: 'Authorize', replaceLabel: 'Reconnect',
    readyText: 'Ready for secure GOG authorization.', disconnectedText: 'No GOG account authorized.',
    reconnectText: 'The old public-profile connection cannot read hidden GOG games. Reauthorize once.',
    missingConnectionText: 'Authorize with GOG, then paste the final result URL.',
    connectedToast: 'GOG account authorized.', disconnectedToast: 'GOG account disconnected.',
    connectionName: connection => connection.username,
    connectionDetail: connection => `${connection.username}${connection.lastSyncedAt ? ` // last import ${new Date(connection.lastSyncedAt).toLocaleString(UI_LOCALE)}` : ''}`,
    itemMeta: item => item.sourceHidden ? 'Owned on GOG // hidden on GOG' : 'Owned on GOG',
  } });
}
