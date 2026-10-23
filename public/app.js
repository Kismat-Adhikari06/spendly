'use strict';

/* ------------------------------------------------------------------ state */

const state = {
  cards: [],
  cardOrder: [],
  activeCardId: null,
  hiddenBalances: false,
  revealedCardId: null,
  revealedCardNumber: null,
  revealedCardNumberId: null,
  revealedBalanceCardId: null,
  storeFullCardNumbers: false,
  displayCurrency: 'NPR',
  profileName: '',
  profileLastName: '',
  profileNamePrompted: false,
  profilePhoto: '',
  cardSelectionChanged: false,
  expandedCardId: null,
  overview: null,
  categories: [],
  themes: [],
};

const $ = (sel) => document.querySelector(sel);
const money = (n, currency = state.displayCurrency || 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n || 0);
const transactionMoney = (n) => money(n, state.displayCurrency);

/* ------------------------------------------------------------- theme maps */

const CARD_THEMES = {
  violet: 'linear-gradient(135deg, #6C5CE7 0%, #8B7CF6 100%)',
  teal: 'linear-gradient(90deg, #0E8F83 0%, #14B8A6 100%)',
  amber: 'linear-gradient(90deg, #B45309 0%, #F59E0B 100%)',
  rose: 'linear-gradient(135deg, #be123c 0%, #fb7185 100%)',
  slate: 'linear-gradient(135deg, #1f2937 0%, #4b5563 100%)',
  ocean: 'linear-gradient(135deg, #1e3a8a 0%, #38bdf8 100%)',
};

const CARD_COLOR_PRESETS = [
  { name: 'Charcoal', value: '#252827' },
  { name: 'Navy', value: '#24364b' },
  { name: 'Forest', value: '#25483a' },
  { name: 'Burgundy', value: '#59343d' },
  { name: 'Gold', value: '#8a7041' },
];

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

function parseHexColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || ''));
  if (!match) return [37, 40, 39];
  return [0, 2, 4].map((index) => parseInt(match[1].slice(index, index + 2), 16));
}

function rgbHex([r, g, b]) {
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;
}

function getCardTextColor(value) {
  const [r, g, b] = parseHexColor(value);
  const linear = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  });
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  return luminance > .179 ? '#111512' : '#ffffff';
}

function cardColorTokens(value, isBack = false) {
  const [r, g, b] = parseHexColor(value);
  const factor = isBack ? .82 : 1;
  const base = [r * factor, g * factor, b * factor];
  const bottom = base.map((channel) => channel * (isBack ? .76 : .84));
  const luminance = ([red, green, blue]) => [red, green, blue]
    .map((channel) => {
      const normalized = channel / 255;
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const contrast = (foreground, background) => {
    const lighter = Math.max(foreground, background);
    const darker = Math.min(foreground, background);
    return (lighter + .05) / (darker + .05);
  };
  const endpointLuminances = [luminance(base), luminance(bottom)];
  const whiteScore = Math.min(...endpointLuminances.map((background) => contrast(1, background)));
  const blackScore = Math.min(...endpointLuminances.map((background) => contrast(0, background)));
  const text = whiteScore >= blackScore ? '#ffffff' : '#111512';
  return `--card-top:${rgbHex(base)};--card-bottom:${rgbHex(bottom)};--card-ink:${text};--card-muted:${text};`;
}

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
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const year = d.getFullYear();
  return `${time} ${day} ${month}, ${year}`;
}

/* -------------------------------------------------------------------- api */

async function api(path, options = {}) {
  return window.spendlyLocalStore.api(path, options);
}

async function refresh() {
  const [cardsRes, overview] = await Promise.all([
    api('/api/cards'),
    api('/api/overview'),
  ]);
  state.cards = cardsRes.cards;
  state.overview = overview;
  state.cardOrder = state.cardOrder.filter((id) => state.cards.some((card) => card.id === id));
  state.cards.forEach((card) => {
    if (!state.cardOrder.includes(card.id)) state.cardOrder.unshift(card.id);
  });
  if (!state.cards.some((c) => c.id === state.activeCardId)) {
    state.activeCardId = state.cardOrder[0] || null;
  }
  renderAll();
}

/* ---------------------------------------------------------- backup nudge */

const BACKUP_KEY = 'spendly.lastBackupAt';
const BACKUP_SNOOZE_KEY = 'spendly.backupSnoozedUntil';
const BACKUP_INTERVAL_DAYS = 14;
const DAY_MS = 86400000;

function readStored(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ }
}

function renderBackupStatus() {
  const last = readStored(BACKUP_KEY);
  const days = last ? Math.floor((Date.now() - last) / DAY_MS) : null;
  $('#last-backup-label').textContent = last
    ? `Last backup downloaded ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}.`
    : 'You have not downloaded a backup on this device yet.';

  const hasData = state.cards.length > 0;
  const overdue = !last || days >= BACKUP_INTERVAL_DAYS;
  const snoozed = Date.now() < readStored(BACKUP_SNOOZE_KEY);
  $('#backup-reminder').hidden = !(hasData && overdue && !snoozed);
  $('#backup-reminder-text').textContent = last
    ? `It's been ${days} days since your last backup. Your records only live in this browser.`
    : 'Your records only live in this browser. Download a backup so you can restore them if site data is cleared.';
}

function renderAll() {
  renderStack();
  renderRecent();
  renderCards();
  renderStats();
  renderProfile();
  renderBackupStatus();
}

/* ------------------------------------------------------------- rendering */

