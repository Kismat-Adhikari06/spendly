# Spendly — Expense Management System

A lightweight, installable expense tracker with multi-card management. The app is served as static files; each browser stores its own records in IndexedDB. No account or shared user database is used.

## Run

```bash
npm install
npm start          # http://localhost:3000 (static hosting + legacy API routes unused by PWA UI)
```

## Local data and privacy

Card/account records, transactions, and preferences are stored in IndexedDB on the current browser and device. The frontend does not send this data to the Express/SQLite server. Each browser starts with an empty local database; existing server-side SQLite data is not automatically imported. There is no account or automatic cross-device sync. Clearing browser/site data may permanently remove local records. Full card number storage is an opt-in local preference and remains sensitive data.

The existing SQLite backend and its database file remain in the repository for now, but the PWA frontend does not use them for user records.

The app shell is cached by its service worker for offline loading. External Google Fonts and profile images may be unavailable offline, and installing from the web normally requires HTTPS (localhost is allowed for development). Currency conversion still requests public daily exchange rates from Frankfurter when changing currencies; other user data remains local.

## Stack

- **Local data:** Browser IndexedDB, stored separately per browser/device
- **Static hosting:** Express 4 serves the app files; no frontend framework or build tool
- **Legacy backend:** SQLite via Node's built-in `node:sqlite` remains available in this repository, but is not used by the PWA frontend

## Features

- **Dashboard** — total balance, month spend/income, recent transactions, card stack
- **Multi-card management** — add, delete and top up cards; each card gets its own view and colour theme
- **Expense tracking** — record expenses and income, categorised, against any card
- **Expense history** — full transaction list, filterable per card, deletable
- **Statistics** — 6-month spend trend bars and a category donut with legend
- **Responsive** — phone-width column on mobile, framed card on desktop

## Security

- User-entered records stay in the current browser's IndexedDB; the frontend does not send them to the server
- Full card number storage is off by default; if enabled, full numbers are stored unencrypted in local browser storage
- Never enter PINs, CVVs or banking passwords
- Local storage is not a backup: clearing site data or losing the device may remove records

## Project structure

```
.
├── server.js          Express static-file host and legacy API
├── db.js              Legacy SQLite schema and seed data (unused by PWA frontend)
├── public/
│   ├── index.html     App shell, screens, modals
│   ├── styles.css     All styling
│   ├── app.js         UI logic and charts
│   ├── local-store.js IndexedDB data layer
│   ├── sw.js          PWA offline app-shell cache
│   └── manifest.webmanifest
└── app.db             Legacy SQLite database, git-ignored
```

## Screens

Four tabs in the bottom nav:

- **Home** — greeting, card stack, quick actions, recent expenses
- **Cards** — every linked card with balance, top-up and delete
- **Stats** — monthly spend trend and category breakdown
- **Profile** — summary totals, local preferences and data reset

Use **Wipe all data** on the Profile tab to clear this browser's local records. This does not delete or migrate records in the legacy server-side SQLite database.
