function compareGames(left, right, sort = 'title') {
  const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()
    .replace(/\s+/g, ' ').trim();
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const title = () => compare(normalize(left.title), normalize(right.title)) || Number(left.id || 0) - Number(right.id || 0);
  const text = (key, direction = 1) => (!left[key]) - (!right[key])
    || direction * compare(normalize(left[key]), normalize(right[key])) || title();
  const number = (key, direction = 1) => (left[key] == null) - (right[key] == null)
    || direction * (Number(left[key] || 0) - Number(right[key] || 0)) || title();

  if (sort === 'title_desc') return -title();
  if (sort === 'platform') return text('platform');
  if (sort === 'publisher') return text('publisher');
  if (sort === 'year') return number('releaseYear');
  if (sort === 'year_desc') return number('releaseYear', -1);
  if (sort === 'pegi') return number('pegi');
  if (sort === 'pegi_desc') return number('pegi', -1);
  if (sort === 'ownership') return ({ owned: 0, wanted: 1, unavailable: 2 }[left.ownership] ?? 3)
    - ({ owned: 0, wanted: 1, unavailable: 2 }[right.ownership] ?? 3) || title();
  if (sort === 'status') return ({ playing: 0, backlog: 1, paused: 2, completed: 3, abandoned: 4 }[left.playStatus] ?? 5)
    - ({ playing: 0, backlog: 1, paused: 2, completed: 3, abandoned: 4 }[right.playStatus] ?? 5) || title();
  if (sort === 'favorites') return Number(right.favorite) - Number(left.favorite) || title();
  if (sort === 'newest') return String(right.createdAt).localeCompare(String(left.createdAt)) || right.id - left.id;
  if (sort === 'oldest') return String(left.createdAt).localeCompare(String(right.createdAt)) || left.id - right.id;
  if (sort === 'updated') return String(right.updatedAt).localeCompare(String(left.updatedAt)) || right.id - left.id;

  const hltbSorts = {
    hltb_main_short: ['hltbMainStory', 1], hltb_main_long: ['hltbMainStory', -1],
    hltb_extra_short: ['hltbMainExtra', 1], hltb_extra_long: ['hltbMainExtra', -1],
    hltb_100_short: ['hltbCompletionist', 1], hltb_100_long: ['hltbCompletionist', -1],
    hltb_all_short: ['hltbAllStyles', 1], hltb_all_long: ['hltbAllStyles', -1],
  };
  if (hltbSorts[sort]) return number(...hltbSorts[sort]);
  if (sort === 'cartridge') return number('cartridgeNumber');
  return title();
}

export { compareGames };