function networkLogo(network) {
  const name = String(network || 'card').toLowerCase();
  if (name === 'mastercard') {
    return '<svg class="network-logo mastercard-logo" viewBox="0 0 52 34" role="img" aria-label="Mastercard"><circle cx="19" cy="15" r="13" fill="#eb001b"/><circle cx="33" cy="15" r="13" fill="#f79e1b" fill-opacity=".95"/><text x="26" y="32" text-anchor="middle" fill="currentColor" font-size="5" font-family="Arial,sans-serif">mastercard</text></svg>';
  }
  if (name === 'visa') {
    return '<svg class="network-logo visa-logo" viewBox="0 0 58 24" role="img" aria-label="Visa"><path fill="currentColor" d="M22.7 3.5 14.9 20.6H9.8L6 6.9c-.2-.8-.4-1.1-1.1-1.5C3.8 4.8 2 4.3.4 4l.1-.5h8.2c1 0 1.8.7 2 1.6l2 10.8 5-12.4zm19.8 11.5c0-4.5-6.3-4.7-6.3-6.7 0-.6.6-1.3 1.8-1.5 1.8-.2 3.6.1 5.2.9l.9-4.1c-1.5-.5-3.1-.8-4.7-.8-5 0-8.5 2.7-8.5 6.5 0 2.8 2.5 4.4 4.5 5.3 2 .9 2.7 1.5 2.7 2.3 0 1.2-1.5 1.7-2.9 1.7-2 .1-4-.4-5.8-1.4l-.9 4.2c1.8.7 3.8 1 5.8 1 5.3 0 8.8-2.6 8.8-6.6m12.5 5.6h4.5L55.6 3.5h-4.1c-.9 0-1.7.5-2 1.3l-7.3 15.8h5.3l1-2.9h6.5zm-5.6-7.1 2.6-7.2 1.5 7.2zM29 3.5l-4.2 17.1h-5L24 3.5z"/></svg>';
  }
  const label = ({ amex: 'AMEX', discover: 'DISCOVER' }[name] || String(network || 'CARD').toUpperCase());
  return `<svg class="network-logo generic-logo" viewBox="0 0 72 24" role="img" aria-label="${escapeHtml(label)}"><text x="36" y="17" text-anchor="middle" fill="currentColor" font-size="13" font-weight="700" font-family="Arial,sans-serif">${escapeHtml(label)}</text></svg>`;
}

function formattedBalance(card) {
  const displayCurrency = state.displayCurrency || 'USD';
  const currency = displayCurrency;
  const parts = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: displayCurrency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).formatToParts(Number(card.balance) || 0);
  const decimalIndex = parts.findIndex((part) => part.type === 'decimal');
  const fractionIndex = parts.findIndex((part) => part.type === 'fraction');
  if (decimalIndex < 0 || fractionIndex < 0) return escapeHtml(new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency }).format(Number(card.balance) || 0));
  const whole = parts.slice(0, decimalIndex).map((part) => part.value).join('');
  const cents = parts[fractionIndex].value;
  const suffix = parts.slice(fractionIndex + 1).map((part) => part.value).join('');
  return `<span>${escapeHtml(whole)}</span><small>.${escapeHtml(cents)}</small><span>${escapeHtml(suffix)}</span>`;
}

function cardFace(card, layer = 'front', expanded = false) {
  const isAccount = card.kind === 'account';
  const hidden = state.revealedBalanceCardId !== Number(card.id);
  const id = Number(card.id);
  const holder = escapeHtml(card.holder_name || 'Card holder');
  const type = escapeHtml(card.card_type || card.type || (isAccount ? 'Bank Account' : 'Physical Card'));
  const colorStyle = cardColorTokens(card.card_color || '#252827', layer === 'back');
  const rawStatus = String(card.status || 'active').toLowerCase();
  const status = ['active', 'frozen', 'expired'].includes(rawStatus) ? rawStatus : 'active';
  return `<div class="physical-card-face ${layer} ${expanded ? 'is-expanded' : ''}" data-card-face="${id}" style="${colorStyle}">
    <div class="physical-card-head">
      <span class="card-kind">${type}</span>
      <div class="card-head-actions">
        <button type="button" class="balance-toggle" data-toggle-balance="${id}" aria-label="${hidden ? 'Show' : 'Hide'} balance and card number" aria-pressed="${!hidden}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg>
        </button>
        ${expanded ? '<button type="button" class="collapse-card" data-collapse-card aria-label="Collapse card details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button>' : ''}
      </div>
    </div>
    <div class="physical-card-balance">
      <span class="card-balance-label">Available Balance</span>
      <span class="card-balance-value ${hidden ? 'is-hidden' : ''}" data-card-balance="${id}" aria-label="${hidden ? 'Balance hidden' : `Balance ${money(card.balance, card.currency || state.displayCurrency)}`}" aria-live="polite">${hidden ? '••••••' : formattedBalance(card)}</span>
      <span class="physical-card-number" role="text" aria-label="${isAccount ? 'Account' : 'Card'} ending in ${escapeHtml(card.last4 || '0000')}">${!isAccount && !hidden && state.storeFullCardNumbers && state.revealedCardNumberId === id && state.revealedCardNumber ? escapeHtml(state.revealedCardNumber) : `<span aria-hidden="true">•••• &nbsp; •••• &nbsp; •••• &nbsp;</span>${escapeHtml(card.last4 || '0000')}`}</span>
    </div>
    <div class="physical-card-details">
      <div class="card-holder"><span>${isAccount ? escapeHtml(card.provider || 'Account holder') : 'Card Holder'}</span><strong>${holder}</strong></div>
      <div class="card-expiry"><span>${isAccount ? 'Type' : 'Expires'}</span><strong>${isAccount ? escapeHtml(card.account_kind === 'mobile_wallet' ? 'Wallet' : 'Bank') : `${String(card.exp_month || 1).padStart(2, '0')}/${card.exp_year || '----'}`}</strong></div>
      <div class="network-logo-wrap">${isAccount ? `<span class="account-mark">${escapeHtml(card.provider || 'ACCOUNT')}</span>` : networkLogo(card.brand)}</div>
    </div>
    ${expanded ? `<div class="expanded-card-details" aria-label="Card details expanded">
      <div class="expanded-details-heading"><span>Card details</span><span role="status" aria-live="polite">Card details expanded</span></div>
      <dl>
        <div><dt>Type</dt><dd>${type}</dd></div>
        <div><dt>${isAccount ? 'Provider' : 'Network'}</dt><dd>${escapeHtml(isAccount ? card.provider || '' : brandLabel(card.brand))}</dd></div>
        ${isAccount ? `        <div><dt>Account number</dt><dd>${escapeHtml(card.account_number || '')}</dd></div>` : ''}
        <div><dt>Status</dt><dd>${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}</dd></div>
        <div><dt>Card number</dt><dd>${isAccount ? escapeHtml(card.account_number || '') : (!hidden && state.storeFullCardNumbers && state.revealedCardNumberId === id && state.revealedCardNumber ? escapeHtml(state.revealedCardNumber) : `•••• ${escapeHtml(card.last4 || '0000')}`)}</dd></div>
        <div><dt>Expires</dt><dd>${String(card.exp_month || 1).padStart(2, '0')}/${card.exp_year || '----'}</dd></div>
        <div><dt>Cardholder</dt><dd>${holder}</dd></div>
        <div><dt>Currency</dt><dd>${escapeHtml(card.currency || state.displayCurrency || 'USD')}</dd></div>
      </dl>
    </div>` : ''}
  </div>`;
}

