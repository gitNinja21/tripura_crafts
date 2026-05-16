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
// ── Admin Basic Auth middleware ────────────────────────────────────────────
// Once the browser caches credentials for /admin, it sends them automatically
// on subsequent same-origin fetches — so the admin UI's POST/PATCH/DELETE
// calls are authenticated without any extra wiring on the frontend side.
function requireAdmin(req, res, next) {
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'mwktai2024';
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Mwktai Admin"');
    return res.status(401).send('Unauthorised');
  }
  const pass = Buffer.from(auth.slice(6), 'base64').toString().split(':')[1];
  if (pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Mwktai Admin"');
    return res.status(401).send('Unauthorised');
  }
  next();
}

app.get('/admin', requireAdmin, (_, res) => res.sendFile(view('admin.html')));

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

// PATCH /api/products/:id/stock — quick stock-only update (admin)
app.patch('/api/products/:id/stock', requireAdmin, async (req, res) => {
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

// POST /api/products — create a new product (admin)
app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const { gender, collection, name, size, price, stock, image, description } = req.body || {};
    if (!gender || !collection || !name || price == null || stock == null || !image) {
      return res.status(400).json({
        error: 'gender, collection, name, price, stock and image are required',
      });
    }
    const result = await pool.query(
      `INSERT INTO products (gender, collection, name, size, price, stock, image, description, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
       RETURNING *`,
      [gender, collection, name, size || null, price, stock, image, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/products/:id — update any subset of fields (admin)
app.patch('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const allowed = ['gender','collection','name','size','price','stock','image','description','active'];
    const sets = [];
    const params = [];
    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        sets.push(`${f} = $${params.length}`);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id — soft delete (sets active = false). (admin)
// Soft so existing orders that reference this product still resolve cleanly.
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE products SET active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, id: result.rows[0].id });
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
// Body: { amount, currency?, receipt?, product_id?, quantity?, size?,
//         product_name?, customer_name?, customer_phone?, customer_email?,
//         customer_address? }
// Returns: { order_id, amount, currency }   |   409 { sold_out: true } if no stock
//
// When a product_id is supplied and the DB is connected, stock is RESERVED
// here — BEFORE the payment modal opens — inside a transaction: an atomic
// conditional decrement plus a 'pending' order row tied to the Razorpay order.
// This guarantees a customer can never pay for an item that's already gone.
// Reservations abandoned without payment are released by the sweep below.
app.post('/api/razorpay/create-order', async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ error: 'Razorpay not configured on server' });
  }
  try {
    const { amount, currency = 'INR', receipt,
            product_id, quantity, size, product_name,
            customer_name, customer_phone, customer_email, customer_address } = req.body || {};
    const amountPaise = Number(amount);
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      return res.status(400).json({ error: 'amount must be an integer >= 100 (paise)' });
    }
    const qty = quantity || 1;

    const makeRzpOrder = () => razorpay.orders.create({
      amount:   amountPaise,
      currency,
      receipt:  (receipt || `rcpt_${Date.now()}`).slice(0, 40),
    });

    // ── Reserve stock + create a pending order (DB connected & product known) ─
    if (!dbDisabled() && product_id) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Atomic conditional reservation — 0 rows means it's already sold out.
        const stockResult = await client.query(
          'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
          [qty, product_id]
        );
        if (stockResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            sold_out: true,
            error: 'This item just sold out — please pick another size or product.',
          });
        }

        // Stock is held; create the Razorpay order, then the pending row.
        const order = await makeRzpOrder();
        await client.query(
          `INSERT INTO orders
             (product_id, customer_name, customer_phone, customer_email,
              customer_address, size, quantity, price_paid, status,
              razorpay_order_id, payment_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received',$9,'pending')`,
          [product_id, customer_name || 'Pending', customer_phone || '',
           customer_email || null, customer_address || 'Pending',
           size || null, qty, Math.round(amountPaise / 100), order.id]
        );
        await client.query('COMMIT');
        return res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }
    }

    // ── No DB, or no product specified: create the order without reservation ─
    const order = await makeRzpOrder();
    res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
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
app.post('/api/razorpay/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ success: false, error: 'Razorpay not configured' });
  }

  let valid = false;
  try {
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    // Length-mismatched buffers throw inside timingSafeEqual; guard against it.
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(razorpay_signature), 'hex');
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error('Razorpay verify error:', err);
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  if (!valid) {
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  // Signature good — promote the reserved (pending) order to paid. A DB hiccup
  // here must NOT fail the request: the payment is verified, which is what
  // matters; /api/orders is idempotent and the sweep won't touch a paid row.
  if (!dbDisabled()) {
    try {
      await pool.query(
        `UPDATE orders
            SET payment_status = 'paid', razorpay_payment_id = $2
          WHERE razorpay_order_id = $1 AND payment_status = 'pending'`,
        [razorpay_order_id, razorpay_payment_id]
      );
    } catch (dbErr) {
      console.error('verify-payment: could not promote order:', dbErr.message);
    }
  }
  res.json({ success: true });
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

    // ── Idempotency: in the Razorpay flow, create-order already reserved
    //    stock and inserted this order. Don't insert a duplicate or decrement
    //    stock a second time — just confirm the existing row, and send the
    //    admin notification here (create-order can't, payment isn't done yet). ─
    if (razorpay_order_id) {
      const existing = await pool.query(
        'SELECT * FROM orders WHERE razorpay_order_id = $1 LIMIT 1',
        [razorpay_order_id]
      );
      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        notifyAdmin({ ...row, product_name: product_name || row.product_name })
          .catch(e => console.error('Admin email failed:', e));
        return res.status(201).json({
          success: true, order_id: row.id, reserved: true,
        });
      }
    }

    // ── DB path: stock decrement + order insert in one transaction ─────────
    // The stock UPDATE is conditional (`stock >= qty`) so two simultaneous
    // buyers of the last unit can't both succeed — Postgres row locking
    // serialises them, and the loser's UPDATE matches 0 rows. (This branch
    // only runs for non-reserved orders, e.g. legacy or non-Razorpay flows.)
    const qty = quantity || 1;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (product_id) {
        const stockResult = await client.query(
          'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
          [qty, product_id]
        );
        if (stockResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            sold_out: true,
            error: 'This item just sold out — please refresh and try another size/product.',
          });
        }
      }

      const result = await client.query(
        `INSERT INTO orders
           (product_id, customer_name, customer_phone, customer_email,
            customer_address, size, quantity, price_paid, status,
            razorpay_order_id, razorpay_payment_id, payment_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received',$9,$10,$11)
         RETURNING *`,
        [product_id, customer_name, customer_phone, customer_email,
         customer_address, size, qty, price_paid,
         razorpay_order_id || null, razorpay_payment_id || null, payment_status]
      );

      await client.query('COMMIT');

      // Email admin (fire-and-forget — outside the transaction)
      notifyAdmin({ ...result.rows[0], product_name })
        .catch(e => console.error('Admin email failed:', e));

      res.status(201).json({ success: true, order_id: result.rows[0].id });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
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

