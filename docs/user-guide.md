# Game Kat·a·log - User Guide

Game Kat·a·log is a private, multi-account library for physical and digital video games. It is designed for fast desktop use, compact phone use, and large collections.

---

## Getting started

Open `http://localhost:3005` in a browser. To use another device on the same network, replace `localhost` with the server computer's LAN address.

### Creating an account

1. Select **Register**.
2. Choose a username. Matching is case-insensitive.
3. Optionally enter an email address.
4. Choose a password with at least eight characters and enter it again for confirmation.
5. Select **Create account**.

Every account has an isolated library. Game ownership is attached to the account's internal numeric ID, so changing a username does not affect its collection.

### Signing in and out

- Use **Login** with an existing username and password.
- A secure HttpOnly cookie carries the random session identifier. Page scripts cannot read it, and the app puts no authentication data in local or session storage.
- Sessions remain valid for two weeks and are extended while used. Revoked or expired sessions also close their live-update stream within about 20 seconds.
- Select the username in the top-right corner, then **Log out**, to end the current session.
- Five incorrect passwords temporarily lock the account for 15 minutes. A local administrator can also lock an account until they explicitly unlock it; that action signs it out everywhere.
- Select **Forgot?** to replace the sign-in form with the reset-request panel, then enter a username or email. The branded email has a clickable **Reset password** button and a linked fallback address; it opens a dedicated new-password panel. Links expire after one hour and all existing sessions are signed out after a successful reset. An account needs an email address and the local administrator must have configured SMTP delivery.

During refresh, a compact **Mounting authenticated library…** screen remains visible only while the secure session cookie is checked. The app then appears immediately in its loading state; a green-outline controller marks an empty grid while library data arrives, and header and background covers fill in afterward. Existing cards remain visible during later refreshes instead of being replaced by the loader. The public login and registration interface is shown only if that session is absent or invalid.

---

## Public Kat·a·log

Select **Kat·a·log** from the login-page footer or signed-in header to browse the shared release index at `/katalog`. While signed in, the application shell stays in place: only the content beneath the header changes; **Kat·a·log**, **My Kat·a·log**, and **+Game** remain in their fixed header positions, with the current view visibly inactive. Direct public pages use the same shell treatment, including its subtle shared-cover spread. This page is public and search-engine-visible; it can be searched by title, publisher, or platform and filtered to one platform. With no platform filter, one card represents a game title and lists its available platform releases; applying a platform filter deliberately shows the matching release rows separately. A release detail dialog shows its cover, PEGI details, publisher and year, all available HowLongToBeat estimates, and links to the other public platform editions.

When signed in, choose collection and media format in a release detail dialog, then select **Add to my Kat·a·log**. The app creates an ordinary private library row with the release facts already filled. Your ownership, format, play state, favorite, notes, and other tracking remain private and editable. If that title and platform already exist in your account, the dialog shows **Already in your Kat·a·log** instead of add controls. Opening My Kat·a·log from either state closes the details dialog first, leaving the private library immediately interactive. The server keeps duplicate protection as a safeguard if another tab adds it while the dialog is open.

The Kat·a·log grows conservatively from member libraries. A release publishes automatically only when all of these are present:

- A durable locally stored cover with an exact normalized title match.
- Substantive PEGI metadata.
- A HowLongToBeat record with at least one timing estimate and an exact normalized title match.

Complete records with an ambiguous cover or HLTB title wait for localhost administrator review. Incomplete records do not enter the shared index. The public copy contains factual release metadata only // never the contributing account, ownership, media format, play state, personal rating, favorite, cartridge number, notes, or private game-row ID. From the first linked private rating, it can show an anonymous community average and rating count. It also owns a separate cover copy, so editing or deleting a private game does not break the public page.

Public Kat·a·log matches also appear between games already in your library and optional SteamGridDB title suggestions while typing in the add dialog. Selecting one opens its public release details over the Kat·a·log, where you can inspect the metadata before adding it. Each release also has a stable shareable URL for search engines; opening one directly lands on the same Kat·a·log detail dialog, and closing it returns to the catalogue without creating a redundant browser-history entry. If the same title and platform are already in your library, the page shows **Already in your Kat·a·log** instead of an add form and links back to your library.

---

## Dashboard

The ten compact cards summarize the current account and act as one-click major filters:

