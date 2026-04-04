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
  customer_address TEXT         NOT NULL,
  size             VARCHAR(5),               -- size ordered
  quantity         INTEGER      NOT NULL DEFAULT 1,
  price_paid       INTEGER      NOT NULL,    -- in rupees
  status           VARCHAR(20)  NOT NULL DEFAULT 'received',
                                             -- received | confirmed | shipped | delivered
  tracking_number  VARCHAR(100),             -- filled when shipped
  notes            TEXT,                     -- admin notes
  ordered_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every status change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
--  Seed: initial products (Risa + Kubai)
-- ─────────────────────────────────────────────

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
  ('mens', 'kubai', 'Kubai Ceremonial', 'L', 2099, 3, 'kubai_3.jpg', 'Premium silk-blend Kubai with dense gold border work — made for weddings and festivals.')

ON CONFLICT DO NOTHING;
