export const CUSTOM_PLATFORM = '__custom__';

export const pegiColors = {
  3: '#4fbd69', 7: '#83bd46', 12: '#e4b447', 16: '#e67b45', 18: '#df5656', none: '#526170',
};

export const pcStorefronts = Object.freeze([
  'Steam', 'GOG', 'Epic Games Store', 'Microsoft Store', 'PC Game Pass', 'Xbox app (PC)',
  'EA app', 'Origin', 'Ubisoft Connect', 'Uplay', 'Battle.net', 'Rockstar Games Launcher',
  'itch.io', 'Amazon Games',
]);
const pcStorefrontSet = new Set(pcStorefronts);

export const platformGroups = {
  Nintendo: [
    'Nintendo Entertainment System', 'Super Nintendo Entertainment System', 'Nintendo 64',
    'Nintendo GameCube', 'Nintendo Wii', 'Nintendo Wii U', 'Nintendo Switch', 'Nintendo Switch 2',
    'Game Boy', 'Game Boy Color', 'Game Boy Advance', 'Nintendo DS', 'Nintendo DSi', 'Nintendo 3DS',
    'Virtual Boy', 'Pokémon Mini',
  ],
  PlayStation: [
    'PlayStation', 'PlayStation 2', 'PlayStation 3', 'PlayStation 4', 'PlayStation 5',
    'PlayStation Portable', 'PlayStation Vita', 'PlayStation VR', 'PlayStation VR2',
  ],
  Xbox: ['Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X|S', 'Xbox Cloud Gaming'],
  Sega: [
    'Sega Master System', 'Sega Mega Drive / Genesis', 'Sega CD / Mega-CD', 'Sega 32X',
    'Sega Saturn', 'Sega Dreamcast', 'Sega Game Gear', 'Sega Pico',
  ],
  Atari: ['Atari 2600', 'Atari 5200', 'Atari 7800', 'Atari Jaguar', 'Atari Lynx', 'Atari 8-bit', 'Atari ST'],
  'NEC, SNK & other consoles': [
    'PC Engine / TurboGrafx-16', 'PC Engine CD / TurboGrafx-CD', 'PC-FX', 'Neo Geo AES / MVS',
    'Neo Geo CD', 'Neo Geo Pocket', 'Neo Geo Pocket Color', '3DO', 'WonderSwan', 'WonderSwan Color',
    'Bandai Playdia', 'Casio Loopy', 'FM Towns Marty', 'Philips CD-i',
  ],
  'Classic consoles': [
    'Magnavox Odyssey', 'Magnavox Odyssey²', 'Fairchild Channel F', 'Intellivision',
    'ColecoVision', 'Vectrex', 'Bally Astrocade',
  ],
  Computers: [
    'PC (Windows)', 'DOS', 'macOS', 'Linux', 'Amiga', 'Commodore 64', 'Commodore VIC-20',
    'ZX Spectrum', 'Amstrad CPC', 'MSX', 'Apple II', 'BBC Micro', 'Acorn Archimedes',
    'Sharp X68000', 'NEC PC-98', 'FM Towns', 'TRS-80', 'Sam Coupé',
  ],
  'PC storefronts & launchers': pcStorefronts,
  'Mobile & handheld': ['Android', 'iOS', 'N-Gage', 'Gizmondo', 'Playdate', 'Evercade', 'Evercade VS', 'Steam Deck'],
  'Arcade, VR & streaming': ['Arcade', 'Meta Quest', 'SteamVR', 'Pico VR', 'Amazon Luna', 'GeForce NOW', 'Google Stadia'],
  Microconsoles: ['Amazon Fire TV', 'Android TV', 'Apple TV', 'Nvidia Shield TV', 'Ouya', 'Intellivision Amico'],
};

export const knownPlatforms = new Set(Object.values(platformGroups).flat());
export const isPcStorefront = platform => pcStorefrontSet.has(String(platform || '').trim());

export function platformFromReleaseText(releases) {
  const haystack = String(releases || '').toLocaleLowerCase();
  const exact = [...knownPlatforms]
    .sort((left, right) => right.length - left.length)
    .find(platform => haystack.includes(platform.toLocaleLowerCase()));
  if (exact) return exact;
  return /(^|[^\p{L}\p{N}])pc([^\p{L}\p{N}]|$)/u.test(haystack) ? 'PC (Windows)' : undefined;
}
