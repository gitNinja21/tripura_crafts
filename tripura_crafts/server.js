// Load .env if dotenv is available (no-op in production where the host
// injects env vars directly — Railway, Heroku, etc.).
try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const pool    = require('./db');
const { notifyAdmin, notifyCustomerConfirmed, notifyCustomerShipped,
        sendSMS, sendSellerEmail } = require('./email');

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
// '/' is the language landing page (English / বাংলা) — the site's front door.
app.get('/', (req, res) => {
  const nav = req.query.nav;
  if (nav && NAV_MAP[nav]) return res.redirect(NAV_MAP[nav]);
  res.sendFile(view('landing.html'));
});
// '/home' is the actual storefront homepage (reached after picking a language).
app.get('/home', (req, res) => {
  const nav = req.query.nav;
  if (nav && NAV_MAP[nav]) return res.redirect(NAV_MAP[nav]);
  res.sendFile(view('index.html'));
});
// Alias kept for any links to the language page.
app.get('/language', (_, res) => res.sendFile(view('landing.html')));
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
    let query = `SELECT * FROM products WHERE active = true AND review_status = 'approved'`;
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
    const {
      gender, collection, name, size, price, stock, image, description,
      sku, name_bn, description_bn,
    } = req.body || {};
    if (!gender || !collection || !name || price == null || stock == null || !image) {
      return res.status(400).json({
        error: 'gender, collection, name, price, stock and image are required',
      });
    }
    const result = await pool.query(
      `INSERT INTO products
         (gender, collection, name, name_bn, size, price, stock, image,
          description, description_bn, sku, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
       RETURNING *`,
      [gender, collection, name, name_bn || null, size || null, price, stock, image,
       description || null, description_bn || null, (sku && sku.trim()) || null]
    );
    const row = result.rows[0];
    // Auto-generate SKU (MWK-NNNN) if admin didn't supply one.
    if (!row.sku) {
      const skuVal = 'MWK-' + String(row.id).padStart(4, '0');
      await pool.query('UPDATE products SET sku = $1 WHERE id = $2', [skuVal, row.id]);
      row.sku = skuVal;
    }
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/products/:id — update any subset of fields (admin)
app.patch('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const allowed = ['gender','collection','name','name_bn','size','price','stock',
                     'image','description','description_bn','sku','active'];
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

