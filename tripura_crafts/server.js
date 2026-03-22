const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ── Static assets (images) ─────────────────────────────────────────────────
app.use('/static', express.static(path.join(__dirname, 'static')));

// ── Helper ─────────────────────────────────────────────────────────────────
const view = (f) => path.join(__dirname, 'views', f);

// ── Route map (also handles legacy Streamlit ?nav= query params) ───────────
const NAV_MAP = {
  womens_wear:  '/womens-wear',
  mens_wear:    '/mens-wear',
  jewellery:    '/jewellery',
  home_decor:   '/home-decor',
  contact:      '/contact',
  help:         '/help',
  track_order:  '/track-order',
};

// ── Landing page ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const nav = req.query.nav;
  if (nav && NAV_MAP[nav]) return res.redirect(NAV_MAP[nav]);
  res.sendFile(view('index.html'));
});

// ── Collection pages ───────────────────────────────────────────────────────
app.get('/womens-wear',              (_, res) => res.sendFile(view('womens-wear.html')));
app.get('/womens-wear/:collection',  (_, res) => res.sendFile(view('womens-wear.html')));
app.get('/mens-wear',                (_, res) => res.sendFile(view('mens-wear.html')));
app.get('/jewellery',                (_, res) => res.sendFile(view('jewellery.html')));
app.get('/home-decor',               (_, res) => res.sendFile(view('home-decor.html')));
app.get('/contact',                  (_, res) => res.sendFile(view('contact.html')));
app.get('/help',                     (_, res) => res.sendFile(view('help.html')));
app.get('/track-order',              (_, res) => res.sendFile(view('track-order.html')));

// ── Fallback → home ────────────────────────────────────────────────────────
app.use((_, res) => res.redirect('/'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tripura Craftsmen running at http://0.0.0.0:${PORT}`);
});
