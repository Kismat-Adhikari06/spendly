'use strict';

/* ------------------------------------------------------------------ state */

const state = {
  cards: [],
  activeCardId: null,
  overview: null,
  categories: [],
  themes: [],
};

const $ = (sel) => document.querySelector(sel);
const money = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

/* ------------------------------------------------------------- theme maps */

const CARD_THEMES = {
  violet: 'linear-gradient(135deg, #6c4cf5 0%, #8b6bff 100%)',
  teal: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
  amber: 'linear-gradient(135deg, #9a3412 0%, #d97706 55%, #b45309 100%)',
  rose: 'linear-gradient(135deg, #be123c 0%, #fb7185 100%)',
  slate: 'linear-gradient(135deg, #1f2937 0%, #4b5563 100%)',
  ocean: 'linear-gradient(135deg, #1e3a8a 0%, #38bdf8 100%)',
};

const CATEGORY_ICONS = {
  Housing: '<path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 13 15 13 15 22"/>',
  Utilities: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  Groceries: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  Dining: '<path d="M3 2v7c0 1.1.9 2 2 2h1a2 2 0 0 0 2-2V2"/><path d="M5.5 11v11"/><path d="M18 2a4 4 0 0 0-4 4v6h4v10"/>',
  Transport: '<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  Shopping: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  Health: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  Entertainment: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  Income: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  Other: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
};

const PALETTE = ['#6c4cf5', '#f59e0b', '#14b8a6', '#e5484d', '#38bdf8', '#8b5cf6', '#22c55e', '#f472b6', '#64748b', '#ef4444'];

const icon = (name) =>
  `<svg viewBox="0 0 24 24">${CATEGORY_ICONS[name] || CATEGORY_ICONS.Other}</svg>`;

const brandLabel = (b) =>
  ({ visa: 'VISA', mastercard: 'MasterCard', amex: 'AMEX', discover: 'DISCOVER', card: 'CARD' }[b] || 'CARD');

function brandMark(brand, light) {
  if (brand === 'mastercard') {
    return `<span class="brandmark"><span class="mc-circles"><i></i><i></i></span></span>`;
  }
  return `<span>${brandLabel(brand)}</span>`;
}

