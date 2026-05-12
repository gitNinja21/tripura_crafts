// Load .env if dotenv is available (no-op in production where the host
// injects env vars directly — Railway, Heroku, etc.).
try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const pool    = require('./db');
const { notifyAdmin, notifyCustomerConfirmed, notifyCustomerShipped } = require('./email');

// Razorpay SDK is only required if credentials are configured, so a developer
// who hasn't run `npm install` yet can still boot the rest of the app.
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  try {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log('Razorpay configured.');
  } catch (err) {
    console.error('Razorpay SDK not installed — run `npm install razorpay`.', err.message);
  }
} else {
  console.log('No RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET — payments disabled.');
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));

const view = (f) => path.join(__dirname, 'views', f);

// ── Run schema on startup if DB is connected ───────────────────────────────
async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL — skipping DB init.');
    return;
  }
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Database ready.');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}
initDB();

// ── Legacy ?nav= redirect ──────────────────────────────────────────────────
const NAV_MAP = {
  womens_wear: '/womens-wear', mens_wear: '/mens-wear',
  jewellery: '/jewellery',     home_decor: '/home-decor',
  contact: '/contact',         help: '/help',
  track_order: '/track-order',
};

// ── Pages ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const nav = req.query.nav;
  if (nav && NAV_MAP[nav]) return res.redirect(NAV_MAP[nav]);
  res.sendFile(view('index.html'));
});
app.get('/womens-wear',             (_, res) => res.sendFile(view('womens-wear.html')));
app.get('/womens-wear/:collection', (_, res) => res.sendFile(view('womens-wear.html')));
app.get('/mens-wear',               (_, res) => res.sendFile(view('mens-wear.html')));
app.get('/jewellery',               (_, res) => res.sendFile(view('jewellery.html')));
app.get('/home-decor',              (_, res) => res.sendFile(view('home-decor.html')));
app.get('/contact',                 (_, res) => res.sendFile(view('contact.html')));
app.get('/help',                    (_, res) => res.sendFile(view('help.html')));
app.get('/track-order',             (_, res) => res.sendFile(view('track-order.html')));
app.get('/admin', (req, res) => {
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'mwktai2024';
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Mwktai Admin"');
    return res.status(401).send('Unauthorised');
  }
  const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  if (pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Mwktai Admin"');
    return res.status(401).send('Unauthorised');
  }
  res.sendFile(view('admin.html'));
});

