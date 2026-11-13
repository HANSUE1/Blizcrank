-- ============================================================
--  Blitzcrank — database schema (SQLite)
--
--  Conventions
--  * Money is stored as INTEGER centavos (₱1,499.50 -> 149950).
--    Never use REAL for money.
--  * Timestamps are UTC text: 'YYYY-MM-DD HH:MM:SS' (datetime('now')).
--  * Orders copy product names / prices / addresses at purchase time,
--    so editing a product or address never changes order history.
--  * Raw card data is NEVER stored. Payments keep only the
--    provider's reference id (Stripe PaymentIntent id, PayPal id, ...).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
--  Users / accounts
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY,
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT    NOT NULL,                       -- scrypt, never plain text
  first_name     TEXT    NOT NULL DEFAULT '',
  last_name      TEXT    NOT NULL DEFAULT '',
  phone          TEXT,
  role           TEXT    NOT NULL DEFAULT 'customer'
                 CHECK (role IN ('customer', 'staff', 'admin')),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Login sessions. Only a SHA-256 hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS addresses (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label           TEXT    NOT NULL DEFAULT 'Home',
  recipient_name  TEXT    NOT NULL,
  phone           TEXT    NOT NULL,
  line1           TEXT    NOT NULL,
  line2           TEXT,
  barangay        TEXT,
  city            TEXT    NOT NULL,
  province        TEXT    NOT NULL,
  region          TEXT    NOT NULL,          -- matches shipping_rates.region
  postal_code     TEXT    NOT NULL,
  country         TEXT    NOT NULL DEFAULT 'PH',
  is_default      INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_addresses_user ON addresses(user_id);

-- ------------------------------------------------------------
--  Product catalog
-- ------------------------------------------------------------

-- Tree: e.g. components > gpus, peripherals > keyboards
CREATE TABLE IF NOT EXISTS categories (
  id           INTEGER PRIMARY KEY,
  parent_id    INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  description  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_categories_parent ON categories(parent_id);

CREATE TABLE IF NOT EXISTS brands (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY,
  slug           TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  brand_id       INTEGER REFERENCES brands(id) ON DELETE RESTRICT,
  category_id    INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  badge          TEXT    CHECK (badge IN ('hot', 'new', 'sale')),
  status         TEXT    NOT NULL DEFAULT 'active'
                 CHECK (status IN ('draft', 'active', 'archived')),
  is_preorder    INTEGER NOT NULL DEFAULT 0 CHECK (is_preorder IN (0, 1)),
  release_date   TEXT,                      -- 'YYYY-MM-DD', for pre-orders
  -- Cached from `reviews` by triggers below (fast product listings).
  rating_avg     REAL    NOT NULL DEFAULT 0,
  rating_count   INTEGER NOT NULL DEFAULT 0,
  -- Storefront card illustration, used until real photos are uploaded.
  card_art       TEXT,
  card_art_color TEXT,
  card_bg        TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_products_category ON products(category_id, status);
CREATE INDEX IF NOT EXISTS ix_products_brand    ON products(brand_id);

-- Every product has at least one variant. SKU, price and stock live
-- here, so "Red / Brown switch / 2TB" style options each get their own.
CREATE TABLE IF NOT EXISTS product_variants (
  id               INTEGER PRIMARY KEY,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku              TEXT    NOT NULL UNIQUE,
  name             TEXT    NOT NULL DEFAULT 'Standard',
  options          TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(options)),
                   -- e.g. {"color":"Black","switch":"Green"} / {"capacity":"2TB"}
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  compare_at_cents INTEGER CHECK (compare_at_cents IS NULL OR compare_at_cents > price_cents),
  weight_grams     INTEGER,
  is_default       INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_variants_product ON product_variants(product_id);
-- At most one default variant per product.
CREATE UNIQUE INDEX IF NOT EXISTS ux_variants_default
  ON product_variants(product_id) WHERE is_default = 1;

-- Spec / compatibility fields (socket, DPI, refresh rate, VRAM, ...).
-- num_value is filled when the value is numeric, so you can filter
-- "refresh_rate >= 144" or "dpi >= 20000".
CREATE TABLE IF NOT EXISTS product_specs (
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  spec_key    TEXT    NOT NULL,     -- 'socket', 'dpi', 'refresh_rate_hz'
  label       TEXT    NOT NULL,     -- 'Socket', 'Max DPI', 'Refresh rate'
  spec_value  TEXT    NOT NULL,     -- 'AM5', '25600', '165'
  num_value   REAL,
  unit        TEXT,                 -- 'Hz', 'GB', 'W'
  PRIMARY KEY (product_id, spec_key)
);
CREATE INDEX IF NOT EXISTS ix_specs_text ON product_specs(spec_key, spec_value);
CREATE INDEX IF NOT EXISTS ix_specs_num  ON product_specs(spec_key, num_value);

CREATE TABLE IF NOT EXISTS product_images (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
  url         TEXT    NOT NULL,
  alt         TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_primary  INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1))
);
CREATE INDEX IF NOT EXISTS ix_images_product ON product_images(product_id, sort_order);

-- ------------------------------------------------------------
--  Inventory
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS warehouses (
  id         INTEGER PRIMARY KEY,
  code       TEXT    NOT NULL UNIQUE,     -- 'MNL-01'
  name       TEXT    NOT NULL,
  city       TEXT,
  priority   INTEGER NOT NULL DEFAULT 0,  -- lower ships first
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

-- The CHECK makes overselling impossible at the database level:
-- an UPDATE that would push stock below zero fails and the whole
-- checkout transaction rolls back.
CREATE TABLE IF NOT EXISTS inventory (
  variant_id        INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id      INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  quantity_on_hand  INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level     INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (variant_id, warehouse_id)
);

-- Audit trail: every stock change and why.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id            INTEGER PRIMARY KEY,
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id  INTEGER NOT NULL REFERENCES warehouses(id),
  change        INTEGER NOT NULL,            -- +restock / -sale
  reason        TEXT    NOT NULL
                CHECK (reason IN ('initial', 'restock', 'sale', 'cancel', 'return', 'adjustment')),
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  note          TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_movements_variant ON inventory_movements(variant_id, created_at);

-- ------------------------------------------------------------
--  Shipping rates & coupons
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shipping_rates (
  id               INTEGER PRIMARY KEY,
  region           TEXT    NOT NULL UNIQUE,     -- 'Metro Manila', 'Luzon', ...
  fee_cents        INTEGER NOT NULL CHECK (fee_cents >= 0),
  free_over_cents  INTEGER,                     -- NULL = never free
  eta_min_days     INTEGER NOT NULL,
  eta_max_days     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS coupons (
  id                  INTEGER PRIMARY KEY,
  code                TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description         TEXT    NOT NULL DEFAULT '',
  discount_type       TEXT    NOT NULL
                      CHECK (discount_type IN ('percent', 'fixed', 'free_shipping')),
  discount_value      INTEGER NOT NULL DEFAULT 0,  -- percent: 1-100, fixed: centavos
  min_subtotal_cents  INTEGER NOT NULL DEFAULT 0,
  max_discount_cents  INTEGER,                     -- cap for percent coupons
  starts_at           TEXT,
  ends_at             TEXT,
  usage_limit         INTEGER,                     -- total uses, NULL = unlimited
  per_user_limit      INTEGER,
  times_used          INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (discount_type <> 'percent' OR discount_value BETWEEN 1 AND 100),
  CHECK (discount_type <> 'fixed'   OR discount_value > 0)
);

-- ------------------------------------------------------------
--  Cart
-- ------------------------------------------------------------

-- A cart belongs to a logged-in user OR to a guest (cookie token).
-- Guest carts are merged into the user's cart on login.
CREATE TABLE IF NOT EXISTS carts (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  guest_token  TEXT    UNIQUE,
  coupon_id    INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
  status       TEXT    NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'converted', 'abandoned')),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_carts_active_user
  ON carts(user_id) WHERE status = 'active' AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_carts_status ON carts(status, updated_at);

CREATE TABLE IF NOT EXISTS cart_items (
  id          INTEGER PRIMARY KEY,
  cart_id     INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cart_id, variant_id)
);

-- ------------------------------------------------------------
--  Orders
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  id                  INTEGER PRIMARY KEY,
  order_number        TEXT    NOT NULL UNIQUE,      -- 'BZ-261113-7KQ2M'
  user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email               TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'processing', 'shipped',
                                        'delivered', 'cancelled', 'refunded')),
  payment_status      TEXT    NOT NULL DEFAULT 'unpaid'
                      CHECK (payment_status IN ('unpaid', 'authorized', 'paid',
                                                'failed', 'refunded')),
  fulfillment_status  TEXT    NOT NULL DEFAULT 'unfulfilled'
                      CHECK (fulfillment_status IN ('unfulfilled', 'fulfilled', 'returned')),
  currency            TEXT    NOT NULL DEFAULT 'PHP',
  subtotal_cents      INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents      INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  shipping_cents      INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  tax_cents           INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),  -- VAT included in total
  total_cents         INTEGER NOT NULL CHECK (total_cents >= 0),
  coupon_id           INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code         TEXT,
  -- Shipping address snapshot (copied, not a foreign key)
  ship_name           TEXT    NOT NULL,
  ship_phone          TEXT    NOT NULL,
  ship_line1          TEXT    NOT NULL,
  ship_line2          TEXT,
  ship_barangay       TEXT,
  ship_city           TEXT    NOT NULL,
  ship_province       TEXT    NOT NULL,
  ship_region         TEXT    NOT NULL,
  ship_postal_code    TEXT    NOT NULL,
  ship_country        TEXT    NOT NULL DEFAULT 'PH',
  notes               TEXT,
  placed_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  cancelled_at        TEXT
);
CREATE INDEX IF NOT EXISTS ix_orders_user   ON orders(user_id, placed_at);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status, placed_at);