function fmtDate(sql) {
  const d = new Date(sql.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return sql;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* -------------------------------------------------------------------- api */

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function refresh() {
  const [cardsRes, overview] = await Promise.all([
    api('/api/cards'),
    api('/api/overview'),
  ]);
  state.cards = cardsRes.cards;
  state.overview = overview;
  if (!state.cards.some((c) => c.id === state.activeCardId)) {
    state.activeCardId = state.cards.length ? state.cards[state.cards.length - 1].id : null;
  }
  renderAll();
}

function renderAll() {
  renderStack();
  renderRecent();
  renderCards();
  renderStats();
  renderProfile();
}

/* ------------------------------------------------------------- rendering */

function renderStack() {
  const el = $('#card-stack');
  if (!state.cards.length) {
    el.innerHTML = `<div class="big-card" style="background:${CARD_THEMES.violet}">
      <div class="bc-brand">—</div>
      <div class="bc-row"><div><div class="bc-label">Balance</div><div class="bc-balance">$0.00</div></div></div>
      <div class="bc-foot"><span class="bc-holder">No cards yet</span>
      <button class="add-card-btn" data-open="add-card">+ Add Card</button></div>
    </div>`;
    return;
  }
  const active = state.cards.find((c) => c.id === state.activeCardId) || state.cards[0];
  const others = state.cards.filter((c) => c.id !== active.id).slice(-2);

  const minis = others
    .map(
      (c) => `<div class="mini-card" style="background:${CARD_THEMES[c.theme]}" data-card="${c.id}">
        ${brandMark(c.brand)}
        <span class="mc-dots">•••• •••• ${c.last4}</span>
      </div>`
    )
    .join('');

  el.innerHTML = `${minis}
    <div class="big-card" style="background:${CARD_THEMES[active.theme]}">
      <div class="bc-brand">${brandMark(active.brand)}</div>
      <div class="bc-row">
        <div>
          <div class="bc-label">Balance</div>
          <div class="bc-balance">${money(active.balance)}</div>
        </div>
        <div>
          <div class="bc-label">Exp. Date</div>
          <div class="bc-exp">${String(active.exp_month).padStart(2, '0')}/${String(active.exp_year).slice(-2)}</div>
        </div>
      </div>
      <div class="bc-foot">
        <div>
          <div class="bc-label">Name</div>
          <div class="bc-holder">${active.holder_name}</div>
        </div>
        <button class="add-card-btn" data-open="add-card">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Card
        </button>
      </div>
    </div>`;
}

function txRow(t, withDelete) {
  return `<div class="tx">
    <div class="tx-ico">${icon(t.category)}</div>
    <div class="tx-main">
      <div class="tx-title">${escapeHtml(t.title)}</div>
      <div class="tx-meta">${escapeHtml(t.category)} · ${fmtDate(t.spent_at)}</div>
    </div>
    <div class="tx-amt ${t.type === 'income' ? 'income' : ''}">${t.type === 'income' ? '+' : '-'}${money(t.amount)}</div>
    ${
      withDelete
        ? `<button class="tx-del" data-del="${t.id}" aria-label="Delete">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>`
        : ''
    }
  </div>`;
}

function renderRecent() {
  const el = $('#recent-list');
  const list = state.overview ? state.overview.recent : [];
  el.innerHTML = list.length
    ? list.map((t) => txRow(t, false)).join('')
    : `<div class="empty">No transactions yet. Tap a quick action to add one.</div>`;
}

function renderCards() {
  const el = $('#cards-grid');
  $('#cards-sub').textContent = `${state.cards.length} card${state.cards.length === 1 ? '' : 's'} linked`;
  if (!state.cards.length) {
    el.innerHTML = `<div class="panel"><div class="empty">No cards yet — add your first card below.</div></div>`;
    return;
  }
  el.innerHTML = state.cards
    .map(
      (c) => `<div class="credit-card" style="background:${CARD_THEMES[c.theme]}">
        <div class="cc-top">
          <span class="cc-brand">${brandMark(c.brand)}</span>
          <span class="cc-num">•••• ${c.last4}</span>
        </div>
        <div class="cc-label">Balance</div>
        <div class="cc-balance">${money(c.balance)}</div>
        <div class="cc-foot">
          <div>
            <div class="cc-label" style="margin-top:0">Name</div>
            <div class="cc-holder">${escapeHtml(c.holder_name)}</div>
            <div class="cc-label" style="margin-top:6px">Exp ${String(c.exp_month).padStart(2, '0')}/${String(c.exp_year).slice(-2)}</div>
          </div>
          <div class="cc-actions">
            <button class="chip-btn" data-topup="${c.id}">Top Up</button>
            <button class="chip-btn danger" data-del-card="${c.id}">Delete</button>
          </div>
        </div>
      </div>`
    )
    .join('');
}

function renderStats() {
  const o = state.overview;
  if (!o) return;
  $('#stat-month-spend').textContent = money(o.month_spend);
  $('#stat-month-income').textContent = money(o.month_income);

  // bars
  const bars = $('#bars');
  const max = Math.max(...o.monthly.map((m) => m.spend), 1);
  bars.innerHTML = o.monthly.length
    ? o.monthly
        .map((m) => {
          const h = Math.max(6, Math.round((m.spend / max) * 120));
          const label = new Date(m.month + '-02').toLocaleDateString('en-US', { month: 'short' });
          return `<div class="bar-col">
            <span class="bar-val">${Math.round(m.spend / 100) / 10}k</span>
            <div class="bar ${m.spend === 0 ? 'dim' : ''}" style="height:${h}px"></div>
            <span class="bar-label">${label}</span>
          </div>`;
        })
        .join('')
    : `<div class="empty">No data yet.</div>`;

  // donut
  const donut = $('#donut');
  const cats = o.by_category;
  const total = cats.reduce((s, c) => s + c.total, 0);
  $('#donut-value').textContent = money(total);
  $('#cat-total').textContent = total ? 'This month' : '';
  const R = 45;
  const C = 2 * Math.PI * R;
  if (!total) {
    donut.innerHTML = `<circle cx="60" cy="60" r="${R}" stroke="#ececf1" stroke-dasharray="${C}" />`;
    $('#legend').innerHTML = `<div class="empty">No spending this month.</div>`;
    return;
  }
  let offset = 0;
  donut.innerHTML =
    `<circle cx="60" cy="60" r="${R}" stroke="#f3f3f6" stroke-dasharray="${C}" />` +
    cats
      .map((c, i) => {
        const frac = c.total / total;
        const dash = frac * C;
        const seg = `<circle cx="60" cy="60" r="${R}" stroke="${PALETTE[i % PALETTE.length]}"
          stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-offset}" />`;
        offset += dash;
        return seg;
      })
      .join('');

  $('#legend').innerHTML = cats
    .map(
      (c, i) => `<div class="legend-row">
        <span class="legend-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
        <span class="legend-name">${escapeHtml(c.category)}</span>
        <span class="legend-pct">${Math.round((c.total / total) * 100)}%</span>
        <span class="legend-amt">${money(c.total)}</span>
      </div>`
    )
    .join('');
}

function renderProfile() {
  const o = state.overview;
  if (!o) return;
  $('#profile-summary').innerHTML = `
    <div class="row"><span>Total balance</span><span>${money(o.total_balance)}</span></div>
    <div class="row"><span>Spent this month</span><span>${money(o.month_spend)}</span></div>
    <div class="row"><span>Income this month</span><span>${money(o.month_income)}</span></div>
    <div class="row"><span>Cards linked</span><span>${o.card_count}</span></div>
    <div class="row"><span>Lifetime spend</span><span>${money(o.total_spend)}</span></div>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ---------------------------------------------------------------- modals */

const modalRoot = $('#modal-root');
const sheet = $('#sheet');

function openSheet(html) {
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  modalRoot.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  modalRoot.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
}

modalRoot.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close')) closeSheet();
});

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ---- add card ---- */
function addCardModal() {
  const opts = state.themes
    .map((t) => `<button type="button" class="theme-swatch ${t === 'violet' ? 'on' : ''}" data-theme="${t}" style="background:${CARD_THEMES[t]}"></button>`)
    .join('');
  openSheet(`
    <h3>Add a Card</h3>
    <p class="hint">Only the last 4 digits are stored — never a full number, PIN or CVV.</p>
    <form id="card-form">
      <div class="field">
        <label>Cardholder name</label>
        <input name="holder_name" placeholder="e.g. dailyflutterui" required maxlength="60" />
      </div>
      <div class="field">
        <label>Card number</label>
        <input name="number" inputmode="numeric" placeholder="4242 4242 4242 4242" required maxlength="23" />
      </div>
      <div class="field-row">
        <div class="field"><label>Expiry month</label><input name="exp_month" inputmode="numeric" placeholder="08" maxlength="2" required /></div>
        <div class="field"><label>Expiry year</label><input name="exp_year" inputmode="numeric" placeholder="28" maxlength="4" required /></div>
      </div>
      <div class="field"><label>Starting balance</label><input name="balance" inputmode="decimal" placeholder="0.00" value="0" /></div>
      <div class="field"><label>Colour</label><div class="theme-pick" id="theme-pick">${opts}</div></div>
      <div class="form-error" id="card-error"></div>
      <button class="submit-btn violet" type="submit">Save Card</button>
      <button class="submit-btn ghost" type="button" data-close>Cancel</button>
    </form>`);

  let theme = 'violet';
  sheet.querySelector('#theme-pick').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    theme = btn.dataset.theme;
    sheet.querySelectorAll('.theme-swatch').forEach((s) => s.classList.toggle('on', s === btn));
  });

  sheet.querySelector('#card-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = sheet.querySelector('#card-error');
    err.textContent = '';
    try {
      const { card } = await api('/api/cards', {
        method: 'POST',
        body: {
          holder_name: f.get('holder_name'),
          number: String(f.get('number')).replace(/[\s-]/g, ''),
          exp_month: f.get('exp_month'),
          exp_year: f.get('exp_year'),
          balance: Number(f.get('balance')) || 0,
          theme,
        },
      });
      state.activeCardId = card.id;
      closeSheet();
      await refresh();
      toast('Card added');
    } catch (err2) {
      err.textContent = err2.message;
    }
  });
}

/* ---- add transaction ---- */
function transactionModal(type = 'expense') {
  if (!state.cards.length) {
    toast('Add a card first');
    return addCardModal();
  }
  const cardOpts = state.cards
    .map((c) => `<option value="${c.id}" ${c.id === state.activeCardId ? 'selected' : ''}>${brandLabel(c.brand)} •••• ${c.last4}</option>`)
    .join('');
  const catOpts = state.categories
    .filter((c) => (type === 'income' ? c === 'Income' : c !== 'Income'))
    .map((c) => `<option value="${c}">${c}</option>`)
    .join('');
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  openSheet(`
    <h3>${type === 'income' ? 'Request / Income' : type === 'send' ? 'Send Money' : 'Add Expense'}</h3>
    <p class="hint">${type === 'income' ? 'Record money coming in.' : 'Log a payment made from one of your cards.'}</p>
    <form id="tx-form">
      <div class="field"><label>Title</label><input name="title" placeholder="e.g. Groceries" required maxlength="60" /></div>
      <div class="field-row">
        <div class="field"><label>Amount</label><input name="amount" inputmode="decimal" placeholder="0.00" required /></div>
        <div class="field"><label>Date & time</label><input name="spent_at" type="datetime-local" value="${local}" /></div>
      </div>
      <div class="field"><label>Category</label><select name="category">${catOpts}</select></div>
      <div class="field"><label>Card</label><select name="card_id">${cardOpts}</select></div>
      <div class="form-error" id="tx-error"></div>
      <button class="submit-btn ${type === 'income' ? 'violet' : ''}" type="submit">
        ${type === 'income' ? 'Add Income' : 'Save Expense'}
      </button>
      <button class="submit-btn ghost" type="button" data-close>Cancel</button>
    </form>`);

  sheet.querySelector('#tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = sheet.querySelector('#tx-error');
    err.textContent = '';
    const kind = type === 'income' ? 'income' : 'expense';
    try {
      await api('/api/transactions', {
        method: 'POST',
        body: {
          card_id: Number(f.get('card_id')),
          title: f.get('title'),
          category: kind === 'income' ? 'Income' : f.get('category') || 'Other',
          amount: Number(f.get('amount')),
          type: kind,
          spent_at: f.get('spent_at'),
        },
      });
      closeSheet();
      await refresh();
      toast(kind === 'income' ? 'Income recorded' : 'Expense saved');
    } catch (err2) {
      err.textContent = err2.message;
    }
  });
}

/* ---- top up ---- */
function topUpModal(cardId) {
  if (!state.cards.length) return addCardModal();
  const id = cardId || state.activeCardId;
  const opts = state.cards
    .map((c) => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${brandLabel(c.brand)} •••• ${c.last4}</option>`)
    .join('');
  openSheet(`
    <h3>Top Up</h3>
    <p class="hint">Add funds to one of your cards.</p>
    <form id="topup-form">
      <div class="field"><label>Card</label><select name="card_id">${opts}</select></div>
      <div class="field"><label>Amount</label><input name="amount" inputmode="decimal" placeholder="100.00" required /></div>
      <div class="form-error" id="tu-error"></div>
      <button class="submit-btn violet" type="submit">Add Funds</button>
      <button class="submit-btn ghost" type="button" data-close>Cancel</button>
    </form>`);
  sheet.querySelector('#topup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = sheet.querySelector('#tu-error');
    err.textContent = '';
    try {
      await api(`/api/cards/${Number(f.get('card_id'))}/topup`, {
        method: 'POST',
        body: { amount: Number(f.get('amount')) },
      });
      closeSheet();
      await refresh();
      toast('Funds added');
    } catch (err2) {
      err.textContent = err2.message;
    }
  });
}

