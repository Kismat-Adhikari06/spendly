'use strict';

const path = require('path');
const express = require('express');
const { db, transaction, detectBrand } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- helpers ---------------------------------------------------------------

function sanitizeCard(card) {
  return {
    id: card.id,
    holder_name: card.holder_name,
    brand: card.brand,
    last4: card.last4,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    balance: Number(card.balance),
    theme: card.theme,
  };
}

function bad(res, message) {
  return res.status(400).json({ error: message });
}

const THEMES = ['violet', 'teal', 'amber', 'rose', 'slate', 'ocean'];
const CATEGORIES = [
  'Housing', 'Utilities', 'Groceries', 'Dining', 'Transport',
  'Shopping', 'Health', 'Entertainment', 'Income', 'Other',
];

const cardExists = db.prepare('SELECT 1 FROM cards WHERE id = ?');

// ---- cards -----------------------------------------------------------------

app.get('/api/cards', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards ORDER BY id ASC').all();
  res.json({ cards: cards.map(sanitizeCard) });
});

app.post('/api/cards', (req, res) => {
  const { holder_name, number, exp_month, exp_year, balance, theme } = req.body || {};

  if (!holder_name || typeof holder_name !== 'string' || !holder_name.trim()) {
    return bad(res, 'Cardholder name is required.');
  }
  const digits = String(number || '').replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) {
    return bad(res, 'Card number must be 12-19 digits.');
  }
  const m = Number(exp_month);
  const y = Number(exp_year);
  if (!Number.isInteger(m) || m < 1 || m > 12) return bad(res, 'Invalid expiry month.');
  const fullYear = y < 100 ? 2000 + y : y;
  const now = new Date();
  if (fullYear < now.getFullYear() || fullYear > now.getFullYear() + 20) {
    return bad(res, 'Invalid expiry year.');
  }
  if (fullYear === now.getFullYear() && m < now.getMonth() + 1) {
    return bad(res, 'Card is expired.');
  }
  const startBalance = Number(balance);
  if (!Number.isFinite(startBalance) || startBalance < 0) return bad(res, 'Invalid balance.');

  // Only the last four digits are ever persisted.
  const info = db
    .prepare(
      `INSERT INTO cards (holder_name, brand, last4, exp_month, exp_year, balance, theme)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      holder_name.trim().slice(0, 60),
      detectBrand(digits),
      digits.slice(-4),
      m,
      fullYear,
      startBalance,
      THEMES.includes(theme) ? theme : 'violet'
    );

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ card: sanitizeCard(card) });
});

app.delete('/api/cards/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  if (!info.changes) return bad(res, 'Card not found.');
  res.json({ ok: true });
});

app.post('/api/cards/:id/topup', (req, res) => {
  const id = Number(req.params.id);
  const amount = Number((req.body || {}).amount);
  if (!cardExists.get(id)) return bad(res, 'Card not found.');
  if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'Enter a positive amount.');

  transaction(() => {
    db.prepare('UPDATE cards SET balance = balance + ? WHERE id = ?').run(amount, id);
    db.prepare(
      `INSERT INTO transactions (card_id, title, category, amount, type, spent_at)
       VALUES (?, 'Top Up', 'Income', ?, 'income', datetime('now'))`
    ).run(id, amount);
  })();

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  res.json({ card: sanitizeCard(card) });
});

// ---- transactions ----------------------------------------------------------

app.get('/api/transactions', (req, res) => {
  const cardId = Number(req.query.card_id) || 0;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = cardId
    ? db
        .prepare(
          `SELECT t.*, c.brand, c.last4, c.theme FROM transactions t
           JOIN cards c ON c.id = t.card_id
           WHERE t.card_id = ? ORDER BY t.spent_at DESC, t.id DESC LIMIT ?`
        )
        .all(cardId, limit)
    : db
        .prepare(
          `SELECT t.*, c.brand, c.last4, c.theme FROM transactions t
           JOIN cards c ON c.id = t.card_id
           ORDER BY t.spent_at DESC, t.id DESC LIMIT ?`
        )
        .all(limit);
  res.json({ transactions: rows });
});

app.post('/api/transactions', (req, res) => {
  const { card_id, title, category, amount, type, spent_at } = req.body || {};
  const cid = Number(card_id);
  const amt = Number(amount);
  const kind = type === 'income' ? 'income' : 'expense';

  if (!cardExists.get(cid)) return bad(res, 'Select a card.');
  if (!title || typeof title !== 'string' || !title.trim()) return bad(res, 'Title is required.');
  if (!Number.isFinite(amt) || amt <= 0) return bad(res, 'Amount must be positive.');
  if (!CATEGORIES.includes(category)) return bad(res, 'Unknown category.');

  let when = spent_at ? String(spent_at).slice(0, 19).replace('T', ' ') : null;
  if (!when || Number.isNaN(Date.parse(when))) {
    when = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  transaction(() => {
    db.prepare(
      `INSERT INTO transactions (card_id, title, category, amount, type, spent_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(cid, title.trim().slice(0, 60), category, amt, kind, when);
    const delta = kind === 'income' ? amt : -amt;
    db.prepare('UPDATE cards SET balance = balance + ? WHERE id = ?').run(delta, cid);
  })();

  const tx = db
    .prepare(
      `SELECT t.*, c.brand, c.last4, c.theme FROM transactions t
       JOIN cards c ON c.id = t.card_id WHERE t.id = last_insert_rowid()`
    )
    .get();
  res.status(201).json({ transaction: tx });
});

