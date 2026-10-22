# Spendly — Expense Management System

A lightweight expense tracker with multi-card management. Node + Express + SQLite, no build step, no MongoDB.

## Run

```bash
npm install
npm start          # http://localhost:3000
```

The SQLite database (`app.db`) is created and seeded with demo cards and transactions on first run. Delete `app.db` to reset.

## Stack

- **Database:** SQLite via Node's built-in `node:sqlite` (zero native dependencies, WAL mode)
- **Backend:** Express 4 — one small route file, no ORM
- **Frontend:** Vanilla HTML/CSS/JS single-page app, no framework or bundler

## Features

- **Dashboard** — total balance, month spend/income, recent transactions, card stack
- **Multi-card management** — add, delete and top up cards; each card gets its own view and colour theme
- **Expense tracking** — record expenses and income, categorised, against any card
- **Expense history** — full transaction list, filterable per card, deletable
- **Statistics** — 6-month spend trend bars and a category donut with legend
- **Responsive** — phone-width column on mobile, framed card on desktop

## Security

- Only the **last 4 digits** of a card number are ever persisted — the full number is validated then discarded server-side
- No PINs, CVVs or auth secrets are stored or logged
- All input is validated server-side (card number length, expiry, positive amounts, known categories)
- Card deletion cascades to its transactions
- Amounts are handled as numbers and only accepted when positive

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/overview` | Balance, month spend/income, category breakdown, monthly trend, recent tx |
| GET | `/api/cards` | All cards (masked) |
| POST | `/api/cards` | Add card — sends full number, only `last4` is stored |
| DELETE | `/api/cards/:id` | Delete card + its transactions |
| POST | `/api/cards/:id/topup` | Add funds, records an income transaction |
| GET | `/api/transactions?card_id=&limit=` | Transaction history |
| POST | `/api/transactions` | Record expense or income |
| DELETE | `/api/transactions/:id` | Delete a transaction and reverse its balance effect |
| GET | `/api/meta` | Categories and theme list |

## Project structure

```
.
├── server.js          Express app, all API routes
├── db.js              SQLite connection, schema, seed data
├── public/
│   ├── index.html     App shell, screens, modals
│   ├── styles.css     All styling
│   └── app.js         Frontend logic, API calls, charts
└── app.db             SQLite database (created on first run, git-ignored)
```

## Screens

Four tabs in the bottom nav:

- **Home** — greeting, card stack, quick actions, recent expenses
- **Cards** — every linked card with balance, top-up and delete
- **Stats** — monthly spend trend and category breakdown
- **Profile** — summary totals and data reset

To reset the demo data, delete `app.db` and restart, or use **Wipe all data** on the Profile tab.
