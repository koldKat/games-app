# Game Kat·a·log - Technical Reference

---

## Architecture

Game Kat·a·log follows the same lightweight family architecture as the other local apps: one Node.js HTTP process, SQLite persistence, no browser framework, and no build step for application code.

```text
games-app/
  server.js                 HTTP entrypoint, static serving, route dispatch
  server/
    constants.js            shared catalogue domains, provider identity and batch policy
    admin.js                loopback gate, admin API, backups and maintenance
    auth.js                 scrypt passwords, sessions, account changes, throttling
    backup.js               hourly compressed SQLite snapshots and retention
    activity.js             public-safe Signal ledger plus announcement draft/publish/pin projection
    patch-data.js           private Patch-thread storage and read/unread lifecycle
    patch-routes.js         authenticated Ping and public/private Patch HTTP boundary
    forum-data.js           forum categories, threads, posts, ownership, and moderation queries
    forum-pages.js          server-rendered public forum views using the shared app shell
    forum-routes.js         forum page/API dispatcher and public contribution boundary
    db.js                   schema, migrations, validation, scoped game queries
    preferences.js          validated per-account view, search, filter and sort state
    pegi.js                 opt-in PEGI HTTP lookup and result parser
    pegi-bulk.js            account-scoped conservative PEGI enrichment jobs
    hltb.js                 native Node HLTB lookup, session setup, parsing
    hltb-bulk.js            account-scoped conservative timing enrichment jobs
    events.js               authenticated server-sent event fan-out
    covers.js               SteamGridDB client, throttling, matching, artwork selection
    cover-storage.js        validated local image storage and cover migration
    image-policy.js         256 KiB JPEG processing for covers and avatars
    showcase-covers.js      atomic public decorative-cover catalogue writer
    thegamesdb.js           TheGamesDB boxart search, CDN URL parsing and credential checks
    steam-store.js          Steam Store description lookup
    description-bulk.js     Steam-first, quota-safe missing-description scan
    cover-provider-utils.js shared title/platform normalization for artwork providers
    cover-provider-bulk.js  reusable account-scoped external-cover batch engine
    catalogue-policy.js     conservative publication eligibility and identity policy
    catalogue-store.js      shared-index schema, queries, links and moderation state
    catalogue-cover-store.js independent durable cover copies for shared/private rows
    catalogue-service.js    fail-closed promotion and add-to-library orchestration
    catalogue-runtime.js    single wired catalogue service instance
    catalogue-pages.js      server-rendered browse/detail/Signal pages and dynamic sitemap
    catalogue-routes.js     isolated public page and catalogue API dispatcher
    version.js              validated atomic reads/writes of the VERSION file
  admin/
    index.html              localhost control-panel markup
    style.css               dense terminal-style admin theme
    announcements.css       isolated Signal announcement panel styling
    patch.css               isolated private Patch queue styling
    js/                     dashboard, accounts, announcements, private rows, public review, tools and shared ES modules
  scripts/
    generate-docs.js        Markdown-to-HTML documentation generator/checker
    normalize-covers.js     idempotent existing-cover normalization command
  public/
    index.html              application and authentication markup
    app.js                  browser state, rendering, auth, forms, API calls
    js/events.js            cookie-authenticated SSE stream parser and reconnect
    js/game-sorting.js      client ordering for live incremental card updates
    js/platforms.js         grouped platform catalogue and release-name matching
    js/title-autocomplete.js local/provider suggestions and duplicate warnings
    js/announcement-format.js safe shared rich-text formatter for Signal notices
    js/forum-page.js        forum composer, owner actions, themed confirmation, and SSE refresh binding
    js/patch.js             admin Patch queue rendering and reply controls
    js/patch-ui.js          reusable Patch composer and Ping conversation UI
    js/patch-page.js        public server-rendered page adapter for Patch and Ping
    js/catalogue-public.js  release-detail dialog and one-click private-library add bindings
    js/catalogue-navigation.js persistent authenticated-shell catalogue navigation
    js/hltb-ui.js           manual HLTB selection, card estimates, form state
    js/cover-provider-settings.js TheGamesDB connection and scan controls
    js/cover-result-images.js failed-thumbnail fallback to provider originals
    js/artwork-url.js       accepted remote and durable-local artwork URL policy
    js/ui-policy.js         browser pagination, lookup limits and interaction timing
    css/
      foundation.css       reset, structural layout, and baseline responsive rules
      theme.css            dense dark operator theme and primary components
      library.css          legible typography, header art, cards, and game tools
      landing.css          authentication landing page and promotional modules
      features.css         later feature-specific components and viewport rules
      patch.css            private Patch and Ping dialogs, unread alert state
      catalogue.css        standalone public catalogue and detail-page theme
      forum.css            public forum surfaces and responsive composer theme
    manifest.webmanifest    installable-app metadata
    favicon.svg             application icon
    icon-192.png            installable-app icon
    icon-512.png            high-resolution installable-app icon
    social-preview.*        source SVG and rendered 1200x630 social card
    robots.txt              crawler policy for public and private surfaces
    sitemap.xml             static public fallback; runtime serves the release-aware sitemap
    docs/                   generated standalone HTML documentation
  docs/
    user-guide.md           user documentation source
    technical.md            this file
  test/
    auth.test.js            sessions, password changes, isolation
    backup.test.js          hourly ZIP creation and scheduling
    pegi.test.js            PEGI result parsing
    pegi-bulk.test.js       exact-title matching, skips, and job notifications
    cover-providers.test.js provider parsing, image URLs and platform aliases
    cover-provider-bulk.test.js reusable cover-job updates and race protection
    cover-storage.test.js   provider allow-list, image validation and local migration
    image-policy.test.js    cover/avatar dimensions, format and byte ceilings
    cover-result-images.test.js browser thumbnail fallback contract
    artwork-url.test.js    durable local artwork across landing, header and background
    hltb.test.js            HLTB parsing, normalization, current search route
    hltb-bulk.test.js       exact-title matching, skips, and circuit breaker
    hltb-ui.test.js         null-safe new/edit form metadata state
    preferences.test.js     persistence, account isolation, validation and cascading
    platforms.test.js       PC storefront taxonomy and PEGI release mapping
    sorting.test.js         client sort behavior, null placement, accent parity
    events.test.js          SSE framing, replay isolation, and session revocation
    covers.test.js          conservative cover-title normalization
    seo.test.js             canonical metadata, crawler policy, image dimensions
    admin.test.js           localhost gate and cross-account admin summaries
    catalogue-*.test.js     promotion policy, persistence, privacy, pages and workflow
    version.test.js         arbitrary release-string persistence and validation
    constants.test.js       shared domain, provider identity and browser-policy contracts
  VERSION                   release string displayed in the application header
  games.db                  runtime SQLite database
```

