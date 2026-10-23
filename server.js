'use strict';

// Static file host only. All user data lives in the browser (IndexedDB);
// nothing is stored or processed here.
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.static(PUBLIC_DIR));

// SPA fallback so /cards, /stats, /profile work on refresh.
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => console.log(`Spendly running at http://localhost:${PORT}`));
