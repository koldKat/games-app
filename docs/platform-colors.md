# Platform color research

Game Kat·a·log uses platform color only as a restrained identity cue. It is not a claim that every platform has one official brand color. The badge text stays neutral for legibility; the researched color appears in its border, status mark, hover treatment, and lightly tinted surface.

## Method

The palette follows this order of evidence:

1. A first-party brand guide with RGB or hexadecimal values.
2. A first-party logo, press kit, product page, or historical hardware page.
3. Maintained Simple Icons metadata whose source points to the first-party asset or a published console wordmark.
4. A preserved published logo when the original company no longer maintains the platform.
5. Neutral styling when no stable color identity survives, when regional marks conflict, or when a product was primarily monochrome.

Multicolor marks are represented by a subdued gradient. The gradient preserves the order and character of the published mark, but its CSS stops are normalized for legibility in this dark interface. They are not presented as official spot-color specifications.

## Audited palette

| Theme | Platforms | Basis |
|---|---|---|
| Nintendo red `#E60012` | NES, Switch, Switch 2, Virtual Boy | Nintendo red from the [Nintendo Switch brand guide](https://repo.mariocube.com/Marketing/Europe/GUIDELINES/NintendoSwitch_BrandGuide_EU-2_external_05092017_v3.pdf); the NES and Virtual Boy use their published red product marks. |
| Nintendo multicolor | SNES, Nintendo 64, Game Boy Color | Their published product marks are explicitly multicolor. See the preserved [SNES](https://commons.wikimedia.org/wiki/File:Super_Famicom_logo.svg), [Nintendo 64](https://commons.wikimedia.org/wiki/File:Nintendo_64_wordmark.svg), and [Game Boy Color](https://commons.wikimedia.org/wiki/File:Game_Boy_Color_logo.svg) marks. |
| GameCube `#6A5FBB` | Nintendo GameCube | Maintained brand metadata based on Nintendo's former official [GameCube support identity](https://www.nintendo.com/consumer/systems/nintendogamecube/index.jsp). |
| Wii gray | Wii | The published Wii wordmark is gray. No unrelated Nintendo red is applied. |
| Wii U `#009AC7` | Wii U | Nintendo's [Wii U logo guide](https://repo.mariocube.com/Marketing/Nintendo%20Design%20Files/Nintendo/Nintendo%20Wii%20U/WiiU_LogoGuidelines_0319_E3VersionB%5B1%5D.pdf) specifies RGB 0/150/200 and `#009AC7`. |
| Nintendo 3DS `#D12228` | Nintendo 3DS | Maintained brand metadata sourced from Nintendo's published 3DS identity. |
| Nintendo neutral | Game Boy, Game Boy Advance, DS, DSi, Pokémon Mini | These products used monochrome, variable, or region-dependent marks. A neutral badge is more accurate than assigning modern Nintendo red. |
| Original PlayStation multicolor | PlayStation | The original PlayStation mark is multicolor, so the badge uses its red, yellow, green, and blue sequence. |
| PlayStation blue `#003791` | PS2, PS3, PS4, PS5, PSP, Vita, PS VR, PS VR2 | The preserved console wordmarks and current PlayStation material consistently use the deep PlayStation blue family. [Sony's PS5 design story](https://www.sony.com/en/SonyInfo/design/stories/PS5/) identifies blue as the brand color; maintained icon metadata uses `#003791` for the console marks. |
| Xbox green `#107C10` | Xbox hardware, Xbox Cloud Gaming, Microsoft Store, PC Game Pass, Xbox app | Microsoft's published Fluent palette identifies `#107C10` as its primary green, matching Xbox's first-party green identity. See [Fluent design tokens](https://microsoft.github.io/fluentui-design-tokens/). |
| Sega blue `#0089CF` | Sega hardware | Sega's published corporate mark and [official hardware archive](https://www.sega.jp/history/hard/) provide the shared blue anchor. Dreamcast does not use its region-specific orange, red, or blue swirl as a universal color. |
| Atari rainbow | Atari hardware | Atari itself calls the 5200 treatment its [iconic rainbow animated logo](https://atari.com/products/atari-desktop-art-1). Red remains the border anchor while the identity mark uses the classic spectrum. |
| SNK blue | Neo Geo hardware | The current and historical SNK marks use blue. Gold is not applied as a guessed Neo Geo family color. |
| NEC blue `#1414A0` | PC Engine, TurboGrafx, PC-FX, NEC PC-98 | The NEC corporate mark supplies the stable source-backed anchor across these NEC platforms. |
| Preserved multicolor marks | WonderSwan, Amiga, ZX Spectrum, Amstrad CPC, Apple II, FM Towns, Amico | Each has its own explicit gradient based on its published product mark. They do not share one generic rainbow. The [first Amiga mark](https://en.wikipedia.org/wiki/Amiga#Marketing) and [ZX Spectrum material](https://worldofspectrum.org/pub/sinclair/games-info/l/Logo_1-TurtleGraphics.pdf) document those systems' rainbow identities. |
| Neutral legacy | 3DO, Playdia, Loopy, CD-i, Odyssey systems, Channel F, Intellivision, ColecoVision, Vectrex, Astrocade, DOS, BBC Micro, X68000, TRS-80, Sam Coupé, N-Gage, Gizmondo, Arcade, Pico VR, Ouya | No single stable and well-supported color was found. Neutral is an intentional researched outcome, not a missing mapping. |
| Windows blue `#0078D4` | PC (Windows) | Microsoft's current Windows/Fluent blue. |
| Apple neutral | macOS, iOS, Apple TV | Apple's published marks are monochrome, so the dark interface uses a neutral silver rather than inventing a platform color. |
| Linux yellow `#FCC624` | Linux | The Linux Foundation's published Tux mark supplies the yellow anchor. |
| Commodore navy `#1E2A4E` | Commodore 64, VIC-20 | Current Commodore identity metadata sourced from the published Commodore mark. |
| Steam neutral | Steam, SteamVR | Valve's [Steam branding guide](https://partner.steamgames.com/doc/marketing/branding) specifies black for the positive mark and white for the reverse mark. The old bright blue guess was removed. |
| Steam Deck blue `#1A9FFF` | Steam Deck | Maintained platform identity metadata based on Valve's Steam hardware branding. |
| GOG purple `#5100DC` | GOG | The current [GOG brand guide](https://www.gog.com/pressroom/wp-content/uploads/2025/06/GOG-Brand-Visual-Guidelines.pdf) names `#5100DC` as the main purple. The older `#86328A` value was removed. |
| Monochrome storefronts | Epic Games Store, EA app, Ubisoft Connect, Uplay | Their published current marks are monochrome. Neutral silver is used instead of arbitrary corporate colors. |
| Origin orange `#F56C2D` | Origin | The preserved Origin product mark supplies the orange anchor. |
| Battle.net blue `#4381C3` | Battle.net | Maintained identity metadata sourced from Battle.net's published mark. |
| Rockstar yellow `#FCAF17` | Rockstar Games Launcher | Maintained identity metadata sourced from Rockstar's published mark. |
| itch.io carnation `#FA5C5C` | itch.io | The [itch.io press kit](https://itch.io/press-kit) explicitly names `#FA5C5C` as its primary brand color. |
| Amazon orange `#FF9900` | Amazon Games, Fire TV | Amazon's smile/wordmark orange is used as the common anchor. Luna remains separate because its product identity is purple. |
| Android green `#3DDC84` | Android, Android TV | Google's [Android visual identity](https://partnermarketinghub.withgoogle.com/brands/android/visual-identity/visual-identity/logo-lock-ups) supplies the green. |
| Playdate yellow | Playdate | Panic's [Playdate media kit](https://help.play.date/press/is-there-a-media-kit/) describes the system simply and explicitly: "It's yellow." |
| Evercade cartridge gradient | Evercade, Evercade VS | The gradient follows Evercade's red console, purple arcade, and blue home-computer cartridge families shown on the [official cartridge library](https://evercade.co.uk/cartridges/). |
| Meta blue `#0467DF` | Meta Quest | Current Meta identity metadata sourced from Meta's published mark. |
| Luna purple `#9146FF` | Amazon Luna | Amazon's own Games page presents the [Luna logo on purple](https://games.amazon.com/en-us). |
| NVIDIA green `#76B900` | GeForce NOW, Nvidia Shield TV | NVIDIA's [brand guide](https://www.nvidia.com/content/dam/en-zz/Solutions/about-us/NVIDIA-Brand-Guidelines-for-NVIDIA-Partner-Network-v03-3-5-19.pdf) specifies RGB 118/185/0. |
| Stadia red `#CD2640` | Google Stadia | Preserved product identity metadata sourced from Stadia's published service mark. |

## Implementation contract

`public/js/platforms.js` owns the exact platform-to-theme map. It deliberately performs no regex guessing. Every built-in platform must resolve to a named audited theme, while user-entered custom platforms receive the neutral `custom` theme.

`public/css/library.css` owns the palette variables. `public/css/features.css` consumes the shared surface, frame, and mark variables for platform badges. `public/js/platforms.js` applies the same identity classes to library cards and dialogs, public-release cards and edition selectors, Signal, public collector profiles, title suggestions, import review matches, and Stats for Nerds. Server-rendered public markup carries the raw platform in `data-platform-theme`; the public Kat·a·log client resolves it through the same centralized map after initial load and partial navigation. Multicolor identities use the same ordered gradient for the frame and marker, with a darker version spread across the full surface. The card rail remains PEGI-colored, so platform identity never replaces age-rating semantics.

The platform regression test iterates every built-in platform and fails if any falls through to `custom`. Additions to the platform list therefore require an explicit palette decision.

Canonical platform values remain unchanged in storage and filters. The interface shortens Nintendo Entertainment System and Super Nintendo Entertainment System to the more recognizable NES and SNES labels.