Values shared by multiple server features live in `server/constants.js`; provider-specific limits stay beside their provider implementation. Browser pagination, lookup thresholds, upload limits, and interaction timings live in `public/js/ui-policy.js`. This keeps operational policy discoverable without creating a single catch-all configuration module or coupling browser modules to CommonJS server code.

### Request flow

```text
Browser
  -> static file request ----------------------> server.js -> public/
  -> GET /katalog or /game/:slug -------------> catalogue-routes.js -> catalogue-pages.js
  -> public catalogue JSON/add request --------> catalogue-service.js -> catalogue-store.js
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

### Collector progression

Progression is split into three focused server modules. `progression-policy.js` is the dependency-free definition of XP event defaults, the exact Gamebooks triangular level curve (`1000 × level × (level + 1) / 2`), and collector titles. `progression-store.js` owns the SQLite tables, configurable amounts, and atomic idempotency key `(user_id, event, ref)`. `progression-service.js` maps a complete game record to eligible one-time awards and evaluates account milestones.

`user_progression` stores the account XP total and one-time backfill marker. `progression_events` stores every granted award with its stable reference; uniqueness guarantees that toggling a field cannot farm XP. `progression_config` is localhost-admin-editable and changes future awards only. Regular authenticated boot reads the already-stored progression summary and never triggers a historical backfill. Game create/update, enrichment SSE paths, catalogue additions, and a first avatar set all feed the same service. It emits a `progression-updated` SSE event only when XP changes. `public/js/progression-ui.js` hydrates its animation baseline from the authenticated summary before connecting SSE, so either the live event or the save response animates from the XP already on screen and the duplicate is ignored. Signal independently derives any historical level crossings from that immutable XP ledger, preserving the original award timestamp and never duplicating an already recorded level.

The authenticated SPA and crawlable server-rendered pages share the same header progress component. Its dynamic fill uses a fully themed semantic `progress` value rather than an inline CSS declaration, because the public page Content Security Policy intentionally rejects inline styles. Refreshing Signal, Forum, or the public Kat·a·log therefore preserves the same fill shown in My Kat·a·log without introducing an SVG layout surface into the header.

Patch and Ping use `patch_threads` and `patch_messages`. A Patch can be submitted anonymously or under the authenticated account; ordinary accounts see only their own Ping threads while the protected operator account maps the same view to every Patch using the distinct admin unread state. Rows maintain separate sender and admin unread state plus independent soft-delete flags. New Patches and user replies target the operator through `ping-updated`; operator replies target the owning account. The normal authenticated SSE stream updates the persistent Ping badge, attention state, and disabled availability without exposing message content. When a Patch supplied an email address, an operator reply additionally attempts a short SMTP notification without making delivery a requirement for the saved reply. Neither support thread content nor metadata is eligible for Signal, catalogue, sitemap, or forum output.

Catalogue dispatch runs before the generic authenticated API gate because browse, detail, and search are intentionally public. Only the add-to-library endpoint authenticates. Private create/edit and enrichment flows call `syncGameSafely`; catalogue failures are logged and contained, so they cannot turn a successful account-scoped save into an error.

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
| `THEGAMESDB_API_KEY` | blank | Optional server-wide TheGamesDB key |

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

Expired sessions are purged when the server starts. Valid sessions receive a rolling two-week expiry on authenticated requests. SSE heartbeats validate the existing expiry without writing the session row every 20 seconds.

An inline pre-render marker adds the `resuming-session` document class before the body is painted. Because the HttpOnly cookie is deliberately invisible to JavaScript, the marker cannot inspect it. The class hides the public authentication surface and exposes a non-sensitive session-resume screen only while `/api/auth/me` asks the server to validate the cookie. Successful validation reveals the application immediately in its loading state; collection, statistics, metadata, and decorative artwork continue asynchronously. Failed authentication reveals the login screen without an expiry warning because the absence of a cookie is the normal logged-out state. This prevents logged-out UI from flashing for an authenticated account without putting session state into browser storage.

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
| `ownership` | `owned` or `wanted` |
| `play_status` | `backlog`, `playing`, `completed`, `paused`, or `abandoned` |
| `media_format` | `physical`, `digital`, or `unknown` |
| `cartridge_number` | Optional integer |
| `publisher`, `release_year`, `notes` | Optional metadata |
| `rating` | Optional private personal score from 0.5 to 5 in half-star increments |
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
| `description`, `description_source`, `description_source_url` | Selected game description and its required source attribution |
| `created_at`, `updated_at` | SQLite timestamps |

Indexes cover owner, platform, ownership, PEGI, and case-insensitive title.

### `catalogue_entries`

This table stores one shared factual release per normalized `(title, platform)` identity. It includes a stable unique slug, PEGI and HLTB facts, publisher/year, a catalogue-owned cover URL, source provenance, confidence reasons, and a `candidate`, `public`, or `rejected` moderation state. Its `updated_at` timestamp feeds the dynamic sitemap's release `lastmod` value.

Public projections explicitly remove contributor account ID, source private-game ID, confidence reasons, moderation state, and internal creation data. Personal fields do not exist in this table at all.

### `catalogue_game_links`

This join table records which private game rows are represented by a shared release. A private game can link to only one catalogue entry, while `(catalogue_id, user_id)` prevents duplicate links for one account. Public reads calculate an anonymous rating average and rating count by joining these links to non-null private `games.rating` values; those aggregate fields appear from the first rating, while individual scores and account identities are never exposed. All foreign keys cascade. Deleting an account or private row removes only its link; the independently owned public release and cover remain intact.

Automatic publication requires a durable `/covers/<random>.<ext>` asset, substantive PEGI data, an HLTB record with a reported duration, and exact normalized title matches for both cover and HLTB provenance. Complete ambiguous records become candidates. Rejected records are sticky and cannot be republished by a later background synchronization without administrator action.

`cover_provider_credentials` stores account-scoped JSON credential sets keyed by `(user_id, provider)` for TheGamesDB. Rows cascade when an account is deleted. Status endpoints expose only a boolean connection state; stored secrets are never returned to the browser.

Username comparison is case-insensitive. Renaming an account later does not alter ownership because all collection queries use the immutable numeric user ID.

---

## Authentication and authorization

The authentication design is a reduced version of the gamebooks app's model.

### Passwords

- `crypto.scrypt` derives a 64-byte hash.
- Every password receives a random 16-byte salt.
- Verification uses `crypto.timingSafeEqual`.
- Passwords must contain 8 to 200 characters.

### Usernames

- Length: 3 to 32 characters.
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

### Login throttling and account locks

The process keeps recent failed login/registration attempts by client IP. Eight failures within 15 minutes produce HTTP 429. Successful authentication clears that IP's failure list. The throttle resets when the Node.js process restarts.

Each account also records consecutive incorrect passwords in SQLite. Five failed passwords temporarily lock that account for 15 minutes; a correct login clears the count. Local administrators can apply an indefinite manual lock or unlock from Accounts. Locking revokes all active sessions immediately and blocks existing session authentication. The `koldKat` account is protected from admin deletion and locking, and it cannot be renamed into an unprotected identity.

Password-reset tokens are random 256-bit values. SQLite stores only their SHA-256 hashes, limits them to one hour, and invalidates previous tokens for the account only after SMTP has accepted the new reset email for delivery. Reset messages use a branded multipart email: an HTML button and linked fallback URL for capable mail clients, plus a plain-text fallback. The public authentication screen swaps its sign-in form for dedicated request and new-password panels, and removes a received token from the visible URL before rendering it. Consuming a token updates the scrypt password hash transactionally, clears temporary login-lock state, and revokes every existing session. Requests always return the same message whether or not an account/email exists.

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
| POST | `/api/password-reset/request` | Request a non-enumerating password-reset email |
| POST | `/api/password-reset` | Consume a one-time reset token and set a new password |
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
| POST | `/api/patch` | Create a private operator-support Patch, anonymously or as the signed-in account |
| GET | `/api/ping` | Signed-in account's private Patch conversations and unread count; operator sees the admin queue |
| POST | `/api/ping/:id/read`, `/reply` | Mark a Ping thread read or append an owner/operator reply |
| DELETE | `/api/ping/:id` | Hide a thread for its owner or the operator queue |
| GET | `/api/activity` | Public Kat·a·log Signal entries plus the optional pinned announcement |
| GET | `/api/activity/stream` | Public SSE refresh signal for Kat·a·log Signal |
| GET | `/signal` | Crawlable public Kat·a·log Signal page; attaches to the public SSE stream |
| GET | `/api/pegi/search?q=...` | Explicit server-side PEGI search |
| GET | `/api/pegi/status` | Missing-metadata count and current account job state |
| POST | `/api/pegi/bulk` | Start an account-scoped conservative metadata scan |
| GET | `/api/hltb/search?q=...` | Search HLTB for manual timing selection |
| GET | `/api/hltb/status` | Missing-timing count and current account job state |
| POST | `/api/hltb/bulk` | Start an account-scoped exact-title timing scan |
| GET | `/api/descriptions/status` | Missing-description count, source availability, and job state |
| GET | `/api/descriptions/search?q=...&platform=...` | Search Steam Store and connected TheGamesDB descriptions |
| POST | `/api/descriptions/bulk` | Start an account-scoped Steam-first missing-description scan |
| GET | `/api/covers/status` | Provider configuration, missing count, and bulk progress |
| PUT | `/api/covers/config` | Validate and store the account's SteamGridDB key |
| DELETE | `/api/covers/config` | Remove the account-specific provider key |
| GET | `/api/covers/search?q=...` | Search portrait covers for manual selection |
| GET | `/api/titles/autocomplete?q=...` | Return account-local matches, public catalogue releases, and up to ten SteamGridDB suggestions; `local=1` skips the remote provider and `exact=1&platform=...` performs the save-time duplicate check |
| POST | `/api/covers/bulk` | Start an account-scoped exact-title scan for missing covers |
| GET | `/api/cover-providers/:provider/status` | TheGamesDB connection state, missing count, and job progress |
| PUT | `/api/cover-providers/:provider/config` | Validate and store an account's provider credentials |
| DELETE | `/api/cover-providers/:provider/config` | Remove account credentials and fall back to server configuration, if present |
| POST | `/api/cover-providers/:provider/bulk` | Start that provider's conservative missing-cover scan |

List query parameters are `q`, `platform`, `ownership`, `playStatus`, `pegi`, `missing`, `favorite`, and `sort`. `ownership` accepts `owned_physical`, `owned_digital`, or `wanted`; the two owned values combine the stored `owned` collection state with the corresponding media format. `missing` accepts `pegi`, `cover`, `hltb`, `description`, `either`, or `both`; `either` means any enrichment data set is absent and `both` means all are absent. Missing-PEGI filtering and automatic PEGI enrichment include Evercade like every other platform. Legacy `missingPegi=1` and `missingCover=1` requests remain accepted.

Sort values cover ascending/descending title, platform, publisher, release year, PEGI, collection and play-state priority, favorites, creation/update timestamps, cartridge number, and ascending/descending values for all four HLTB estimates. SQL ordering always puts null numeric metadata last. Text ordering uses the same accent-insensitive normalization as collection search and includes numeric ID tie-breakers for deterministic placement. The focused `public/js/game-sorting.js` module mirrors those contracts for cards patched into the current result set through SSE, preventing live enrichment from temporarily using a different order than the server response.

Avatar filenames contain only the authenticated numeric user ID, timestamp, and random suffix. The browser center-crops and compresses before upload; the server independently decodes and reprocesses the image through the shared policy before accepting it, guaranteeing a 512×512 JPEG no larger than 256 KiB. Avatars are stored beneath `public/avatars/`; replacement and removal delete only the filename recorded for that account after a basename traversal check. Avatar binaries are excluded from Git.

### Public catalogue

| Method | Route | Purpose |
|---|---|---|
| GET | `/katalog` | Server-rendered public browse/search/filter page |
| GET | `/game/:slug` | Canonical server-rendered public release URL; opens the Kat·a·log detail dialog for browsers and provides `VideoGame` JSON-LD to crawlers |
| GET | `/sitemap.xml` | Dynamic standard sitemap containing Signal, every currently public release URL, and current update dates |
| GET | `/api/catalogue/search?q=...` | Small public factual search projection for discovery/autocomplete |
| GET | `/api/catalogue/game/:slug` | Public factual release projection without contributor/private identifiers |
| POST | `/api/catalogue/:id/library` | Authenticated one-click private copy with duplicate protection |

The add route accepts only collection and media-format choices. The server supplies all factual fields from the public entry, initializes remaining personal fields to safe defaults, creates an independent cover copy, and links the new row transactionally at the service level. If creation or linking fails, the partial private row and copied cover are removed.

### Local administrator API

The admin interface is available at `http://127.0.0.1:3005/admin/`. It is intentionally not an account role. A request is accepted only when the TCP peer is loopback. If nginx-style `X-Real-IP` or `X-Forwarded-For` headers are present, the first reported client must also be loopback. This prevents the public reverse proxy from exposing admin merely because it connects to Node locally.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | Runtime and whole-database counts |
| GET | `/api/admin/live` | Lightweight one-second process resource and uptime snapshot |
| GET | `/api/admin/accounts` | Account, collection, cover, and session counts |
| GET, POST | `/api/admin/announcements` | List all notices or create a draft |
| PATCH, DELETE | `/api/admin/announcements/:id` | Edit or permanently delete one notice |
| POST | `/api/admin/announcements/:id/publish`, `/unpublish`, `/pin`, `/unpin` | Change publication or single-pin state and refresh Signal via SSE |
| GET/POST/DELETE | `/api/admin/patch` and `/api/admin/patch/:id/*` | Localhost-only Patch queue, read state, replies, and removal |
| GET, PUT | `/api/admin/mail` | Read non-secret SMTP status or save SMTP settings |
| POST | `/api/admin/mail/test` | Send a test message to the configured sender |
| DELETE | `/api/admin/accounts/:id/sessions` | Revoke every active session for one account |
| PATCH | `/api/admin/accounts/:id/lock` | Manually lock or unlock an account; locking revokes sessions |
| DELETE | `/api/admin/accounts/:id` | Delete an account, its avatar, and cascaded games, sessions, integration settings, and preferences |
| GET | `/api/admin/games?q=...` | Search up to 250 games across accounts |
| DELETE | `/api/admin/games/:id` | Permanently remove one explicitly selected game |
| GET | `/api/admin/catalogue?q=...&status=...` | List shared entries and moderation counts |
| PATCH | `/api/admin/catalogue/:id` | Edit shared factual metadata, or set `candidate`, `public`, or `rejected` state |
| PUT | `/api/admin/catalogue/:id` | Replace the shared cover from a supported artwork-provider URL |
| DELETE | `/api/admin/catalogue/:id` | Delete a shared entry and its catalogue-owned cover |
| GET, PUT | `/api/admin/version` | Read or atomically replace the release string |
| POST | `/api/admin/database/checkpoint` | Truncate-checkpoint the SQLite WAL |
| POST | `/api/admin/database/optimize` | Run SQLite planner optimization |
| POST | `/api/admin/database/vacuum` | Rebuild the SQLite database file |
| GET, POST | `/api/admin/backups` | List or trigger the current hour's compressed SQLite backup |
| DELETE | `/api/admin/backups/:name` | Delete one validated backup filename |

