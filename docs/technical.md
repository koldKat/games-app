# Game Kat·a·log - Technical Reference

---

## Architecture

Game Kat·a·log follows the same lightweight family architecture as the other local apps: one Node.js HTTP process, SQLite persistence, no browser framework, and no build step for application code.

```text
games-app/
  server.js                 HTTP entrypoint, static serving, route dispatch
  server/
    admin.js                loopback gate, admin API, backups and maintenance
    auth.js                 scrypt passwords, sessions, account changes, throttling
    backup.js               hourly compressed SQLite snapshots and retention
    db.js                   schema, migrations, validation, scoped game queries
    pegi.js                 opt-in PEGI HTTP lookup and result parser
    pegi-bulk.js            account-scoped conservative PEGI enrichment jobs
    events.js               authenticated server-sent event fan-out
    covers.js               SteamGridDB client, throttling, matching, artwork selection
    version.js              validated atomic reads/writes of the VERSION file
  admin/
    index.html              localhost control-panel markup
    style.css               dense terminal-style admin theme
    js/                     dashboard, accounts, catalogue, tools and shared ES modules
  scripts/
    generate-docs.js        Markdown-to-HTML documentation generator/checker
  public/
    index.html              application and authentication markup
    app.js                  browser state, rendering, auth, forms, API calls
    js/events.js            bearer-authenticated SSE stream parser and reconnect
    js/platforms.js         grouped platform catalogue and release-name matching
    style.css               dense dark responsive theme
    manifest.webmanifest    installable-app metadata
    favicon.svg             application icon
    icon-192.png            installable-app icon
    icon-512.png            high-resolution installable-app icon
    social-preview.*        source SVG and rendered 1200x630 social card
    robots.txt              crawler policy for public and private surfaces
    sitemap.xml             canonical public URLs for gamekat.net
    docs/                   generated standalone HTML documentation
  docs/
    user-guide.md           user documentation source
    technical.md            this file
  test/
    auth.test.js            sessions, password changes, isolation
    backup.test.js          hourly ZIP creation and scheduling
    pegi.test.js            PEGI result parsing
    pegi-bulk.test.js       exact-title matching, skips, and job notifications
    events.test.js          SSE framing, replay isolation, and session revocation
    covers.test.js          conservative cover-title normalization
    seo.test.js             canonical metadata, crawler policy, image dimensions
    admin.test.js           localhost gate and cross-account admin summaries
    version.test.js         arbitrary release-string persistence and validation
  VERSION                   release string displayed in the application header
  games.db                  runtime SQLite database
```

### Request flow

```text
Browser
  -> static file request ----------------------> server.js -> public/
  -> localhost /admin/* -----------------------> admin.js -> admin/ + SQLite/VERSION
  -> POST /api/login or /api/register --------> server.js -> auth.js -> SQLite
  -> authenticated /api/* + Bearer token -----> auth.js -> user identity
                                                    |
                                                    +-> db.js (user-scoped query)
                                                    +-> pegi.js + pegi-bulk.js (lookup/jobs)
                                                    +-> covers.js (configured lookup/bulk scan)

  <- authenticated /api/events event stream <------ events.js <- job progress/game changes
```

All authenticated routes resolve the session before dispatching feature logic. They pass the numeric user ID into every database operation rather than trusting a client-provided owner ID.

---

## Runtime and dependencies

