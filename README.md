# Game Kat·a·log

A responsive, local-first, multi-platform game collection manager built with the same lightweight stack as the other household apps: plain Node.js, `better-sqlite3`, and dependency-free HTML/CSS/JavaScript.

Game Kat·a·log tracks physical and digital games across Nintendo, PlayStation, Xbox, Sega, Atari, computers, handhelds, mobile, arcade, VR, streaming services, and custom platforms. Each title can carry ownership, wishlist, availability, play-state, PEGI, format, cover-art, HowLongToBeat estimates, and favourite metadata.

## Accounts

Registration and login use scrypt-hashed passwords and random bearer-token sessions with a rolling two-week expiry. Each account has an isolated library and can change its own username or password from the account menu.

New accounts begin with isolated, empty libraries. Existing game ownership is stored by immutable numeric account ID, so renaming an account does not affect its collection.

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

The authentication landing page doubles as a crawler-readable product page for `https://gamekat.net/`, with canonical, Open Graph, Twitter, and structured application metadata. The **Game Kat·a·log** wordmark uses true middle dots and the interface contains no mascot artwork. `robots.txt` excludes API, admin, and avatar paths; the sitemap contains only public pages. A 1200×630 social preview and installable-app PNG icons are kept in `public/`.

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
