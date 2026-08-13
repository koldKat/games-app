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
    preferences.js          validated per-account view, search, filter and sort state
    pegi.js                 opt-in PEGI HTTP lookup and result parser
    pegi-bulk.js            account-scoped conservative PEGI enrichment jobs
    hltb.js                 native Node HLTB lookup, endpoint discovery, parsing
    hltb-bulk.js            account-scoped conservative timing enrichment jobs
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
    js/events.js            cookie-authenticated SSE stream parser and reconnect
    js/game-sorting.js      client ordering for live incremental card updates
    js/platforms.js         grouped platform catalogue and release-name matching
    js/title-autocomplete.js local/provider suggestions and duplicate warnings
    js/hltb-ui.js           manual HLTB selection, card estimates, form state
    css/
      foundation.css       reset, structural layout, and baseline responsive rules
      theme.css            dense dark operator theme and primary components
      library.css          legible typography, header art, cards, and game tools
      landing.css          authentication landing page and promotional modules
      features.css         later feature-specific components and viewport rules
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
    hltb.test.js            HLTB parsing, normalization, endpoint discovery
    hltb-bulk.test.js       exact-title matching, skips, and circuit breaker
    hltb-ui.test.js         null-safe new/edit form metadata state
    preferences.test.js     persistence, account isolation, validation and cascading
    sorting.test.js         client sort behavior, null placement, accent parity
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
  -> authenticated /api/* + HttpOnly cookie --> auth.js -> user identity
                                                    |
                                                    +-> db.js (user-scoped query)
                                                    +-> pegi.js + pegi-bulk.js (lookup/jobs)
                                                    +-> hltb.js + hltb-bulk.js (lookup/jobs)
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

An inline pre-render marker adds the `resuming-session` document class before the body is painted. Because the HttpOnly cookie is deliberately invisible to JavaScript, the marker cannot inspect it. The class hides the public authentication surface and exposes a non-sensitive session-resume screen only while `/api/auth/me` asks the server to validate the cookie. Successful validation reveals the application immediately in its loading state; collection, statistics, metadata, and decorative artwork continue asynchronously. Failed authentication reveals the login screen. This prevents logged-out UI from flashing for an authenticated account without putting session state into browser storage.

### `user_preferences`

| Column | Notes |
|---|---|
| `user_id` | Primary key and cascading foreign key to the owning account |
| `library_view` | `grid` or `list` |
| `search_query` | Current library search text |
| `platform_filter`, `ownership_filter`, `pegi_filter` | Current catalogue filters |
| `status_filter`, `missing_filter`, `favorite_filter` | Current workflow and data-gap filters |
| `sort_order` | One of the server and client supported sort identifiers |
| `updated_at` | SQLite timestamp of the latest persisted preference change |

Missing rows produce safe defaults. `server/preferences.js` validates every enum, limits free-text fields, and upserts the complete preference snapshot. Rows cascade with account deletion. The browser never uses `localStorage` or `sessionStorage`; the account record is the single persistent source of workspace settings across devices.

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
| `hltb_id`, `hltb_title`, `hltb_url` | Selected HowLongToBeat record and source provenance |
| `hltb_main_story`, `hltb_main_extra` | Main Story and Main + Sides hour estimates |
| `hltb_completionist`, `hltb_all_styles` | Completionist and All Styles hour estimates |
| `hltb_updated_at` | Timestamp of the selected HLTB metadata |
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

- The server creates a random 256-bit session token.
- Registration and login return it only in a `games_session` cookie with `HttpOnly`, `SameSite=Strict`, `Path=/`, and a matching two-week maximum age.
- HTTPS requests also receive the `Secure` attribute, detected directly or through nginx's `X-Forwarded-Proto` header.
- Browser requests include the same-origin cookie automatically; application JavaScript cannot read the token and uses no web storage.
- Bearer-token parsing remains supported for programmatic API compatibility, but the web client does not receive or use a bearer token.
- Sessions expire after two inactive weeks and refresh on use.
- Password changes delete every session for the account.

### Login throttling

The process keeps recent failed login/registration attempts by client IP. Eight failures within 15 minutes produce HTTP 429. Successful authentication clears that IP's failure list. The throttle resets when the Node.js process restarts.

### Isolation invariant

Every collection query includes `user_id = authenticatedUserId`. Updates and deletes use both game ID and user ID. A game belonging to another account therefore behaves as nonexistent and returns HTTP 404.

The client never sends or selects `user_id`.

---

## HTTP API

All JSON responses use `Cache-Control: no-store`. Registration, login, public configuration, and the cover-only showcase route are public. Collection routes require a valid session cookie; bearer authentication remains a compatibility path for non-browser clients. Admin routes use a separate loopback-only boundary and do not accept normal account sessions as a substitute.

### Authentication

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/register` | Create an isolated account with password confirmation and optional email |
| POST | `/api/login` | Verify credentials and create session |
| GET | `/api/config` | Return the current public version string |
| GET | `/api/showcase/covers` | Return randomized cover URLs for the public authentication-page artwork |
| POST | `/api/logout` | Delete current session |
| GET | `/api/auth/me` | Resolve current user |
| GET, PUT | `/api/preferences` | Read or replace the current account's validated workspace settings |
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
| GET | `/api/hltb/search?q=...` | Search HLTB for manual timing selection |
| GET | `/api/hltb/status` | Missing-timing count and current account job state |
| POST | `/api/hltb/bulk` | Start an account-scoped exact-title timing scan |
| GET | `/api/covers/status` | Provider configuration, missing count, and bulk progress |
| PUT | `/api/covers/config` | Validate and store the account's SteamGridDB key |
| DELETE | `/api/covers/config` | Remove the account-specific provider key |
| GET | `/api/covers/search?q=...` | Search portrait covers for manual selection |
| GET | `/api/titles/autocomplete?q=...` | Return account-local matches and up to ten SteamGridDB suggestions; `local=1` skips the provider and `exact=1&platform=...` performs the save-time duplicate check |
| POST | `/api/covers/bulk` | Start an account-scoped exact-title scan for missing covers |

List query parameters are `q`, `platform`, `ownership`, `playStatus`, `pegi`, `missing`, `favorite`, and `sort`. `missing` accepts `pegi`, `cover`, `hltb`, `either`, or `both`; `either` means any of the three data sets is absent and `both` retains its legacy value while now meaning all three are absent. The PEGI condition follows batch eligibility and excludes Evercade, the cover condition requires an empty cover URL, and the HLTB condition requires no selected HLTB record. Legacy `missingPegi=1` and `missingCover=1` requests remain accepted. Data-gap selection combines with every other filter.

Sort values cover ascending/descending title, platform, publisher, release year, PEGI, collection and play-state priority, favourites, creation/update timestamps, cartridge number, and ascending/descending values for all four HLTB estimates. SQL ordering always puts null numeric metadata last. Text ordering uses the same accent-insensitive normalization as collection search and includes numeric ID tie-breakers for deterministic placement. The focused `public/js/game-sorting.js` module mirrors those contracts for cards patched into the current result set through SSE, preventing live enrichment from temporarily using a different order than the server response.

Avatar filenames contain only the authenticated numeric user ID, timestamp, and random suffix. They are stored beneath `public/avatars/`; replacement and removal delete only the filename recorded for that account after a basename traversal check. Avatar binaries are excluded from Git.

### Local administrator API

The admin interface is available at `http://127.0.0.1:3005/admin/`. It is intentionally not an account role. A request is accepted only when the TCP peer is loopback. If nginx-style `X-Real-IP` or `X-Forwarded-For` headers are present, the first reported client must also be loopback. This prevents the public reverse proxy from exposing admin merely because it connects to Node locally.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | Runtime and whole-database counts |
| GET | `/api/admin/accounts` | Account, collection, cover, and session counts |
| DELETE | `/api/admin/accounts/:id/sessions` | Revoke every active session for one account |
| DELETE | `/api/admin/accounts/:id` | Delete an account, its avatar, and cascaded games, sessions, integration settings, and preferences |
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

## HowLongToBeat integration

HowLongToBeat does not provide a documented public developer API. `server/hltb.js` uses Node's built-in `fetch` implementation to discover the site's current private search route from its browser bundle, request the rotating search credentials, and perform opt-in searches. The provider is native JavaScript: it does not spawn Python, invoke the old Downloads script, or add a Python dependency.

Responses are reduced to a numeric record ID, title, source URL, similarity score, and four hour values: Main Story, Main + Sides, Completionist, and All Styles. Search results are cached for 30 minutes, provider calls are serialized, and each request has a 20-second timeout. Authentication is refreshed once after an authorization failure. The private endpoint can change without notice, so this remains optional assistance and lookup errors never block ordinary game editing.

The **Fill HLTB times** account action runs an in-memory, account-scoped job over games with no selected HLTB record. Each queued game is reloaded before lookup, and the database update also requires its HLTB ID to remain null. Automatic selection requires exactly one punctuation-, case-, trademark-, whitespace-, and accent-normalized exact title. Ambiguous editions and fuzzy matches remain untouched for manual selection. Requests are spaced by 1.5 seconds; five consecutive provider failures pause the job. Successful records are persisted immediately and published as targeted `game-updated` SSE events.

The game form owns HLTB state in the focused `public/js/hltb-ui.js` module. Lookup requests carry a local sequence guard: changing the title or reopening the dialog invalidates an older response so it cannot populate a different game form. Cards show a compact four-column estimate strip, while the form shows the complete labels and source link. Grid cards use a column layout with consistent two-line title and two-row badge areas plus a bottom-anchored action row. Games without HLTB data retain a muted four-column timing frame with dashes, so optional metadata does not change the card or grid-row structure. Narrow single-column mobile cards release the title and badge height limits to keep their full content visible. Compact list view retains the same four-value strip in a dedicated desktop column; narrow list rows wrap it beneath the title rather than removing information. The **No HLTB info** data-gap filter is available independently and participates in the combined any/all missing-data modes.

---

## Cover-art integration

SteamGridDB was selected because its API is dedicated to game artwork and exposes portrait grid images suitable for box-art cards. It requires a personal bearer API key. Account keys are stored in `user_integrations`; an optional `STEAMGRIDDB_API_KEY` environment value acts as a server-wide fallback. Keys are never returned to the browser after configuration.

The add/edit title field searches the authenticated account's own titles and reuses SteamGridDB's game autocomplete after three characters. Browser requests are delayed by 100 ms, stale requests are aborted, remote results are capped at ten, and provider results are cached server-side for 30 minutes. Existing entries appear first with platform and ownership context. Local collection search, title suggestions, and duplicate identity checks normalize Unicode combining marks before comparison, making accented and unaccented spellings equivalent. SQL `LIKE` wildcards supplied by the user are escaped.

An exact case-insensitive, whitespace-normalized title-and-platform pair is treated as a possible duplicate. Save-time validation uses a dedicated account-scoped exact lookup rather than the autocomplete result limit, so spacing variants and collections with many editions cannot bypass the warning. The warning can open the existing record. Creating another entry requires an explicit themed confirmation, but remains permitted for multiple copies or editions; another platform is never treated as the same record. The authenticated autocomplete route deliberately returns local results plus an empty remote list when no key is configured or SteamGridDB fails. The interface shows no provider warning, toast, empty state, or loading indicator: remote autocomplete is optional assistance and manual entry always remains available.

Manual lookup searches up to four title candidates and returns portrait static grids. Results are cached in memory for 30 minutes. Provider calls are serialized below four requests per second, have a 15-second timeout, and retry HTTP 429 once.

Bulk lookup considers only games without a cover and reloads each queued record before contacting SteamGridDB. Games deleted or manually covered after the job began are skipped rather than queried or overwritten; the database update also requires the cover to remain empty, closing the race while a provider request is in flight. Title comparison is Unicode-normalized, case-insensitive, punctuation-insensitive, and conservative: auto-selection requires exactly one exact normalized title candidate. The highest-scoring portrait grid is stored; ambiguous titles remain unmatched. Five consecutive provider errors trip a circuit breaker and mark the job failed instead of hammering the remaining catalogue. Job state is in memory and therefore does not survive a server restart, while already matched covers remain in SQLite.

Cards use a centred, full-card image with a dark left-to-right gradient, mirroring Gamebooks' cover-background treatment. Images use native lazy loading so only the visible portion of a large collection is requested.

On authenticated entry, the browser starts the core library requests and reveals the workspace immediately, without awaiting their responses. After the returned games render, it shuffles their unique cover URLs and fills the five header covers first, followed by the fixed 32-slot decorative field. HTML declares each cover group once with `data-cover-slots`; the browser generates its non-semantic positioning nodes, element type, base class, and numbered modifier classes. The single loose promo cover uses the same declarative mounting pass through `data-cover-decoration`. Repeated empty cover tags are therefore absent from maintained markup. The controller mark, separator rules, status dots, progress fill, and modal spacing use CSS or meaningful elements rather than empty helper tags. Empty live regions remain only where runtime content is intentionally inserted. Decorative images load in a genuine one-at-a-time queue and appear progressively, so remote artwork never competes with the application shell or floods the browser connection pool. Each image may take up to six seconds; failed candidates are skipped in favour of the next shuffled URL. If fewer unique images succeed than there are slots, successful covers repeat instead of leaving permanent holes. Stale work is discarded if the account changes while images are loading. The field reuses the login artwork geometry and opacity, has no pointer interaction, and is reduced to four slots on narrow screens. It does not make another provider request or expose another account's cover selection.

---

## Browser application

`public/app.js` is a zero-dependency ES-module browser orchestration entry point. Its state contains the authenticated user, games, account statistics, platform list, result render limit, selected view, and loading state. Static platform taxonomy and release-text matching live in `public/js/platforms.js`; authenticated event streaming lives in `public/js/events.js`; incremental card ordering lives in `public/js/game-sorting.js`; title suggestions live in `public/js/title-autocomplete.js`; and HLTB form and card presentation lives in `public/js/hltb-ui.js`.

Public CSS is split by responsibility and loaded in deliberate cascade order: `foundation.css`, `theme.css`, `library.css`, `landing.css`, then `features.css`. Later modules refine shared primitives established earlier, so the order in `public/index.html` must be preserved. Every module is source-formatted rather than minified; production compression, if desired, belongs at the HTTP layer rather than in the maintained source.

The event client reads SSE through `fetch()` and a `ReadableStream` so reconnects can send `Last-Event-ID` for replay while using the same-origin session cookie. It reconnects after interruption and stops immediately on local logout. The server disables nginx buffering, revalidates the session on each 20-second heartbeat, and rotates long-lived connections after ten minutes. Logout, password changes, admin revocation, expiry, or account deletion therefore close an existing stream as well as blocking its reconnect. Every account has a bounded 2,048-event replay window; the client returns its last event ID after a disconnect so card and progress changes from the gap are replayed in order. If an unusually long interruption exceeds that window, a reset event triggers a correctness resync.

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

Cover, PEGI, and HLTB workers publish account-targeted progress plus `game-updated` records. The browser normally reconciles only that record against the current filters and sort order, reusing every unaffected card node; it does not reload the entire game list or move the viewport. Updates received while a filter/search request is in flight are keyed by game ID and flushed afterward. Collection and summary requests also carry a client-side sequence and account check, so a slower or previous-account HTTP response cannot overwrite newer state. Likewise, a late unauthorized response can end only the same session generation that issued it, never a newer login. Logout clears the in-memory collection and account-specific header artwork before another account can enter.

### Startup

1. Show the neutral session-resume surface before first paint.
2. Call `/api/auth/me`; the browser supplies any HttpOnly session cookie automatically.
3. Show authentication on absence/failure, or apply the returned account preferences and mount the library on success.
4. Load games, statistics, and metadata in parallel using those preferences.

An HTTP 401 on a protected request advances the client session generation and returns to login. No browser-stored token needs to be removed.

### Rendering

Game cards are generated from escaped values. Filters are sent to the server rather than applied to a global cross-user data set. Search uses a 220 ms query debounce. View, search, filter, and sort changes are separately debounced into `/api/preferences`, which stores the validated snapshot in SQLite. Dirty preference state retries after a transient failure and is flushed with a keepalive request when the page exits or before logout. Rendering is batched in groups of 120.

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

The public landing page uses `https://gamekat.net/` as its canonical URL. Its focused title and description, Open Graph and Twitter large-image fields, install manifest, and `WebApplication` JSON-LD consistently describe multi-platform collection tracking, wishlists and backlogs, deep filtering, PEGI/HLTB assistance, cover art, and cross-device account preferences. Structured data also links the public guide and GitHub repository. The domain inspires the **Game Kat·a·log** wordmark, whose separators are true middle dots. The social image is authored as `public/social-preview.svg` and rendered to the crawler-compatible `public/social-preview.png` at 1200×630.

`robots.txt` permits the landing page and public guide while excluding `/api/`, `/admin/`, and account avatars. `sitemap.xml` lists only the canonical landing page and user guide. The manifest includes 192×192 and 512×512 PNG icons in addition to the scalable favicon.

The authentication landing markup contains six visible, descriptive feature cards covering platform breadth, querying, PEGI/HLTB metadata, cover workflows, cross-device preference persistence, and live background enrichment. This gives non-JavaScript crawlers useful product content without exposing any private collection data. Backups and local administration remain documented operational features rather than headline public marketing claims.

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
| `test/hltb.test.js` | HLTB response parsing, title similarity, and dynamic route discovery |
| `test/hltb-bulk.test.js` | Exact-title selection, late-change skipping, job events, and failure circuit breaker |
| `test/hltb-ui.test.js` | Null-safe new-game and saved-game browser metadata normalization |
| `test/preferences.test.js` | Per-account persistence, validation, isolation, and deletion cascade |
| `test/sorting.test.js` | Client HLTB null-last ordering and deterministic accent-insensitive title sorting |
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
- HLTB lookup depends on an undocumented private search route that can change; it is discovered dynamically, but may still require maintenance. Running batch jobs are not resumed after a process restart.
- Cover lookup requires a SteamGridDB API key and its external API availability; bulk jobs resume only when restarted manually after a process restart.
- Browser authentication uses an HttpOnly, SameSite cookie and all persistent workspace settings live in SQLite. Production access should still use HTTPS so the cookie also receives the `Secure` attribute.
- The public client retains one orchestration entry point, with stable data catalogues split into focused modules. The admin client is divided by panel plus shared utilities.
