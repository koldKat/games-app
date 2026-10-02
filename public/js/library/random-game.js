export function createRandomGamePicker({ button, rerollButton, api, queryString, openGame, toast }) {
  let available = false;
  let pending = false;
  let randomDialog = false;
  let currentGameId = null;

  function paint() {
    button.disabled = pending || !available;
    button.textContent = pending ? 'rolling…' : 'random()';
    rerollButton.hidden = !randomDialog;
    rerollButton.disabled = pending || !available;
    rerollButton.textContent = pending ? 'rolling…' : 'reroll()';
  }

  async function pick(excludeCurrent = false) {
    if (pending || !available) return;
    pending = true; paint();
    try {
      const params = new URLSearchParams(queryString());
      if (excludeCurrent && currentGameId) params.set('excludeId', String(currentGameId));
      const game = await api(`/api/games/random?${params}`);
      openGame(game, true);
    } catch (error) { toast(error.message); }
    finally { pending = false; paint(); }
  }

  button.addEventListener('click', () => { void pick(false); });
  rerollButton.addEventListener('click', () => { void pick(true); });

  return {
    setAvailability(count, loading = false) {
      available = Number(count) > 0 && !loading;
      paint();
    },
    setDialog(active, gameId = null) {
      randomDialog = Boolean(active);
      currentGameId = randomDialog ? Number(gameId) || null : null;
      paint();
    },
  };
}
