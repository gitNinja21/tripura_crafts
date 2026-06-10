-- ─────────────────────────────────────────────
--  MWKTAI — Database Schema
-- ─────────────────────────────────────────────

-- Products / Inventory
-- Each size of a product is its own row.
-- e.g. Kubai Heritage Shirt has 3 rows: S, M, L

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  gender      VARCHAR(10)  NOT NULL,          -- 'womens' | 'mens'
  collection  VARCHAR(50)  NOT NULL,          -- 'risa' | 'kubai' etc.
  name        VARCHAR(100) NOT NULL,          -- 'Risa Heritage Set'
  size        VARCHAR(5),                     -- 'S' | 'M' | 'L' | NULL (for unsized items)
  price       INTEGER      NOT NULL,          -- in rupees, e.g. 1499
  stock       INTEGER      NOT NULL DEFAULT 0,
  image       VARCHAR(100) NOT NULL,          -- filename, e.g. 'risa_1.jpg'
  description TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Orders
-- One row per order placed by a customer.

CREATE TABLE IF NOT EXISTS orders (
  id               SERIAL PRIMARY KEY,
  product_id       INTEGER      REFERENCES products(id),
  customer_name    VARCHAR(100) NOT NULL,
  customer_phone   VARCHAR(20)  NOT NULL,
  customer_email   VARCHAR(150),
  customer_address TEXT         NOT NULL,
  size             VARCHAR(5),               -- size ordered
  quantity         INTEGER      NOT NULL DEFAULT 1,
  price_paid       INTEGER      NOT NULL,    -- in rupees
  status           VARCHAR(20)  NOT NULL DEFAULT 'received',
                                             -- received | confirmed | shipped | delivered
  tracking_number  VARCHAR(100),             -- filled when shipped
  notes            TEXT,                     -- admin notes
  ordered_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Razorpay payment audit fields (added in v2 — see ALTER TABLE below).
  razorpay_order_id   VARCHAR(50),
  razorpay_payment_id VARCHAR(50),
  payment_status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                                            -- pending | paid | failed
);

-- Idempotent migration for databases created before Razorpay was added.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id   VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status      VARCHAR(20) NOT NULL DEFAULT 'pending';

-- Bilingual product text — typed directly in the admin form (no auto-translate).
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_bn        VARCHAR(200);
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_bn TEXT;

-- Stock-keeping unit (item code). Auto-generated as MWK-NNNN on insert if the
-- admin doesn't supply one. Nullable so existing rows are valid before backfill.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(40);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'products_sku_unique'
  ) THEN
    CREATE UNIQUE INDEX products_sku_unique ON products (sku) WHERE sku IS NOT NULL;
  END IF;
END $$;

