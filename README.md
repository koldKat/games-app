# Game Kat·a·log

A responsive, private-library-first, multi-platform game collection manager with a shared public discovery Kat·a·log, built with the same lightweight stack as the other household apps: plain Node.js, `better-sqlite3`, and dependency-free HTML/CSS/JavaScript.

Game Kat·a·log tracks owned and wishlisted games across Nintendo, PlayStation, Xbox, Sega, Atari, computers, handhelds, mobile, arcade, VR, streaming services, and custom platforms. Each title can carry physical/digital format, play-state, PEGI and ESRB details, cover-art, HowLongToBeat estimates, a personal half-star rating, favourite, publisher, release-year, cartridge, and note metadata.

## Features

- Multi-account, account-scoped libraries with responsive card and compact views.
- Broad platform taxonomy plus custom platforms for unusual hardware and editions.
- Owned and wishlisted collection states, physical/digital format, play status, personal half-star ratings, favourites, cartridge numbers, publishers, years, and notes.
- Accent-insensitive search; composable platform, collection, PEGI, status, favourite, and missing-data filters; and 23 Kat·a·log or HLTB sort orders.
- PEGI-assisted ratings, descriptors, releases, guidance, and conservative batch enrichment.
- Optional ESRB-assisted US rating details, content descriptors, interactive elements, rating summaries, and conservative batch enrichment.
- SteamGridDB and TheGamesDB cover search with provider-specific missing-cover scans, durable public local artwork, and SteamGridDB title suggestions.
- Editable game descriptions with Steam Store-first and TheGamesDB-fallback lookup and conservative background filling.
- HowLongToBeat Main Story, Main + Sides, Completionist, and All Styles estimates with manual and batch matching.
- Server-sent live updates that patch affected cards without reloading the grid or moving the viewport.
- Collector progression with the Gamebooks level curve, permanent action awards, titles, milestone XP, and live account updates.
- SQLite-backed view, search, filter, and sort preferences that follow an account across devices.
- Dense, responsive desktop and mobile interfaces with background enrichment progress and targeted live card updates.
- A crawlable public release Kat·a·log that grows from fully enriched libraries and lets signed-in members add an existing release without re-entering factual metadata.

## Accounts

Registration and login use scrypt-hashed passwords and random sessions delivered through an HttpOnly, SameSite cookie with a rolling two-week expiry. The browser stores no authentication or preference state in local or session storage. Each account has an isolated library and can change its own username or password from the account menu.

New accounts begin with isolated, empty libraries. Existing game ownership is stored by immutable numeric account ID, so renaming an account does not affect its collection.

Library view, search text, filters, and sorting are stored per account in SQLite. Signing in from another desktop or phone therefore restores the same workspace settings.

The add/edit form includes a broad grouped platform list plus a custom-platform escape hatch. PEGI rating colours provide the card rail identity; the platform remains visible on each card.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3005`. The server listens on all interfaces by default, so the app can also be opened from a phone on the same network using the computer's LAN address.

Optional environment variables:

```bash
PORT=3005 HOST=0.0.0.0 DB_PATH=/path/to/games.db npm start
```

## Local admin

Open `http://127.0.0.1:3005/admin/` on the host machine for the dense, terminal-style control panel. It exposes live process health plus one-minute collection/catalogue summaries, account locks and session revocation, collector XP tuning, SMTP settings for password resets, cross-account private-row inspection, public Kat·a·log review, SQLite maintenance, hourly compressed backups, and an arbitrary release-string editor backed by `VERSION`.

The server makes one database-only ZIP backup at startup and then on every hour, retaining 15 days under the Git-ignored `backups/` directory. Cover binaries in `public/covers/` are deliberately excluded. The host `zip` command is required.

The panel is loopback-only. Requests forwarded by nginx with a non-loopback client address are rejected even though nginx itself connects locally.

## Public landing and SEO

The authentication landing page doubles as a crawler-readable product page for `https://gamekat.net/`. Its public Kat·a·log is server-rendered at `/katalog`, while each release receives a stable `/game/:slug` URL with factual metadata and `VideoGame` structured data; browser visitors see that release's detail dialog over the catalogue. Canonical, Open Graph, Twitter, install-manifest, and JSON-LD metadata use the same product language and link to the public guide and GitHub repository. `robots.txt` excludes API, admin, and avatar paths; the dynamic sitemap uses the standard URL-set format and exposes the landing page, documentation, Kat·a·log, published releases, and their latest update dates. A 1200×630 social preview and installable-app PNG icons are kept in `public/`.

## Public Kat·a·log

Private libraries remain the primary workspace. A release becomes public automatically only after it has a durable local cover, substantive PEGI **or ESRB** metadata, HLTB timing data, and exact normalized cover and HLTB title matches. Complete but ambiguous records enter the localhost-only review queue; incomplete records remain private. An administrator can edit shared factual metadata, replace a shared cover from a supported artwork provider, publish, reject, return, or delete Kat·a·log entries. For signed-in users, Kat·a·log navigation retains the shared app header and swaps only the workspace below it; the Kat·a·log/My Kat·a·log action interchanges while Add a game stays fixed.

Only factual release data is copied. Account identity, ownership, media format, play state, personal ratings, favourites, cartridge numbers, notes, and private row IDs are never exposed. An added public release stays linked to its private copy so the public detail dialog can show only an anonymous community rating average and count once at least two members have rated it. The Kat·a·log owns a separate cover file so later private edits or deletion cannot break a public release. A signed-in release detail detects an existing title-and-platform copy and shows an already-added state instead of add controls; normal duplicate protection remains as a race safeguard.

## PEGI lookup

PEGI does not publish a documented public developer API. The add/edit dialog therefore performs a user-triggered search of PEGI's public catalogue and parses only the displayed result metadata. It fills title, rating, publisher, release year, descriptors, and release/platform details. An account-scoped background scan can conservatively fill missing PEGI metadata for an existing library. Manual entry remains available if PEGI is offline or changes its page.

## ESRB lookup

ESRB likewise has no documented public developer API. Its optional integration reads the public search page only when requested, stores the selected US rating, descriptors, interactive elements, summary, and source link, and can fill unambiguous exact-title records in an account-scoped background scan. ESRB does not affect PEGI card colours or automatic public-release eligibility.

## HowLongToBeat estimates

The add/edit dialog can search HowLongToBeat and store Main Story, Main + Sides, Completionist, and All Styles estimates. An account-scoped background scan fills only unique exact-title matches and leaves ambiguous editions for manual review. The provider is implemented entirely in Node.js; no Python runtime or worker process is required.

Cover, PEGI, and HLTB batch progress is delivered over an authenticated server-sent event stream. Matching cards are patched in place as results arrive, without reloading or repositioning the complete library grid.

Provider artwork is copied into durable public storage rather than hotlinked. Covers are normalized to JPEG, capped at 900 pixels on the longest edge and 256 KiB; avatars are 512×512 JPEGs capped at 256 KiB.

## Data and tests

The SQLite database is `games.db`. Run the regression tests with:

```bash
npm test
```

## Documentation

- [User guide](docs/user-guide.md)
- [Technical reference](docs/technical.md)
- Browser documentation index: `http://localhost:3005/docs/`

Markdown is the source of truth. Regenerate and verify the standalone HTML mirrors with:

```bash
npm run docs:build
npm run docs:check
```
