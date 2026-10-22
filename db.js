'use strict';

const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'app.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    holder_name TEXT    NOT NULL,
    brand       TEXT    NOT NULL DEFAULT 'visa',
    last4       TEXT    NOT NULL,
    exp_month   INTEGER NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
    exp_year    INTEGER NOT NULL,
    balance     REAL    NOT NULL DEFAULT 0,
    theme       TEXT    NOT NULL DEFAULT 'violet',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    category   TEXT    NOT NULL,
    amount     REAL    NOT NULL CHECK (amount > 0),
    type       TEXT    NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income')),
    spent_at   TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_card   ON transactions(card_id);
  CREATE INDEX IF NOT EXISTS idx_tx_spent  ON transactions(spent_at);
`);

function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

const hasCards = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n > 0;

if (!hasCards) {
  const insertCard = db.prepare(`
    INSERT INTO cards (holder_name, brand, last4, exp_month, exp_year, balance, theme)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTx = db.prepare(`
    INSERT INTO transactions (card_id, title, category, amount, type, spent_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seedCards = [
    ['dailyflutterui', 'visa', '9312', 8, 27, 12450.0, 'teal'],
    ['dailyflutterui', 'mastercard', '2585', 3, 26, 8320.55, 'amber'],
    ['dailyflutterui', 'visa', '7845', 8, 26, 56782.8, 'violet'],
  ];

  const today = new Date();
  const at = (daysAgo, hour) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  const seedTx = [
    // [cardIndex, title, category, amount, type, daysAgo, hour]
    // The first four rows match the reference design exactly.
    [2, 'House Rent', 'Housing', 300.0, 'expense', 0, 10],
    [2, 'Internet Bill', 'Utilities', 85.0, 'expense', 0, 12],
    [1, 'Groceries', 'Groceries', 240.0, 'expense', 1, 9],
    [2, 'Shopping', 'Shopping', 79.99, 'expense', 1, 16],
    [2, 'Electricity', 'Utilities', 132.5, 'expense', 2, 17],
    [0, 'Coffee & Bakery', 'Dining', 24.75, 'expense', 2, 8],
    [1, 'Fuel - Shell', 'Transport', 62.4, 'expense', 3, 18],
    [2, 'Netflix', 'Entertainment', 15.99, 'expense', 4, 11],
    [0, 'Pharmacy', 'Health', 43.2, 'expense', 5, 16],
    [1, 'Sneakers', 'Shopping', 129.0, 'expense', 6, 14],
    [2, 'Freelance Payout', 'Income', 1850.0, 'income', 7, 15],
    [0, 'Uber Rides', 'Transport', 38.6, 'expense', 8, 20],
    [1, 'Dinner - Trattoria', 'Dining', 88.3, 'expense', 9, 20],
    [2, 'Salary', 'Income', 4200.0, 'income', 12, 9],
    [0, 'App Store', 'Entertainment', 9.99, 'expense', 13, 13],
    [1, 'Groceries', 'Groceries', 187.25, 'expense', 16, 10],
    [2, 'Gym Membership', 'Health', 45.0, 'expense', 18, 7],
    [0, 'Water Bill', 'Utilities', 32.15, 'expense', 22, 11],
    [1, 'Headphones', 'Shopping', 199.0, 'expense', 26, 15],
    [2, 'Home Rent', 'Housing', 300.0, 'expense', 34, 10],
    [1, 'Groceries', 'Groceries', 210.4, 'expense', 39, 9],
    [2, 'Salary', 'Income', 4200.0, 'income', 42, 9],
    [0, 'Fuel - Shell', 'Transport', 55.8, 'expense', 46, 18],
    [2, 'Internet Bill', 'Utilities', 85.0, 'expense', 51, 12],
    [1, 'Dinner - Sushi Bar', 'Dining', 74.5, 'expense', 58, 20],
  ];

  const seedAll = transaction(() => {
    const ids = seedCards.map((c) => insertCard.run(...c).lastInsertRowid);
    // Rows pinned to the exact reference timestamps, everything else is relative demo history.
    // Keyed by seedTx index (not title) so shared titles like Groceries are not wrongly pinned.
    const pinned = new Map([
      [0, '2026-10-21 10:00:00'],
      [1, '2026-10-21 12:00:00'],
      [2, '2026-10-20 09:30:00'],
      [3, '2026-10-20 17:20:00'],
      [4, '2026-10-19 18:40:00'],
    ]);
    seedTx.forEach((row, i) => {
      const [ci, title, category, amount, type, days, hour] = row;
      insertTx.run(ids[ci], title, category, amount, type, pinned.get(i) || at(days, hour));
    });
  });
  seedAll();
}

function detectBrand(digits) {
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^6/.test(digits)) return 'discover';
  return 'card';
}

module.exports = { db, transaction, detectBrand, newId: () => crypto.randomUUID() };