- Node.js 20 or newer
- `better-sqlite3` as the only production package
- Port `3005` and host `0.0.0.0` by default

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3005` | HTTP listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `DB_PATH` | `./games.db` | SQLite database path |
| `VERSION_FILE` | `./VERSION` | Release-string file; primarily useful for isolated tests or custom deployments |
| `BACKUP_DIR` | `./backups` | Hourly ZIP backup destination |
| `STEAMGRIDDB_API_KEY` | blank | Optional server-wide cover API key; per-account keys can instead be configured in the UI |

Start the server with `npm start`. Development watch mode is available through `npm run dev`.

---

## Database

SQLite runs in WAL mode with foreign keys enabled.

### `users`

| Column | Notes |
|---|---|
| `id` | Integer primary key |
| `username` | Case-insensitively unique |
| `email` | Optional and case-insensitively unique |
| `password_hash` | 64-byte scrypt result encoded as hex |
| `salt` | Random 16-byte salt encoded as hex |
| `created_at`, `updated_at` | SQLite timestamps |

### `sessions`

| Column | Notes |
|---|---|
| `token` | Random 32-byte token encoded as 64 hex characters; primary key |
| `user_id` | Foreign key to `users`, cascading on account deletion |
| `expires_at` | Unix timestamp |
| `created_at` | SQLite timestamp |

Expired sessions are purged when the server starts. Valid sessions receive a rolling two-week expiry on authenticated use.

### `games`

| Column | Notes |
|---|---|
| `id` | Integer primary key |
| `user_id` | Owner account foreign key |
| `title`, `platform` | Required identification |
| `pegi` | Null or 3, 7, 12, 16, 18 |
| `ownership` | `owned`, `wanted`, or `unavailable` |
| `play_status` | `backlog`, `playing`, `completed`, `paused`, or `abandoned` |
| `media_format` | `physical`, `digital`, or `unknown` |
| `cartridge_number` | Optional integer |
| `publisher`, `release_year`, `notes` | Optional metadata |
| `favorite` | Boolean integer |
| `pegi_url` | Source search URL when PEGI-assisted |
| `pegi_descriptors`, `pegi_releases` | JSON arrays containing content labels and exact platform/date strings |
| `pegi_advice`, `pegi_outline` | PEGI consumer guidance and synopsis |
| `pegi_content_issues`, `pegi_other_issues` | Detailed rating rationale and additional concerns |
| `cover_url`, `cover_source`, `cover_match_title` | Selected artwork and match provenance |
| `created_at`, `updated_at` | SQLite timestamps |

Indexes cover owner, platform, ownership, PEGI, and case-insensitive title.

Username comparison is case-insensitive. Renaming an account later does not alter ownership because all collection queries use the immutable numeric user ID.

---

## Authentication and authorization

The authentication design is a reduced version of the gamebooks app's model.

### Passwords

- `crypto.scrypt` derives a 64-byte hash.
- Every password receives a random 16-byte salt.
- Verification uses `crypto.timingSafeEqual`.
- Passwords must contain 8–200 characters.

### Usernames

- Length: 3–32 characters.
- Allowed: Unicode letters and numbers, dot, dash, and underscore.
- SQLite enforces case-insensitive uniqueness.

### Sessions

- The server creates a random 256-bit bearer token.
- The browser stores it under `games_shelf_auth_token` in local storage.
- API requests send `Authorization: Bearer TOKEN`.
- Sessions expire after two inactive weeks and refresh on use.
- Password changes delete every session for the account.

### Login throttling

The process keeps recent failed login/registration attempts by client IP. Eight failures within 15 minutes produce HTTP 429. Successful authentication clears that IP's failure list. The throttle resets when the Node.js process restarts.

### Isolation invariant

Every collection query includes `user_id = authenticatedUserId`. Updates and deletes use both game ID and user ID. A game belonging to another account therefore behaves as nonexistent and returns HTTP 404.

The client never sends or selects `user_id`.

---

## HTTP API

All JSON responses use `Cache-Control: no-store`. Registration, login, public configuration, and the cover-only showcase route are public. Collection routes require a valid bearer token. Admin routes use a separate loopback-only boundary and do not accept normal account sessions as a substitute.

### Authentication

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/register` | Create an isolated account with password confirmation and optional email |
| POST | `/api/login` | Verify credentials and create session |
| GET | `/api/config` | Return the current public version string |
| GET | `/api/showcase/covers` | Return randomized cover URLs for the public authentication-page artwork |
| POST | `/api/logout` | Delete current session |
| GET | `/api/auth/me` | Resolve current user |
| PUT | `/api/account` | Change username and/or password after current-password verification |
| POST | `/api/account/avatar` | Upload a browser-cropped JPEG avatar, maximum 256 KB |
| DELETE | `/api/account/avatar` | Remove the current avatar and restore the initial fallback |