-- Price/name/SKU are copied at purchase time. product_id/variant_id
-- use RESTRICT so a product with sales history can't be hard-deleted
-- (archive it instead: products.status = 'archived').
CREATE TABLE IF NOT EXISTS order_items (
  id                INTEGER PRIMARY KEY,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id        INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name      TEXT    NOT NULL,
  variant_name      TEXT    NOT NULL,
  sku               TEXT    NOT NULL,
  options           TEXT    NOT NULL DEFAULT '{}',
  unit_price_cents  INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents  INTEGER NOT NULL CHECK (line_total_cents >= 0)
);
CREATE INDEX IF NOT EXISTS ix_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS ix_order_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id              INTEGER PRIMARY KEY,
  coupon_id       INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id        INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  discount_cents  INTEGER NOT NULL,
  redeemed_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_redemptions_user ON coupon_redemptions(coupon_id, user_id);

-- ------------------------------------------------------------
--  Payments  (NO card numbers / CVV — provider references only)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payments (
  id                  INTEGER PRIMARY KEY,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider            TEXT    NOT NULL
                      CHECK (provider IN ('stripe', 'paypal', 'gcash', 'maya', 'cod', 'manual')),
  provider_reference  TEXT,        -- e.g. Stripe 'pi_3Q...' / PayPal order id
  amount_cents        INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency            TEXT    NOT NULL DEFAULT 'PHP',
  status              TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'authorized', 'succeeded',
                                        'failed', 'refunded', 'cancelled')),
  failure_reason      TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_reference)
);
CREATE INDEX IF NOT EXISTS ix_payments_order ON payments(order_id);