The Dashboard mirrors the Gamebooks refresh cadence: collection and catalogue totals refresh every 60 seconds, while the lightweight live cards (heap, RSS/CPU, application age, and session uptime) refresh every second. Application age starts with the earliest user or game record in the database. Uptime is persisted across restarts: every restart has a five-second allowance. Gaps within it are continuous; for longer gaps, only the excess is recorded as downtime, and the new session begins with the same five seconds already included.

Admin static files and API responses use restrictive security headers. Backup names are server-generated and deletion accepts only that exact filename shape. Backups are stored in `backups/`, which is excluded from Git.

`server/backup.js` creates one consistent SQLite snapshot at process startup and then exactly on each hour. The snapshot is compressed with the host `zip` command, published by atomic rename, and its temporary raw SQLite file is always removed. A second attempt in the same hour is a no-op. Archives older than 15 days are pruned during each run.

### Version file

`VERSION` contains one nonempty, arbitrary single-line string of at most 80 characters. It is not limited to semantic versions. The admin writes a temporary sibling and atomically renames it over the target; the main header fetches the value through `/api/config` on page load. Changing the version does not require restarting Node, though already-open app tabs refresh it on their next reload.

---

## PEGI integration

PEGI exposes a public catalogue search but no documented public developer API. `server/pegi.js` therefore performs opt-in HTTPS requests after the user selects either **Look up title** or the account-level **Fill PEGI details** batch action.