-- Auto-update updated_at on every status change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DROP first so re-running schema.sql on an existing DB doesn't fail here.
-- ('CREATE TRIGGER' is not idempotent; a failure here rolls back the whole
--  batch — including the ALTER TABLE column additions above.)
DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
--  Seed: initial products (Risa + Kubai) — first-time only
-- ─────────────────────────────────────────────
--
-- Guarded against re-running: the seed only fires when `products` is empty.
-- (The previous version used `ON CONFLICT DO NOTHING`, but the only unique
--  constraint on `products` is its auto-incrementing `id`, so the seed was
--  re-inserting all 12 rows on every server restart.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products LIMIT 1) THEN
    INSERT INTO products (gender, collection, name, size, price, stock, image, description) VALUES
      -- Risa (no sizes)
      ('womens', 'risa', 'Risa Heritage Set',    NULL, 1499, 10, 'risa_1.jpg', 'Full handwoven Risa & Rignai set on traditional pit looms. Each piece unique. Ships in 5–7 days.'),
      ('womens', 'risa', 'Risa Classic Wrap',    NULL,  899, 15, 'risa_2.jpg', 'Single Risa in deep crimson with gold border — everyday wear, traditionally styled.'),
      ('womens', 'risa', 'Risa Ceremonial Set',  NULL, 2199,  5, 'risa_3.jpg', 'Premium Risa & Rignai in silk-blend thread, made for festivals and weddings.'),

      -- Kubai (S / M / L)
      ('mens', 'kubai', 'Kubai Heritage Shirt', 'S', 1299, 8,  'kubai_1.jpg', 'Handwoven in crimson and gold stripes on pit looms. Worn during ceremonies — now available year-round.'),
      ('mens', 'kubai', 'Kubai Heritage Shirt', 'M', 1299, 12, 'kubai_1.jpg', 'Handwoven in crimson and gold stripes on pit looms. Worn during ceremonies — now available year-round.'),
      ('mens', 'kubai', 'Kubai Heritage Shirt', 'L', 1299, 6,  'kubai_1.jpg', 'Handwoven in crimson and gold stripes on pit looms. Worn during ceremonies — now available year-round.'),

      ('mens', 'kubai', 'Kubai Everyday', 'S',  849, 10, 'kubai_2.jpg', 'Lighter cotton Kubai for daily wear — the classic Tripuri stripe in a breathable weave.'),
      ('mens', 'kubai', 'Kubai Everyday', 'M',  849, 14, 'kubai_2.jpg', 'Lighter cotton Kubai for daily wear — the classic Tripuri stripe in a breathable weave.'),
      ('mens', 'kubai', 'Kubai Everyday', 'L',  849,  8, 'kubai_2.jpg', 'Lighter cotton Kubai for daily wear — the classic Tripuri stripe in a breathable weave.'),

      ('mens', 'kubai', 'Kubai Ceremonial', 'S', 2099, 4, 'kubai_3.jpg', 'Premium silk-blend Kubai with dense gold border work — made for weddings and festivals.'),
      ('mens', 'kubai', 'Kubai Ceremonial', 'M', 2099, 6, 'kubai_3.jpg', 'Premium silk-blend Kubai with dense gold border work — made for weddings and festivals.'),
      ('mens', 'kubai', 'Kubai Ceremonial', 'L', 2099, 3, 'kubai_3.jpg', 'Premium silk-blend Kubai with dense gold border work — made for weddings and festivals.');
  END IF;
END $$;

-- ─────────────────────────────────────────────
--  Jewellery products (added v3)
-- ─────────────────────────────────────────────
-- Idempotent per-product: each row is inserted only if a product with that
-- name doesn't already exist. Runs on every deploy but never duplicates.
-- Edit names / prices afterwards from the admin Inventory tab.
INSERT INTO products (gender, collection, name, size, price, stock, image, description)
SELECT 'jewellery', 'silver', 'Silver Torque Necklace', NULL, 1599, 8, 'jwl_1.jpg',
       'Hand-hammered silver torque, forged by Tripura silversmiths — a statement neckpiece.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Silver Torque Necklace');

INSERT INTO products (gender, collection, name, size, price, stock, image, description)
SELECT 'jewellery', 'silver', 'Tribal Coin Necklace', NULL, 1799, 8, 'jwl_2.jpg',
       'Layered silver-coin necklace in the traditional Mwktai style.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Tribal Coin Necklace');

INSERT INTO products (gender, collection, name, size, price, stock, image, description)
SELECT 'jewellery', 'silver', 'Hand-Hammered Earrings', NULL, 1899, 8, 'jwl_3.jpg',
       'Artisan silver earrings with hand-hammered texture and tribal motifs.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Hand-Hammered Earrings');

INSERT INTO products (gender, collection, name, size, price, stock, image, description)
SELECT 'jewellery', 'silver', 'Mwktai Heritage Set', NULL, 1999, 8, 'jwl_4.jpg',
       'Premium silver set — necklace and earrings, made for ceremonies and festivals.'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Mwktai Heritage Set');
