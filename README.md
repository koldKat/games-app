# Game Kat·a·log

A responsive, local-first, multi-platform game collection manager built with the same lightweight stack as the other household apps: plain Node.js, `better-sqlite3`, and dependency-free HTML/CSS/JavaScript.

Game Kat·a·log tracks physical and digital games across Nintendo, PlayStation, Xbox, Sega, Atari, computers, handhelds, mobile, arcade, VR, streaming services, and custom platforms. Each title can carry ownership, wishlist, availability, play-state, PEGI, format, cover-art, HowLongToBeat estimates, and favourite metadata.

## Features

- Multi-account, account-scoped libraries with responsive card and compact views.
- Broad platform taxonomy plus custom platforms for unusual hardware and editions.
- Ownership, wishlist, availability, physical/digital format, play status, favourites, cartridge numbers, publishers, years, and notes.
- Accent-insensitive search; composable platform, collection, PEGI, status, favourite, and missing-data filters; and 23 catalogue or HLTB sort orders.
- PEGI-assisted ratings, descriptors, releases, guidance, and conservative batch enrichment.
- SteamGridDB title suggestions, duplicate warnings, manual cover selection, and missing-cover scans.
- HowLongToBeat Main Story, Main + Sides, Completionist, and All Styles estimates with manual and batch matching.
- Server-sent live updates that patch affected cards without reloading the grid or moving the viewport.
- SQLite-backed view, search, filter, and sort preferences that follow an account across devices.
- Dense, responsive desktop and mobile interfaces with background enrichment progress and targeted live card updates.

## Accounts

Registration and login use scrypt-hashed passwords and random sessions delivered through an HttpOnly, SameSite cookie with a rolling two-week expiry. The browser stores no authentication or preference state in local or session storage. Each account has an isolated library and can change its own username or password from the account menu.

New accounts begin with isolated, empty libraries. Existing game ownership is stored by immutable numeric account ID, so renaming an account does not affect its collection.

Library view, search text, filters, and sorting are stored per account in SQLite. Signing in from another desktop or phone therefore restores the same workspace settings.

The add/edit form includes a broad grouped platform catalogue plus a custom-platform escape hatch. PEGI rating colours provide the card rail identity; the platform remains visible on each card.

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

Open `http://127.0.0.1:3005/admin/` on the host machine for the dense, terminal-style control panel. It exposes collection/account summaries, session revocation, cross-account catalogue inspection, SQLite maintenance, hourly compressed backups, and an arbitrary release-string editor backed by `VERSION`.

The server makes one ZIP backup at startup and then on every hour, retaining 15 days under the Git-ignored `backups/` directory. The host `zip` command is required.

The panel is loopback-only. Requests forwarded by nginx with a non-loopback client address are rejected even though nginx itself connects locally.

## Public landing and SEO

The authentication landing page doubles as a crawler-readable product page for `https://gamekat.net/`. Six visible feature modules describe platform breadth, querying, PEGI/HLTB metadata, cover workflows, cross-device preferences, and live background enrichment. Canonical, Open Graph, Twitter, install-manifest, and `WebApplication` JSON-LD metadata use the same product language and link to the public guide and GitHub repository. `robots.txt` excludes API, admin, and avatar paths; the sitemap contains only public pages. A 1200×630 social preview and installable-app PNG icons are kept in `public/`.

## PEGI lookup

PEGI does not publish a documented public developer API. The add/edit dialog therefore performs a user-triggered search of PEGI's public catalogue and parses only the displayed result metadata. It fills title, rating, publisher, release year, descriptors, and release/platform details. An account-scoped background scan can conservatively fill missing PEGI metadata for an existing library. Manual entry remains available if PEGI is offline or changes its page.

## HowLongToBeat estimates

The add/edit dialog can search HowLongToBeat and store Main Story, Main + Sides, Completionist, and All Styles estimates. An account-scoped background scan fills only unique exact-title matches and leaves ambiguous editions for manual review. The provider is implemented entirely in Node.js; no Python runtime or worker process is required.

Cover, PEGI, and HLTB batch progress is delivered over an authenticated server-sent event stream. Matching cards are patched in place as results arrive, without reloading or repositioning the complete library grid.

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