| Card | Meaning |
|---|---|
| **Total** | Every title in the account's library and clears all filters |
| **Owned physical** | Owned games stored as physical copies |
| **Owned digital** | Owned games stored as digital copies |
| **Wishlisted** | Games wanted but not yet owned |
| **Backlog** | Games waiting to be played |
| **Playing** | Games currently in progress |
| **Completed** | Games with play status set to Completed |
| **Paused** | Games intentionally put on hold |
| **Abandoned** | Games no longer being pursued |
| **Favorites** | Games marked as favorites |

Selecting a summary card applies its corresponding library filter and highlights the active card. **Total** clears search and every library filter while retaining the selected sort order.

---

## Finding games

The library updates as filters change.

### Search

Search matches the game title, publisher, notes, and description. It is case- and accent-insensitive, so `Pokemon` also finds `Pokémon`, and starts after a short typing delay. The public Kat·a·log and both administrator indexes use the same delayed live search. On the public Kat·a·log, typing, clearing a query, filtering, and paging update only the result cards rather than refreshing the page.

### Filters

| Filter | Options |
|---|---|
| **Platform** | Platforms currently present in the account |
| **Collection** | Owned physical, Owned digital, or Wishlisted |
| **PEGI** | 3, 7, 12, 16, 18, or Unrated |
| **Play status** | Backlog, Playing, Completed, Paused, or Abandoned |
| **Data gaps** | No PEGI info, no cover, no HLTB info, no description, any missing, or all missing; Evercade titles are included whenever their information is absent |
| **Sort by** | Title in either direction; platform; publisher; release year; PEGI in either direction; collection state; play status; favorites; added/updated date; cartridge number; or shortest/longest HLTB Main, Main + Sides, Completionist, and All Styles time |

Select **Clear filters** to return to the complete library. Results are paginated in ten desktop rows.

HLTB duration sorts always place games without that particular estimate after games with a known time. This keeps missing data from appearing as zero-hour games. Live batch updates use the same selected order as a full library reload.

### Card and compact views

Use the two view buttons beside **My Kat·a·log**:

- **Card view** gives titles more space and is the default.
- **Compact view** places each game on a denser horizontal row.
- The left card rail uses the PEGI color: green for 3/7, amber for 12/16, red for 18, and muted gray when unrated.
- The platform appears inside each card as its own label.
- With no platform filter, copies of the same normalized title are collected into one card with platform buttons. Select a platform button to inspect that specific private version. Applying a platform filter intentionally expands the matching records into separate cards.
- Games with saved HLTB data show compact Main, Main +, 100%, and All Styles estimates.

The selected view, search text, every filter, and the sort order are stored with the account in SQLite. They follow the account to another browser, desktop, or phone; nothing is kept in local or session storage.

The signed-in workspace keeps the login screen's scattered box-art atmosphere at the same visibility behind the interface. It selects and randomizes durable local artwork from the current account when the app is entered; those same local files feed the public promo modules and header covers. Artwork finishes loading in the background and waits for an open filter menu to close before changing the decorative layer, so it cannot interrupt filtering. The decorative layer is non-interactive and does not affect the cards or controls.

The small release string beside **Game Kat·a·log** comes from the project's `VERSION` file and can be changed from the local administrator panel. A saved change appears immediately in open signed-in and public headers without a refresh.

---

## Collector progression

Your account has a private collector level. The persistent application header and account panel show its current level, title, total XP, and distance to the next level on My Kat·a·log, Signal, Forum, and the public Kat·a·log, including after a direct refresh. The same `+Game` control remains available in every signed-in view and opens the game form without navigating back to My Kat·a·log. Levels use the same triangular Gamebooks curve: level 1 starts at 1,000 XP, level 2 at 3,000 XP, level 10 at 55,000 XP, and the maximum level is 100. Header XP changes animate in queued, level-scaled segments: at level 16, each awarded update takes 1,600 ms.

XP recognizes durable collection work: adding a game; setting a cover, PEGI details, HLTB times, description, personal note, publisher, year, rating, favorite, wishlist, play state, or first avatar; opening a new platform shelf; contributing a game to the public Kat·a·log; starting a forum thread or reply; and collection, enrichment, and completion milestones. Recording a note awards 5 XP once per game; changing a Wishlisted game to Owned awards 25 XP once; publishing a contributed game to the Kat·a·log awards 30 XP once.

