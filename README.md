# Spendly — Expense Management System

A lightweight, installable expense tracker with multi-card management. The app is served as static files; each browser stores its own records in IndexedDB. No account or shared user database is used.

## Run

```bash
npm install
npm start          # http://localhost:3000 (static hosting only)
```

## Local data and privacy

Card/account records, transactions, and preferences are stored in IndexedDB on the current browser and device. The server only hosts static files and never receives this data. Each browser starts with an empty local database. There is no account or automatic cross-device sync. Clearing browser/site data may permanently remove local records. Full card number storage is an opt-in local preference and remains sensitive data.


The app shell is cached by its service worker for offline loading. External Google Fonts and profile images may be unavailable offline, and installing from the web normally requires HTTPS (localhost is allowed for development). Currency conversion still requests public daily exchange rates from Frankfurter when changing currencies; other user data remains local.

## Stack

- **Local data:** Browser IndexedDB, stored separately per browser/device
- **Static hosting:** Express 4 serves the app files; no frontend framework or build tool

## Features

- **Dashboard** — total balance, month spend/income, recent transactions, card stack
- **Multi-card management** — add, delete and top up cards; each card gets its own view and colour theme
- **Expense tracking** — record expenses and income, categorised, against any card
- **Expense history** — full transaction list, filterable per card, deletable
- **Statistics** — 6-month spend trend bars and a category donut with legend
- **Responsive** — phone-width column on mobile, framed card on desktop

## Security

- User-entered records stay in the current browser's IndexedDB; the frontend does not send them to the server
- Full card number storage is off by default. Card entry always requires a complete 12–19 digit card number; when storage is off, only its last four digits are retained in local browser storage. Enabling storage keeps the complete number locally, unencrypted, so it can be revealed on-device.
- Never enter PINs, CVVs or banking passwords
- Local storage is not a backup: clearing site data or losing the device may remove records

## Project structure

```
.
├── server.js          Express static-file host (no API, no database)
├── public/
│   ├── index.html     App shell, screens, modals
│   ├── styles.css     All styling
│   ├── app.js         UI logic and charts
│   ├── local-store.js IndexedDB data layer
│   ├── sw.js          PWA offline app-shell cache
│   └── manifest.webmanifest
```

## Screens

Four tabs in the bottom nav:

- **Home** — greeting, card stack, quick actions, recent expenses
- **Cards** — every linked card with balance, top-up and delete
- **Stats** — monthly spend trend and category breakdown
- **Profile** — summary totals, local preferences and data reset

Use **Wipe all data** on the Profile tab to clear this browser's local records.