// ═══════════════════════════════════════════════════════════════════════════
//  Reservation sweep
// ═══════════════════════════════════════════════════════════════════════════
// create-order reserves stock by inserting a 'pending' order. If the customer
// abandons the Razorpay modal — or their browser dies before paying — that
// stock would stay locked forever. Every 5 minutes, release reservations that
// have been pending longer than RESERVATION_TTL_MIN: restore the stock and
// mark the order 'abandoned'. Paid orders are never touched.
const RESERVATION_TTL_MIN = 20;

async function sweepStaleReservations() {
  if (dbDisabled()) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stale = await client.query(
      `SELECT id, product_id, quantity FROM orders
        WHERE payment_status = 'pending'
          AND ordered_at < NOW() - ($1 * INTERVAL '1 minute')
        FOR UPDATE`,
      [RESERVATION_TTL_MIN]
    );
    for (const o of stale.rows) {
      if (o.product_id) {
        await client.query(
          'UPDATE products SET stock = stock + $1 WHERE id = $2',
          [o.quantity || 1, o.product_id]
        );
      }
      await client.query(
        `UPDATE orders SET payment_status = 'abandoned' WHERE id = $1`,
        [o.id]
      );
    }
    await client.query('COMMIT');
    if (stale.rowCount > 0) {
      console.log(`Reservation sweep: released ${stale.rowCount} abandoned reservation(s).`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Reservation sweep error:', err.message);
  } finally {
    client.release();
  }
}
setInterval(sweepStaleReservations, 5 * 60 * 1000);

// ── Fallback → home ────────────────────────────────────────────────────────
app.use((_, res) => res.redirect('/'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mwktai running at http://0.0.0.0:${PORT}`);
});