Each award is permanently recorded against the account, action, and relevant game or milestone. Removing a favorite, cover, or other field and adding it back cannot award XP twice. Existing libraries are safely credited once on their first progression check. XP amounts are controlled only from the localhost administrator panel; the level curve and titles remain stable.

## Kat·a·log Signal

**Kat·a·log Signal** is a public page at `/signal`; the landing screen shows a short live preview and links to it. It shows every eligible event from the last 30 days // there is no event-count cap // and groups activity by your local day. It intentionally contains only public-safe events: new accounts, collector level-ups, games contributed to the public Kat·a·log, and published administrator announcements. It uses a server-sent-event connection, so a new event appears without refreshing the page. Private library additions, wishlists, ratings, edits, metadata scans, and play status never appear there.

New accounts are announced by default with a randomly selected message. Level-up messages are also selected from the stored Signal templates and identify a newly gained collector title when one changes. Five or more public game contributions from one account on the same day collapse into one compact count; select that contribution summary to inspect every contributed game. Open **Account settings** and enable **Hide from Kat·a·log Signal** to hide all of your Signal events, including existing ones. The choice is stored with your account and applies across devices.

The localhost-only administrator panel can compose announcements as drafts, edit them, publish or unpublish them, delete them, and pin one published notice. A pinned announcement stays above Signal regardless of age; other published announcements follow the normal 30-day window. Announcement text supports restrained `**bold**`, `*italic*`, `__underline__`, `~~strike~~`, and `{color:teal}color{/color}` formatting.

---

## Forum

**Forum** is a public, search-visible discussion space at `/forum`. It keeps the same header and cover treatment as Signal and the public Kat·a·log, and switches below the signed-in shell rather than rebuilding the app header. Anyone can read the starting channels: General, Games & recommendations, Collections & hardware, and Kat·a·log.

Choose a channel before starting a thread: its inline composer appears within that channel and locks the selected channel, so a new discussion never falls into General by default. Thread cards identify their author; each thread-page post also shows that account's avatar or initial, username, and collector level. Sign in to start a thread or reply. You can edit or delete only your own thread or reply; deletion uses a themed second-click confirmation, deleting a thread removes its replies, while deleting a reply leaves a clear deleted marker in the conversation. Forum changes use a public server-sent-event stream, so open channels and threads refresh without manual reload. A localhost administrator manages channels and can pin, lock, or remove any thread. Starting a thread awards 25 XP once; each reply awards 5 XP once.

## Patch and Ping

**Patch** is the private operator link. Use it for bugs, ideas, and game-data corrections. Signed-in accounts automatically identify themselves; visitors can leave a name and optional email. Patch threads never enter Signal, the public Kat·a·log, or the forum.

**Ping** is the signed-in private inbox for Patch replies. It remains muted and unavailable until there is at least one conversation, then shows unread conversations, supports replying, and lets you hide a thread from your own list. Operator replies arrive live through the authenticated event stream, so the Ping badge updates without reloading the library and pulses until read. The operator account sees the same Patch conversations through Ping with the operator unread state, so later user replies become unread again. If you left an email address, a reply also sends a short email notice when SMTP is configured. The localhost-only admin panel has the matching Patch queue: it can read, reply to, and remove threads.

---

## Adding a game

Select **Add a game** on desktop or the **+** floating button on mobile.

### Manual entry

Only **Title** and **Platform** are required. Every other field can be added later.

After three title characters, matching games already in the current account appear first, with their platform and collection state. Public Kat·a·log matches follow and open their release-details dialog; optional SteamGridDB title suggestions appear last when that provider is connected. Select an existing result to open it instead of creating another entry. Pointer selection, arrow keys, Enter, and Escape are supported.

An exact title-and-platform match shows an **Already in your library** warning and an **Open existing** action. Saving a new game with that same pair requires a themed **Add anyway** confirmation because multiple copies or editions can be legitimate. The same title on another platform is not considered a duplicate. Suggestions are optional: any title can still be entered manually. If SteamGridDB is unavailable or not configured, its suggestions disappear silently while local duplicate detection and ordinary title entry continue working.