/* ---- view all transactions ---- */
function viewAllModal() {
  openSheet(`
    <h3>All Transactions</h3>
    <div class="filter-row" id="filters"></div>
    <div class="tx-list" id="all-tx"></div>
    <button class="submit-btn ghost" type="button" data-close>Close</button>`);

  const filters = sheet.querySelector('#filters');
  const listEl = sheet.querySelector('#all-tx');
  let active = 'all';

  const paint = async () => {
    const url = active === 'all' ? '/api/transactions?limit=200' : `/api/transactions?card_id=${active}&limit=200`;
    const { transactions } = await api(url);
    listEl.innerHTML = transactions.length
      ? transactions.map((t) => txRow(t, true)).join('')
      : `<div class="empty">Nothing here yet.</div>`;
  };

  filters.innerHTML =
    `<button data-filter="all" class="on">All</button>` +
    state.cards
      .map((c) => `<button data-filter="${c.id}">${brandLabel(c.brand)} •••• ${c.last4}</button>`)
      .join('');

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    active = btn.dataset.filter;
    filters.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    paint();
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    await api(`/api/transactions/${btn.dataset.del}`, { method: 'DELETE' });
    await refresh();
    paint();
    toast('Transaction deleted');
  });

  paint();
}

/* ---- more menu ---- */
function moreModal() {
  openSheet(`
    <h3>Quick Actions</h3>
    <p class="hint">What would you like to do?</p>
    <button class="submit-btn violet" data-more="expense" style="margin-top:0">Add Expense</button>
    <button class="submit-btn" data-more="income">Record Income</button>
    <button class="submit-btn" data-more="topup">Top Up a Card</button>
    <button class="submit-btn" data-more="all">View All Transactions</button>
    <button class="submit-btn ghost" type="button" data-close>Close</button>`);
  sheet.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-more]');
    if (!btn) return;
    const kind = btn.dataset.more;
    closeSheet();
    if (kind === 'topup') topUpModal();
    else if (kind === 'all') viewAllModal();
    else transactionModal(kind);
  });
}