app.delete('/api/transactions/:id', (req, res) => {
  const id = Number(req.params.id);
  transaction(() => {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!tx) return;
    const delta = tx.type === 'income' ? -tx.amount : tx.amount;
    db.prepare('UPDATE cards SET balance = balance + ? WHERE id = ?').run(delta, tx.card_id);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  })();
  res.json({ ok: true });
});

// ---- dashboard / stats -----------------------------------------------------

app.get('/api/overview', (req, res) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='expense' AND spent_at >= ? THEN amount END), 0) AS month_spend,
         COALESCE(SUM(CASE WHEN type='income'  AND spent_at >= ? THEN amount END), 0) AS month_income,
         COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) AS total_spend
       FROM transactions`
    )
    .get(monthStart, monthStart);

  const byCategory = db
    .prepare(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count
       FROM transactions
       WHERE type='expense' AND spent_at >= ?
       GROUP BY category ORDER BY total DESC`
    )
    .all(monthStart);

  const monthly = db
    .prepare(
      `SELECT strftime('%Y-%m', spent_at) AS month,
              SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS spend,
              SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income
       FROM transactions
       WHERE spent_at >= date('now', '-6 months', 'start of month')
       GROUP BY month ORDER BY month ASC`
    )
    .all();

  const recent = db
    .prepare(
      `SELECT t.*, c.brand, c.last4, c.theme FROM transactions t
       JOIN cards c ON c.id = t.card_id
       ORDER BY t.spent_at DESC, t.id DESC LIMIT 6`
    )
    .all();

  const cardCount = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  const totalBalance = db.prepare('SELECT COALESCE(SUM(balance),0) AS b FROM cards').get().b;

  res.json({
    total_balance: Number(totalBalance),
    month_spend: Number(totals.month_spend),
    month_income: Number(totals.month_income),
    total_spend: Number(totals.total_spend),
    card_count: cardCount,
    by_category: byCategory.map((r) => ({ ...r, total: Number(r.total) })),
    monthly: monthly.map((r) => ({ ...r, spend: Number(r.spend), income: Number(r.income) })),
    recent,
  });
});

app.get('/api/meta', (req, res) => res.json({ categories: CATEGORIES, themes: THEMES }));

// SPA fallback for any non-API GET.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => console.log(`Expense manager running at http://localhost:${PORT}`));