PC libraries can be tracked by storefront rather than only by operating system. The built-in platform list includes Steam, GOG, Epic Games Store, Microsoft Store, PC Game Pass, Xbox app, EA app and Origin, Ubisoft Connect and Uplay, Battle.net, Rockstar Games Launcher, itch.io, and Amazon Games. These remain distinct platforms for filtering and duplicate detection, while PEGI matching treats them as PC editions and preserves the chosen storefront when applying a generic PC result.

Select any non-control area of a library card to open its read-only record of metadata, description, PEGI and HLTB information, notes, and your rating. Use **Edit details** only when you want to change it.

| Field | Purpose |
|---|---|
| **Title** | Display name of the game |
| **Platform** | Choose from the grouped hardware, operating-system, PC storefront and launcher list, or select Custom to enter anything else |
| **PEGI rating** | 3, 7, 12, 16, 18, or blank |
| **Your rating** | Optional private score from 0.5 to 5 stars; hover to preview the score, click a star’s left or right half for half-star increments, or use the keyboard arrows when the control is focused |
| **Collection** | Owned or Wishlisted |
| **Play status** | Backlog, Playing, Completed, Paused, or Abandoned |
| **Format** | Physical, Digital, or Unknown |
| **Cartridge no.** | Mainly used for Evercade cartridge numbering |
| **Publisher** | Optional publisher or label |
| **Release year** | Four-digit release year |
| **Notes** | Edition, condition, storage location, purchase notes, or anything else |
| **Favorite** | Adds a visible favorite marker |

### PEGI-assisted entry

1. Type at least two characters in **Title**.
2. Select **Look up title**.
3. Choose the correct result.
4. Review the filled fields, especially platform and release year.
5. Select **Save game**.

The lookup can fill title, PEGI rating, publisher, release year, descriptors, exact platform release dates, consumer advice, a brief outline, content-specific issues, and other issues. When PEGI divides matches across multiple result pages, Game Kat·a·log retrieves up to the first 10 pages and presents the merged result count above the choices. PEGI has no documented public developer API, so the app reads its public search pages only when you explicitly request a lookup. If PEGI is unavailable or changes its page, manual entry continues to work.

After selecting a result, **PEGI details** opens beneath the form. It contains:

- Content descriptors, also shown as compact badges on the saved game card.
- An amber warning when PEGI identifies in-game purchases or paid random items.
- Every exact platform and release date listed for that PEGI record.
- PEGI's consumer advice, brief outline, content-specific issues, and other issues.
- A link back to the PEGI source search.

The longer material stays collapsed when a saved game is opened, keeping routine edits compact. Select **PEGI details** to reveal it.

### Cover-assisted entry

1. Open **Account Settings** and connect one or both artwork sources: SteamGridDB or TheGamesDB. For TheGamesDB, select **Sign in / register** first, then return and select **View API key**; its key page is available only to signed-in site accounts.
2. Type a title in the game form and select **Request cover**.
3. Review the portrait artwork and game names, then select the correct edition.
4. Or select **Upload cover** to choose your own JPEG, PNG, or WebP image. The preview is local until you save; the server then normalizes it to the same durable cover format used by provider artwork.
5. Save the game. Select **Remove cover** before saving if the match is wrong.

After validation, that provider's disabled field shows **Connected** in green. Secrets are deliberately never returned to the browser. Select **Replace key** or **Replace credentials** to open empty replacement fields.

If a provider cannot be reached while Account Settings loads, its scan action stays disabled and its credential fields remain available instead of displaying a stale connection from an earlier session.

**Request cover** searches every connected source plus HowLongToBeat and labels each result with its provider. HLTB is available only in this deliberate per-game request flow // it is never used for a bulk cover scan. When the game is saved, Game Kat·a·log downloads the selected JPEG, PNG, or WebP into `public/covers/` and stores its public `/covers/...` path, provider, and match title. The card therefore remains independent of the provider CDN and the image is directly accessible through `https://gamekat.net/covers/...`. TheGamesDB and HLTB cards carry a source-credit link.

TheGamesDB's smaller preview derivatives are not reliable, so its chooser rows load the authoritative original artwork directly. This avoids broken preview tiles; selecting and saving a result still stores the app's own optimized durable copy.

### HowLongToBeat-assisted entry

1. Type at least two characters in **Title**.
2. Select **Look up times**.
3. Review the result names and four estimates, then select the correct edition.
4. Save the game. Select **Remove times** before saving if the match is wrong.