### Collection

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/games` | List current user's games with query filters |
| POST | `/api/games` | Create a game for current user |
| GET | `/api/games/:id` | Read owned game |
| PUT | `/api/games/:id` | Replace editable metadata on owned game |
| DELETE | `/api/games/:id` | Delete owned game |
| GET | `/api/stats` | Account-scoped aggregates |
| GET | `/api/meta` | Platforms, version, PEGI capability, current user |
| GET | `/api/events` | Authenticated SSE stream for job progress and changed games |
| GET | `/api/pegi/search?q=...` | Explicit server-side PEGI search |
| GET | `/api/pegi/status` | Missing-metadata count and current account job state |
| POST | `/api/pegi/bulk` | Start an account-scoped conservative metadata scan |
| GET | `/api/covers/status` | Provider configuration, missing count, and bulk progress |
| PUT | `/api/covers/config` | Validate and store the account's SteamGridDB key |
| DELETE | `/api/covers/config` | Remove the account-specific provider key |
| GET | `/api/covers/search?q=...` | Search portrait covers for manual selection |
| POST | `/api/covers/bulk` | Start an account-scoped exact-title scan for missing covers |

List query parameters are `q`, `platform`, `ownership`, `playStatus`, `pegi`, `favorite`, and `sort`.

Avatar filenames contain only the authenticated numeric user ID, timestamp, and random suffix. They are stored beneath `public/avatars/`; replacement and removal delete only the filename recorded for that account after a basename traversal check. Avatar binaries are excluded from Git.

### Local administrator API

The admin interface is available at `http://127.0.0.1:3005/admin/`. It is intentionally not an account role. A request is accepted only when the TCP peer is loopback. If nginx-style `X-Real-IP` or `X-Forwarded-For` headers are present, the first reported client must also be loopback. This prevents the public reverse proxy from exposing admin merely because it connects to Node locally.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | Runtime and whole-database counts |
| GET | `/api/admin/accounts` | Account, collection, cover, and session counts |
| DELETE | `/api/admin/accounts/:id/sessions` | Revoke every active session for one account |
| DELETE | `/api/admin/accounts/:id` | Delete an account, its avatar, and cascaded games, sessions, and integration settings |
| GET | `/api/admin/games?q=...` | Search up to 250 games across accounts |
| DELETE | `/api/admin/games/:id` | Permanently remove one explicitly selected game |
| GET, PUT | `/api/admin/version` | Read or atomically replace the release string |
| POST | `/api/admin/database/checkpoint` | Truncate-checkpoint the SQLite WAL |
| POST | `/api/admin/database/optimize` | Run SQLite planner optimization |
| POST | `/api/admin/database/vacuum` | Rebuild the SQLite database file |
| GET, POST | `/api/admin/backups` | List or trigger the current hour's compressed SQLite backup |
| DELETE | `/api/admin/backups/:name` | Delete one validated backup filename |

Admin static files and API responses use restrictive security headers. Backup names are server-generated and deletion accepts only that exact filename shape. Backups are stored in `backups/`, which is excluded from Git.

`server/backup.js` creates one consistent SQLite snapshot at process startup and then exactly on each hour. The snapshot is compressed with the host `zip` command, published by atomic rename, and its temporary raw SQLite file is always removed. A second attempt in the same hour is a no-op. Archives older than 15 days are pruned during each run.

### Version file

`VERSION` contains one nonempty, arbitrary single-line string of at most 80 characters. It is not limited to semantic versions. The admin writes a temporary sibling and atomically renames it over the target; the main header fetches the value through `/api/config` on page load. Changing the version does not require restarting Node, though already-open app tabs refresh it on their next reload.

---

## PEGI integration

PEGI exposes a public catalogue search but no documented public developer API. `server/pegi.js` therefore performs opt-in HTTPS requests after the user selects either **Look up title** or the account-level **Fill PEGI details** batch action.

The parser extracts displayed title, publisher, rating, descriptors, exact platform releases, year, consumer advice, brief outline, content-specific issues, and other issues. A lookup reads PEGI's reported result count and requests subsequent zero-based result pages, up to a hard limit of 10 pages. Later pages are fetched concurrently, individual later-page failures do not discard successful results, and duplicate records are removed using title, publisher, rating, and release data. Descriptor and release arrays are stored as validated JSON; long PEGI text is length-limited before persistence. Merged results are cached in process memory for one hour per normalized query. Each request has a 12-second timeout and a 4 MB response limit.

The client renders descriptors as compact card badges, with purchase and paid-random-item labels receiving a distinct warning treatment. The complete record uses a themed `<details>` disclosure inside the game form so lengthy guidance does not increase every card's footprint.

