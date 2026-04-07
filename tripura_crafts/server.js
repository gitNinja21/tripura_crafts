const express = require('express');
const path    = require('path');
const fs      = require('fs');
const pool    = require('./db');
const { notifyAdmin, notifyCustomerConfirmed, notifyCustomerShipped } = require('./email');

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
//  API — Orders
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/orders — create a new order
app.post('/api/orders', async (req, res) => {
  try {
    const { product_id, product_name, customer_name, customer_phone,
            customer_email, customer_address, size, quantity, price_paid } = req.body;

    const result = await pool.query(
      `INSERT INTO orders
         (product_id, customer_name, customer_phone, customer_email,
          customer_address, size, quantity, price_paid, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received')
       RETURNING *`,
      [product_id, customer_name, customer_phone, customer_email,
       customer_address, size, quantity || 1, price_paid]
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