The selected result stores Main Story, Main + Sides, Completionist, and All Styles estimates, plus a link back to its HowLongToBeat page. Missing or unreported estimates display as a dash. HLTB lookup is optional: provider or network failure never prevents manual game creation or editing.

### Fill existing games

After connecting SteamGridDB, select **Fill missing covers** in Account Settings. The scanner runs in the background and reports its progress. It only auto-selects artwork when exactly one normalized, exact-title game match exists. Ambiguous editions and non-exact matches remain blank for manual review rather than receiving a likely-wrong cover.

TheGamesDB has its own **Fill with TheGamesDB** action. Its scan is platform-aware and requires exactly one normalized title record for the saved platform. Run it after SteamGridDB to fill remaining gaps; it touches only games that still have no cover.

### Game descriptions

Each game has an editable **Description** field. Select **Look up description** to choose a result from Steam Store or, when connected, TheGamesDB. The selected source is retained for the public Kat·a·log page; editing the text yourself marks it as manual.

Select **Fill descriptions** in Account Settings to scan games with an empty description. Steam Store is always tried first and only one normalized exact-title match is accepted. TheGamesDB is used only as a fallback and only when its existing account key is connected. The scan pauses rather than continuing if TheGamesDB rejects a request or reaches its API limit, so it does not burn through the remaining monthly allowance.

Select **Fill PEGI details** in Account Settings to scan existing games without a saved PEGI source record or extended PEGI metadata. The scanner searches the paginated PEGI catalog and prefers one exact-title result for the game's platform. Ambiguous matches are skipped for manual review. It updates only PEGI information, publisher, and release year; your title, platform, ownership, play state, format, notes, favorite state, and cover remain untouched.

Select **Fill HLTB times** in Account Settings to scan every game without timing data. Automatic matching requires exactly one normalized exact-title result. Platform is not used because HLTB times describe the title rather than a particular physical copy; ambiguous editions remain blank so you can choose one manually.

All metadata, description, and artwork scanners continue in the background while the app is open. Their counters update live, and each successfully enriched game card changes in place. If you manually add a cover, PEGI record, HLTB match, or description while a scanner is running, its queued copy is skipped and your newer choice is preserved. The full grid is not reloaded, the current filters stay active, and the page does not jump. Short network interruptions reconnect automatically and replay missed updates. A server restart stops an unfinished scan; saved results are retained and starting it again scans what is still missing.

---

## Managing games

### Editing

Select **Edit details** on a game. Change any field and select **Save game**.

### Favorites

Select the star in the top-right corner of a card. The change is saved immediately.

### Moving a wishlist game to owned

Wishlisted cards include **Mark owned**. It changes only the collection state; other metadata is preserved.

### Deleting

Open **Edit details**, select **Delete**, and confirm. Deletion is permanent for that account and cannot affect another user's library.

### Dialog behavior

- Select **×**, **Cancel**, press **Escape**, or click directly on the backdrop to close a dialog.
- Selecting text and releasing the pointer outside the dialog does not close it.
- A backdrop close occurs only when the pointer starts and ends on the backdrop.
- Destructive actions use application-themed confirmation dialogs. Game Kat·a·log never invokes the browser's native alert, confirm, or prompt interface.

---

## Account management

Select the username in the top-right corner.

### Add or change avatar

Select the avatar or **Change avatar**, then choose an image. The browser center-crops it to a 512×512 square and compresses it before upload. The stored JPEG is limited to 256 KB. Select **Remove** to return to the username initial.

Downloaded game covers are also normalized automatically: each is stored as a JPEG with a maximum 900-pixel edge and a maximum size of 256 KB. This keeps card, header, and decorative background artwork quick to load without changing its public `/covers/...` availability.

### Change username

Enter the new username and current password, then select **Save account**. Usernames are case-insensitively unique and may contain letters, numbers, dots, dashes, and underscores.

Changing the username does not change ownership of existing games.

### Add or change email

Enter an optional email address and current password, then save. Email addresses are case-insensitively unique. The address is used only to deliver a password-reset link when SMTP has been configured by the local administrator.

### Change password

Enter the current password, enter the new password twice, and save. The new password must contain at least eight characters.

Changing a password invalidates all existing sessions for that account. Sign in again with the new password.