The **Fill PEGI details** action in Account Settings starts an in-memory, account-scoped job. It considers non-Evercade games that have neither a saved PEGI source record nor extended PEGI metadata. Before each external request it reloads the game and skips it if it was deleted or enriched since the job began. Every remaining title is searched across the same paginated catalogue, then accepted only through normalized exact-title matching; an unambiguous exact platform release is preferred. Ambiguous results remain unchanged for manual review. The enrichment update touches only PEGI fields, publisher, and release year, preserving ownership, play state, notes, format, favourite state, platform, title, and cover. Requests are paced by 500 ms, and five consecutive lookup failures stop the job instead of repeatedly hitting a failing provider. Completed metadata remains in SQLite; active job state itself is intentionally process-local.

This integration is deliberately nonessential. Parsing or network failure returns HTTP 502 with a PEGI fallback URL; manual game creation remains available.

---

## Cover-art integration

SteamGridDB was selected because its API is dedicated to game artwork and exposes portrait grid images suitable for box-art cards. It requires a personal bearer API key. Account keys are stored in `user_integrations`; an optional `STEAMGRIDDB_API_KEY` environment value acts as a server-wide fallback. Keys are never returned to the browser after configuration.

Manual lookup searches up to four title candidates and returns portrait static grids. Results are cached in memory for 30 minutes. Provider calls are serialized below four requests per second, have a 15-second timeout, and retry HTTP 429 once.

Bulk lookup considers only games without a cover and reloads each queued record before contacting SteamGridDB. Games deleted or manually covered after the job began are skipped rather than queried or overwritten; the database update also requires the cover to remain empty, closing the race while a provider request is in flight. Title comparison is Unicode-normalized, case-insensitive, punctuation-insensitive, and conservative: auto-selection requires exactly one exact normalized title candidate. The highest-scoring portrait grid is stored; ambiguous titles remain unmatched. Five consecutive provider errors trip a circuit breaker and mark the job failed instead of hammering the remaining catalogue. Job state is in memory and therefore does not survive a server restart, while already matched covers remain in SQLite.

Cards use a centred, full-card image with a dark left-to-right gradient, mirroring Gamebooks' cover-background treatment. Images use native lazy loading so only the visible portion of a large collection is requested.

---

## Browser application

`public/app.js` is a zero-dependency ES-module browser application. Its state contains the authenticated user, games, account statistics, platform list, result render limit, selected view, and loading state. Static platform taxonomy and release-text matching live separately in `public/js/platforms.js`; authenticated event streaming lives in `public/js/events.js`.

Because native `EventSource` cannot attach the existing bearer token header, the event client reads an SSE response through `fetch()` and a `ReadableStream`. It reconnects after interruption and stops immediately on local logout. The server disables nginx buffering, revalidates the bearer session on each 20-second heartbeat, and rotates long-lived connections after ten minutes. Logout, password changes, admin revocation, expiry, or account deletion therefore close an existing stream as well as blocking its reconnect. Every account has a bounded 2,048-event replay window; the client returns its last event ID after a disconnect so card and progress changes from the gap are replayed in order. If an unusually long interruption exceeds that window, a reset event triggers a correctness resync.

The public nginx location should explicitly support the long-lived stream:

```nginx
location / {
    proxy_pass http://127.0.0.1:3005;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

An isolated `net::ERR_INCOMPLETE_CHUNKED_ENCODING` entry means the proxy or upstream ended an open event stream without a normal HTTP terminator. The browser client catches that interruption and reconnects after 2.5 seconds with its last event ID. Repeated warnings indicate a proxy timeout or unstable upstream process; they do not require reloading the library grid.

Cover and PEGI workers publish account-targeted progress plus `game-updated` records. The browser normally reconciles only that record against the current filters and sort order, reusing every unaffected card node; it does not reload the entire game list or move the viewport. Updates received while a filter/search request is in flight are keyed by game ID and flushed afterward. Collection and summary requests also carry a client-side sequence and account check, so a slower or previous-account HTTP response cannot overwrite newer state. Likewise, a late unauthorized response can clear only the same bearer token it actually used, never a newer login token. Logout clears the in-memory collection and account-specific header artwork before another account can enter.

### Startup

1. Read the bearer token from local storage.
2. Call `/api/auth/me` when a token exists.
3. Show authentication on absence/failure, or mount the library on success.
4. Load games, statistics, and metadata in parallel.

An HTTP 401 on a protected request removes the token and returns to login.

### Rendering

Game cards are generated from escaped values. Filters are sent to the server rather than applied to a global cross-user data set. Search uses a 220 ms debounce. Rendering is batched in groups of 120.

### Dialog pointer safety

Backdrop dismissal tracks `pointerdown` and `pointerup`. It closes only when both events target the dialog backdrop. This prevents a text-selection drag that begins inside the form and ends outside from dismissing the dialog.

Destructive actions use themed HTML dialogs in both the public application and localhost admin. Native browser `alert`, `confirm`, and `prompt` APIs are not used.

---

## Static serving

`server.js` resolves requested paths beneath `public/`, rejects traversal outside that directory, assigns MIME types, and serves static content with `Cache-Control: no-cache`. API content uses `no-store`.

Admin assets are not beneath the public directory. `server/admin.js` serves an explicit file allowlist only after the request passes the loopback check.

Generated documentation is available at:

- `/docs/`
- `/docs/user-guide.html`
- `/docs/technical.html`

### Search and social metadata

The public landing page uses `https://gamekat.net/` as its canonical URL. It includes a focused title and description, Open Graph and Twitter large-image metadata, and `WebApplication` JSON-LD. The domain inspires the **Game Kat·a·log** wordmark, whose separators are true middle dots. The social image is authored as `public/social-preview.svg` and rendered to the crawler-compatible `public/social-preview.png` at 1200×630.

`robots.txt` permits the landing page and public guide while excluding `/api/`, `/admin/`, and account avatars. `sitemap.xml` lists only the canonical landing page and user guide. The manifest includes 192×192 and 512×512 PNG icons in addition to the scalable favicon.

The authentication landing markup contains six visible, descriptive feature cards. This gives non-JavaScript crawlers useful product content without exposing any private collection data.

---

## Documentation workflow

Markdown files in `docs/` are the source of truth.

```bash
npm run docs:build   # regenerate public/docs/*.html
npm run docs:check   # fail if generated HTML is stale
```

`npm test` runs both the Node test suite and the documentation consistency check.

---

## Testing

| Test file | Contract |
|---|---|
| `test/auth.test.js` | Account isolation, sessions, password invalidation |
| `test/pegi.test.js` | PEGI HTML parsing |
| `test/pegi-bulk.test.js` | Exact-title/platform selection, late-change skipping, and account job events |
| `test/events.test.js` | SSE framing, account-isolated replay, and revoked-session closure |
| `test/covers.test.js` | Conservative cover-title normalization |
| `test/seo.test.js` | Canonical/social metadata, crawler policy, and asset dimensions |
| `test/admin.test.js` | Loopback/proxy boundary and whole-database admin summaries |
| `test/backup.test.js` | Hourly ZIP creation, deduplication, cleanup, and scheduler timing |
| `test/version.test.js` | Version-file persistence and input validation |

Run all checks with `npm test`.

The authentication test uses a disposable SQLite database under `/tmp` and removes its main, WAL, and shared-memory files afterward.

---

## Operations and backups

Stop with `Ctrl+C` or send SIGTERM. The server closes SQLite before exiting.

The server automatically creates compressed, consistent live backups at startup and hourly, retaining 15 days. The admin **Tools** tab lists, triggers, and removes those archives and can checkpoint the WAL. For a simple offline backup:

1. Stop the server.
2. Copy `games.db` to a dated backup location.
3. Restart the server.

When backing up a live WAL database, use SQLite's backup API or include a proper checkpoint procedure. Copying only `games.db` during an active write can omit transactions still present in `games.db-wal`.

The database is excluded from Git. Source code, generated documentation, and tests can be versioned normally.

---

## Known boundaries

- No email recovery flow is configured; account passwords must be retained.
- The administrator panel is deliberately available only through a direct loopback request; remote administration requires an explicit, separately secured transport such as an SSH tunnel.
- Login throttling is in-memory rather than persisted.
- PEGI parsing depends on public page structure and can require maintenance; running batch jobs are not resumed after a process restart.
- Cover lookup requires a SteamGridDB API key and its external API availability; bulk jobs resume only when restarted manually after a process restart.
- The browser token is stored in local storage, matching the gamebooks app; only serve the app over trusted networks or HTTPS.
- The public client retains one orchestration entry point, with stable data catalogues split into focused modules. The admin client is divided by panel plus shared utilities.