The parser extracts displayed title, publisher, rating, descriptors, exact platform releases, year, consumer advice, brief outline, content-specific issues, and other issues. A lookup reads PEGI's reported result count and requests subsequent zero-based result pages, up to a hard limit of 10 pages. Later pages are fetched concurrently, individual later-page failures do not discard successful results, and duplicate records are removed using title, publisher, rating, and release data. Descriptor and release arrays are stored as validated JSON; long PEGI text is length-limited before persistence. Merged results are cached in process memory for one hour per normalized query. Each request has a 12-second timeout and a 4 MB response limit. Transient rate-limit and 5xx responses are retried twice with short backoff; exhausted failures return a calm availability message instead of exposing the provider's raw HTTP status.

The client renders descriptors as compact card badges, with purchase and paid-random-item labels receiving a distinct warning treatment. The complete record uses a themed `<details>` disclosure inside the game form so lengthy guidance does not increase every card's footprint.

The **Fill PEGI details** action in Account Settings starts an in-memory, account-scoped job. It considers games that have neither a saved PEGI source record nor extended PEGI metadata, including Evercade titles. Before each external request it reloads the game and skips it if it was deleted or enriched since the job began. Every remaining title is searched across the same paginated catalog, then accepted only through normalized exact-title matching; an unambiguous exact platform release is preferred. Ambiguous results remain unchanged for manual review. The enrichment update touches only PEGI fields, publisher, and release year, preserving ownership, play state, notes, format, favorite state, platform, title, and cover. Requests are paced by 500 ms, and five consecutive lookup failures stop the job instead of repeatedly hitting a failing provider. Completed metadata remains in SQLite; active job state itself is intentionally process-local.

