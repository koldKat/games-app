import { state } from '../core/runtime.js';
import { groupGames } from '../library/game-groups.js';
import { renderVersionPicker } from './version-picker.js';

export function mountVersionPicker(host, game, onSelect, anchor) {
  const versions = Array.isArray(game?.versions) && game.versions.length ? game.versions : state.games;
  renderVersionPicker(host, game, versions, groupGames, selected => {
    onSelect(game?.versions ? { ...selected, versions: game.versions } : selected);
  }, anchor);
}
