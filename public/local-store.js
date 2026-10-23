'use strict';

(() => {
  const DB_NAME = 'spendly-local';
  const DB_VERSION = 1;
  const CATEGORIES = ['Housing', 'Utilities', 'Groceries', 'Dining', 'Transport', 'Shopping', 'Health', 'Entertainment', 'Income', 'Other'];
  const THEMES = ['violet', 'teal', 'amber', 'rose', 'slate', 'ocean'];
  const SUPPORTED_BRANDS = ['visa', 'mastercard', 'amex', 'discover'];
  const CURRENCIES = ['NPR', 'USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY'];
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('transactions')) db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open this device\'s local database.'));
      request.onblocked = () => reject(new Error('Close other Spendly tabs to finish the local database update.'));
    });
    return databasePromise;
  }

  async function request(storeName, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, operation.mode || 'readonly');
      let result;
      const req = operation.run(tx.objectStore(storeName));
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error || new Error('Could not access local data.'));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Local database operation failed.'));
      tx.onabort = () => reject(tx.error || new Error('Local database operation failed.'));
    });
  }

  const all = (store) => request(store, { run: (objectStore) => objectStore.getAll() });
  const get = (store, key) => request(store, { run: (objectStore) => objectStore.get(key) });
  const put = (store, value) => request(store, { mode: 'readwrite', run: (objectStore) => objectStore.put(value) });
  const add = (store, value) => request(store, { mode: 'readwrite', run: (objectStore) => objectStore.add(value) });
  const remove = (store, key) => request(store, { mode: 'readwrite', run: (objectStore) => objectStore.delete(key) });

  async function setting(key, fallback) {
    const record = await get('settings', key);
    return record ? record.value : fallback;
  }

  async function saveSetting(key, value) {
    await put('settings', { key, value });
  }

  function publicCard(card) {
    const { full_number, ...safeCard } = card;
    return safeCard;
  }

  const LOGO_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
  const isValidLogo = (value) => typeof value === 'string' && value.length <= 400_000 && LOGO_PATTERN.test(value);

  function fail(message) {
    throw new Error(message);
  }

  function amount(value, label = 'Invalid amount.') {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) fail(label);
    return number;
  }

  function balance(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) fail('Invalid balance.');
    return number;
  }

  function dateString(value) {
    const candidate = value ? String(value).slice(0, 19).replace('T', ' ') : '';
    if (!candidate || Number.isNaN(Date.parse(candidate))) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    return candidate;
  }

  function transactionWithCard(tx, card) {
    return { ...tx, brand: card.brand, last4: card.last4, theme: card.theme, kind: card.kind, provider: card.provider, account_kind: card.account_kind, currency: card.currency };
  }

  async function cardRows() {
    return (await all('cards')).sort((a, b) => a.id - b.id);
  }

  async function transactionRows(cardId = 0, limit = 100) {
    const [transactions, cards] = await Promise.all([all('transactions'), cardRows()]);
    const byId = new Map(cards.map((card) => [card.id, card]));
    return transactions
      .filter((tx) => (!cardId || tx.card_id === cardId) && byId.has(tx.card_id))
      .sort((a, b) => b.spent_at.localeCompare(a.spent_at) || b.id - a.id)
      .slice(0, limit)
      .map((tx) => transactionWithCard(tx, byId.get(tx.card_id)));
  }

  async function createCard(body) {
    const { holder_name, number, exp_month, exp_year, balance: openingBalance, theme, card_color, brand, kind = 'card', account_kind, provider, account_number, currency = 'USD' } = body;
    if (typeof holder_name !== 'string' || !holder_name.trim()) fail('Account holder name is required.');
    if (!['card', 'account'].includes(kind)) fail('Choose card or bank/mobile account.');
    const startingBalance = Number(openingBalance);
    if (!Number.isFinite(startingBalance) || startingBalance < 0) fail('Invalid balance.');
    if (!/^[A-Z]{3}$/.test(String(currency))) fail('Currency must be a 3-letter code.');

    const card = {
      holder_name: holder_name.trim().slice(0, 60), brand: 'visa', last4: '', exp_month: 1, exp_year: 2099,
      balance: startingBalance, theme: THEMES.includes(theme) ? theme : 'violet',
      card_color: typeof card_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(card_color) ? card_color.toLowerCase() : '#252827',
      card_type: 'Physical Card', currency, status: 'active', kind, account_kind: null, provider: null, account_number: null, logo: null,
    };

    if (kind === 'account') {
      if (!['bank', 'mobile_wallet'].includes(account_kind)) fail('Choose a bank account or mobile wallet.');
      if (typeof provider !== 'string' || !provider.trim()) fail('Bank or wallet name is required.');
      const accountDigits = String(account_number || '').replace(/[\s-]/g, '');
      if (!/^[A-Za-z0-9]{4,34}$/.test(accountDigits)) fail('Enter an account or wallet number with 4-34 letters or digits.');
      card.brand = 'card';
      card.last4 = accountDigits.slice(-4);
      card.card_type = account_kind === 'bank' ? 'Bank Account' : 'Mobile Wallet';
      card.account_kind = account_kind;
      card.provider = provider.trim().slice(0, 60);
      card.account_number = accountDigits;
      if (body.logo) {
        if (!isValidLogo(body.logo)) fail('Choose a valid logo image.');
        card.logo = body.logo;
      }
    } else {
      const storeFull = await setting('store_full_card_numbers', false);
      const rawNumber = String(number || '').trim();
      const digits = rawNumber.replace(/[\s-]/g, '');
      if (!/^[0-9 -]+$/.test(rawNumber) || !/^\d{12,19}$/.test(digits) || !isValidCardNumber(digits)) fail('Enter a valid complete card number with 12-19 digits.');
      card.full_number = storeFull ? digits : null;
      if (brand !== undefined && !SUPPORTED_BRANDS.includes(brand)) fail('Choose a supported card network.');
      const month = Number(exp_month);
      const yearInput = Number(exp_year);
      if (!Number.isInteger(month) || month < 1 || month > 12) fail('Invalid expiry month.');
      const fullYear = yearInput < 100 ? 2000 + yearInput : yearInput;
      const now = new Date();
      if (!Number.isInteger(yearInput) || fullYear < now.getFullYear() || fullYear > now.getFullYear() + 20) fail('Invalid expiry year.');
      if (fullYear === now.getFullYear() && month < now.getMonth() + 1) fail('Card is expired.');
      card.brand = brand || detectBrand(digits);
      card.last4 = digits.slice(-4);
      card.exp_month = month;
      card.exp_year = fullYear;
    }
    card.id = await add('cards', card);
    return { card: publicCard(card) };
  }

  function isValidCardNumber(digits) {
    let sum = 0;
    let doubleDigit = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let digit = Number(digits[index]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  }

  function detectBrand(digits) {
    if (/^4/.test(digits)) return 'visa';
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'mastercard';
    if (/^3[47]/.test(digits)) return 'amex';
    if (/^6/.test(digits)) return 'discover';
    return 'card';
  }

  async function updateCard(id, body) {
    const card = await get('cards', id);
    if (!card) fail('Card not found.');
    if (typeof body.holder_name !== 'string' || !body.holder_name.trim()) fail('Account holder name is required.');
    if (body.kind !== undefined && body.kind !== card.kind) fail('An account cannot be converted to a card or vice versa. Delete it and add the correct type.');
    const updated = { ...card, holder_name: body.holder_name.trim().slice(0, 60), balance: balance(body.balance) };
    if (body.card_color !== undefined) {
      if (typeof body.card_color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.card_color)) fail('Invalid card color.');
      updated.card_color = body.card_color.toLowerCase();
    }
    if (body.status !== undefined) {
      if (!['active', 'frozen', 'expired'].includes(body.status)) fail(`Invalid ${card.kind} status.`);
      updated.status = body.status;
    }

    if (card.kind === 'account') {
      if (!['bank', 'mobile_wallet'].includes(body.account_kind)) fail('Choose a bank account or mobile wallet.');
      if (typeof body.provider !== 'string' || !body.provider.trim()) fail('Bank or wallet name is required.');
      const digits = String(body.account_number || '').replace(/[\s-]/g, '');
      if (!/^[A-Za-z0-9]{4,34}$/.test(digits)) fail('Enter an account or wallet number with 4-34 letters or digits.');
      const nextCurrency = body.currency || card.currency;
      if (!/^[A-Z]{3}$/.test(String(nextCurrency))) fail('Currency must be a 3-letter code.');
      Object.assign(updated, { account_kind: body.account_kind, provider: body.provider.trim().slice(0, 60), account_number: digits, last4: digits.slice(-4), currency: nextCurrency, card_type: body.account_kind === 'bank' ? 'Bank Account' : 'Mobile Wallet' });
      if (body.logo !== undefined) {
        if (body.logo && !isValidLogo(body.logo)) fail('Choose a valid logo image.');
        updated.logo = body.logo || null;
      }
    } else {
      const month = Number(body.exp_month);
      const yearInput = Number(body.exp_year);
      if (!Number.isInteger(month) || month < 1 || month > 12) fail('Invalid expiry month.');
      if (!Number.isInteger(yearInput) || yearInput < 0 || yearInput > 9999) fail('Invalid expiry year.');
      const year = yearInput < 100 ? 2000 + yearInput : yearInput;
      if (body.brand !== undefined && !SUPPORTED_BRANDS.includes(body.brand)) fail('Choose a supported card network.');
      if (body.last4 !== undefined && !/^\d{4}$/.test(String(body.last4))) fail('Last four digits must be exactly 4 digits.');
      const fullStorage = await setting('store_full_card_numbers', false);
      const rawFull = String(body.full_number || '');
      if (rawFull && !/^[0-9 -]+$/.test(rawFull)) fail('Card number must contain digits only, with optional spaces or dashes.');
      const digits = rawFull.replace(/[\s-]/g, '');
      let last4 = body.last4 === undefined ? card.last4 : String(body.last4);
      if (rawFull) {
        if (!/^\d{12,19}$/.test(digits) || !isValidCardNumber(digits)) fail('Enter a valid complete card number with 12-19 digits.');
        if (last4 !== digits.slice(-4)) fail('Last four digits must match the complete card number.');
        updated.full_number = fullStorage ? digits : null;
      } else if (!fullStorage) {
        updated.full_number = null;
      } else if (last4 !== card.last4) {
        fail('Enter the complete card number to change its last four digits.');
      }
      updated.last4 = last4;
      updated.exp_month = month;
      updated.exp_year = year;
      if (body.brand !== undefined) updated.brand = body.brand;
    }
    await put('cards', updated);
    return { card: publicCard(updated) };
  }

  async function deleteCard(id) {
    const cards = await cardRows();
    if (!cards.some((card) => card.id === id)) fail('Card not found.');
    const txs = await all('transactions');
    await Promise.all(txs.filter((tx) => tx.card_id === id).map((tx) => remove('transactions', tx.id)));
    await remove('cards', id);
    return { ok: true };
  }

  async function createTransaction(body) {
    const cardId = Number(body.card_id);
    const card = await get('cards', cardId);
    if (!card) fail('Select a card.');
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) fail('Title is required.');
    const txAmount = amount(body.amount, 'Amount must be positive.');
    if (!CATEGORIES.includes(body.category)) fail('Unknown category.');
    const type = body.type === 'income' ? 'income' : 'expense';
    const tx = { card_id: cardId, title: body.title.trim().slice(0, 60), category: body.category, amount: txAmount, type, spent_at: dateString(body.spent_at) };
    tx.id = await add('transactions', tx);
    card.balance += type === 'income' ? txAmount : -txAmount;
    await put('cards', card);
    return { transaction: transactionWithCard(tx, card) };
  }

  async function updateTransaction(id, body) {
    const tx = await get('transactions', id);
    if (!tx) fail('Transaction not found.');
    const cardId = Number(body.card_id);
    const nextCard = await get('cards', cardId);
    if (!nextCard) fail('Select a card.');
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) fail('Title is required.');
    const nextAmount = amount(body.amount, 'Amount must be positive.');
    const nextCategory = body.category;
    if (!CATEGORIES.includes(nextCategory)) fail('Unknown category.');
    const nextType = body.type === 'income' ? 'income' : 'expense';
    const previousCard = tx.card_id === cardId ? nextCard : await get('cards', tx.card_id);
    if (previousCard && previousCard.id !== nextCard.id) {
      previousCard.balance += tx.type === 'income' ? -tx.amount : tx.amount;
      await put('cards', previousCard);
    }
    nextCard.balance += (tx.card_id === cardId ? (tx.type === 'income' ? -tx.amount : tx.amount) : 0)
      + (nextType === 'income' ? nextAmount : -nextAmount);
    await put('cards', nextCard);
    const updated = {
      ...tx,
      card_id: cardId,
      title: body.title.trim().slice(0, 60),
      category: nextCategory,
      amount: nextAmount,
      type: nextType,
      spent_at: dateString(body.spent_at),
    };
    await put('transactions', updated);
    return { transaction: transactionWithCard(updated, nextCard) };
  }

  async function deleteTransaction(id) {
    const tx = await get('transactions', id);
    if (tx) {
      const card = await get('cards', tx.card_id);
      if (card) {
        card.balance += tx.type === 'income' ? -tx.amount : tx.amount;
        await put('cards', card);
      }
      await remove('transactions', id);
    }
    return { ok: true };
  }

  async function topUp(id, value) {
    const card = await get('cards', id);
    if (!card) fail('Card not found.');
    const topUpAmount = amount(value, 'Enter a positive amount.');
    card.balance += topUpAmount;
    await put('cards', card);
    const tx = { card_id: id, title: 'Top Up', category: 'Income', amount: topUpAmount, type: 'income', spent_at: dateString() };
    tx.id = await add('transactions', tx);
    return { card: publicCard(card) };
  }

  async function overview() {
    const [cards, transactions] = await Promise.all([cardRows(), all('transactions')]);
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const thisMonth = transactions.filter((tx) => tx.spent_at >= monthStart);
    const expensesThisMonth = thisMonth.filter((tx) => tx.type === 'expense');
    const monthSpend = expensesThisMonth.reduce((sum, tx) => sum + tx.amount, 0);
    const monthIncome = thisMonth.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const totalSpend = transactions.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
    const byCategory = new Map();
    for (const tx of expensesThisMonth) {
      const entry = byCategory.get(tx.category) || { category: tx.category, total: 0, count: 0 };
      entry.total += tx.amount;
      entry.count += 1;
      byCategory.set(tx.category, entry);
    }
    const monthlyMap = new Map();
    for (const tx of transactions) {
      if (tx.spent_at < new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10)) continue;
      const month = tx.spent_at.slice(0, 7);
      const entry = monthlyMap.get(month) || { month, spend: 0, income: 0 };
      entry[tx.type === 'income' ? 'income' : 'spend'] += tx.amount;
      monthlyMap.set(month, entry);
    }
    const byId = new Map(cards.map((card) => [card.id, card]));
    const recent = transactions.filter((tx) => byId.has(tx.card_id))
      .sort((a, b) => b.spent_at.localeCompare(a.spent_at) || b.id - a.id)
      .slice(0, 6).map((tx) => transactionWithCard(tx, byId.get(tx.card_id)));
    return {
      total_balance: cards.reduce((sum, card) => sum + Number(card.balance || 0), 0),
      month_spend: monthSpend,
      month_income: monthIncome,
      total_spend: totalSpend,
      card_count: cards.length,
      by_category: [...byCategory.values()].sort((a, b) => b.total - a.total),
      monthly: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
      recent,
    };
  }

  async function convertCurrency(target) {
    if (!CURRENCIES.includes(target)) fail('Choose a supported display currency.');
    const cards = await cardRows();
    const transactions = await all('transactions');
    const sources = [...new Set(cards.map((card) => card.currency || 'USD'))];
    const rates = new Map();
    for (const source of sources) {
      if (source === target) continue;
      const response = await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(source)}/${encodeURIComponent(target)}`);
      if (!response.ok) fail(`No exchange rate available for ${source} to ${target}.`);
      const result = await response.json();
      if (!Number.isFinite(result.rate) || result.rate <= 0) fail(`Invalid exchange rate for ${source}.`);
      rates.set(source, result.rate);
    }
    const changedCards = [];
    const convertedTransactions = [];
    for (const card of cards) {
      const rate = rates.get(card.currency || 'USD');
      if (rate === undefined) continue;
      changedCards.push({ ...card, balance: card.balance * rate, currency: target });
      convertedTransactions.push(...transactions.filter((item) => item.card_id === card.id).map((tx) => ({ ...tx, amount: tx.amount * rate })));
    }
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['cards', 'transactions', 'settings'], 'readwrite');
      for (const card of changedCards) tx.objectStore('cards').put(card);
      for (const item of convertedTransactions) tx.objectStore('transactions').put(item);
      tx.objectStore('settings').put({ key: 'display_currency', value: target });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not convert local currency values.'));
      tx.onabort = () => reject(tx.error || new Error('Could not convert local currency values.'));
    });
  }

  async function api(path, options = {}) {
    const method = options.method || 'GET';
    const body = options.body || {};
    const route = new URL(path, location.origin);
    const pathname = route.pathname;
    let match;

    if (method === 'GET' && pathname === '/api/meta') {
      return { categories: CATEGORIES, themes: THEMES, settings: { store_full_card_numbers: await setting('store_full_card_numbers', false), display_currency: await setting('display_currency', 'NPR'), profile_name: await setting('profile_name', ''), profile_first_name: await setting('profile_first_name', ''), profile_last_name: await setting('profile_last_name', ''), profile_name_prompted: await setting('profile_name_prompted', false), profile_photo: await setting('profile_photo', ''), profile_setup_version: await setting('profile_setup_version', 0) } };
    }
    if (method === 'GET' && pathname === '/api/cards') return { cards: (await cardRows()).map(publicCard) };
    if (method === 'POST' && pathname === '/api/cards') return createCard(body);
    if (method === 'GET' && (match = pathname.match(/^\/api\/cards\/(\d+)\/number$/))) {
      if (!await setting('store_full_card_numbers', false)) fail('Full card-number storage is turned off.');
      const card = await get('cards', Number(match[1]));
      if (!card || card.kind !== 'card') fail('Card not found.');
      if (!card.full_number) fail('This card was saved without its full number. Edit the card to enter it again.');
      return { number: card.full_number };
    }
    if (method === 'PUT' && (match = pathname.match(/^\/api\/cards\/(\d+)$/))) return updateCard(Number(match[1]), body);
    if (method === 'DELETE' && (match = pathname.match(/^\/api\/cards\/(\d+)$/))) return deleteCard(Number(match[1]));
    if (method === 'POST' && (match = pathname.match(/^\/api\/cards\/(\d+)\/topup$/))) return topUp(Number(match[1]), body.amount);
    if (method === 'GET' && pathname === '/api/transactions') {
      const cardId = Number(route.searchParams.get('card_id')) || 0;
      const limit = Math.min(Number(route.searchParams.get('limit')) || 100, 500);
      return { transactions: await transactionRows(cardId, limit) };
    }
    if (method === 'POST' && pathname === '/api/transactions') return createTransaction(body);
    if (method === 'PUT' && (match = pathname.match(/^\/api\/transactions\/(\d+)$/))) return updateTransaction(Number(match[1]), body);
    if (method === 'DELETE' && (match = pathname.match(/^\/api\/transactions\/(\d+)$/))) return deleteTransaction(Number(match[1]));
    if (method === 'GET' && pathname === '/api/overview') return overview();
    if (method === 'PUT' && pathname === '/api/settings') {
      if (body.store_full_card_numbers !== undefined) {
        if (typeof body.store_full_card_numbers !== 'boolean') fail('Full card number setting must be true or false.');
        await saveSetting('store_full_card_numbers', body.store_full_card_numbers);
        if (!body.store_full_card_numbers) {
          const cards = await cardRows();
          for (const card of cards) {
            if (card.kind === 'card') {
              card.full_number = null;
              await put('cards', card);
            }
          }
        }
      }
      if (body.display_currency !== undefined) await convertCurrency(body.display_currency);
      if (body.profile_name !== undefined) {
        if (typeof body.profile_name !== 'string') fail('Name must be text.');
        await saveSetting('profile_name', body.profile_name.trim().slice(0, 40));
      }
      if (body.profile_first_name !== undefined) {
        if (typeof body.profile_first_name !== 'string' || body.profile_first_name.length > 30) fail('First name must be 30 characters or fewer.');
        await saveSetting('profile_first_name', body.profile_first_name.trim());
      }
      if (body.profile_last_name !== undefined) {
        if (typeof body.profile_last_name !== 'string' || body.profile_last_name.length > 30) fail('Last name must be 30 characters or fewer.');
        await saveSetting('profile_last_name', body.profile_last_name.trim());
      }
      if (body.profile_name_prompted !== undefined) {
        if (typeof body.profile_name_prompted !== 'boolean') fail('Name prompt status must be true or false.');
        await saveSetting('profile_name_prompted', body.profile_name_prompted);
      }
      if (body.profile_photo !== undefined) {
        if (typeof body.profile_photo !== 'string' || body.profile_photo.length > 2_000_000
          || (body.profile_photo && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(body.profile_photo))) {
          fail('Choose a supported image smaller than 1.5 MB.');
        }
        await saveSetting('profile_photo', body.profile_photo);
      }
      if (body.profile_setup_version !== undefined && body.profile_setup_version !== 2) fail('Unsupported profile setup version.');
      if (body.profile_setup_version === 2
        && (!String(body.profile_first_name || '').trim() || !String(body.profile_last_name || '').trim())) {
        fail('Enter your first and last name to complete your profile.');
      }
      if (body.profile_name !== undefined && !await setting('profile_setup_version', 0)) await saveSetting('profile_setup_version', 1);
      if (body.profile_setup_version !== undefined) {
        if (body.profile_setup_version !== 2) fail('Unsupported profile setup version.');
        await saveSetting('profile_setup_version', 2);
      }
      if (body.profile_setup_version === 2 && body.profile_name_prompted === undefined) await saveSetting('profile_name_prompted', true);
      return { settings: { store_full_card_numbers: await setting('store_full_card_numbers', false), display_currency: await setting('display_currency', 'NPR'), profile_name: await setting('profile_name', ''), profile_first_name: await setting('profile_first_name', ''), profile_last_name: await setting('profile_last_name', ''), profile_name_prompted: await setting('profile_name_prompted', false), profile_photo: await setting('profile_photo', ''), profile_setup_version: await setting('profile_setup_version', 0) } };
    }
    return fail(`Unsupported local action: ${method} ${pathname}`);
  }

  window.spendlyLocalStore = {
    api,
    open: openDatabase,
    async exportBackup() {
      const [cards, transactions, settings] = await Promise.all([all('cards'), all('transactions'), all('settings')]);
      return {
        format: 'spendly-local-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        cards,
        transactions,
        settings,
      };
    },
    async importBackup(backup) {
      if (!backup || backup.format !== 'spendly-local-backup' || backup.version !== 1
        || !Array.isArray(backup.cards) || !Array.isArray(backup.transactions) || !Array.isArray(backup.settings)) {
        fail('This is not a supported Spendly backup file.');
      }
      const cardIds = new Set();
      for (const card of backup.cards) {
        if (!card || !Number.isSafeInteger(card.id) || card.id < 1 || cardIds.has(card.id)
          || typeof card.holder_name !== 'string' || !Number.isFinite(card.balance) || card.balance < 0
          || typeof card.last4 !== 'string' || !/^[A-Z]{3}$/.test(String(card.currency || 'USD'))) {
          fail('The backup contains invalid card data.');
        }
        if (card.logo !== undefined && card.logo !== null && !isValidLogo(card.logo)) fail('The backup contains an invalid logo.');
        cardIds.add(card.id);
      }
      const storeFullNumbers = backup.settings.find((item) => item?.key === 'store_full_card_numbers')?.value === true;
      for (const card of backup.cards) {
        if (card.kind === 'card' && card.full_number !== undefined && card.full_number !== null) {
          if (typeof card.full_number !== 'string' || !/^\d{12,19}$/.test(card.full_number) || !isValidCardNumber(card.full_number)
            || card.full_number.slice(-4) !== card.last4 || !storeFullNumbers) {
            fail('The backup contains invalid or disallowed full card-number data.');
          }
        }
      }
      const transactionIds = new Set();
      for (const item of backup.transactions) {
        if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || transactionIds.has(item.id)
          || !cardIds.has(item.card_id) || !Number.isFinite(item.amount) || item.amount <= 0
          || !['expense', 'income'].includes(item.type) || typeof item.title !== 'string' || typeof item.category !== 'string') {
          fail('The backup contains invalid transaction data.');
        }
        transactionIds.add(item.id);
      }
      const settingKeys = new Set();
      for (const item of backup.settings) {
        if (!item || !['store_full_card_numbers', 'display_currency', 'profile_name', 'profile_first_name', 'profile_last_name', 'profile_name_prompted', 'profile_photo', 'profile_setup_version'].includes(item.key) || settingKeys.has(item.key)) {
          fail('The backup contains invalid preference data.');
        }
        if (item.key === 'store_full_card_numbers' && typeof item.value !== 'boolean') fail('The backup contains an invalid card-number preference.');
        if (item.key === 'display_currency' && (typeof item.value !== 'string' || !CURRENCIES.includes(item.value))) fail('The backup contains an invalid currency preference.');
        if (item.key === 'profile_name' && (typeof item.value !== 'string' || item.value.length > 40)) fail('The backup contains an invalid profile name.');
        if (item.key === 'profile_first_name' && (typeof item.value !== 'string' || item.value.length > 30)) fail('The backup contains an invalid first name.');
        if (item.key === 'profile_last_name' && (typeof item.value !== 'string' || item.value.length > 30)) fail('The backup contains an invalid last name.');
        if (item.key === 'profile_name_prompted' && typeof item.value !== 'boolean') fail('The backup contains an invalid name-prompt preference.');
        if (item.key === 'profile_photo' && (typeof item.value !== 'string' || item.value.length > 2_000_000
          || (item.value && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(item.value)))) fail('The backup contains an invalid profile photo.');
        if (item.key === 'profile_setup_version' && ![1, 2].includes(item.value)) fail('The backup contains an invalid profile setup version.');
        if (item.key === 'profile_setup_version' && item.value === 2
          && (!backup.settings.some((entry) => entry.key === 'profile_first_name' && typeof entry.value === 'string' && entry.value.trim())
            || !backup.settings.some((entry) => entry.key === 'profile_last_name' && typeof entry.value === 'string' && entry.value.trim()))) {
          fail('The backup is missing a first or last name.');
        }
        settingKeys.add(item.key);
      }
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['cards', 'transactions', 'settings'], 'readwrite');
        for (const store of ['cards', 'transactions', 'settings']) tx.objectStore(store).clear();
        for (const card of backup.cards) tx.objectStore('cards').put(card);
        for (const item of backup.transactions) tx.objectStore('transactions').put(item);
        for (const item of backup.settings) tx.objectStore('settings').put(item);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not restore the local backup.'));
        tx.onabort = () => reject(tx.error || new Error('Could not restore the local backup.'));
      });
    },
    async clearAll() {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['cards', 'transactions', 'settings'], 'readwrite');
        tx.objectStore('cards').clear();
        tx.objectStore('transactions').clear();
        tx.objectStore('settings').clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not clear local data.'));
        tx.onabort = () => reject(tx.error || new Error('Could not clear local data.'));
      });
    },
  };
})();