-- ------------------------------------------------------------
--  Shipping / fulfillment
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shipments (
  id               INTEGER PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier          TEXT    NOT NULL,            -- 'LBC', 'J&T Express', 'Ninja Van'
  tracking_number  TEXT,
  status           TEXT    NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'in_transit', 'out_for_delivery',
                                     'delivered', 'failed', 'returned')),
  shipped_at       TEXT,
  delivered_at     TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_shipments_order ON shipments(order_id);

-- ------------------------------------------------------------
--  Reviews / ratings
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reviews (
  id                    INTEGER PRIMARY KEY,
  product_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating                INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title                 TEXT    NOT NULL DEFAULT '',
  body                  TEXT    NOT NULL DEFAULT '',
  is_verified_purchase  INTEGER NOT NULL DEFAULT 0 CHECK (is_verified_purchase IN (0, 1)),
  status                TEXT    NOT NULL DEFAULT 'published'
                        CHECK (status IN ('pending', 'published', 'hidden')),
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)                  -- one review per customer per product
);
CREATE INDEX IF NOT EXISTS ix_reviews_product ON reviews(product_id, status);

-- Keep products.rating_avg / rating_count in sync with published reviews.
CREATE TRIGGER IF NOT EXISTS trg_reviews_ai AFTER INSERT ON reviews BEGIN
  UPDATE products SET
    rating_avg   = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews WHERE product_id = NEW.product_id AND status = 'published'), 0),
    rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND status = 'published')
  WHERE id = NEW.product_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_reviews_au AFTER UPDATE ON reviews BEGIN
  UPDATE products SET
    rating_avg   = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews WHERE product_id = NEW.product_id AND status = 'published'), 0),
    rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND status = 'published')
  WHERE id = NEW.product_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_reviews_ad AFTER DELETE ON reviews BEGIN
  UPDATE products SET
    rating_avg   = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews WHERE product_id = OLD.product_id AND status = 'published'), 0),
    rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = OLD.product_id AND status = 'published')
  WHERE id = OLD.product_id;