This integration is deliberately nonessential. Parsing or network failure returns HTTP 502 with a PEGI fallback URL; manual game creation remains available.

---

## HowLongToBeat integration

HowLongToBeat does not provide a documented public developer API. `server/hltb.js` uses Node's built-in `fetch` implementation against HLTB's current token-gated search route, requests the rotating search credentials, and performs opt-in searches. The same results expose HLTB game-image filenames, which are offered only within an explicit per-game Request cover search // never by bulk cover work. The provider is native JavaScript: it does not spawn Python, invoke the old Downloads script, or add a Python dependency.

Responses are reduced to a numeric record ID, title, source URL, similarity score, and four hour values: Main Story, Main + Sides, Completionist, and All Styles. Search results are cached for 30 minutes, provider calls are serialized, and each request has a 20-second timeout. Authentication is refreshed once after an authorization failure. The private endpoint can change without notice, so this remains optional assistance and lookup errors never block ordinary game editing.

The **Fill HLTB times** account action runs an in-memory, account-scoped job over games with no selected HLTB record. Each queued game is reloaded before lookup, and the database update also requires its HLTB ID to remain null. Automatic selection requires exactly one punctuation-, case-, trademark-, whitespace-, and accent-normalized exact title. Ambiguous editions and fuzzy matches remain untouched for manual selection. Requests are spaced by 1.5 seconds; five consecutive provider failures pause the job. Successful records are persisted immediately and published as targeted `game-updated` SSE events.

The game form owns HLTB state in the focused `public/js/hltb-ui.js` module. Lookup requests carry a local sequence guard: changing the title or reopening the dialog invalidates an older response so it cannot populate a different game form. Cards show a compact four-column estimate strip, while the form shows the complete labels and source link. Grid cards use a column layout with consistent two-line title and two-row badge areas plus a bottom-anchored action row. Games without HLTB data retain a muted four-column timing frame with dashes, so optional metadata does not change the card or grid-row structure. Narrow single-column mobile cards release the title and badge height limits to keep their full content visible. Compact list view retains the same four-value strip in a dedicated desktop column; narrow list rows wrap it beneath the title rather than removing information. The **No HLTB info** data-gap filter is available independently and participates in the combined any/all missing-data modes.

---

## Cover-art integration

The artwork layer supports SteamGridDB and TheGamesDB. SteamGridDB supplies portrait grids and title autocomplete. TheGamesDB supplies front boxart and platform metadata from its CDN. Manual lookup runs both configured sources concurrently, preserves provider provenance, and returns successful results even when the other source is unavailable.

SteamGridDB requires a personal bearer API key stored in `user_integrations`. TheGamesDB requires an API key stored in `cover_provider_credentials`; its key page requires an authenticated TheGamesDB site account, so Account Settings links to sign-in/registration separately from the key page. `STEAMGRIDDB_API_KEY` and `THEGAMESDB_API_KEY` provide optional server-wide fallbacks. Secrets are validated before storage and never returned to the browser.

Cover-status responses expose only whether lookup is configured. When connected, Account Settings renders a disabled field as a green **Connected** state; secrets are never returned to the browser. Selecting **Replace key** or **Replace credentials** explicitly enters replacement mode with empty fields.

The add/edit title field searches the authenticated account's own titles and reuses SteamGridDB's game autocomplete after three characters. Browser requests are delayed by 100 ms, stale requests are aborted, remote results are capped at ten, and provider results are cached server-side for 30 minutes. Existing entries appear first with platform and ownership context. Local collection search, title suggestions, and duplicate identity checks normalize Unicode combining marks before comparison, making accented and unaccented spellings equivalent. SQL `LIKE` wildcards supplied by the user are escaped.