function renderStack() {
  const el = $('#card-stack');
  if (!state.cards.length) {
    el.innerHTML = `<button type="button" class="empty-card-placeholder" data-open="add-card" aria-label="Add a card or account"><span class="empty-card-outline" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="3"/><line x1="2" y1="9" x2="22" y2="9"/></svg></span><span class="empty-card-copy"><strong>No cards or accounts yet</strong><span>Add one to start tracking your balances and expenses.</span></span><span class="empty-card-arrow" aria-hidden="true">+</span></button>`;
    el.classList.add('is-empty');
    el.classList.remove('has-expanded-card');
    el.setAttribute('aria-expanded', 'false');
    return;
  }
  el.classList.remove('is-empty');

  const orderedCards = state.cardOrder.map((id) => state.cards.find((card) => card.id === id)).filter(Boolean);
  const active = orderedCards.find((card) => card.id === state.activeCardId) || orderedCards[0];
  const activeIndex = orderedCards.findIndex((card) => card.id === active.id);
  const behind = orderedCards.filter((card) => card.id !== active.id).slice(0, 2).reverse();
  const isExpanded = state.expandedCardId === active.id;
  const stack = [...behind, active];
  const extraBack = orderedCards.length > 3
    ? `<span class="stack-card back back-more" style="z-index:0;${cardColorTokens(active.card_color || '#252827', true)}" aria-hidden="true"></span>`
    : '';
  const featuredCard = `<article class="stack-card front ${isExpanded ? 'expanded' : ''} ${state.cardSelectionChanged ? 'card-selected' : ''}" data-stack-layer="front" style="z-index:3">
    ${!isExpanded ? `<button type="button" class="front-card-toggle" data-toggle-expand="${active.id}" aria-label="Card ending in ${escapeHtml(active.last4)}, tap to expand" aria-expanded="false"></button>` : ''}
    ${cardFace(active, 'front', isExpanded)}
  </article>`;
  const expandedPicker = isExpanded ? `<section class="expanded-card-chooser" aria-label="Choose a card to bring to the front">
    <h3>Cards &amp; accounts <span>${orderedCards.length}</span></h3>
    <div class="expanded-card-options">
      ${orderedCards.map((card, index) => `<button type="button" class="expanded-card-option ${card.id === active.id ? 'selected' : ''}" data-expanded-card-choice="${card.id}" aria-pressed="${card.id === active.id}" aria-label="${escapeHtml(card.holder_name || 'Card')}, ending in ${escapeHtml(card.last4 || '0000')}${card.id === active.id ? ', currently in front' : ', bring to front'}" style="${cardColorTokens(card.card_color || '#252827')}">
        <span class="option-card-top"><span>${escapeHtml(card.card_type || 'Physical Card')}</span>${networkLogo(card.brand)}</span>
        <span class="option-card-holder">${escapeHtml(card.holder_name || 'Card holder')}</span>
        <span class="option-card-bottom"><span>•••• ${escapeHtml(card.last4 || '0000')}</span><span>${index + 1} of ${orderedCards.length}</span></span>
      </button>`).join('')}
    </div>
  </section>` : '';
  el.innerHTML = `<div class="card-deck ${isExpanded ? 'deck-open' : ''}" data-deck>
    ${isExpanded ? featuredCard : `${extraBack}${stack.map((card, index) => {
      const isFront = card.id === active.id;
      const layer = isFront ? 'front' : `back back-${index}`;
      return `<article class="stack-card ${layer} ${state.cardSelectionChanged && isFront ? 'card-selected' : ''}" data-stack-layer="${index}" style="z-index:${index + 1}">
        ${isFront ? `<button type="button" class="front-card-toggle" data-toggle-expand="${card.id}" aria-label="${card.kind === 'account' ? 'Account' : 'Card'} ending in ${escapeHtml(card.last4)}, tap to expand" aria-expanded="false"></button>` : ''}
        ${cardFace(card, layer)}
        ${isFront ? '' : `<button type="button" class="stack-card-select" data-card="${card.id}" aria-label="${card.kind === 'account' ? 'Account' : 'Card'} ending in ${escapeHtml(card.last4)}, select to view"></button>`}
      </article>`;
    }).join('')}`}
    </div>
    ${expandedPicker}
    <div class="stack-footer">
      <span class="stack-position" role="status" aria-live="polite" aria-atomic="true">${active.kind === 'account' ? 'Account' : 'Card'} ${activeIndex + 1} of ${orderedCards.length}</span>
      ${!isExpanded && orderedCards.length > 3 ? '<button type="button" class="view-all-cards" data-view-cards>View all cards</button>' : ''}
    </div>`;
  state.cardSelectionChanged = false;
  el.classList.toggle('has-expanded-card', isExpanded);
  el.setAttribute('aria-expanded', String(isExpanded));
}

async function toggleCardBalance(cardId) {
  const card = state.cards.find((item) => item.id === Number(cardId));
  if (!card) return;
  if (state.revealedBalanceCardId === card.id) {
    state.revealedBalanceCardId = null;
    state.revealedCardNumber = null;
    state.revealedCardNumberId = null;
  } else {
    state.revealedBalanceCardId = card.id;
    state.revealedCardNumber = null;
    state.revealedCardNumberId = null;
    if (card.kind === 'card' && state.storeFullCardNumbers) {
      try {
        const result = await api(`/api/cards/${card.id}/number`);
        state.revealedCardNumber = result.number;
        state.revealedCardNumberId = card.id;
      } catch (err) {
        toast(err.message);
      }
    }
  }
  renderStack();
  renderCards();
}

function selectCard(id) {
  if (state.expandedCardId !== null) return;
  state.activeCardId = Number(id);
  state.revealedBalanceCardId = null;
  state.revealedCardNumber = null;
  state.revealedCardNumberId = null;
  state.cardOrder = [state.activeCardId, ...state.cardOrder.filter((cardId) => cardId !== state.activeCardId)];
  state.cardSelectionChanged = true;
  renderStack();
}

function toggleCardExpanded(id = state.activeCardId) {
  const cardId = Number(id);
  state.expandedCardId = state.expandedCardId === cardId ? null : cardId;
  renderStack();
}

function collapseCard() {
  if (state.expandedCardId === null) return;
  state.expandedCardId = null;
  renderStack();
}

