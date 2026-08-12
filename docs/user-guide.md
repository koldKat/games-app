# Game Kat·a·log - User Guide

Game Kat·a·log is a private, multi-account catalogue for physical and digital video games. It is designed for fast desktop use, compact phone use, and large collections.

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
- The browser remembers a random session token, not the password.
- Sessions remain valid for two weeks and are extended while used.
- Select the username in the top-right corner, then **Log out**, to end the current session.

---

## Dashboard

The ten compact cards summarize the current account and act as one-click major filters:

| Card | Meaning |
|---|---|
| **Total** | Every title in the account's library and clears all filters |
| **Owned** | Games currently owned |
| **Wishlisted** | Games wanted but not yet owned |
| **Unavailable** | Entries unavailable on the tracked platform |
| **Backlog** | Games waiting to be played |
| **Playing** | Games currently in progress |
| **Completed** | Games with play status set to Completed |
| **Paused** | Games intentionally put on hold |
| **Abandoned** | Games no longer being pursued |
| **Favourites** | Games marked as favourites |

Selecting a summary card applies its corresponding library filter and highlights the active card. **Total** clears search and every library filter while retaining the selected sort order.

---

## Finding games

The library updates as filters change.

### Search

Search matches the game title, publisher, and notes. It is case-insensitive and starts after a short typing delay.

### Filters

| Filter | Options |
|---|---|
| **Platform** | Platforms currently present in the account |
| **Collection** | Owned, Wishlisted, or Unavailable |
| **PEGI** | 3, 7, 12, 16, 18, or Unrated |
| **Play status** | Backlog, Playing, Completed, Paused, or Abandoned |
| **Sort by** | Title, platform, PEGI rating, recently added, or cartridge number |

Select **Clear filters** to return to the complete library. Large result sets initially render 120 cards; **Show more** renders the next batch.

### Card and compact views

Use the two view buttons beside **My library**:

- **Card view** gives titles more space and is the default.
- **Compact view** places each game on a denser horizontal row.
- The left card rail uses the PEGI colour: green for 3/7, amber for 12/16, red for 18, and muted grey when unrated.
- The platform appears inside each card as its own label.

The preference is stored in the browser.

The small release string beside **Game Kat·a·log** comes from the project's `VERSION` file and can be changed from the local administrator panel.

---

## Adding a game

Select **Add a game** on desktop or the **+** floating button on mobile.

### Manual entry

Only **Title** and **Platform** are required. Every other field can be added later.

| Field | Purpose |
|---|---|
| **Title** | Display name of the game |
| **Platform** | Choose from the grouped platform catalogue, or select Custom to enter any other platform |
| **PEGI rating** | 3, 7, 12, 16, 18, or blank |
| **Collection** | Owned, Wishlisted, or Unavailable |
| **Play status** | Backlog, Playing, Completed, Paused, or Abandoned |
| **Format** | Physical, Digital, or Unknown |
| **Cartridge no.** | Mainly used for Evercade cartridge numbering |
| **Publisher** | Optional publisher or label |
| **Release year** | Four-digit release year |
| **Notes** | Edition, condition, storage location, purchase notes, or anything else |
| **Favourite** | Adds a visible favourite marker |

### PEGI-assisted entry

1. Type at least two characters in **Title**.
2. Select **Look up title**.
3. Choose the correct result.
4. Review the filled fields, especially platform and release year.
5. Select **Save game**.

The lookup can fill title, PEGI rating, publisher, release year, descriptors, and release/platform information. PEGI has no documented public developer API, so Game Kat·a·log reads its public search result page only when you explicitly request a lookup. If PEGI is unavailable or changes its page, manual entry continues to work.

### Cover-assisted entry

1. Open **Account Settings**, obtain a personal SteamGridDB API key from the linked preferences page, paste it, and select **Connect**.
2. Type a title in the game form and select **Request cover**.
3. Review the portrait artwork and game names, then select the correct edition.
4. Save the game. Select **Remove cover** before saving if the match is wrong.

The chosen cover flows from the centre of the card beneath a dark readability gradient, following the card treatment used by Gamebooks. The image remains hosted by SteamGridDB; Game Kat·a·log stores its URL and match title.

### Fill existing games

After connecting SteamGridDB, select **Fill missing covers** in Account Settings. The scanner runs in the background and reports its progress. It only auto-selects artwork when exactly one normalized, exact-title game match exists. Ambiguous editions and non-exact matches remain blank for manual review rather than receiving a likely-wrong cover.

---

## Managing games

### Editing

Select **Edit details** on a game. Change any field and select **Save game**.

### Favourites

Select the star in the top-right corner of a card. The change is saved immediately.

### Moving a wishlist game to owned

Wishlisted cards include **Mark owned**. It changes only the collection state; other metadata is preserved.

### Deleting

Open **Edit details**, select **Delete**, and confirm. Deletion is permanent for that account and cannot affect another user's library.

### Dialog behaviour

- Select **×**, **Cancel**, press **Escape**, or click directly on the backdrop to close a dialog.
- Selecting text and releasing the pointer outside the dialog does not close it.
- A backdrop close occurs only when the pointer starts and ends on the backdrop.
- Destructive actions use application-themed confirmation dialogs. Game Kat·a·log never invokes the browser's native alert, confirm, or prompt interface.

---

## Account management

Select the username in the top-right corner.

### Add or change avatar

Select the avatar or **Change avatar**, then choose an image. The browser centre-crops it to a 512×512 square and compresses it before upload. The stored JPEG is limited to 256 KB. Select **Remove** to return to the username initial.

### Change username

Enter the new username and current password, then select **Save account**. Usernames are case-insensitively unique and may contain letters, numbers, dots, dashes, and underscores.

Changing the username does not change ownership of existing games.

### Add or change email

Enter an optional email address and current password, then save. Email addresses are case-insensitively unique. Email is stored for account identification and future recovery support; the app does not currently send mail or provide automated password recovery.

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

- Whole-database game, account, cover, session, favourite, platform, ownership, and PEGI summaries.
- Account inspection, session revocation, and typed-confirmation account deletion. Deleting an account also deletes its avatar, games, sessions, and integration settings.
- Cross-account catalogue search and deliberate, confirmed game deletion.
- An arbitrary release-string editor. Saving writes directly to `VERSION`; reload the main app to see the new string in its header.
- SQLite WAL checkpoint, query-planner optimization, and vacuum actions.
- Hourly compressed live backups stored in the ignored `backups/` directory. One runs at startup and then on the hour; archives are retained for 15 days.

The admin panel is not a normal user account and has no public login screen. Its security boundary is the local machine itself. If remote administration is ever needed, use an explicitly secured tunnel rather than publishing `/admin/` in nginx.

---

## Troubleshooting

### A session expired

Sign in again. Sessions expire after two weeks of inactivity. A password change also invalidates all sessions.

### PEGI lookup failed

Continue with manual entry. The failure does not prevent saving a game.

### The page still shows an older design

Perform a hard refresh so the browser reloads `style.css` and `app.js`.

### The server is not reachable

From the project directory run:

```bash
npm start
```

Confirm port 3005 is free and that the device can reach the host machine.

---

## Data safety

All persistent collection data lives in `games.db`. Back up that file while the server is stopped, or use **Create backup** in the local admin panel while it is running. Do not copy only the main file during active writes without also accounting for its WAL files.

The application has no cloud synchronization and does not send the collection to a third party. Only an explicit PEGI lookup sends the typed search title to PEGI.
