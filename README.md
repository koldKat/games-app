# Games Shelf

A responsive, local-first game collection manager built with the same lightweight stack as the other household apps: plain Node.js, `better-sqlite3`, and dependency-free HTML/CSS/JavaScript.

## Accounts

Registration and login use scrypt-hashed passwords and random bearer-token sessions with a rolling two-week expiry. Each account has an isolated library and can change its own username or password from the account menu.

New accounts begin with isolated, empty libraries. Existing game ownership is stored by immutable numeric account ID, so renaming an account does not affect its collection.

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

## PEGI lookup

PEGI does not publish a documented public developer API. The add/edit dialog therefore performs a user-triggered search of PEGI's public catalogue and parses only the displayed result metadata. It fills title, rating, publisher, release year, descriptors, and release/platform details. Manual entry remains available if PEGI is offline or changes its page.

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
