# Game Kat·a·log

Game Kat·a·log is a responsive, private-library-first game tracker with a shared public release index and community layer. It uses a lightweight stack: plain Node.js, `better-sqlite3`, server-rendered public pages, and dependency-free browser JavaScript.

Track owned and wishlisted games across consoles, handhelds, computers, storefronts, mobile, arcade, VR, streaming services, and custom platforms. Personal collection data stays account-scoped while sufficiently enriched factual release data can contribute to the public Kat·a·log.

## Features

### Private libraries

- Separate SQLite-backed libraries for every account, with settings synchronized across devices.
- Owned physical, owned digital, and wishlisted collection states.
- Backlog, playing, completed, paused, abandoned, and dropdown-only hidden play states.
- Half-star ratings, favorites, notes, cartridge numbers, publisher, release year, descriptions, PEGI metadata, IGDB user and critic ratings, cover art, and HowLongToBeat estimates.
- Grid and compact views, accent-insensitive live search, composable filters, and 27 sorting modes.
- Ten-row desktop pagination for both private and public collections.
- Copies sharing one canonical game identity are grouped into one card when no platform filter is active. IGDB-backed identities survive title and edition-name differences; records without IGDB data retain a normalized-title fallback. Platform chips select the exact private copy being viewed, rated, or edited, while a platform filter separates the releases again.
- Clicking a private card opens its read-only details. Editing remains an explicit action.

### Adding and enriching games

- A broad grouped platform list includes console families, handhelds, computers, operating systems, Steam, GOG, Epic Games Store, other launchers, and a Custom option.
- Title autocomplete checks the current account first, then the public Kat·a·log, then optional IGDB or SteamGridDB suggestions.
- Duplicate warnings use IGDB identity plus platform when known and otherwise fall back to normalized title plus platform. Deliberately separate copies and editions can still be confirmed.
- PEGI lookup can fill ratings, descriptors, releases, publisher, year, consumer advice, outlines, and content details.
- HowLongToBeat lookup stores Main Story, Main + Sides, Completionist, and All Styles estimates.
- Cover requests can use SteamGridDB, TheGamesDB, IGDB, and an HLTB match already selected for that game. Users can also upload their own cover.
- Description lookup checks Steam Store and can use IGDB and TheGamesDB as additional sources.
- Account-scoped background scans can fill missing covers, PEGI, HLTB, descriptions, and conservative exact-match IGDB metadata.
- Live updates patch affected cards without reloading the full grid or moving the viewport.
- Stored covers are durable local JPEGs capped at 900 pixels and 256 KiB. Avatars are center-cropped 512×512 JPEGs capped at 256 KiB.

### One persistent application shell

The signed-in app has four top-level views with one shared header and cover fan:

- **My Kat·a·log** for the private library.
- **Public Kat·a·log** for shared releases and one-click additions.
- **Kat·a·log Signal** for public-safe community activity.
- **Kat·a·log Forum** for public discussions.

Navigation swaps only the content below the header. The account control, collector progress, view buttons, and `+Game` action remain mounted. Direct refreshes on public views restore the requested section without briefly exposing the login screen.

### Collector progression

- The Gamebooks level curve, 100 levels, and Kat·a·log-specific titles.
- Permanent XP awards for building and enriching a collection, playing games, milestones, public contributions, avatars, and forum participation.
- Stable event references prevent repeated actions from farming XP.
- The header XP meter updates live and animates awards in level-scaled steps.
- Future award amounts can be tuned from the localhost admin panel without rewriting historical XP.

### Public Kat·a·log

- Crawlable browse pages at `/katalog` and stable factual release pages at `/game/:slug`.
- Public cards group releases by canonical game identity until a platform filter is applied.
- Signed-in members can add an existing public release without re-entering factual metadata.
- Existing copies of the selected canonical release are detected before the add action, with normalized title/platform fallback and server-side protection retained for races between tabs.
- Anonymous community ratings appear from the first private rating onward.
- Public covers are independent durable copies, so private edits or deletion cannot break a public release.

A private game becomes eligible only when it has a durable cover, substantive PEGI data, and HLTB timing data. Exact normalized cover and HLTB title matches publish automatically. Complete but ambiguous records enter the localhost review queue. Hidden and incomplete games stay private.

The shared entry contains factual release metadata only. It never includes the contributing account, ownership, format, play state, personal rating, favorite, cartridge number, notes, private row ID, email, or location.

### Signal and public profiles

- Signal is public at `/signal`, grouped by local day, limited to the last 30 days, and updated live.
- Public-safe events include new accounts, level-ups, public game contributions, and administrator announcements. Private library activity never appears.
- Larger same-day contribution groups collapse into one compact expandable entry.
- Accounts can hide all of their Signal activity, including existing events.
- Public collector profiles are opt-in and contain only aggregate collection information.
- Administrators can draft, publish, unpublish, delete, and pin Signal announcements.