An exact case-insensitive, whitespace-normalized title-and-platform pair is treated as a possible duplicate. Save-time validation uses a dedicated account-scoped exact lookup rather than the autocomplete result limit, so spacing variants and collections with many editions cannot bypass the warning. The warning can open the existing record. Creating another entry requires an explicit themed confirmation, but remains permitted for multiple copies or editions; another platform is never treated as the same record. The authenticated autocomplete route deliberately returns local results plus an empty remote list when no key is configured or SteamGridDB fails. The interface shows no provider warning, toast, empty state, or loading indicator: remote autocomplete is optional assistance and manual entry always remains available.

Manual lookup sends the title and selected platform to the configured sources. SteamGridDB searches up to four title candidates for portrait static grids. TheGamesDB requests front boxart with platform filtering and constructs image URLs only from the API's returned CDN bases. Results are cached in memory for 30 minutes. Provider failures are isolated, so one healthy source can still populate the chooser. TheGamesDB result tiles use its original image URL directly because its generated preview derivatives are intermittently absent; other provider thumbnails retain the generic original-art fallback, including detection of a cached failure before the error listener mounts.

Selected and automatically matched covers are not hotlinked permanently. `server/cover-storage.js` accepts HTTPS downloads only from the supported providers' CDN domains, validates every redirect before following it, caps source responses at 12 MB, and verifies JPEG/PNG/WebP file signatures. The shared server-side `server/image-policy.js` then applies EXIF rotation, limits the longest edge to 900 pixels without enlargement, converts to JPEG, and iteratively compresses until the result is no larger than 256 KiB. Only the processed image is written through a collision-safe temporary filename and atomically published under `public/covers/`. SQLite stores the resulting `/covers/...` path while retaining provider and matched-title provenance. These static files are unauthenticated and therefore publicly reachable through `https://gamekat.net/covers/...`; they stream from disk with exact content lengths and immutable one-year cache headers because filenames never change in place. Replacement, game deletion, account deletion, and admin catalogue deletion remove the corresponding local file.

Normal startup never scans the whole library. Replaying catalogue eligibility or opening every cover with Sharp can monopolize the single Node process on a large collection, so cover maintenance is deliberately explicit: `npm run covers:normalize` performs the local 900-pixel/256-KiB JPEG normalization, while the established cover-storage functions can localize legacy HTTPS URLs when deliberately invoked. New and edited games are synchronized immediately through their normal request paths. Cover conversion atomically writes a replacement before changing the database URL and removes the old file only when no database record still references it.

Each source has an independent missing-cover scan. Jobs consider only games without a cover and reload each queued record before making a request. Games deleted or manually covered after queuing are skipped; the database update also requires the cover to remain empty. TheGamesDB additionally requires a platform match and exactly one normalized title record; several regional images belonging to one record are not treated as ambiguous. Five consecutive provider errors pause that job. Progress and individual card updates use SSE, jobs remain in memory, and saved results remain in SQLite across restarts.

Description lookup queries Steam Store first and accepts only a single normalized exact-title result during automatic filling. If it does not find one, a configured TheGamesDB key enables a platform-aware overview fallback. TheGamesDB HTTP 403 and 429 responses are terminal for the current description job, so a rejected or quota-limited request pauses the batch rather than consuming further allowance. Other source failures are isolated where the alternate source can answer. Each persistence operation compare-and-swaps against an empty description, preserving manual edits made during a scan.

Cards use a centered, full-card image with a dark left-to-right gradient, mirroring Gamebooks' cover-background treatment. Images use native lazy loading so only the visible portion of a large collection is requested.

On authenticated entry, the browser starts the core library requests and reveals the workspace immediately, without awaiting their responses. `public/js/artwork-url.js` admits both legacy HTTPS artwork and validated `/covers/...` paths, while `randomShowcaseCovers()` applies the same two-form policy to the public cover-only endpoint. The logged-out loader also falls back to the generated, Git-ignored `public/cover-showcase.json` catalogue if an older running server process returns no covers; the file exposes only the same already-public randomized paths and is regenerated after normalization. Durable storage therefore feeds the login background, promo modules, authenticated header and app background consistently. After the returned games render, it shuffles their unique cover URLs and fills the five header covers first, followed by the fixed 32-slot decorative field. HTML declares each cover group once with `data-cover-slots`; the browser generates its non-semantic positioning nodes, element type, base class, and numbered modifier classes. The single loose promo cover uses the same declarative mounting pass through `data-cover-decoration`. Repeated empty cover tags are therefore absent from maintained markup. The controller mark, separator rules, status dots, progress fill, and modal spacing use CSS or meaningful elements rather than empty helper tags. Empty live regions remain only where runtime content is intentionally inserted. Decorative images preload in a genuine one-at-a-time queue, so artwork never competes with the application shell or floods the browser connection pool. Each image may take up to six seconds; failed candidates are skipped in favor of the next shuffled URL. The successful set is committed to the decorative field in one synchronous batch rather than mutating the page after every image. A focused dropdown defers that commit until it loses focus, preventing background artwork from dismissing native filter menus in Chromium browsers. Logged-out artwork work is canceled as soon as authentication succeeds. If fewer unique images succeed than there are slots, successful covers repeat instead of leaving permanent holes. Stale work is discarded if the account changes while images are loading. The field reuses the login artwork geometry and opacity, has no pointer interaction, and is reduced to four slots on narrow screens. It does not make another provider request or expose another account's cover selection.

---

## Browser application

