function titleKey(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function featuredVersion(versions) {
  return versions.find(game => game.coverUrl) || versions[0];
}

export function groupGames(games, { splitPlatforms = false } = {}) {
  if (splitPlatforms) return games.map(game => ({ ...game, versions: [game], versionCount: 1 }));
  const groups = new Map();
  for (const game of games) {
    const key = titleKey(game.title) || `game-${game.id}`;
    const group = groups.get(key) || []; group.push(game); groups.set(key, group);
  }
  return [...groups.values()].map(versions => {
    const game = featuredVersion(versions);
    return { ...game, versions, versionCount: versions.length };
  });
}