### Forum, Patch, and Ping

- `/forum` is a public, search-visible discussion area with channels, threads, replies, ownership controls, and live updates.
- New-thread composition stays inline inside the selected channel.
- Members can edit or delete their own forum content; administrators can manage channels and moderate any thread.
- Patch is a private support and feedback channel for members and visitors.
- Ping is the signed-in private inbox for Patch replies, with live unread updates.
- Optional SMTP notifications use branded email templates linking back to the app.

### Stats for Nerds

The public Stats for Nerds panel provides an anonymous aggregate view of the collection, community, metadata, progression, and application. It never exposes credentials, emails, locations, private game titles, notes, or individual library rows.

## Accounts and security

- Registration includes username, password confirmation, and an optional email address.
- Passwords use scrypt with random salts. Sessions use random HttpOnly, SameSite cookies with rolling two-week expiry.
- Login throttling and temporary locks protect against repeated password failures.
- Accounts can change username, email, password, avatar, public-profile visibility, and Signal visibility.
- Password-reset links are one-time, expire after an hour, and revoke all existing sessions after use.
- The browser stores no authentication or account preferences in local storage or session storage.
- A configured owner account is protected from admin deletion, locking, and renaming. No username is hardcoded in the application.
- The public surface uses restrictive CSP, content-type, referrer, framing, and permissions headers.

## Requirements and startup

- Node.js 20 or newer.
- npm.
- The host `zip` command for scheduled database backups.

```bash
npm install
npm start
```

Open `http://localhost:3005`. The default listener accepts LAN connections, so another device can use the host computer's LAN address.

Optional environment variables:

```bash
PORT=3005 \
HOST=0.0.0.0 \
DB_PATH=/path/to/games.db \
PUBLIC_URL=https://gamekat.net \
OWNER_USERNAME=your_name \
IGDB_CLIENT_ID=optional_server_wide_client_id \
IGDB_CLIENT_SECRET=optional_server_wide_client_secret \
npm start
```

`PUBLIC_URL` controls canonical URLs, server-rendered links, email actions, and the SMTP greeting host. If `OWNER_USERNAME` is omitted, the oldest account is treated as the protected owner. IGDB credentials can instead be connected per account in Account Settings and are never sent back to the browser. IGDB requires a Twitch developer application created with the **Confidential** client type; a Public client cannot generate the required secret.

The current arbitrary release string lives in `VERSION`. It can be edited through the localhost admin panel and is broadcast immediately to open headers.

## Localhost admin

Open `http://127.0.0.1:3005/admin/` on the server itself. The panel deliberately rejects LAN and reverse-proxied public clients.

The terminal-style admin provides:

- Collection, account, metadata, public Kat·a·log, process, and application summaries.
- Account activity, approximate offline GeoIP location, session revocation, locking, and deletion controls.
- Collector XP tuning.
- Cross-account private-row inspection and deliberate game deletion.
- Public Kat·a·log review, factual editing, cover replacement, state management, and deletion.
- Signal announcement management.
- Forum channel and thread moderation.
- Private Patch queue triage and Ping replies.
- SMTP configuration and test email.
- SQLite maintenance, release-string editing, and backup controls.

## Backups and durable files

The server creates a compressed SQLite backup at startup and then on every hour. Archives are retained for 15 days in the Git-ignored `backups/` directory.

Backups intentionally contain the database only. Durable cover binaries in `public/covers/` and avatars in `public/avatars/` must be handled separately if the host itself is being backed up.

Do not copy only `games.db` while the server is actively writing unless its WAL files are also handled correctly. Use the built-in backup path or SQLite's backup API.

## Public pages and SEO

The authentication landing page is also the crawler-readable product page for `https://gamekat.net/`. Public routes include:

- `/katalog`
- `/game/:slug`
- `/signal`
- `/forum`
- `/forum/:channel`
- `/forum/thread/:id`
- `/docs/`

The app supplies canonical URLs, Open Graph and Twitter metadata, structured data, an install manifest, social artwork, controller icons, `robots.txt`, and a dynamic XML sitemap. The sitemap includes public releases and forum threads, but never private libraries, review candidates, rejected entries, API routes, admin routes, or avatars.

## Development and tests

Application code has no browser build step. Run the complete regression suite and documentation consistency check with:

```bash
npm test
```

Useful maintenance commands:

```bash
npm run dev
npm run docs:build
npm run docs:check
npm run covers:normalize
npm run covers:showcase
```

## Documentation

- [User guide](docs/user-guide.md)
- [Technical reference](docs/technical.md)
- [Platform color research](docs/platform-colors.md)
- Browser documentation index: `http://localhost:3005/docs/`

The Markdown files are the source of truth. `npm run docs:build` regenerates the standalone HTML mirrors, and `npm run docs:check` fails when those mirrors are stale.