`public/app.js` is a zero-dependency ES-module browser orchestration entry point. Its state contains the authenticated user, games, account statistics, platform list, result render limit, selected view, and loading state. Static platform taxonomy and release-text matching live in `public/js/platforms.js`; this includes PC storefronts and launchers such as Steam, GOG, and Epic Games Store as first-class filterable platforms. Generic PEGI PC releases do not overwrite a selected storefront, while server-side PEGI matching normalizes those storefronts to PC for edition matching. Authenticated event streaming lives in `public/js/events.js`; incremental card ordering lives in `public/js/game-sorting.js`; title suggestions, including local public-catalogue hits, live in `public/js/title-autocomplete.js`; HLTB form and card presentation lives in `public/js/hltb-ui.js`; `public/js/catalogue-navigation.js` fetches and swaps only the public-catalogue content view while retaining the mounted app header, account control, add-game action, library DOM, and browser history; and `public/js/catalogue-public.js` binds native release-detail dialogs and their one-click add action in either the standalone public document or that mounted view. Returning to the private library closes an open release dialog before hiding the public content region, removes its modal top layer and invisible backdrop, and suppresses the dialog's normal return-to-public history update. `server/app-shell.js` distinguishes full authenticated document loads from partial view requests: a signed-in hard refresh on Signal, Forum, Kat·a·log, or a release URL receives the real SPA shell at the unchanged URL, then restores that content view below the mounted header. Guests retain crawlable server-rendered HTML, and partial fetches identify themselves with `X-GameKat-Partial`. Consequently the persistent `+Game` control opens the existing dialog from every authenticated view rather than linking back to the library. Server-rendered release pages check the signed-in account for the same normalized title/platform private copy; a match renders an already-added state instead of an add form. The POST endpoint retains duplicate validation for races, and the browser turns its duplicate response into that same already-added action instead of showing an error.

The authenticated library footer mirrors the family branding used by Gamebooks: **koldKat productions** followed by a copyright year. `COPYRIGHT_START_YEAR` lives in `public/js/ui-policy.js`; the browser displays that year initially and automatically expands it to a range in later years.

Public CSS is split by responsibility and loaded in deliberate cascade order: `foundation.css`, `theme.css`, `library.css`, `landing.css`, then `features.css`. Later modules refine shared primitives established earlier, so the order in `public/index.html` must be preserved. Standalone public catalogue pages also load the landing and feature layers for the same low-opacity cover spread used by the authenticated shell; their server-rendered slots use only validated local public-cover paths. Every module is source-formatted rather than minified; production compression, if desired, belongs at the HTTP layer rather than in the maintained source.

The event client reads SSE through `fetch()` and a `ReadableStream` so reconnects can send `Last-Event-ID` for replay while using the same-origin session cookie. It reconnects after interruption and stops immediately on logout or page exit; standalone Signal and public-shell Ping streams have the same explicit page-exit cleanup. The server disables nginx buffering, revalidates the session without extending it or writing SQLite on each 20-second heartbeat, and rotates long-lived connections after ten minutes. Logout, password changes, admin revocation, expiry, or account deletion therefore close an existing stream as well as blocking its reconnect. Every account has a bounded 2,048-event replay window; the client returns its last event ID after a disconnect so card and progress changes from the gap are replayed in order. If an unusually long interruption exceeds that window, a reset event triggers a correctness resync.

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

An isolated `net::ERR_INCOMPLETE_CHUNKED_ENCODING` entry means the proxy or upstream ended an open event stream without a normal HTTP terminator. The browser client catches that interruption and reconnects with its last event ID. Repeated short-lived failures back off from 2.5 seconds to a 30-second ceiling; a stable connection resets the delay. Repeated warnings indicate a proxy timeout or unstable upstream process; they do not require reloading the library grid.

Cover, PEGI, and HLTB workers publish account-targeted progress plus `game-updated` records. The browser normally reconciles only that record against the current filters and sort order, reusing every unaffected card node; it does not reload the entire game list or move the viewport. Updates received while a filter/search request is in flight are keyed by game ID and flushed afterward. Collection and summary requests also carry a client-side sequence and account check, so a slower or previous-account HTTP response cannot overwrite newer state. Likewise, a late unauthorized response can end only the same session generation that issued it, never a newer login. Logout clears the in-memory collection and account-specific header artwork before another account can enter.

### Startup

1. Show the neutral session-resume surface before first paint.
2. Call `/api/auth/me`; the browser supplies any HttpOnly session cookie automatically.
3. Show authentication on absence/failure, or apply the returned account preferences and mount the library on success.
4. Load games, statistics, and metadata in parallel using those preferences.

An HTTP 401 on a protected request made from an active application advances the client session generation, returns to login, and reports that the session expired. A 401 from the initial `/api/auth/me` probe is treated as an ordinary logged-out visit and does not show that warning. No browser-stored token needs to be removed.

### Rendering

Game cards are generated from escaped values. While a library request has no existing cards to preserve, the grid area shows a compact animated controller derived from the green-outline favicon; it is hidden as soon as cards or the genuine empty state can render. Refreshes with existing cards never replace them with the loader. Reduced-motion clients receive the same status as a static mark. Filters are sent to the server rather than applied to a global cross-user data set. Search uses a 220 ms query debounce. View, search, filter, and sort changes are separately debounced into `/api/preferences`, which stores the validated snapshot in SQLite. Dirty preference state retries after a transient failure and is flushed with a keepalive request when the page exits or before logout. Rendering is batched in groups of 120.

### Dialog pointer safety

Backdrop dismissal tracks `pointerdown` and `pointerup`. It closes only when both events target the dialog backdrop. This prevents a text-selection drag that begins inside the form and ends outside from dismissing the dialog.

Destructive actions use themed HTML dialogs in both the public application and localhost admin. Native browser `alert`, `confirm`, and `prompt` APIs are not used.

---

## Static serving

