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
    card_color: card.card_color || '#252827',
    card_type: card.card_type || 'Physical Card',
    currency: card.currency || 'USD',
    status: card.status || 'active',
    kind: card.kind || 'card',
    account_kind: card.account_kind || null,
    provider: card.provider || null,
    account_number: card.account_number || null,
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
  const { holder_name, number, exp_month, exp_year, balance, theme, card_color, brand, kind = 'card', account_kind, provider, account_number, currency = 'USD' } = req.body || {};

  if (!holder_name || typeof holder_name !== 'string' || !holder_name.trim()) {
    return bad(res, 'Account holder name is required.');
  }
  if (!['card', 'account'].includes(kind)) return bad(res, 'Choose card or bank/mobile account.');
  const startBalance = Number(balance);
  if (!Number.isFinite(startBalance) || startBalance < 0) return bad(res, 'Invalid balance.');
  if (!/^[A-Z]{3}$/.test(String(currency))) return bad(res, 'Currency must be a 3-letter code.');
  if (kind === 'account') {
    if (!['bank', 'mobile_wallet'].includes(account_kind)) return bad(res, 'Choose a bank account or mobile wallet.');
    if (typeof provider !== 'string' || !provider.trim()) return bad(res, 'Bank or wallet name is required.');
    const accountDigits = String(account_number || '').replace(/[\s-]/g, '');
    if (!/^[A-Za-z0-9]{4,34}$/.test(accountDigits)) return bad(res, 'Enter an account or wallet number with 4-34 letters or digits.');
    const accountColor = typeof card_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(card_color) ? card_color.toLowerCase() : '#252827';
    const info = db.prepare(`INSERT INTO cards (holder_name, brand, last4, exp_month, exp_year, balance, theme, card_color, currency, card_type, kind, account_kind, provider, account_number)
      VALUES (?, 'card', ?, 1, 2099, ?, ?, ?, ?, ?, 'account', ?, ?, ?)`)
      .run(holder_name.trim().slice(0, 60), accountDigits.slice(-4), startBalance, THEMES.includes(theme) ? theme : 'violet', accountColor, currency, account_kind === 'bank' ? 'Bank Account' : 'Mobile Wallet', account_kind, provider.trim().slice(0, 60), accountDigits);
    const account = db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json({ card: sanitizeCard(account) });
  }
  const digits = String(number || '').replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) {
    return bad(res, 'Card number must be 12-19 digits.');
  }
  if (!/^[0-9 -]+$/.test(String(number))) return bad(res, 'Card number must contain digits only, with optional spaces or dashes.');
  const supportedBrands = ['visa', 'mastercard', 'amex', 'discover'];
  if (brand !== undefined && !supportedBrands.includes(brand)) return bad(res, 'Choose a supported card network.');
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

  const color = typeof card_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(card_color)
    ? card_color.toLowerCase()
    : '#252827';

  const storeFull = db.prepare("SELECT value FROM app_settings WHERE key = 'store_full_card_numbers'").get()?.value === 'true';
  const fullDigits = storeFull ? digits : null;
  const info = db
    .prepare(
      `INSERT INTO cards (holder_name, brand, last4, full_number, exp_month, exp_year, balance, theme, card_color, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      holder_name.trim().slice(0, 60),
      brand || detectBrand(digits),
      digits.slice(-4),
      fullDigits,
      m,
      fullYear,
      startBalance,
      THEMES.includes(theme) ? theme : 'violet',
      color,
      currency
    );

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ card: sanitizeCard(card) });
});

app.get('/api/cards/:id/number', (req, res) => {
  const id = Number(req.params.id);
  const card = db.prepare("SELECT id, kind, full_number FROM cards WHERE id = ?").get(id);
  if (!card || card.kind !== 'card') return bad(res, 'Card not found.');
  const storeFull = db.prepare("SELECT value FROM app_settings WHERE key = 'store_full_card_numbers'").get()?.value === 'true';
  if (!storeFull) return bad(res, 'Full card-number storage is turned off.');
  if (!card.full_number) return bad(res, 'This card was saved without its full number. Edit the card to enter it again.');
  res.json({ number: card.full_number });
});

app.put('/api/cards/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  if (!existing) return bad(res, 'Card not found.');

  const { holder_name, exp_month, exp_year, balance, card_color, last4, status, brand, kind, account_kind, provider, account_number, currency, full_number } = req.body || {};
  if (typeof holder_name !== 'string' || !holder_name.trim()) {
    return bad(res, 'Account holder name is required.');
  }
  if (kind !== undefined && kind !== existing.kind) return bad(res, 'An account cannot be converted to a card or vice versa. Delete it and add the correct type.');
  if (existing.kind === 'account') {
    if (!['bank', 'mobile_wallet'].includes(account_kind)) return bad(res, 'Choose a bank account or mobile wallet.');
    if (typeof provider !== 'string' || !provider.trim()) return bad(res, 'Bank or wallet name is required.');
    const accountDigits = String(account_number || '').replace(/[\\s-]/g, '');
    if (!/^[A-Za-z0-9]{4,34}$/.test(accountDigits)) return bad(res, 'Enter an account or wallet number with 4-34 letters or digits.');
    const updatedBalance = Number(balance);
    if (!Number.isFinite(updatedBalance) || updatedBalance < 0) return bad(res, 'Invalid balance.');
    const accountCurrency = currency || existing.currency;
    if (!/^[A-Z]{3}$/.test(String(accountCurrency))) return bad(res, 'Currency must be a 3-letter code.');
    if (card_color !== undefined && (typeof card_color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(card_color))) return bad(res, 'Invalid card color.');
    if (status !== undefined && !['active', 'frozen', 'expired'].includes(status)) return bad(res, 'Invalid account status.');
    db.prepare(`UPDATE cards SET holder_name = ?, account_kind = ?, provider = ?, account_number = ?, last4 = ?, balance = ?, currency = ?, card_color = ?, status = ?, card_type = ? WHERE id = ?`)
      .run(holder_name.trim().slice(0, 60), account_kind, provider.trim().slice(0, 60), accountDigits, accountDigits.slice(-4), updatedBalance, accountCurrency, card_color === undefined ? existing.card_color : card_color.toLowerCase(), status === undefined ? existing.status : status, account_kind === 'bank' ? 'Bank Account' : 'Mobile Wallet', id);
    return res.json({ card: sanitizeCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(id)) });
  }
  const month = Number(exp_month);
  const yearInput = Number(exp_year);
  if (!Number.isInteger(month) || month < 1 || month > 12) return bad(res, 'Invalid expiry month.');
  if (!Number.isInteger(yearInput) || yearInput < 0 || yearInput > 9999) return bad(res, 'Invalid expiry year.');
  const year = yearInput < 100 ? 2000 + yearInput : yearInput;
  const updatedBalance = Number(balance);
  if (!Number.isFinite(updatedBalance) || updatedBalance < 0) return bad(res, 'Invalid balance.');
  if (last4 !== undefined && !/^\d{4}$/.test(String(last4))) return bad(res, 'Last four digits must be exactly 4 digits.');
  if (card_color !== undefined && (typeof card_color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(card_color))) {
    return bad(res, 'Invalid card color.');
  }
  const validStatuses = ['active', 'frozen', 'expired'];
  if (status !== undefined && !validStatuses.includes(status)) return bad(res, 'Invalid card status.');
  const supportedBrands = ['visa', 'mastercard', 'amex', 'discover'];
  if (brand !== undefined && !supportedBrands.includes(brand)) return bad(res, 'Choose a supported card network.');

  const storeFull = db.prepare("SELECT value FROM app_settings WHERE key = 'store_full_card_numbers'").get()?.value === 'true';
  const rawFull = String(full_number || '');
  if (rawFull && !/^[0-9 -]+$/.test(rawFull)) return bad(res, 'Card number must contain digits only, with optional spaces or dashes.');
  const requestedFull = rawFull.replace(/[\s-]/g, '');
  if (rawFull && !/^\d{12,19}$/.test(requestedFull)) return bad(res, 'Full card number must be 12-19 digits.');
  if (rawFull && !storeFull) return bad(res, 'Full-number storage is turned off. Enable it in Profile to save a complete card number.');
  if (rawFull && String(last4) !== requestedFull.slice(-4)) return bad(res, 'Last four digits must match the complete card number.');
  const updatedFull = storeFull && requestedFull ? requestedFull : existing.full_number;
  db.prepare(`UPDATE cards
    SET holder_name = ?, brand = ?, last4 = ?, full_number = ?, exp_month = ?, exp_year = ?, balance = ?, card_color = ?, status = ?
    WHERE id = ?`).run(
      holder_name.trim().slice(0, 60),
      brand === undefined ? existing.brand : brand,
      last4 === undefined ? existing.last4 : String(last4),
      storeFull ? updatedFull : null,
      month,
      year,
      updatedBalance,
      card_color === undefined ? existing.card_color : card_color.toLowerCase(),
      status === undefined ? existing.status : status,
      id
    );
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  res.json({ card: sanitizeCard(card) });
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
          `SELECT t.*, c.brand, c.last4, c.theme, c.kind, c.provider, c.account_kind, c.currency FROM transactions t
           JOIN cards c ON c.id = t.card_id
           WHERE t.card_id = ? ORDER BY t.spent_at DESC, t.id DESC LIMIT ?`
        )
        .all(cardId, limit)
    : db
        .prepare(
          `SELECT t.*, c.brand, c.last4, c.theme, c.kind, c.provider, c.account_kind, c.currency FROM transactions t
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
      `SELECT t.*, c.brand, c.last4, c.theme, c.kind, c.provider, c.account_kind, c.currency FROM transactions t
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

app.get('/api/meta', (req, res) => res.json({
  categories: CATEGORIES,
  themes: THEMES,
  settings: {
    store_full_card_numbers: db.prepare("SELECT value FROM app_settings WHERE key = 'store_full_card_numbers'").get()?.value === 'true',
    display_currency: db.prepare("SELECT value FROM app_settings WHERE key = 'display_currency'").get()?.value || 'USD',
  },
}));

app.put('/api/settings', async (req, res) => {
  const { store_full_card_numbers, display_currency } = req.body || {};
  if (store_full_card_numbers !== undefined && typeof store_full_card_numbers !== 'boolean') return bad(res, 'Full card number setting must be true or false.');
  if (store_full_card_numbers === false) {
    transaction(() => {
      db.prepare('UPDATE cards SET full_number = NULL').run();
      db.prepare("UPDATE app_settings SET value = 'false' WHERE key = 'store_full_card_numbers'").run();
    })();
  }
  if (display_currency !== undefined && !['NPR', 'USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY'].includes(display_currency)) return bad(res, 'Choose a supported display currency.');
  if (display_currency !== undefined) {
    const currencies = db.prepare('SELECT DISTINCT currency FROM cards').all().map((row) => row.currency || 'USD');
    const rates = new Map();
    try {
      for (const source of currencies) {
        if (source === display_currency) continue;
        const response = await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(source)}/${encodeURIComponent(display_currency)}`);
        if (!response.ok) throw new Error(`No exchange rate available for ${source} to ${display_currency}.`);
        const data = await response.json();
        if (!Number.isFinite(data.rate) || data.rate <= 0) throw new Error(`Invalid exchange rate for ${source}.`);
        rates.set(source, data.rate);
      }
    } catch (err) {
      return res.status(502).json({ error: `Could not convert currency: ${err.message}` });
    }
    transaction(() => {
      for (const [source, rate] of rates) {
        db.prepare('UPDATE transactions SET amount = amount * ? WHERE card_id IN (SELECT id FROM cards WHERE currency = ?)').run(rate, source);
        db.prepare('UPDATE cards SET balance = balance * ?, currency = ? WHERE currency = ?').run(rate, display_currency, source);
      }
      db.prepare("UPDATE app_settings SET value = ? WHERE key = 'display_currency'").run(display_currency);
    })();
  }
  if (store_full_card_numbers === true) {
    db.prepare("UPDATE app_settings SET value = 'true' WHERE key = 'store_full_card_numbers'").run();
  }
  res.json({ settings: {
    store_full_card_numbers: db.prepare("SELECT value FROM app_settings WHERE key = 'store_full_card_numbers'").get().value === 'true',
    display_currency: db.prepare("SELECT value FROM app_settings WHERE key = 'display_currency'").get().value,
  } });
});

// SPA fallback for any non-API GET.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => console.log(`Expense manager running at http://localhost:${PORT}`));