// POST /api/admin/delete-all-products — wipe products. Hard-deletes ones not
// referenced by any order; soft-deletes the rest (so order history stays).
app.post('/api/admin/delete-all-products', requireAdmin, async (req, res) => {
  try {
    const hard = await pool.query(`
      DELETE FROM products
        WHERE id NOT IN (
          SELECT DISTINCT product_id FROM orders WHERE product_id IS NOT NULL
        )
        RETURNING id`);
    const soft = await pool.query(`
      UPDATE products SET active = false
        WHERE active = true
        RETURNING id`);
    res.json({
      success: true,
      hard_deleted: hard.rowCount,
      soft_deleted: soft.rowCount,
    });
  } catch (err) {
    console.error('Delete-all error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/upload-config — Cloudinary cloud name + unsigned upload
// preset for the admin image uploader. Neither value is secret (both are
// designed to be used from the browser); the API SECRET is never exposed.
app.get('/api/admin/upload-config', requireAdmin, (req, res) => {
  res.json({
    cloud_name:    process.env.CLOUDINARY_CLOUD_NAME    || '',
    upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
  });
});

// POST /api/admin/purge-inactive-products — physically delete soft-deleted
// (active=false) products, but ONLY those not referenced by any existing order
// (so order history stays intact). Safe to run repeatedly.
app.post('/api/admin/purge-inactive-products', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      DELETE FROM products
       WHERE active = false
         AND id NOT IN (
           SELECT DISTINCT product_id FROM orders
            WHERE product_id IS NOT NULL
         )
       RETURNING id, name, size`);

    const counts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE active = true)  AS active_count,
        COUNT(*) FILTER (WHERE active = false) AS inactive_count,
        COUNT(*)                                AS total_count
      FROM products`);

    res.json({
      success: true,
      deleted_count: result.rowCount,
      deleted_rows: result.rows,
      counts: counts.rows[0],
    });
  } catch (err) {
    console.error('Purge error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/dedupe-products — one-shot cleanup for duplicate seed rows.
// Keeps the row with the highest stock per unique (gender, collection, name,
// size) combo, soft-deletes the rest. Idempotent — running it again is a
// no-op once duplicates are gone.
app.post('/api/admin/dedupe-products', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY gender, collection, name, size
                 ORDER BY stock DESC, id ASC
               ) AS rn
        FROM products
        WHERE active = true
      )
      UPDATE products
         SET active = false
       WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
       RETURNING id, name, size, stock`);

    // Confirm what's left
    const after = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM products WHERE active = true) AS active_count,
        (SELECT COUNT(*)::int FROM (
          SELECT 1 FROM products WHERE active = true
          GROUP BY gender, collection, name, size HAVING COUNT(*) > 1
        ) x) AS remaining_duplicate_groups`);

    res.json({
      success: true,
      deactivated_count: result.rowCount,
      deactivated_rows: result.rows,
      after: after.rows[0],
    });
  } catch (err) {
    console.error('Dedupe error:', err);
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
//  Marketplace — sellers, OTP login, seller portal API, admin tooling
// ═══════════════════════════════════════════════════════════════════════════

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  h.split(/;\s*/).forEach(p => {
    if (!p) return;
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '').replace(/^(91|0)/, '');
  return digits.length === 10 ? digits : null;
}

async function requireSeller(req, res, next) {
  try {
    const token = parseCookies(req).seller_session;
    if (!token) return res.status(401).json({ error: 'Login required' });
    const r = await pool.query(
      `SELECT s.* FROM seller_sessions ss
         JOIN sellers s ON s.id = ss.seller_id
        WHERE ss.token = $1 AND ss.expires_at > NOW()`,
      [token]
    );
    if (r.rowCount === 0) return res.status(401).json({ error: 'Session expired' });
    if (r.rows[0].status !== 'active') return res.status(403).json({ error: 'Account not active' });
    req.seller = r.rows[0];
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Page routes ──────────────────────────────────────────────────────────
app.get('/seller',       (_, res) => res.sendFile(view('seller.html')));
app.get('/seller-login', (_, res) => res.sendFile(view('seller.html')));
app.get('/sell-with-us', (_, res) => res.sendFile(view('seller.html')));

// ── Seller auth: phone-OTP ───────────────────────────────────────────────
// POST /api/seller/login/request-otp { phone }  → SMS the seller a 6-digit code
app.post('/api/seller/login/request-otp', async (req, res) => {
  try {
    const phone = normalizePhone(req.body && req.body.phone);
    if (!phone) return res.status(400).json({ error: 'Valid 10-digit phone required' });
    // Only registered sellers may log in (avoids phone enumeration: respond OK either way).
    const seller = await pool.query('SELECT id FROM sellers WHERE phone = $1 AND status = $2', [phone, 'active']);
    if (seller.rowCount === 0) {
      console.log(`OTP requested for unregistered/inactive phone: ${phone}`);
      return res.json({ success: true });   // silent no-op
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await pool.query(
      `INSERT INTO seller_otps (phone, code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (phone) DO UPDATE SET code = $2, expires_at = NOW() + INTERVAL '10 minutes'`,
      [phone, code]
    );
    console.log(`Seller OTP for ${phone}: ${code}`);
    sendSMS(phone, `Your Mwktai seller login code is ${code}. Valid for 10 minutes.`)
      .catch(e => console.error('OTP SMS failed:', e.message));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seller/login/verify-otp { phone, code } → set seller_session cookie
app.post('/api/seller/login/verify-otp', async (req, res) => {
  try {
    const phone = normalizePhone(req.body && req.body.phone);
    const code  = String((req.body && req.body.code) || '').trim();
    if (!phone || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Phone and 6-digit code required' });
    const otp = await pool.query(
      'SELECT * FROM seller_otps WHERE phone = $1 AND code = $2 AND expires_at > NOW()',
      [phone, code]
    );
    if (otp.rowCount === 0) return res.status(401).json({ error: 'Invalid or expired code' });
    const seller = await pool.query('SELECT * FROM sellers WHERE phone = $1 AND status = $2', [phone, 'active']);
    if (seller.rowCount === 0) return res.status(403).json({ error: 'Account not active' });
    await pool.query('DELETE FROM seller_otps WHERE phone = $1', [phone]);
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO seller_sessions (token, seller_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [token, seller.rows[0].id]
    );
    res.cookie('seller_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 30*24*60*60*1000 });
    res.json({ success: true, seller: { id: seller.rows[0].id, name: seller.rows[0].name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/seller/logout', async (req, res) => {
  const token = parseCookies(req).seller_session;
  if (token) await pool.query('DELETE FROM seller_sessions WHERE token = $1', [token]).catch(() => {});
  res.clearCookie('seller_session');
  res.json({ success: true });
});

// ── Seller portal endpoints (scoped to req.seller.id) ────────────────────
app.get('/api/seller/me', requireSeller, (req, res) => {
  const s = req.seller;
  res.json({
    id: s.id, name: s.name, phone: s.phone, email: s.email,
    upi_id: s.upi_id, bank_account: s.bank_account, bank_ifsc: s.bank_ifsc,
    bank_holder_name: s.bank_holder_name, commission_rate: s.commission_rate,
  });
});

app.get('/api/seller/products', requireSeller, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM products WHERE seller_id = $1 ORDER BY id DESC',
      [req.seller.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/seller/products', requireSeller, async (req, res) => {
  try {
    const { gender, collection, name, name_bn, size, price, stock, image, description, description_bn, sku } = req.body || {};
    if (!gender || !collection || !name || price == null || stock == null || !image) {
      return res.status(400).json({ error: 'gender, collection, name, price, stock and image are required' });
    }
    const r = await pool.query(
      `INSERT INTO products
         (seller_id, gender, collection, name, name_bn, size, price, stock, image,
          description, description_bn, sku, active, review_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,'pending')
       RETURNING *`,
      [req.seller.id, gender, collection, name, name_bn || null, size || null, price, stock, image,
       description || null, description_bn || null, (sku && sku.trim()) || null]
    );
    const row = r.rows[0];
    if (!row.sku) {
      const skuVal = 'MWK-' + String(row.id).padStart(4, '0');
      await pool.query('UPDATE products SET sku = $1 WHERE id = $2', [skuVal, row.id]);
      row.sku = skuVal;
    }
    // Notify Mwktai admin
    sendSMS(process.env.ADMIN_PHONE || '', `New product submission from ${req.seller.name}: "${name}". Review on /admin → Reviews.`)
      .catch(() => {});
    sendSellerEmail('mwktaitripura@gmail.com', `New product needs review: ${name}`,
      `Seller: ${req.seller.name} (#${req.seller.id})\nProduct: ${name}\nCollection: ${collection}\nPrice: ₹${price}\n\nReview on /admin → Reviews.`)
      .catch(() => {});
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/seller/products/:id', requireSeller, async (req, res) => {
  try {
    const owned = await pool.query('SELECT review_status FROM products WHERE id = $1 AND seller_id = $2',
      [req.params.id, req.seller.id]);
    if (owned.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    const sellerAllowed = ['name','name_bn','size','price','stock','image','description','description_bn','collection','gender'];
    const substantive = ['name','name_bn','size','price','image','description','description_bn','collection','gender'];
    const sets = []; const params = []; let triggersReview = false;
    for (const f of sellerAllowed) {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        sets.push(`${f} = $${params.length}`);
        if (substantive.includes(f)) triggersReview = true;
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    // Substantive edits flip status back to pending review (per policy).
    if (triggersReview && owned.rows[0].review_status === 'approved') {
      sets.push(`review_status = 'pending'`);
    }
    params.push(req.params.id, req.seller.id);
    const r = await pool.query(
      `UPDATE products SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND seller_id = $${params.length}
        RETURNING *`, params);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/seller/orders', requireSeller, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, p.name AS product_name, p.image
         FROM orders o
         LEFT JOIN products p ON p.id = o.product_id
        WHERE o.seller_id = $1
        ORDER BY o.ordered_at DESC`,
      [req.seller.id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/seller/orders/:id', requireSeller, async (req, res) => {
  try {
    const { status, tracking_number, notes } = req.body || {};
    if (status && !['shipped', 'delivered'].includes(status)) {
      return res.status(400).json({ error: 'Sellers can only mark shipped or delivered' });
    }
    const r = await pool.query(
      `UPDATE orders
          SET status = COALESCE($1, status),
              tracking_number = COALESCE($2, tracking_number),
              notes = COALESCE($3, notes)
        WHERE id = $4 AND seller_id = $5
        RETURNING *`,
      [status || null, tracking_number || null, notes || null, req.params.id, req.seller.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
    if (status === 'shipped') {
      notifyCustomerShipped(r.rows[0]).catch(e => console.error('Shipped email failed:', e));
    }
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/seller/payouts', requireSeller, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, ordered_at, payout_status, payout_paid_at, payout_reference,
              seller_payout, commission_amount, status
         FROM orders
        WHERE seller_id = $1 AND payment_status = 'paid'
        ORDER BY ordered_at DESC`,
      [req.seller.id]
    );
    const pending = r.rows.filter(o => o.payout_status === 'pending');
    const paid    = r.rows.filter(o => o.payout_status === 'paid');
    const sum = arr => arr.reduce((s, o) => s + Number(o.seller_payout || 0), 0);
    res.json({
      orders: r.rows,
      pending_count:   pending.length,
      pending_amount:  sum(pending),
      paid_count:      paid.length,
      paid_amount:     sum(paid),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/seller/me', requireSeller, async (req, res) => {
  try {
    const allowed = ['email', 'upi_id', 'bank_account', 'bank_ifsc', 'bank_holder_name'];
    const sets = []; const params = [];
    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        params.push(req.body[f] || null);
        sets.push(`${f} = $${params.length}`);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.seller.id);
    const r = await pool.query(
      `UPDATE sellers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: sellers, reviews, payouts ─────────────────────────────────────
app.get('/api/admin/sellers', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM sellers ORDER BY id ASC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/sellers', requireAdmin, async (req, res) => {
  try {
    const { name, phone, email, upi_id, bank_account, bank_ifsc, bank_holder_name, commission_rate, status } = req.body || {};
    const normalized = normalizePhone(phone);
    if (!name || !normalized) return res.status(400).json({ error: 'name and valid 10-digit phone required' });
    const r = await pool.query(
      `INSERT INTO sellers (name, phone, email, upi_id, bank_account, bank_ifsc, bank_holder_name, commission_rate, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, normalized, email || null, upi_id || null, bank_account || null, bank_ifsc || null,
       bank_holder_name || null, commission_rate != null ? commission_rate : 15, status || 'active']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Phone already registered' });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/sellers/:id', requireAdmin, async (req, res) => {
  try {
    const allowed = ['name','email','upi_id','bank_account','bank_ifsc','bank_holder_name','commission_rate','status'];
    const sets = []; const params = [];
    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]); sets.push(`${f} = $${params.length}`);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    const r = await pool.query(`UPDATE sellers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Seller not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/reviews', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.*, s.name AS seller_name
         FROM products p
         LEFT JOIN sellers s ON s.id = p.seller_id
        WHERE p.review_status = 'pending' AND p.active = true
        ORDER BY p.id DESC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/products/:id/approve', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE products SET review_status = 'approved', review_note = NULL
        WHERE id = $1 RETURNING *, (SELECT phone FROM sellers WHERE id = products.seller_id) AS seller_phone,
                                   (SELECT email FROM sellers WHERE id = products.seller_id) AS seller_email,
                                   (SELECT name  FROM sellers WHERE id = products.seller_id) AS seller_name`,
      [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    const row = r.rows[0];
    sendSMS(row.seller_phone, `Hi ${row.seller_name}, your product "${row.name}" is now live on Mwktai!`).catch(()=>{});
    sendSellerEmail(row.seller_email, `"${row.name}" is now live on Mwktai`,
      `Good news — your product "${row.name}" has been approved and is now live on the storefront.\nLog in at /seller to see it.`).catch(()=>{});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/products/:id/reject', requireAdmin, async (req, res) => {
  try {
    const note = (req.body && req.body.note) || 'No reason provided.';
    const r = await pool.query(
      `UPDATE products SET review_status = 'rejected', review_note = $1
        WHERE id = $2 RETURNING *, (SELECT phone FROM sellers WHERE id = products.seller_id) AS seller_phone,
                                   (SELECT email FROM sellers WHERE id = products.seller_id) AS seller_email,
                                   (SELECT name  FROM sellers WHERE id = products.seller_id) AS seller_name`,
      [note, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    const row = r.rows[0];
    sendSMS(row.seller_phone, `Mwktai: your product "${row.name}" needs changes. Reason: ${note}. Edit it at /seller.`).catch(()=>{});
    sendSellerEmail(row.seller_email, `"${row.name}" needs changes`,
      `Mwktai reviewed your product and asked for changes before going live.\n\nReason: ${note}\n\nLog in at /seller to edit and resubmit.`).catch(()=>{});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/payouts', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id AS seller_id, s.name AS seller_name, s.phone, s.upi_id,
              s.bank_account, s.bank_ifsc, s.bank_holder_name,
              COUNT(o.id)::int AS order_count,
              COALESCE(SUM(o.seller_payout), 0)::int AS total_due,
              ARRAY_AGG(o.id ORDER BY o.id) AS order_ids
         FROM orders o
         JOIN sellers s ON s.id = o.seller_id
        WHERE o.payment_status = 'paid'
          AND o.payout_status = 'pending'
          AND o.ordered_at < NOW() - INTERVAL '2 days'
        GROUP BY s.id, s.name, s.phone, s.upi_id, s.bank_account, s.bank_ifsc, s.bank_holder_name
        ORDER BY total_due DESC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/payouts/mark-paid', requireAdmin, async (req, res) => {
  try {
    const { order_ids, reference } = req.body || {};
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'order_ids array required' });
    }
    const r = await pool.query(
      `UPDATE orders
          SET payout_status   = 'paid',
              payout_paid_at  = NOW(),
              payout_reference = $1
        WHERE id = ANY($2::int[])
          AND payout_status = 'pending'
        RETURNING id, seller_id, seller_payout`,
      [reference || null, order_ids]);
    // Notify each affected seller
    const bySeller = {};
    for (const row of r.rows) {
      bySeller[row.seller_id] = (bySeller[row.seller_id] || 0) + Number(row.seller_payout);
    }
    for (const sid of Object.keys(bySeller)) {
      const s = await pool.query('SELECT name, phone, email FROM sellers WHERE id = $1', [sid]);
      if (s.rowCount) {
        const amt = bySeller[sid];
        sendSMS(s.rows[0].phone, `Hi ${s.rows[0].name}, ₹${amt} paid to your account for ${r.rows.filter(o=>o.seller_id==sid).length} order(s). Ref: ${reference || '—'}.`).catch(()=>{});
        sendSellerEmail(s.rows[0].email, `Payout sent: ₹${amt}`,
          `₹${amt} has been transferred to your account for ${r.rows.filter(o=>o.seller_id==sid).length} order(s).\nReference: ${reference || '—'}.\n\nLog in at /seller to see details.`).catch(()=>{});
      }
    }
    res.json({ success: true, marked_paid_count: r.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

        // Look up the product's seller + commission rate, then compute the
        // commission and seller payout for this order at sale time.
        const sellerLookup = await client.query(
          `SELECT s.id AS seller_id, s.commission_rate
             FROM products p
             LEFT JOIN sellers s ON s.id = p.seller_id
            WHERE p.id = $1`,
          [product_id]
        );
        const sellerRow = sellerLookup.rows[0] || {};
        const sellerId  = sellerRow.seller_id || null;
        const commRate  = Number(sellerRow.commission_rate || 0);
        const grossRupees = Math.round(amountPaise / 100);
        const commission  = Math.round(grossRupees * commRate / 100);
        const sellerPay   = grossRupees - commission;

        // Stock is held; create the Razorpay order, then the pending row.
        const order = await makeRzpOrder();
        await client.query(
          `INSERT INTO orders
             (product_id, customer_name, customer_phone, customer_email,
              customer_address, size, quantity, price_paid, status,
              razorpay_order_id, payment_status,
              seller_id, commission_amount, seller_payout)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received',$9,'pending',$10,$11,$12)`,
          [product_id, customer_name || 'Pending', customer_phone || '',
           customer_email || null, customer_address || 'Pending',
           size || null, qty, grossRupees, order.id,
           sellerId, commission, sellerPay]
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
      // Auto-confirm if Razorpay payment is verified — same rule as DB path.
      const autoConfirmed = !!razorpay_payment_id;
      const order = {
        id: list.length ? list[0].id + 1 : 1,
        product_id, product_name,
        customer_name, customer_phone, customer_email, customer_address,
        size, quantity: quantity || 1, price_paid,
        status: autoConfirmed ? 'confirmed' : 'received',
        razorpay_order_id: razorpay_order_id || null,
        razorpay_payment_id: razorpay_payment_id || null,
        payment_status,
        ordered_at: new Date().toISOString(),
      };
      list.unshift(order);
      writeOrdersFile(list);
      console.log(`Order #${order.id} saved to orders.json (no DATABASE_URL).`);
      notifyAdmin(order).catch(e => console.error('Admin email failed:', e));
      if (autoConfirmed) {
        notifyCustomerConfirmed(order).catch(e => console.error('Customer confirm email failed:', e));
      }
      return res.status(201).json({ success: true, order_id: order.id, storage: 'file' });
    }

    // ── Idempotency + auto-confirm. In the Razorpay flow, create-order
    //    already reserved stock and inserted this order as 'received'. Since
    //    payment is now verified, advance status → 'confirmed' atomically
    //    (idempotent: only fires the *first* call; later calls match 0 rows).
    //    On that first call, fire both the admin and the customer-confirmed
    //    emails. Later calls just return the existing row. ───────────────────
    if (razorpay_order_id) {
      const promoted = await pool.query(
        `UPDATE orders
            SET status = 'confirmed'
          WHERE razorpay_order_id = $1 AND status = 'received'
          RETURNING *`,
        [razorpay_order_id]
      );

      if (promoted.rowCount > 0) {
        const row = promoted.rows[0];
        const enriched = { ...row, product_name: product_name || row.product_name };
        notifyAdmin(enriched)
          .catch(e => console.error('Admin email failed:', e));
        notifyCustomerConfirmed(enriched)
          .catch(e => console.error('Customer confirm email failed:', e));
        // Notify the seller (skip if it's Mwktai itself — they get notifyAdmin).
        if (row.seller_id) {
          (async () => {
            try {
              const s = await pool.query("SELECT name, phone, email FROM sellers WHERE id = $1 AND phone != 'MWKTAI'", [row.seller_id]);
              if (s.rowCount) {
                const seller = s.rows[0];
                const text = `New Mwktai order #${row.id}: ${enriched.product_name}${row.size ? ' (Size '+row.size+')' : ''}. Customer: ${row.customer_name}, ${row.customer_phone}. Your share: ₹${row.seller_payout}. Ship within 2 days.`;
                sendSMS(seller.phone, text).catch(()=>{});
                sendSellerEmail(seller.email, `New order #${row.id} on Mwktai`,
                  `Hi ${seller.name},\n\nA new order just came in:\n\nProduct: ${enriched.product_name}${row.size ? ' (Size '+row.size+')' : ''}\nCustomer: ${row.customer_name}\nPhone: ${row.customer_phone}\nAddress: ${row.customer_address}\n\nYour share: ₹${row.seller_payout} (after ₹${row.commission_amount} commission).\n\nPlease ship within 2 business days. Log in at /seller to update the order.`)
                  .catch(()=>{});
              }
            } catch (e) { console.error('Seller-notify error:', e.message); }
          })();
        }
        return res.status(201).json({
          success: true, order_id: row.id, reserved: true, confirmed: true,
        });
      }

      // Already past 'received' (e.g. retry of the same /api/orders call) —
      // just fetch and return the row idempotently. No emails.
      const existing = await pool.query(
        'SELECT * FROM orders WHERE razorpay_order_id = $1 LIMIT 1',
        [razorpay_order_id]
      );
      if (existing.rowCount > 0) {
        return res.status(201).json({
          success: true, order_id: existing.rows[0].id, reserved: true,
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

// DELETE /api/orders/:id — admin hard-delete one order.
app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    if (dbDisabled()) {
      const list = readOrdersFile();
      const idx = list.findIndex(o => String(o.id) === String(req.params.id));
      if (idx === -1) return res.status(404).json({ error: 'Order not found' });
      list.splice(idx, 1);
      writeOrdersFile(list);
      return res.json({ success: true });
    }
    const result = await pool.query(
      'DELETE FROM orders WHERE id = $1 RETURNING id', [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/delete-all-orders — wipe every order (test cleanup).
app.post('/api/admin/delete-all-orders', requireAdmin, async (req, res) => {
  try {
    if (dbDisabled()) {
      writeOrdersFile([]);
      return res.json({ success: true, deleted_count: 0 });
    }
    const result = await pool.query('DELETE FROM orders RETURNING id');
    res.json({ success: true, deleted_count: result.rowCount });
  } catch (err) {
    console.error('Delete-all-orders error:', err);
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
  // pool.connect() is INSIDE the try — if the DB is unreachable it throws,
  // and an unhandled rejection from this setInterval callback would crash
  // the whole process. Catching it here keeps the site alive.
  let client;
  try {
    client = await pool.connect();
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
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Reservation sweep error:', err.message);
  } finally {
    if (client) client.release();
  }
}
setInterval(() => { sweepStaleReservations().catch(e => console.error('Sweep crashed:', e.message)); },
            5 * 60 * 1000);

// ── Last-resort safety net: never let a stray async error crash the process.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (ignored):', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (ignored):', err && err.message ? err.message : err);
});

// ── Fallback → home ────────────────────────────────────────────────────────
app.use((_, res) => res.redirect('/'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mwktai running at http://0.0.0.0:${PORT}`);
});