`server.js` resolves requested paths beneath `public/`, rejects traversal outside that directory, assigns MIME types, and serves maintained static content with `Cache-Control: no-cache` plus an ETag. Browsers therefore revalidate on every load, receive a cheap `304 Not Modified` response for unchanged files, and pick up changed JavaScript, CSS, manifests, and app icons without manual `?v=N` URL updates. Durable cover files retain immutable one-year caching because their filenames change when their content changes. API content uses `no-store`.

Admin assets are not beneath the public directory. `server/admin.js` serves an explicit file allowlist only after the request passes the loopback check.

Generated documentation is available at:

- `/docs/`
- `/docs/user-guide.html`
- `/docs/technical.html`

### Search and social metadata

The public landing page uses `https://gamekat.net/` as its canonical URL. Its focused title and description, Open Graph and Twitter large-image fields, install manifest, and `WebApplication` JSON-LD consistently describe multi-platform collection tracking, public release discovery, wishlists and backlogs, deep filtering, PEGI/HLTB assistance, cover art, and cross-device account preferences. Structured data also links the public guide and GitHub repository. The domain inspires the **Game Kat·a·log** wordmark, whose separators are true middle dots. The social image is authored as `public/social-preview.svg` and rendered to the crawler-compatible `public/social-preview.png` at 1200×630.

`robots.txt` permits the landing page, `/signal`, `/forum`, `/katalog`, release pages, and public guide while excluding `/api/`, `/admin/`, and account avatars. Runtime `/sitemap.xml` is generated as a plain standard URL-set with Signal, Forum, stable public release slugs, public forum threads, and their update dates; candidates and rejected catalogue entries never appear. The maintained static file remains a landing/Signal/Forum/Kat·a·log/guide fallback. Signal uses `CollectionPage` JSON-LD and receives public, filtered activity through `/api/activity/stream`; the forum uses the same public shell and its own `/api/forum/stream`; browse pages use `CollectionPage` JSON-LD, and release pages use `VideoGame` JSON-LD with eligible aggregate ratings. A canonical release URL renders the public Kat·a·log with that release detail dialog already open, so search visitors get the same detail surface as people browsing the catalogue. The manifest includes 192×192 and 512×512 PNG icons in addition to the scalable favicon.

The authentication landing markup contains six visible, descriptive feature cards covering platform breadth, querying, PEGI/HLTB metadata, cover workflows, cross-device preference persistence, and public discovery with private tracking. This gives non-JavaScript crawlers useful product content without exposing any private collection data. Backups and local administration remain documented operational features rather than headline public marketing claims.

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
| `test/hltb.test.js` | HLTB response parsing, title similarity, and the current search route |
| `test/hltb-bulk.test.js` | Exact-title selection, late-change skipping, job events, and failure circuit breaker |
| `test/hltb-ui.test.js` | Null-safe new-game and saved-game browser metadata normalization |
| `test/preferences.test.js` | Per-account persistence, validation, isolation, and deletion cascade |
| `test/sorting.test.js` | Client HLTB null-last ordering and deterministic accent-insensitive title sorting |
| `test/events.test.js` | SSE framing, account-isolated replay, and revoked-session closure |
| `test/covers.test.js` | Conservative cover-title normalization |
| `test/seo.test.js` | Canonical/social metadata, crawler policy, and asset dimensions |
| `test/admin.test.js` | Loopback/proxy boundary and whole-database admin summaries |
| `test/catalogue-policy.test.js` | Complete/exact automatic publication and candidate boundaries |
| `test/catalogue-store.test.js` | Identity deduplication, public projection privacy, search, and sticky rejection |
| `test/catalogue-service.test.js` | Independent covers, private-copy defaults, duplicate rejection, and fail-closed sync |
| `test/catalogue-pages.test.js` | SSR metadata, escaping, safe links, and dynamic sitemap output |
| `test/backup.test.js` | Hourly ZIP creation, deduplication, cleanup, and scheduler timing |
| `test/version.test.js` | Version-file persistence and input validation |

Run all checks with `npm test`.

The authentication test uses a disposable SQLite database under `/tmp` and removes its main, WAL, and shared-memory files afterward.

---

## Operations and backups

Stop with `Ctrl+C` or send SIGTERM. The server closes SQLite before exiting.

The server automatically creates compressed, consistent live database backups at startup and hourly, retaining 15 days. Cover binaries under `public/covers/` are deliberately excluded from those ZIP files. The admin **Tools** tab lists, triggers, and removes the database archives and can checkpoint the WAL. For a simple offline database backup:

1. Stop the server.
2. Copy `games.db` to a dated backup location.
3. Restart the server.

When backing up a live WAL database, use SQLite's backup API or include a proper checkpoint procedure. Copying only `games.db` during an active write can omit transactions still present in `games.db-wal`.

The database and generated cover files are excluded from Git. Source code, generated documentation, tests, and the empty `public/covers/.gitkeep` directory marker can be versioned normally.

---

## Known boundaries

- Password resets require an email address on the account and working SMTP settings in the localhost-only administrator panel.
- The administrator panel is deliberately available only through a direct loopback request; remote administration requires an explicit, separately secured transport such as an SSH tunnel.
- Login throttling is in-memory rather than persisted.
- PEGI parsing depends on public page structure and can require maintenance; running batch jobs are not resumed after a process restart.
- HLTB lookup depends on an undocumented private search route that can change and may require maintenance. Running batch jobs are not resumed after a process restart.
- Cover lookup depends on whichever of SteamGridDB or TheGamesDB the account or server has configured; external quotas and availability apply, and unfinished bulk jobs must be restarted after a process restart.
- Browser authentication uses an HttpOnly, SameSite cookie and all persistent workspace settings live in SQLite. Production access should still use HTTPS so the cookie also receives the `Secure` attribute.
- The public client retains one orchestration entry point, with stable data catalogues split into focused modules. The admin client is divided by panel plus shared utilities.