// ═══════════════════════════════════════════════════════════════════════════
//  API — Products
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/products — list all active products
app.get('/api/products', async (req, res) => {
  try {
    const { gender, collection } = req.query;
    let query = 'SELECT * FROM products WHERE active = true';
    const params = [];
    if (gender)     { params.push(gender);     query += ` AND gender = $${params.length}`; }
    if (collection) { params.push(collection); query += ` AND collection = $${params.length}`; }
    query += ' ORDER BY collection, name, size';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/products/:id/stock — update stock count
app.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const { stock } = req.body;
    const result = await pool.query(
      'UPDATE products SET stock = $1 WHERE id = $2 RETURNING *',
      [stock, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  File-based order fallback (used when DATABASE_URL is not configured —
//  useful for local Razorpay testing without spinning up Postgres).
// ═══════════════════════════════════════════════════════════════════════════
const ordersFile = path.join(__dirname, 'orders.json');
const dbDisabled = () => !process.env.DATABASE_URL;

function readOrdersFile() {
  try { return JSON.parse(fs.readFileSync(ordersFile, 'utf8')); }
  catch (_) { return []; }
}
function writeOrdersFile(list) {
  fs.writeFileSync(ordersFile, JSON.stringify(list, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════
//  API — Razorpay (Standard Web Checkout)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/razorpay/key — expose the public Key ID to the frontend.
// (KEY_SECRET is NEVER sent to the browser.)
app.get('/api/razorpay/key', (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) {
    return res.status(500).json({ error: 'Razorpay not configured' });
  }
  res.json({ key_id: process.env.RAZORPAY_KEY_ID });
});

// POST /api/razorpay/create-order
// Body: { amount: <paise int>, currency?: 'INR', receipt?: string }
// Returns: { order_id, amount, currency }
app.post('/api/razorpay/create-order', async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ error: 'Razorpay not configured on server' });
  }
  try {
    const { amount, currency = 'INR', receipt } = req.body || {};
    const amountPaise = Number(amount);
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      return res.status(400).json({ error: 'amount must be an integer >= 100 (paise)' });
    }
    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency,
      receipt:  (receipt || `rcpt_${Date.now()}`).slice(0, 40),
    });
    res.json({
      order_id: order.id,
      amount:   order.amount,
      currency: order.currency,
    });
  } catch (err) {
    console.error('Razorpay create-order error:', err);
    // Razorpay SDK errors expose statusCode (401 on bad credentials, etc.)
    const status = err && err.statusCode === 401 ? 401 : 500;
    const message =
      (err && err.error && err.error.description) ||
      err.message || 'Razorpay error';
    res.status(status).json({ error: message });
  }
});

// POST /api/razorpay/verify-payment
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Returns: { success: true }  (only on signature match)
app.post('/api/razorpay/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ success: false, error: 'Razorpay not configured' });
  }
  try {
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    // Length-mismatched buffers throw inside timingSafeEqual; guard against it.
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(razorpay_signature), 'hex');
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!valid) {
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Razorpay verify error:', err);
    res.status(400).json({ success: false, error: 'Invalid signature' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  API — Orders
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/orders — create a new order
// Razorpay fields (razorpay_order_id, razorpay_payment_id) are optional; when
// present they're stored for audit. Signature verification MUST be done by
// calling POST /api/razorpay/verify-payment before this endpoint.
app.post('/api/orders', async (req, res) => {
  try {
    const { product_id, product_name, customer_name, customer_phone,
            customer_email, customer_address, size, quantity, price_paid,
            razorpay_order_id, razorpay_payment_id } = req.body;

    const payment_status = razorpay_payment_id ? 'paid' : 'pending';

    // ── No-DB fallback: persist to orders.json instead. ────────────────────
    if (dbDisabled()) {
      const list = readOrdersFile();
      const order = {
        id: list.length ? list[0].id + 1 : 1,
        product_id, product_name,
        customer_name, customer_phone, customer_email, customer_address,
        size, quantity: quantity || 1, price_paid,
        status: 'received',
        razorpay_order_id: razorpay_order_id || null,
        razorpay_payment_id: razorpay_payment_id || null,
        payment_status,
        ordered_at: new Date().toISOString(),
      };
      list.unshift(order);
      writeOrdersFile(list);
      console.log(`Order #${order.id} saved to orders.json (no DATABASE_URL).`);
      notifyAdmin(order).catch(e => console.error('Admin email failed:', e));
      return res.status(201).json({ success: true, order_id: order.id, storage: 'file' });
    }

    const result = await pool.query(
      `INSERT INTO orders
         (product_id, customer_name, customer_phone, customer_email,
          customer_address, size, quantity, price_paid, status,
          razorpay_order_id, razorpay_payment_id, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received',$9,$10,$11)
       RETURNING *`,
      [product_id, customer_name, customer_phone, customer_email,
       customer_address, size, quantity || 1, price_paid,
       razorpay_order_id || null, razorpay_payment_id || null, payment_status]
    );

    // Reduce stock
    if (product_id) {
      await pool.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [quantity || 1, product_id]
      );
    }

    // Email admin
    notifyAdmin({ ...result.rows[0], product_name })
      .catch(e => console.error('Admin email failed:', e));

    res.status(201).json({ success: true, order_id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders — list all orders (newest first)
app.get('/api/orders', async (req, res) => {
  try {
    if (dbDisabled()) {
      const { status } = req.query;
      let list = readOrdersFile();
      if (status) list = list.filter(o => o.status === status);
      return res.json(list);
    }

    const { status } = req.query;
    let query = `
      SELECT o.*, p.name AS product_name, p.collection, p.gender, p.image
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
    `;
    const params = [];
    if (status) { params.push(status); query += ` WHERE o.status = $1`; }
    query += ' ORDER BY o.ordered_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id — update status or tracking number
app.patch('/api/orders/:id', async (req, res) => {
  try {
    const { status, tracking_number, notes } = req.body;

    if (dbDisabled()) {
      const list = readOrdersFile();
      const idx = list.findIndex(o => String(o.id) === String(req.params.id));
      if (idx === -1) return res.status(404).json({ error: 'Order not found' });
      const order = list[idx];
      if (status          !== undefined) order.status          = status;
      if (tracking_number !== undefined) order.tracking_number = tracking_number;
      if (notes           !== undefined) order.notes           = notes;
      order.updated_at = new Date().toISOString();
      list[idx] = order;
      writeOrdersFile(list);
      if (status === 'confirmed') notifyCustomerConfirmed(order).catch(e => console.error('Confirm email failed:', e));
      if (status === 'shipped')   notifyCustomerShipped(order).catch(e => console.error('Shipped email failed:', e));
      return res.json(order);
    }

    const result = await pool.query(
      `UPDATE orders
       SET status          = COALESCE($1, status),
           tracking_number = COALESCE($2, tracking_number),
           notes           = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [status, tracking_number, notes, req.params.id]
    );
    const order = result.rows[0];

    // Fetch product name for email
    if (order.product_id) {
      const p = await pool.query('SELECT name FROM products WHERE id = $1', [order.product_id]);
      if (p.rows.length) order.product_name = p.rows[0].name;
    }

    // Send customer email on status change
    if (status === 'confirmed') {
      notifyCustomerConfirmed(order).catch(e => console.error('Confirm email failed:', e));
    }
    if (status === 'shipped') {
      notifyCustomerShipped(order).catch(e => console.error('Shipped email failed:', e));
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fallback → home ────────────────────────────────────────────────────────
app.use((_, res) => res.redirect('/'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mwktai running at http://0.0.0.0:${PORT}`);
});