/* ------------------------------------------------------------------- nav */

function showScreen(name) {
  if (!$(`#screen-${name}`)) name = 'home';
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`#screen-${name}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((n) =>
    n.classList.toggle('active', n.dataset.screen === name)
  );
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-item').forEach((n) =>
  n.addEventListener('click', () => showScreen(n.dataset.screen))
);

document.querySelectorAll('.qa').forEach((b) =>
  b.addEventListener('click', () => {
    const a = b.dataset.action;
    if (a === 'topup') topUpModal();
    else if (a === 'more') moreModal();
    else if (a === 'request') transactionModal('income');
    else transactionModal('expense');
  })
);

$('#add-card-btn').addEventListener('click', addCardModal);
$('#add-card-btn-2').addEventListener('click', addCardModal);
$('#view-all-btn').addEventListener('click', viewAllModal);
$('#bell-btn').addEventListener('click', () => toast('You are all caught up ✨'));

$('#reset-btn').addEventListener('click', async () => {
  if (!confirm('Wipe every card and transaction? This cannot be undone.')) return;
  for (const c of state.cards) await api(`/api/cards/${c.id}`, { method: 'DELETE' });
  await refresh();
  toast('All data wiped');
});

document.body.addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open="add-card"]');
  if (open) return addCardModal();

  const mini = e.target.closest('[data-card]');
  if (mini) {
    state.activeCardId = Number(mini.dataset.card);
    renderStack();
    return;
  }

  const topBtn = e.target.closest('[data-topup]');
  if (topBtn) return topUpModal(Number(topBtn.dataset.topup));

  const delCard = e.target.closest('[data-del-card]');
  if (delCard) {
    const id = Number(delCard.dataset.delCard);
    if (confirm('Delete this card and its transactions?')) {
      await api(`/api/cards/${id}`, { method: 'DELETE' });
      await refresh();
      toast('Card deleted');
    }
  }
});

/* ------------------------------------------------------------------ boot */

(async function init() {
  try {
    const meta = await api('/api/meta');
    state.categories = meta.categories;
    state.themes = meta.themes;
    await refresh();
    showScreen(location.hash.slice(1) || 'home');
  } catch (err) {
    toast('Failed to load data');
    console.error(err);
  }
})();