END;

-- ------------------------------------------------------------
--  Wishlists & saved PC builds
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS saved_builds (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  notes       TEXT,
  is_public   INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_builds_user ON saved_builds(user_id);

CREATE TABLE IF NOT EXISTS saved_build_items (
  build_id    INTEGER NOT NULL REFERENCES saved_builds(id) ON DELETE CASCADE,
  slot        TEXT    NOT NULL,     -- 'cpu', 'gpu', 'motherboard', 'ram', 'monitor', ...
  variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 8),
  PRIMARY KEY (build_id, slot)
);

-- ------------------------------------------------------------
--  Storefront content & marketing
-- ------------------------------------------------------------

-- Homepage hero slides, editable from the admin API.
-- cta_link: '#category=<slug>', '#product=<slug>', '#deals', '#preorders' or a URL.
CREATE TABLE IF NOT EXISTS promo_banners (
  id              INTEGER PRIMARY KEY,
  eyebrow         TEXT,
  title           TEXT    NOT NULL,
  subtitle        TEXT,
  cta_label       TEXT,
  cta_link        TEXT,
  card_art        TEXT,
  card_art_color  TEXT,
  card_bg         TEXT,
  image_url       TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  starts_at       TEXT,
  ends_at         TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id               INTEGER PRIMARY KEY,
  email            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source           TEXT    NOT NULL DEFAULT 'footer',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at  TEXT
);

-- ------------------------------------------------------------
--  Admin / analytics views
-- ------------------------------------------------------------

-- Total sellable stock per variant across all active warehouses.
CREATE VIEW IF NOT EXISTS v_variant_stock AS
SELECT v.id AS variant_id,
       COALESCE(SUM(CASE WHEN w.is_active = 1 THEN i.quantity_on_hand END), 0) AS stock
FROM product_variants v
LEFT JOIN inventory  i ON i.variant_id = v.id
LEFT JOIN warehouses w ON w.id = i.warehouse_id
GROUP BY v.id;

-- Daily sales (cancelled / refunded orders excluded).
CREATE VIEW IF NOT EXISTS v_sales_daily AS
SELECT date(placed_at)            AS day,
       COUNT(*)                   AS orders,
       SUM(total_cents)           AS revenue_cents,
       SUM(discount_cents)        AS discount_cents,
       ROUND(AVG(total_cents))    AS avg_order_cents
FROM orders
WHERE status NOT IN ('cancelled', 'refunded')
GROUP BY date(placed_at);

-- Rows at or below their reorder level.
CREATE VIEW IF NOT EXISTS v_low_stock AS
SELECT p.id AS product_id, p.name AS product_name, v.id AS variant_id, v.sku,
       v.name AS variant_name, w.code AS warehouse, i.quantity_on_hand, i.reorder_level
FROM inventory i
JOIN product_variants v ON v.id = i.variant_id
JOIN products p         ON p.id = v.product_id
JOIN warehouses w       ON w.id = i.warehouse_id
WHERE i.quantity_on_hand <= i.reorder_level
  AND p.status = 'active' AND v.is_active = 1 AND w.is_active = 1;

-- Best sellers by units.
CREATE VIEW IF NOT EXISTS v_popular_products AS
SELECT oi.product_id, p.name AS product_name, p.slug,
       SUM(oi.quantity)          AS units_sold,
       SUM(oi.line_total_cents)  AS revenue_cents,
       COUNT(DISTINCT oi.order_id) AS orders
FROM order_items oi
JOIN orders   o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.status NOT IN ('cancelled', 'refunded')
GROUP BY oi.product_id;

-- Active carts with items, untouched for 24h+.
CREATE VIEW IF NOT EXISTS v_abandoned_carts AS
SELECT c.id AS cart_id, c.user_id, u.email, c.updated_at,
       SUM(ci.quantity)                  AS items,
       SUM(ci.quantity * v.price_cents)  AS value_cents
FROM carts c
JOIN cart_items ci       ON ci.cart_id = c.id
JOIN product_variants v  ON v.id = ci.variant_id
LEFT JOIN users u        ON u.id = c.user_id
WHERE c.status = 'active'
  AND c.updated_at < datetime('now', '-24 hours')
GROUP BY c.id;