function viewAllCards() {
  const rows = state.cardOrder.map((id) => state.cards.find((card) => card.id === id)).filter(Boolean).map((card, index) => `<button type="button" class="card-picker-row ${card.id === state.activeCardId ? 'selected' : ''}" data-select-card="${card.id}" style="${cardColorTokens(card.card_color || '#252827')}">
    <span class="picker-brand">${card.kind === 'account' ? escapeHtml(card.provider || 'Account') : brandLabel(card.brand)}</span>
    <span class="picker-name">${escapeHtml(card.holder_name || 'Card holder')}</span>
    <span class="picker-number">•••• ${escapeHtml(card.last4)}</span>
    <span class="picker-position">${index + 1}</span>
  </button>`).join('');
  openSheet(`<h3>All cards &amp; accounts</h3><p class="hint">Choose one to bring it to the front.</p><div class="card-picker-list">${rows}</div><button class="submit-btn ghost" type="button" data-close>Close</button>`);
}


function txRow(t, withDelete) {
  return `<div class="tx">
    <div class="tx-ico">${icon(t.category)}</div>
    <div class="tx-main">
      <div class="tx-title">${escapeHtml(t.title)}</div>
      <div class="tx-meta">${fmtDate(t.spent_at)} · ${escapeHtml(t.kind === 'account' ? t.provider || 'Account' : `${brandLabel(t.brand)} •••• ${t.last4 || ''}`)}</div>
    </div>
    <div class="tx-amt ${t.type === 'income' ? 'income' : ''}">${transactionMoney(t.amount)}</div>
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
    : `    <div class="empty">No transactions yet. Add an expense or income to start tracking.</div>`;
}

function renderCards() {
  const el = $('#cards-grid');
  $('#cards-sub').textContent = `${state.cards.length} card${state.cards.length === 1 ? '' : 's'} and account${state.cards.length === 1 ? '' : 's'} tracked`;
  if (!state.cards.length) {
    el.innerHTML = `<div class="panel"><div class="empty">No cards or accounts yet — add your first one below.</div></div>`;
    return;
  }
  el.innerHTML = state.cards
    .map((card) => `<div class="credit-card-entry">
      ${cardFace(card, 'listed')}
      <div class="cc-actions">
        <button class="chip-btn" data-topup="${card.id}">${card.kind === 'account' ? 'Add Funds' : 'Top Up'}</button>
        <button class="chip-btn" data-edit-card="${card.id}">Edit</button>
        <button class="chip-btn danger" data-del-card="${card.id}">Delete</button>
      </div>
    </div>`)
    .join('');
}

function renderStats() {
  const o = state.overview;
  if (!o) return;
  $('#stat-month-spend').textContent = transactionMoney(o.month_spend);
  $('#stat-month-income').textContent = transactionMoney(o.month_income);

  // bars
  const bars = $('#bars');
  const monthRows = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthDate = new Date(new Date().getFullYear(), new Date().getMonth() - offset, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    monthRows.push(o.monthly.find((entry) => entry.month === monthKey) || { month: monthKey, spend: 0, income: 0 });
  }
  const max = Math.max(...monthRows.map((m) => m.spend), 1);
  bars.innerHTML = monthRows.length
    ? monthRows
        .map((m) => {
          const h = Math.max(6, Math.round((m.spend / max) * 120));
          const label = new Date(`${m.month}-02T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
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
  $('#donut-value').textContent = transactionMoney(total);
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
        <span class="legend-amt">${transactionMoney(c.total)}</span>
      </div>`
    )
    .join('');
}

function renderProfile() {
  const o = state.overview;
  if (!o) return;
  $('#store-full-card-numbers').checked = state.storeFullCardNumbers;
  $('#display-currency').value = state.displayCurrency;
  $('#profile-name').textContent = [state.profileName, state.profileLastName].filter(Boolean).join(' ') || 'Your profile';
  $('#profile-first-name-input').value = state.profileName;
  $('#profile-last-name-input').value = state.profileLastName;
  $('#stat-month-spend').textContent = transactionMoney(o.month_spend);
  $('#stat-month-income').textContent = transactionMoney(o.month_income);
  const trackedCount = state.cards.length;
  $('#profile-summary').innerHTML = `
    <div class="row"><span>Total balance</span><span>${transactionMoney(o.total_balance)}</span></div>
    <div class="row"><span>Spent this month</span><span>${transactionMoney(o.month_spend)}</span></div>
    <div class="row"><span>Income this month</span><span>${transactionMoney(o.month_income)}</span></div>
    <div class="row"><span>Cards and accounts</span><span>${trackedCount}</span></div>
    <div class="row"><span>Lifetime spend</span><span>${transactionMoney(o.total_spend)}</span></div>`;
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

/* ---- add and edit cards ---- */
function addCardModal() {
  openCardModal();
}

function editCardModal(cardId) {
  const card = state.cards.find((item) => item.id === Number(cardId));
  if (!card) return toast('Card not found');
  openCardModal(card);
}

function openCardModal(existingCard = null) {
  const editing = Boolean(existingCard);
  const initialColor = existingCard?.card_color || '#252827';
  const initialExpiryYear = existingCard ? String(existingCard.exp_year) : '';
  const initialKind = existingCard?.kind || 'card';
  const defaultHolderName = [state.profileName, state.profileLastName].filter(Boolean).join(' ').trim();
  const holderName = existingCard?.holder_name || defaultHolderName;
  openSheet(`
    <h3>${editing ? `Edit ${initialKind === 'account' ? 'Account' : 'Card'}` : 'Add a Card or Account'}</h3>
    <p class="hint">Track a payment card, bank account, or mobile wallet manually. Never enter a PIN or password.</p>
    <form id="card-form">
      ${editing ? '' : `<div class="field"><label for="item-kind">What are you adding?</label><select id="item-kind" name="kind"><option value="card">Payment card</option><option value="account">Bank or mobile wallet account</option></select></div>`}
      <div class="card-preview" style="${cardColorTokens(initialColor)}"><span>${escapeHtml(existingCard?.card_type || 'Physical Card')}</span><strong>${editing ? money(existingCard.balance, existingCard.currency || state.displayCurrency) : 'Available balance'}</strong><span>•••• &nbsp; •••• &nbsp; •••• &nbsp; ${escapeHtml(existingCard?.last4 || '0000')}</span></div>
      <div class="field">
        <label>Account holder name</label>
        <input name="holder_name" placeholder="e.g. Your name" value="${escapeHtml(holderName)}" required maxlength="60" />
      </div>
      <div class="field" data-card-field>
        <label>Full card number</label>
        <input name="number" type="text" inputmode="numeric" placeholder="${editing ? `Enter full number ending ${escapeHtml(existingCard.last4)}` : '4242 4242 4242 4242'}" ${editing ? 'maxlength="23"' : 'required maxlength="23"'} autocomplete="off" />
        <span class="field-hint" data-number-storage-hint>${state.storeFullCardNumbers ? 'Enter all 12–19 digits. Saved locally on this device; tap the eye to reveal it.' : 'Enter all 12–19 digits. Storage is off, so only the last four digits are kept on this device.'}</span>
      </div>
      <div class="field" data-account-field hidden><label>Account type</label><select name="account_kind"><option value="bank" ${existingCard?.account_kind === 'bank' ? 'selected' : ''}>Bank account</option><option value="mobile_wallet" ${existingCard?.account_kind === 'mobile_wallet' ? 'selected' : ''}>Mobile wallet (eSewa, etc.)</option></select></div>
      <div class="field" data-account-field hidden><label>Bank or wallet name</label><input name="provider" placeholder="e.g. Global IME Bank or eSewa" value="${escapeHtml(existingCard?.provider || '')}" maxlength="60" /></div>
      <div class="field" data-account-field hidden><label>Account / wallet number</label><input name="account_number" inputmode="text" placeholder="Your account number" value="${escapeHtml(existingCard?.account_number || '')}" maxlength="34" /></div>
      <div class="field" data-account-field hidden><label>Currency</label><input name="currency" value="${escapeHtml(existingCard?.currency || state.displayCurrency)}" maxlength="3" placeholder="${escapeHtml(state.displayCurrency)}" /></div>
      <div class="field" data-card-field>
        <label for="card-network">Network</label>
        <select id="card-network" name="brand">
          ${[['visa', 'Visa'], ['mastercard', 'Mastercard'], ['amex', 'American Express'], ['discover', 'Discover']].map(([value, label]) => `<option value="${value}" ${(existingCard?.brand || 'visa') === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="field-row" data-card-field>
        <div class="field"><label>Expiry month</label><input name="exp_month" inputmode="numeric" placeholder="08" maxlength="2" value="${editing ? String(existingCard.exp_month).padStart(2, '0') : ''}" ${editing ? '' : 'required'} /></div>
        <div class="field"><label>Expiry year</label><input name="exp_year" inputmode="numeric" placeholder="28" maxlength="4" value="${editing ? escapeHtml(initialExpiryYear) : ''}" ${editing ? '' : 'required'} /></div>
      </div>
      <div class="field"><label>Current balance</label><input name="balance" inputmode="decimal" placeholder="0.00" value="${editing ? Number(existingCard.balance).toFixed(2) : '0'}" /></div>
      ${editing ? `<div class="field"><label for="card-status">Status</label><select id="card-status" name="status"><option value="active" ${existingCard.status === 'active' ? 'selected' : ''}>Active</option><option value="frozen" ${existingCard.status === 'frozen' ? 'selected' : ''}>Frozen</option><option value="expired" ${existingCard.status === 'expired' ? 'selected' : ''}>Expired</option></select></div>` : ''}
      <div class="field" data-card-field>
        <label for="card-color-picker">Card color</label>
        <div class="card-color-controls">
          <input id="card-color-picker" type="color" value="${escapeHtml(initialColor)}" aria-label="Choose a custom card color" />
          <div class="theme-pick" id="theme-pick">${CARD_COLOR_PRESETS.map((color, index) => `<button type="button" class="theme-swatch ${index === 0 ? 'on' : ''}" data-card-color="${color.value}" aria-label="${color.name}" title="${color.name}" style="--swatch-color:${color.value}"></button>`).join('')}</div>
        </div>
      </div>
      <div class="form-error" id="card-error"></div>
      <button class="submit-btn violet" type="submit">${editing ? 'Save Changes' : 'Save Card'}</button>
      <button class="submit-btn ghost" type="button" data-close>Cancel</button>
    </form>`);

  let cardColor = initialColor;
  const colorPicker = sheet.querySelector('#card-color-picker');
  const holderInput = sheet.querySelector('[name="holder_name"]');
  const numberInput = sheet.querySelector('[name="number"]');
  const kindInput = sheet.querySelector('[name="kind"]');
  const setKindFields = (kind) => {
    sheet.querySelectorAll('[data-card-field]').forEach((field) => { field.hidden = kind !== 'card'; });
    sheet.querySelectorAll('[data-account-field]').forEach((field) => { field.hidden = kind !== 'account'; });
    if (numberInput) {
      numberInput.required = kind === 'card' && !editing;
      numberInput.maxLength = 23;
    }
    sheet.querySelectorAll('[data-card-field] input[name="exp_month"], [data-card-field] input[name="exp_year"]').forEach((input) => { input.required = kind === 'card' && !editing; });
  };
  const updateNumberMode = () => {
    if (!numberInput) return;
    const fullStorage = state.storeFullCardNumbers;
    numberInput.maxLength = 23;
    numberInput.placeholder = editing ? `Enter full number ending ${existingCard.last4}` : '4242 4242 4242 4242';
    const hint = sheet.querySelector('[data-number-storage-hint]');
    if (hint) hint.textContent = fullStorage
      ? 'Enter all 12–19 digits. Saved locally on this device; tap the eye to reveal it.'
      : 'Enter all 12–19 digits. Storage is off, so only the last four digits are kept on this device.';
  };
  setKindFields(initialKind);
  updateNumberMode();
  if (kindInput) kindInput.addEventListener('change', () => setKindFields(kindInput.value));
  const balanceInput = sheet.querySelector('[name="balance"]');
  const preview = sheet.querySelector('.card-preview');
  const updatePreview = () => {
    const enteredDigits = String(numberInput?.value || '').replace(/\D/g, '');
    const shownNumber = enteredDigits && state.storeFullCardNumbers
      ? escapeHtml((enteredDigits.match(/.{1,4}/g) || []).join(' '))
      : `<span aria-hidden="true">•••• &nbsp; •••• &nbsp; •••• &nbsp;</span>${escapeHtml(enteredDigits.slice(-4) || existingCard?.last4 || '0000')}`;
    preview.innerHTML = `<span>${escapeHtml(existingCard?.card_type || 'Physical Card')}</span><strong>${editing ? money(Number(balanceInput.value) || 0, existingCard.currency || state.displayCurrency) : 'Available balance'}</strong><span>${shownNumber}</span>`;
    preview.style.cssText = cardColorTokens(cardColor);
    preview.style.color = getCardTextColor(cardColor);
  };
  [holderInput, numberInput, balanceInput].filter(Boolean).forEach((input) => input.addEventListener('input', updatePreview));
  updatePreview();
  const updateCardColor = (color) => {
    cardColor = color;
    colorPicker.value = color;
    sheet.querySelectorAll('[data-card-color]').forEach((swatch) => swatch.classList.toggle('on', swatch.dataset.cardColor === color));
    updatePreview();
  };
  sheet.querySelector('#theme-pick').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-card-color]');
    if (btn) updateCardColor(btn.dataset.cardColor);
  });
  colorPicker.addEventListener('input', () => updateCardColor(colorPicker.value));

  sheet.querySelector('#card-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = sheet.querySelector('#card-error');
    err.textContent = '';
    try {
      const kind = editing ? existingCard.kind || 'card' : f.get('kind');
      const storeFullAtSubmit = state.storeFullCardNumbers;
      const body = {
        kind,
        holder_name: f.get('holder_name'),
        balance: Number(f.get('balance')) || 0,
        card_color: cardColor,
      };
      if (kind === 'account') {
        Object.assign(body, { account_kind: f.get('account_kind'), provider: f.get('provider'), account_number: f.get('account_number'), currency: String(f.get('currency') || 'NPR').toUpperCase() });
      } else {
        Object.assign(body, { exp_month: f.get('exp_month'), exp_year: f.get('exp_year'), brand: f.get('brand'), currency: state.displayCurrency });
      }
      let card;
      if (editing) {
        body.status = f.get('status');
        if (kind === 'card') {
          const rawNumber = String(f.get('number') || '').trim();
          const enteredNumber = rawNumber.replace(/\D/g, '');
          if (rawNumber && !/^[0-9 -]+$/.test(rawNumber)) throw new Error('Card number may contain only digits, spaces, or dashes.');
          if (rawNumber && (enteredNumber.length < 12 || enteredNumber.length > 19 || !isValidCardNumber(enteredNumber))) throw new Error('Enter a valid complete card number (12-19 digits), or leave it blank to keep the current one.');
          if (rawNumber) {
            body.last4 = enteredNumber.slice(-4);
            body.full_number = enteredNumber;
          } else {
            body.last4 = existingCard.last4;
          }
        }
        ({ card } = await api(`/api/cards/${existingCard.id}`, { method: 'PUT', body }));
      } else {
        if (kind === 'card') {
          const rawNumber = String(f.get('number') || '').trim();
          const digits = rawNumber.replace(/\D/g, '');
          if (!/^[0-9 -]+$/.test(rawNumber) || digits.length < 12 || digits.length > 19 || !isValidCardNumber(digits)) throw new Error('Enter a valid complete card number with 12-19 digits.');
          body.number = digits;
        }
        ({ card } = await api('/api/cards', { method: 'POST', body }));
      }
      state.revealedCardId = null;
      state.revealedCardNumber = null;
      state.revealedCardNumberId = null;
      state.revealedBalanceCardId = null;
      if (!editing) state.activeCardId = card.id;
      state.cardOrder = state.cardOrder.filter((id) => id !== card.id);
      if (!editing) state.cardOrder.unshift(card.id);
      state.expandedCardId = null;
      closeSheet();
      await refresh();
      toast(editing ? 'Card updated' : 'Card added');
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
    .map((c) => `<option value="${c.id}" ${c.id === state.activeCardId ? 'selected' : ''}>${c.kind === 'account' ? `${escapeHtml(c.provider || 'Account')} (${c.account_kind === 'mobile_wallet' ? 'wallet' : 'bank'})` : `${brandLabel(c.brand)} •••• ${c.last4}`}</option>`)
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
      <div class="field"><label>Pay from</label><select name="card_id">${cardOpts}</select></div>
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
    .map((c) => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.kind === 'account' ? `${escapeHtml(c.provider || 'Account')} (${c.account_kind === 'mobile_wallet' ? 'wallet' : 'bank'})` : `${brandLabel(c.brand)} •••• ${c.last4}`}</option>`)
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
      .map((c) => `<button data-filter="${c.id}">${c.kind === 'account' ? escapeHtml(c.provider || 'Account') : brandLabel(c.brand)} •••• ${c.last4}</button>`)
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

const SCREENS = ['home', 'cards', 'stats', 'profile'];

// Current screen from the URL path (/cards), with legacy #cards links still honoured.
function screenFromLocation() {
  const name = location.pathname.replace(/^\/+|\/+$/g, '') || location.hash.slice(1);
  return SCREENS.includes(name) ? name : 'home';
}

function showScreen(name, { push = true } = {}) {
  if (!SCREENS.includes(name)) name = 'home';
  const path = name === 'home' ? '/' : `/${name}`;
  if (location.pathname !== path || location.hash) {
    history[push ? 'pushState' : 'replaceState'](null, '', path);
  }
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

window.addEventListener('popstate', () => showScreen(screenFromLocation(), { push: false }));

function renderProfilePhoto() {
  for (const image of [$('#home-avatar'), $('#profile-avatar')]) {
    if (state.profilePhoto) image.src = state.profilePhoto;
    else image.removeAttribute('src');
    image.hidden = !state.profilePhoto;
  }
  $('#profile-avatar-placeholder').hidden = Boolean(state.profilePhoto);
  $('#profile-photo-button').textContent = state.profilePhoto ? 'Change photo' : 'Add photo';
}

async function readProfilePhoto(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP, or GIF photo.');
  if (file.size > 1_500_000) throw new Error('Choose an image smaller than 1.5 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
  });
}

async function saveProfileName(value, prompted = false, photo = state.profilePhoto, lastName = state.profileLastName) {
  const first = String(value || '').trim().slice(0, 30);
  const last = String(lastName || '').trim().slice(0, 30);
  const body = { profile_name: [first, last].filter(Boolean).join(' '), profile_first_name: first, profile_last_name: last, profile_photo: photo || '', profile_setup_version: 2 };
  if (prompted) body.profile_name_prompted = true;
  const { settings } = await api('/api/settings', { method: 'PUT', body });
  state.profileName = settings.profile_first_name || first;
  state.profileLastName = settings.profile_last_name || last;
  state.profileNamePrompted = settings.profile_name_prompted === true;
  state.profilePhoto = settings.profile_photo || '';
  $('#home-greeting').textContent = state.profileName ? `Hello ${state.profileName}` : 'Hello there';
  $('#profile-name').textContent = [state.profileName, state.profileLastName].filter(Boolean).join(' ') || 'Your profile';
  $('#profile-first-name-input').value = state.profileName;
  $('#profile-last-name-input').value = state.profileLastName;
  renderProfilePhoto();
}

async function promptForName() {
  const root = $('#onboarding-root');
  root.hidden = false;
  const firstNameInput = $('#onboarding-first-name');
  const lastNameInput = $('#onboarding-last-name');
  const fileInput = $('#onboarding-photo-input');
  let photo = '';
  firstNameInput.value = '';
  lastNameInput.value = '';
  fileInput.value = '';
  const preview = $('#onboarding-avatar');
  preview.removeAttribute('src');
  preview.hidden = true;
  $('.onboarding-person-icon').hidden = false;
  $('#onboarding-continue').disabled = false;
  fileInput.onchange = async () => {
    try {
      photo = await readProfilePhoto(fileInput.files[0]);
      const preview = $('#onboarding-avatar');
      preview.src = photo;
      preview.hidden = !photo;
      $('.onboarding-person-icon').hidden = Boolean(photo);
    } catch (error) {
      fileInput.value = '';
      photo = '';
      toast(error.message);
    }
  };
  await new Promise((resolve) => {
    $('#onboarding-back').onclick = () => {
      root.hidden = true;
      resolve();
    };
    $('.onboarding-dialog').onsubmit = (event) => {
      event.preventDefault();
      $('#onboarding-continue').click();
    };
    firstNameInput.onkeydown = lastNameInput.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        $('#onboarding-continue').click();
      }
    };
    $('#onboarding-continue').onclick = async () => {
      const button = $('#onboarding-continue');
      button.disabled = true;
      try {
        const first = firstNameInput.value.trim();
        const last = lastNameInput.value.trim();
        if (!first || !last) throw new Error('Enter your first and last name to continue.');
        photo = fileInput.files[0] ? await readProfilePhoto(fileInput.files[0]) : photo;
        await saveProfileName(first, true, photo, last);
        firstNameInput.value = '';
        lastNameInput.value = '';
        fileInput.value = '';
        $('.onboarding-dialog').onsubmit = null;
        firstNameInput.onkeydown = null;
        lastNameInput.onkeydown = null;
        root.hidden = true;
        resolve();
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    };
  });
}

$('#profile-save-btn').addEventListener('click', async () => {
  const firstInput = $('#profile-first-name-input');
  const lastInput = $('#profile-last-name-input');
  try {
    if (!firstInput.value.trim() || !lastInput.value.trim()) throw new Error('Enter your first and last name.');
    await saveProfileName(firstInput.value, true, state.profilePhoto, lastInput.value);
    toast('Profile saved on this device');
  } catch (err) {
    toast(err.message);
  }
});

$('#profile-photo-button').addEventListener('click', async () => {
  if (state.profilePhoto && confirm('Remove your profile photo from this device?')) {
    try {
      await saveProfileName(state.profileName, true, '', state.profileLastName);
      toast('Profile photo removed from this device');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  $('#profile-photo-input').click();
});
$('#profile-photo-input').addEventListener('change', async (event) => {
  try {
    const photo = await readProfilePhoto(event.target.files[0]);
    await saveProfileName(state.profileName, true, photo, state.profileLastName);
    toast(photo ? 'Profile photo saved on this device' : 'Profile photo removed');
  } catch (err) {
    toast(err.message);
  } finally {
    event.target.value = '';
  }
});

$('#record-expense-btn').addEventListener('click', () => transactionModal('expense'));
$('#record-income-btn').addEventListener('click', () => transactionModal('income'));
$('#add-card-btn').addEventListener('click', addCardModal);
$('#add-card-btn-2').addEventListener('click', addCardModal);
$('#view-all-btn').addEventListener('click', viewAllModal);
$('#bell-btn').addEventListener('click', () => toast('You are all caught up ✨'));

$('#store-full-card-numbers').addEventListener('change', async (e) => {
  const checkbox = e.target;
  if (!checkbox.checked && !confirm('Turn off full-number storage? This permanently deletes every saved full card number. Only the last four digits will remain, and the full numbers cannot be recovered.')) {
    checkbox.checked = true;
    return;
  }
  try {
    const { settings } = await api('/api/settings', { method: 'PUT', body: { store_full_card_numbers: checkbox.checked } });
    state.storeFullCardNumbers = settings.store_full_card_numbers;
    state.revealedCardId = null;
    state.revealedCardNumber = null;
    state.revealedCardNumberId = null;
    state.revealedBalanceCardId = null;
    await refresh();
    toast(checkbox.checked ? 'Full card-number storage enabled' : 'Saved full card numbers permanently deleted');
  } catch (err) {
    checkbox.checked = state.storeFullCardNumbers;
    toast(err.message);
  }
});

$('#display-currency').addEventListener('change', async (e) => {
  const select = e.target;
  const previous = state.displayCurrency;
  if (!confirm(`Convert saved balances and transaction amounts from their current currencies to ${select.value} using the latest available daily reference rates? This changes the stored values.`)) {
    select.value = previous;
    return;
  }
  select.disabled = true;
  try {
    const { settings } = await api('/api/settings', { method: 'PUT', body: { display_currency: select.value } });
    state.displayCurrency = settings.display_currency;
    await refresh();
    toast(`Converted balances and transactions to ${state.displayCurrency}`);
  } catch (err) {
    select.value = previous;
    toast(err.message);
  } finally {
    select.disabled = false;
  }
});

async function downloadBackup() {
  try {
    const backup = await window.spendlyLocalStore.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spendly-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    writeStored(BACKUP_KEY, Date.now());
    renderBackupStatus();
    toast('Backup downloaded to your device');
  } catch (err) {
    toast(err.message);
  }
}

$('#export-backup-btn').addEventListener('click', downloadBackup);
$('#backup-reminder-now').addEventListener('click', downloadBackup);
$('#backup-reminder-later').addEventListener('click', () => {
  writeStored(BACKUP_SNOOZE_KEY, Date.now() + 3 * DAY_MS);
  renderBackupStatus();
});

const backupFile = $('#backup-file');
$('#import-backup-btn').addEventListener('click', () => backupFile.click());
backupFile.addEventListener('change', async () => {
  const file = backupFile.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Backup file must be smaller than 10 MB.');
    const backup = JSON.parse(await file.text());
    if (!confirm('Restore this backup? It will replace all cards, transactions, and preferences currently saved in this browser.')) return;
    await window.spendlyLocalStore.importBackup(backup);
    const { settings } = await api('/api/meta');
    state.storeFullCardNumbers = settings.store_full_card_numbers === true;
    state.displayCurrency = settings.display_currency || 'NPR';
    state.profileName = settings.profile_first_name || settings.profile_name || '';
    state.profileLastName = settings.profile_last_name || '';
    state.profileNamePrompted = settings.profile_name_prompted === true;
    state.profilePhoto = settings.profile_photo || '';
    $('#home-greeting').textContent = state.profileName ? `Hello ${state.profileName}` : 'Hello there';
    renderProfilePhoto();
    $('#store-full-card-numbers').checked = state.storeFullCardNumbers;
    $('#display-currency').value = state.displayCurrency;
    state.revealedCardId = null;
    state.revealedCardNumber = null;
    state.revealedCardNumberId = null;
    await refresh();
    toast('Backup restored on this device');
  } catch (err) {
    toast(err.message || 'Could not restore backup');
  } finally {
    backupFile.value = '';
  }
});

$('#reset-btn').addEventListener('click', async () => {
  if (!confirm('Wipe every card and transaction on this device? This cannot be undone.')) return;
  await window.spendlyLocalStore.clearAll();
  state.storeFullCardNumbers = false;
  state.displayCurrency = 'NPR';
  state.profileName = '';
  state.profileLastName = '';
  state.profileNamePrompted = false;
  state.profilePhoto = '';
  renderProfilePhoto();
  $('#home-greeting').textContent = 'Hello there';
  $('#profile-name').textContent = 'Your profile';
  $('#profile-first-name-input').value = '';
  $('#profile-last-name-input').value = '';
  $('#onboarding-first-name').value = '';
  $('#onboarding-last-name').value = '';
  $('#onboarding-photo-input').value = '';
  $('.onboarding-person-icon').hidden = false;
  $('#onboarding-avatar').removeAttribute('src');
  $('#onboarding-avatar').hidden = true;
  state.revealedCardId = null;
  state.revealedCardNumber = null;
  state.revealedCardNumberId = null;
  state.revealedBalanceCardId = null;
  await refresh();
  $('#onboarding-root').hidden = false;
  toast('All local data wiped');
});

let deckTouchStartX = null;
$('#card-stack').addEventListener('touchstart', (e) => {
  deckTouchStartX = e.changedTouches[0].clientX;
}, { passive: true });
$('#card-stack').addEventListener('touchend', (e) => {
  if (deckTouchStartX === null || state.cards.length < 2) return;
  const deltaX = e.changedTouches[0].clientX - deckTouchStartX;
  deckTouchStartX = null;
  if (Math.abs(deltaX) < 45) return;
  if (state.expandedCardId !== null) collapseCard();
  const current = state.cardOrder.indexOf(state.activeCardId);
  const next = (current + (deltaX < 0 ? 1 : -1) + state.cardOrder.length) % state.cardOrder.length;
  selectCard(state.cardOrder[next]);
}, { passive: true });

document.body.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') collapseCard();
});

document.addEventListener('click', (e) => {
  if (state.expandedCardId !== null && !e.target.closest('#card-stack')) collapseCard();
});

document.body.addEventListener('click', async (e) => {
  const balanceToggle = e.target.closest('[data-toggle-balance]');
  if (balanceToggle) {          await toggleCardBalance(balanceToggle.dataset.toggleBalance);
    return;
  }

  const collapseButton = e.target.closest('[data-collapse-card]');
  if (collapseButton) {
    collapseCard();
    return;
  }

  const expandedFace = e.target.closest('.physical-card-face.is-expanded');
  if (expandedFace) {
    collapseCard();
    return;
  }

  const expandButton = e.target.closest('[data-toggle-expand]');
  if (expandButton) {
    toggleCardExpanded(expandButton.dataset.toggleExpand);
    return;
  }

  const viewCards = e.target.closest('[data-view-cards]');
  if (viewCards) return viewAllCards();

  const expandedChoice = e.target.closest('[data-expanded-card-choice]');
  if (expandedChoice) {
    const id = Number(expandedChoice.dataset.expandedCardChoice);
    if (id !== state.activeCardId) {
      state.activeCardId = id;
      state.expandedCardId = id;
      state.cardOrder = [id, ...state.cardOrder.filter((cardId) => cardId !== id)];
      state.cardSelectionChanged = true;
      renderStack();
    }
    return;
  }

  const cardChoice = e.target.closest('[data-select-card]');
  if (cardChoice) {
    selectCard(cardChoice.dataset.selectCard);
    closeSheet();
    return;
  }

  const open = e.target.closest('[data-open="add-card"]');
  if (open) return addCardModal();

  const mini = e.target.closest('[data-card]');
  if (mini) {
    selectCard(mini.dataset.card);
    return;
  }

  const topBtn = e.target.closest('[data-topup]');
  if (topBtn) return topUpModal(Number(topBtn.dataset.topup));

  const editCard = e.target.closest('[data-edit-card]');
  if (editCard) return editCardModal(editCard.dataset.editCard);

  const delCard = e.target.closest('[data-del-card]');
  if (delCard) {
    const id = Number(delCard.dataset.delCard);
    if (confirm('Delete this card and its transactions from this device?')) {
      await api(`/api/cards/${id}`, { method: 'DELETE' });
      await refresh();
      toast('Card deleted');
    }
  }
});

/* ------------------------------------------------------------------ boot */

(async function init() {
  try {
    if (!('indexedDB' in window)) throw new Error('This browser does not support local storage required by Spendly.');
    await window.spendlyLocalStore.open();
    const meta = await api('/api/meta');
    state.categories = meta.categories;
    state.themes = meta.themes;
    state.storeFullCardNumbers = meta.settings?.store_full_card_numbers === true;
    state.displayCurrency = meta.settings?.display_currency || 'USD';
    state.profileName = meta.settings?.profile_first_name || meta.settings?.profile_name || '';
    state.profileLastName = meta.settings?.profile_last_name || '';
    state.profileNamePrompted = meta.settings?.profile_name_prompted === true;
    state.profilePhoto = meta.settings?.profile_photo || '';
    $('#home-greeting').textContent = state.profileName ? `Hello ${state.profileName}` : 'Hello there';
    renderProfilePhoto();
    await refresh();
    showScreen(screenFromLocation(), { push: false });
    if (!state.profileName.trim() || !state.profileLastName.trim()) {
      $('#onboarding-root').hidden = false;
      await promptForName();
    }
  } catch (err) {
    toast('Failed to load data');
    console.error(err);
  }
})();