---

## Mobile use

The interface automatically changes for narrow screens:

- Summary cards become a single compact row.
- Filters use two columns.
- Games use one card per row.
- The desktop add button becomes a floating **+** button.
- Account and form dialogs fit within the visible screen and scroll internally.

The app manifest allows supported browsers to install Game Kat·a·log as a standalone home-screen app.

---

## Local administrator panel

On the computer running Game Kat·a·log, open `http://127.0.0.1:3005/admin/`. The panel deliberately refuses LAN and internet clients, including requests arriving through the public nginx proxy.

The compact terminal-style panel provides:

- Live process health (heap, RSS/CPU, app age, and session uptime, refreshed each second) plus whole-database game, account, cover, description, PEGI, HowLongToBeat, rating, catalog, favorite, platform, ownership, media-format, and play-state summaries (refreshed each minute). The compact dashboard stacks related cards by library, community catalog, metadata coverage, runtime, and process/storage health. App age begins with the earliest user or game record; every restart gets a five-second uptime allowance, so only downtime beyond five seconds is deducted and a new session begins with those five seconds included.
- Account inspection, session revocation, manual lock/unlock, and typed-confirmation account deletion. Locking signs the account out everywhere; automatic temporary locks follow five incorrect passwords. The protected `koldKat` account cannot be locked or deleted. Deleting another account also deletes its avatar, games, sessions, integration settings, and saved interface preferences.
- SMTP host, port, transport security, credentials, sender address, and a send-test-email action for password resets. SMTP passwords are never returned to the browser after saving.
- Cross-account private-row search and deliberate, confirmed game deletion.
- Public Kat·a·log factual editing and moderation with candidate, published, and rejected states, confidence checks, supported-provider cover replacement, and independent shared-cover cleanup. Only review candidates have a **Publish** action; a published release can be returned to review or rejected, and a rejected release must first return to review before it can be published.
- Signal announcement drafting, editing, publishing, unpublishing, deletion, and a single pinned notice that stays above the public feed.
- Forum channel administration plus local thread pinning, locking, and removal.
- Patch queue triage, unread state, private replies delivered through Ping, and thread removal.
- An arbitrary release-string editor. Saving writes directly to `VERSION`; reload the main app to see the new string in its header.
- SQLite WAL checkpoint, query-planner optimization, and vacuum actions.
- Hourly compressed live backups stored in the ignored `backups/` directory. One runs at startup and then on the hour; archives are retained for 15 days.

The admin panel is not a normal user account and has no public login screen. Its security boundary is the local machine itself. If remote administration is ever needed, use an explicitly secured tunnel rather than publishing `/admin/` in nginx.

---

## Troubleshooting

### A session expired

If this notice appears after the library was open, sign in again. Sessions expire after two weeks of inactivity, and a password change invalidates all sessions. Opening or refreshing the normal logged-out login screen does not display an expiry notice.

### PEGI lookup failed

The app automatically retries brief PEGI rate-limit or server failures. If PEGI remains unavailable, wait a moment and try again or continue with manual entry. The failure does not prevent saving a game.

If a background PEGI scan encounters five consecutive provider errors, it stops to avoid hammering a failing service. Open Account Settings after PEGI is available again and restart the scan; already enriched games are not repeated.

### The page still shows an older design

Perform a hard refresh so the browser reloads the modular stylesheets and `app.js`.

### The server is not reachable

From the project directory run:

```bash
npm start
```

Confirm port 3005 is free and that the device can reach the host machine.

---

## Data safety

Persistent collection records live in `games.db`; durable cover binaries live separately in `public/covers/`. **Create backup** in the local admin panel intentionally archives the database only and does not include cover files. Do not copy only the main database file during active writes without also accounting for its WAL files.

The application has no cloud synchronization. Fully enriched factual release metadata can enter the app's own public Kat·a·log under the conservative rules described above; personal tracking and account identity remain private. A manual PEGI lookup sends the typed title to PEGI. Starting the PEGI background scanner sends each eligible game's title to PEGI in turn. Cover lookup sends the title and platform to each configured artwork provider // SteamGridDB and/or TheGamesDB // and their individual background scans do the same for eligible games. Public Kat·a·log autocomplete is local to this server. SteamGridDB autocomplete, when configured, also sends the text currently being typed after the third character.
