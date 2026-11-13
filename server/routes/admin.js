"use strict";
// Staff/admin endpoints: catalog management, inventory, order processing,
// payments, shipments, coupons, review moderation, users and reports.

const { HttpError, notFound, str, int, oneOf } = require("../lib/http");
const { requireStaff, requireAdmin } = require("../lib/auth");
const { transaction } = require("../../db");
const { cancelOrder, getOrderDetail, orderSummary } = require("../lib/orders");

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---- catalog helpers --------------------------------------------------------

function brandId(db, name) {
  if (!name) return null;
  const found = db.prepare("SELECT id FROM brands WHERE name = ? COLLATE NOCASE").get(name);
  if (found) return found.id;
  return Number(db.prepare("INSERT INTO brands (slug, name) VALUES (?, ?)").run(slugify(name), name).lastInsertRowid);
}

function categoryId(db, slug) {
  const c = db.prepare("SELECT id FROM categories WHERE slug = ?").get(slug);
  if (!c) throw new HttpError(400, `Unknown category "${slug}"`, "validation");
  return c.id;
}

function warehouseId(db, code) {
  const w = db.prepare("SELECT id FROM warehouses WHERE code = ?").get(code);
  if (!w) throw new HttpError(400, `Unknown warehouse "${code}"`, "validation");
  return w.id;
}

function replaceSpecs(db, productId, specs) {
  if (!Array.isArray(specs)) throw new HttpError(400, "specs must be a list", "validation");
  db.prepare("DELETE FROM product_specs WHERE product_id = ?").run(productId);
  const ins = db.prepare("INSERT INTO product_specs (product_id, spec_key, label, spec_value, num_value, unit) VALUES (?, ?, ?, ?, ?, ?)");
  for (const s of specs) {
    const key = str(s.key, "spec.key", { required: true, max: 40 });
    if (!/^[a-z0-9_]+$/.test(key)) throw new HttpError(400, "spec.key must be lowercase letters, digits and _", "validation");
    const value = String(s.value ?? "").trim();
    if (!value) throw new HttpError(400, `spec ${key} needs a value`, "validation");
    const num = Number(value);
    ins.run(productId, key, str(s.label, "spec.label", { max: 60 }) || key, value, Number.isFinite(num) ? num : null,
            str(s.unit, "spec.unit", { max: 10 }));
  }
}

function adjustStock(db, { variantId, warehouse, change, reason, note, actorId }) {
  const whId = warehouseId(db, warehouse);
  db.prepare(`INSERT INTO inventory (variant_id, warehouse_id, quantity_on_hand) VALUES (?, ?, 0)
              ON CONFLICT (variant_id, warehouse_id) DO NOTHING`).run(variantId, whId);
  if (change === 0) return;
  const r = db.prepare(`UPDATE inventory SET quantity_on_hand = quantity_on_hand + ?, updated_at = datetime('now')
                        WHERE variant_id = ? AND warehouse_id = ? AND quantity_on_hand + ? >= 0`)
    .run(change, variantId, whId, change);
  if (!r.changes) throw new HttpError(409, "Stock can't go below zero", "out_of_stock");
  db.prepare(`INSERT INTO inventory_movements (variant_id, warehouse_id, change, reason, note, created_by)
              VALUES (?, ?, ?, ?, ?, ?)`).run(variantId, whId, change, reason, note || null, actorId);
}

function insertVariant(db, productId, v, isDefault, actorId) {
  const priceCents = int(v.priceCents, "priceCents", { required: true, min: 0 });
  const compareAt = int(v.compareAtCents, "compareAtCents", { min: 0 });
  if (compareAt !== null && compareAt <= priceCents) throw new HttpError(400, "compareAtCents must be higher than priceCents", "validation");
  const options = v.options && typeof v.options === "object" ? v.options : {};
  const id = Number(db.prepare(`
    INSERT INTO product_variants (product_id, sku, name, options, price_cents, compare_at_cents, weight_grams, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    productId, str(v.sku, "sku", { required: true, max: 64 }), str(v.name, "variant name", { max: 80 }) || "Standard",
    JSON.stringify(options), priceCents, compareAt, int(v.weightGrams, "weightGrams", { min: 0 }), isDefault ? 1 : 0).lastInsertRowid);
  for (const [code, qty] of Object.entries(v.stock || {})) {
    adjustStock(db, { variantId: id, warehouse: code, change: int(qty, "stock", { min: 0, max: 1e6 }), reason: "initial", actorId });
  }
  return id;
}

function releaseDate(v) {
  const d = str(v, "releaseDate", { max: 10 });
  if (d && !/^d{4}-d{2}-d{2}$/.test(d)) throw new HttpError(400, "releaseDate must be YYYY-MM-DD", "validation");
  return d;
}

// ---- order status sync -------------------------------------------------------

function syncPaymentStatus(db, orderId) {
  const statuses = db.prepare("SELECT status FROM payments WHERE order_id = ?").all(orderId).map((p) => p.status);
  const has = (s) => statuses.includes(s);
  const paymentStatus = has("succeeded") ? "paid" : has("refunded") ? "refunded" : has("authorized") ? "authorized"
    : has("failed") && !has("pending") ? "failed" : "unpaid";
  db.prepare("UPDATE orders SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(paymentStatus, orderId);
  if (paymentStatus === "paid") {
    db.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending'").run(orderId);
  }
  if (paymentStatus === "refunded") {
    db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ? AND status NOT IN ('cancelled')").run(orderId);
  }
}

function syncShipmentStatus(db, orderId) {
  const ships = db.prepare("SELECT status FROM shipments WHERE order_id = ?").all(orderId).map((s) => s.status);
  if (!ships.length) return;
  if (ships.every((s) => s === "delivered")) {
    db.prepare(`UPDATE orders SET status = 'delivered', fulfillment_status = 'fulfilled', updated_at = datetime('now')
                WHERE id = ? AND status NOT IN ('cancelled', 'refunded')`).run(orderId);
  } else if (ships.some((s) => ["in_transit", "out_for_delivery", "delivered"].includes(s))) {
    db.prepare(`UPDATE orders SET status = 'shipped', fulfillment_status = 'fulfilled', updated_at = datetime('now')
                WHERE id = ? AND status IN ('pending', 'paid', 'processing')`).run(orderId);
  } else if (ships.every((s) => s === "returned")) {
    db.prepare("UPDATE orders SET fulfillment_status = 'returned', updated_at = datetime('now') WHERE id = ?").run(orderId);
  }
}

module.exports = function register(router) {
  // Every /api/admin route requires staff or admin.
  const staff = (fn) => (ctx) => { requireStaff(ctx); return fn(ctx); };
  const admin = (fn) => (ctx) => { requireAdmin(ctx); return fn(ctx); };

  // ---- products ------------------------------------------------------------

  router.get("/api/admin/products", staff(({ db, query }) => {
    const status = oneOf(query.get("status"), "status", ["draft", "active", "archived"]);
    const rows = db.prepare(`
      SELECT p.id, p.slug, p.name, p.status, p.badge, b.name AS brand, c.slug AS category,
             (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variants,
             (SELECT SUM(s.stock) FROM product_variants v JOIN v_variant_stock s ON s.variant_id = v.id WHERE v.product_id = p.id) AS stock,
             (SELECT MIN(price_cents) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS from_price_cents
      FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
      WHERE (? IS NULL OR p.status = ?) ORDER BY p.updated_at DESC`).all(status, status);
    return { products: rows };
  }));

  // Body: { slug?, name, description, brand, category, badge?, status?, card?{art,color,bg},
  //         specs?[{key,label,value,unit}], variants[{sku,name,options,priceCents,compareAtCents,stock{"MNL-01":10}}],
  //         images?[{url,alt}] }
  router.post("/api/admin/products", staff((ctx) => {
    const { db, body, user } = ctx;
    const name = str(body.name, "name", { required: true, max: 200 });
    const variants = Array.isArray(body.variants) && body.variants.length ? body.variants : null;
    if (!variants) throw new HttpError(400, "A product needs at least one variant (sku + priceCents)", "validation");
    const id = transaction(db, () => {
      const card = body.card || {};
      const id = Number(db.prepare(`
        INSERT INTO products (slug, name, description, brand_id, category_id, badge, status, is_preorder, release_date,
                              card_art, card_art_color, card_bg)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        str(body.slug, "slug", { max: 120 }) || slugify(name), name, str(body.description, "description", { max: 10000 }) || "",
        brandId(db, str(body.brand, "brand", { max: 80 })), categoryId(db, str(body.category, "category", { required: true })),
        oneOf(body.badge, "badge", ["hot", "new", "sale"]), oneOf(body.status, "status", ["draft", "active", "archived"]) || "active",
        body.isPreorder === true ? 1 : 0, releaseDate(body.releaseDate),
        str(card.art, "card.art", { max: 20 }), str(card.color, "card.color", { max: 20 }), str(card.bg, "card.bg", { max: 200 }),
      ).lastInsertRowid);
      variants.forEach((v, i) => insertVariant(db, id, v, i === 0, user.id));
      if (body.specs) replaceSpecs(db, id, body.specs);
      (body.images || []).forEach((im, i) => {
        db.prepare("INSERT INTO product_images (product_id, url, alt, sort_order, is_primary) VALUES (?, ?, ?, ?, ?)")
          .run(id, str(im.url, "image url", { required: true, max: 500 }), str(im.alt, "alt", { max: 200 }) || "", i, i === 0 ? 1 : 0);
      });
      return id;
    });
    ctx.status = 201;
    return { id };
  }));

  router.patch("/api/admin/products/:id", staff(({ db, body, params }) => {
    const id = int(params.id, "id");
    if (!db.prepare("SELECT 1 FROM products WHERE id = ?").get(id)) throw notFound("Product not found");
    transaction(db, () => {
      const set = (col, val) => db.prepare(`UPDATE products SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`).run(val, id);
      if (body.name !== undefined) set("name", str(body.name, "name", { required: true, max: 200 }));
      if (body.slug !== undefined) set("slug", str(body.slug, "slug", { required: true, max: 120 }));
      if (body.description !== undefined) set("description", str(body.description, "description", { max: 10000 }) || "");
      if (body.brand !== undefined) set("brand_id", brandId(db, str(body.brand, "brand", { max: 80 })));
      if (body.category !== undefined) set("category_id", categoryId(db, str(body.category, "category", { required: true })));
      if (body.badge !== undefined) set("badge", oneOf(body.badge, "badge", ["hot", "new", "sale"]));
      if (body.isPreorder !== undefined) set("is_preorder", body.isPreorder === true ? 1 : 0);
      if (body.releaseDate !== undefined) set("release_date", releaseDate(body.releaseDate));
      if (body.status !== undefined) set("status", oneOf(body.status, "status", ["draft", "active", "archived"], { required: true }));
      if (body.card !== undefined) {
        set("card_art", str(body.card.art, "card.art", { max: 20 }));
        set("card_art_color", str(body.card.color, "card.color", { max: 20 }));
        set("card_bg", str(body.card.bg, "card.bg", { max: 200 }));
      }
      if (body.specs !== undefined) replaceSpecs(db, id, body.specs);
    });
    return { ok: true };
  }));

  // Products with orders can't be hard-deleted; archiving hides them from the shop.
  router.delete("/api/admin/products/:id", staff(({ db, params }) => {
    const r = db.prepare("UPDATE products SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(int(params.id, "id"));
    if (!r.changes) throw notFound("Product not found");
    return { ok: true, archived: true };
  }));

  router.post("/api/admin/products/:id/variants", staff((ctx) => {
    const id = int(ctx.params.id, "id");
    if (!ctx.db.prepare("SELECT 1 FROM products WHERE id = ?").get(id)) throw notFound("Product not found");
    const variantId = transaction(ctx.db, () => {
      const hasDefault = ctx.db.prepare("SELECT 1 FROM product_variants WHERE product_id = ? AND is_default = 1").get(id);
      return insertVariant(ctx.db, id, ctx.body, !hasDefault, ctx.user.id);
    });
    ctx.status = 201;
    return { id: variantId };
  }));

  router.patch("/api/admin/variants/:id", staff(({ db, body, params }) => {
    const id = int(params.id, "id");
    const v = db.prepare("SELECT * FROM product_variants WHERE id = ?").get(id);
    if (!v) throw notFound("Variant not found");
    transaction(db, () => {
      const price = body.priceCents !== undefined ? int(body.priceCents, "priceCents", { required: true, min: 0 }) : v.price_cents;
      const compareAt = body.compareAtCents !== undefined ? int(body.compareAtCents, "compareAtCents", { min: 0 }) : v.compare_at_cents;
      if (compareAt !== null && compareAt <= price) throw new HttpError(400, "compareAtCents must be higher than priceCents", "validation");
      db.prepare(`UPDATE product_variants SET name = ?, options = ?, price_cents = ?, compare_at_cents = ?, is_active = ?,
                  updated_at = datetime('now') WHERE id = ?`).run(
        body.name !== undefined ? str(body.name, "name", { required: true, max: 80 }) : v.name,
        body.options !== undefined ? JSON.stringify(body.options || {}) : v.options,
        price, compareAt, body.isActive !== undefined ? (body.isActive ? 1 : 0) : v.is_active, id);
      if (body.isDefault === true) {
        db.prepare("UPDATE product_variants SET is_default = 0 WHERE product_id = ?").run(v.product_id);
        db.prepare("UPDATE product_variants SET is_default = 1 WHERE id = ?").run(id);
      }
    });
    return { ok: true };
  }));

  router.post("/api/admin/products/:id/images", staff((ctx) => {
    const id = int(ctx.params.id, "id");
    if (!ctx.db.prepare("SELECT 1 FROM products WHERE id = ?").get(id)) throw notFound("Product not found");
    const b = ctx.body;
    const imageId = transaction(ctx.db, () => {
      if (b.isPrimary === true) ctx.db.prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ?").run(id);
      return ctx.db.prepare("INSERT INTO product_images (product_id, variant_id, url, alt, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, int(b.variantId, "variantId", { min: 1 }), str(b.url, "url", { required: true, max: 500 }),
             str(b.alt, "alt", { max: 200 }) || "", int(b.sortOrder, "sortOrder") || 0, b.isPrimary === true ? 1 : 0).lastInsertRowid;
    });
    ctx.status = 201;
    return { id: Number(imageId) };
  }));

  router.delete("/api/admin/images/:id", staff(({ db, params }) => {
    db.prepare("DELETE FROM product_images WHERE id = ?").run(int(params.id, "id"));
    return { ok: true };
  }));

  router.post("/api/admin/categories", staff((ctx) => {
    const b = ctx.body;
    const name = str(b.name, "name", { required: true, max: 80 });
    const parent = b.parent ? categoryId(ctx.db, str(b.parent, "parent")) : null;
    const id = ctx.db.prepare("INSERT INTO categories (slug, name, parent_id, description, sort_order) VALUES (?, ?, ?, ?, ?)")
      .run(str(b.slug, "slug", { max: 80 }) || slugify(name), name, parent, str(b.description, "description", { max: 500 }),
           int(b.sortOrder, "sortOrder") || 0).lastInsertRowid;
    ctx.status = 201;
    return { id: Number(id) };
  }));

  // ---- inventory -----------------------------------------------------------

  router.get("/api/admin/inventory", staff(({ db, query }) => {
    const variantId = int(query.get("variantId"), "variantId", { min: 1 });
    return {
      inventory: db.prepare(`
        SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.name AS variant_name, w.code AS warehouse,
               i.quantity_on_hand, i.reorder_level, i.updated_at
        FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
        JOIN warehouses w ON w.id = i.warehouse_id
        WHERE (? IS NULL OR v.id = ?) ORDER BY p.name, v.id, w.priority`).all(variantId, variantId),
      movements: variantId ? db.prepare(`
        SELECT m.change, m.reason, m.note, m.created_at, w.code AS warehouse, o.order_number
        FROM inventory_movements m JOIN warehouses w ON w.id = m.warehouse_id LEFT JOIN orders o ON o.id = m.order_id
        WHERE m.variant_id = ? ORDER BY m.id DESC LIMIT 100`).all(variantId) : undefined,
    };
  }));

  // Body: { variantId, warehouse: "MNL-01", change: +10 | quantity: 25, reason?: restock|adjustment|return, note?, reorderLevel? }
  router.post("/api/admin/inventory/adjust", staff((ctx) => {
    const { db, body, user } = ctx;
    const variantId = int(body.variantId, "variantId", { required: true, min: 1 });
    if (!db.prepare("SELECT 1 FROM product_variants WHERE id = ?").get(variantId)) throw notFound("Variant not found");
    const warehouse = str(body.warehouse, "warehouse", { required: true, max: 20 });
    const reason = oneOf(body.reason, "reason", ["restock", "adjustment", "return"]) || "adjustment";
    transaction(db, () => {
      let change = int(body.change, "change", { min: -1e6, max: 1e6 });
      if (change === null) {
        const target = int(body.quantity, "quantity", { required: true, min: 0, max: 1e6 });
        const cur = db.prepare("SELECT quantity_on_hand FROM inventory WHERE variant_id = ? AND warehouse_id = ?")
          .get(variantId, warehouseId(db, warehouse));
        change = target - (cur ? cur.quantity_on_hand : 0);
      }
      adjustStock(db, { variantId, warehouse, change, reason, note: str(body.note, "note", { max: 300 }), actorId: user.id });
      if (body.reorderLevel !== undefined) {
        db.prepare("UPDATE inventory SET reorder_level = ? WHERE variant_id = ? AND warehouse_id = ?")
          .run(int(body.reorderLevel, "reorderLevel", { min: 0 }), variantId, warehouseId(db, warehouse));
      }
    });
    return { ok: true };
  }));

  // ---- orders, payments, shipments -----------------------------------------

  router.get("/api/admin/orders", staff(({ db, query }) => {
    const status = oneOf(query.get("status"), "status", ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"]);
    const q = str(query.get("q"), "q", { max: 100 });
    const rows = db.prepare(`
      SELECT * FROM orders WHERE (? IS NULL OR status = ?) AND (? IS NULL OR order_number = ? OR email LIKE ?)
      ORDER BY placed_at DESC, id DESC LIMIT 200`).all(status, status, q, q, q ? `%${q}%` : null);
    return { orders: rows.map(orderSummary) };
  }));

  router.get("/api/admin/orders/:id", staff(({ db, params }) => ({ order: getOrderDetail(db, int(params.id, "id")) })));

  router.patch("/api/admin/orders/:id", staff((ctx) => {
    const id = int(ctx.params.id, "id");
    const status = oneOf(ctx.body.status, "status", ["processing", "cancelled"], { required: true });
    if (status === "cancelled") return { order: cancelOrder(ctx.db, id, { actorId: ctx.user.id, note: str(ctx.body.note, "note", { max: 300 }) }) };
    const r = ctx.db.prepare("UPDATE orders SET status = 'processing', updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'paid')").run(id);
    if (!r.changes) throw new HttpError(409, "Only pending or paid orders can move to processing", "bad_status");
    return { order: getOrderDetail(ctx.db, id) };
  }));

  // Record a payment result (what a provider webhook would do).
  // Body: { status: succeeded|failed|refunded|authorized, providerReference?, failureReason? }
  router.patch("/api/admin/payments/:id", staff(({ db, body, params }) => {
    const p = db.prepare("SELECT * FROM payments WHERE id = ?").get(int(params.id, "id"));
    if (!p) throw notFound("Payment not found");
    const status = oneOf(body.status, "status", ["authorized", "succeeded", "failed", "refunded", "cancelled"], { required: true });
    transaction(db, () => {
      db.prepare(`UPDATE payments SET status = ?, provider_reference = COALESCE(?, provider_reference), failure_reason = ?,
                  updated_at = datetime('now') WHERE id = ?`)
        .run(status, str(body.providerReference, "providerReference", { max: 200 }), str(body.failureReason, "failureReason", { max: 300 }), p.id);
      syncPaymentStatus(db, p.order_id);
    });
    return { order: getOrderDetail(db, p.order_id) };
  }));

  // Body: { carrier, trackingNumber?, status? }
  router.post("/api/admin/orders/:id/shipments", staff((ctx) => {
    const { db, body } = ctx;
    const id = int(ctx.params.id, "id");
    const o = db.prepare("SELECT status FROM orders WHERE id = ?").get(id);
    if (!o) throw notFound("Order not found");
    if (["cancelled", "refunded"].includes(o.status)) throw new HttpError(409, `Order is ${o.status}`, "bad_status");
    const status = oneOf(body.status, "status", ["pending", "in_transit"]) || "in_transit";
    transaction(db, () => {
      db.prepare(`INSERT INTO shipments (order_id, carrier, tracking_number, status, shipped_at)
                  VALUES (?, ?, ?, ?, CASE WHEN ? = 'in_transit' THEN datetime('now') END)`)
        .run(id, str(body.carrier, "carrier", { required: true, max: 60 }), str(body.trackingNumber, "trackingNumber", { max: 80 }), status, status);
      syncShipmentStatus(db, id);
    });
    ctx.status = 201;
    return { order: getOrderDetail(db, id) };
  }));

  router.patch("/api/admin/shipments/:id", staff(({ db, body, params }) => {
    const s = db.prepare("SELECT * FROM shipments WHERE id = ?").get(int(params.id, "id"));
    if (!s) throw notFound("Shipment not found");
    const status = oneOf(body.status, "status", ["pending", "in_transit", "out_for_delivery", "delivered", "failed", "returned"]) || s.status;
    transaction(db, () => {
      db.prepare(`UPDATE shipments SET status = ?, tracking_number = COALESCE(?, tracking_number),
                    carrier = COALESCE(?, carrier),
                    shipped_at = COALESCE(shipped_at, CASE WHEN ? IN ('in_transit', 'out_for_delivery', 'delivered') THEN datetime('now') END),
                    delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END,
                    updated_at = datetime('now')
                  WHERE id = ?`)
        .run(status, str(body.trackingNumber, "trackingNumber", { max: 80 }), str(body.carrier, "carrier", { max: 60 }), status, status, s.id);
      syncShipmentStatus(db, s.order_id);
    });
    return { order: getOrderDetail(db, s.order_id) };
  }));

  // ---- coupons -------------------------------------------------------------

  router.get("/api/admin/coupons", staff(({ db }) => ({ coupons: db.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all() })));

  // Body: { code, description?, type: percent|fixed|free_shipping, value, minSubtotalCents?, maxDiscountCents?,
  //         startsAt?, endsAt?, usageLimit?, perUserLimit? }
  router.post("/api/admin/coupons", staff((ctx) => {
    const b = ctx.body;
    const id = ctx.db.prepare(`
      INSERT INTO coupons (code, description, discount_type, discount_value, min_subtotal_cents, max_discount_cents,
                           starts_at, ends_at, usage_limit, per_user_limit)
      VALUES (?, ?, ?, ?, ?, ?, datetime(?), datetime(?), ?, ?)`).run(
      str(b.code, "code", { required: true, max: 40 }).toUpperCase(), str(b.description, "description", { max: 200 }) || "",
      oneOf(b.type, "type", ["percent", "fixed", "free_shipping"], { required: true }), int(b.value, "value", { min: 0 }) || 0,
      int(b.minSubtotalCents, "minSubtotalCents", { min: 0 }) || 0, int(b.maxDiscountCents, "maxDiscountCents", { min: 1 }),
      str(b.startsAt, "startsAt", { max: 30 }), str(b.endsAt, "endsAt", { max: 30 }),
      int(b.usageLimit, "usageLimit", { min: 1 }), int(b.perUserLimit, "perUserLimit", { min: 1 })).lastInsertRowid;
    ctx.status = 201;
    return { id: Number(id) };
  }));

  router.patch("/api/admin/coupons/:id", staff(({ db, body, params }) => {
    const r = db.prepare("UPDATE coupons SET is_active = ? WHERE id = ?").run(body.isActive ? 1 : 0, int(params.id, "id"));
    if (!r.changes) throw notFound("Coupon not found");
    return { ok: true };
  }));

  // ---- homepage banners & newsletter ---------------------------------------

  const BANNER_FIELDS = { eyebrow: 80, title: 120, subtitle: 300, ctaLabel: 40, ctaLink: 300, imageUrl: 500 };
  const BANNER_COLS = { eyebrow: "eyebrow", title: "title", subtitle: "subtitle", ctaLabel: "cta_label", ctaLink: "cta_link", imageUrl: "image_url" };

  router.get("/api/admin/banners", staff(({ db }) => ({ banners: db.prepare("SELECT * FROM promo_banners ORDER BY sort_order, id").all() })));

  // Body: { title, eyebrow?, subtitle?, ctaLabel?, ctaLink?, imageUrl?, card?{art,color,bg}, sortOrder?, startsAt?, endsAt? }
  router.post("/api/admin/banners", staff((ctx) => {
    const b = ctx.body;
    const card = b.card || {};
    const v = {};
    for (const [k, max] of Object.entries(BANNER_FIELDS)) v[k] = str(b[k], k, { max, required: k === "title" });
    const id = ctx.db.prepare(`
      INSERT INTO promo_banners (eyebrow, title, subtitle, cta_label, cta_link, image_url, card_art, card_art_color, card_bg,
                                 sort_order, starts_at, ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(?), datetime(?))`).run(
      v.eyebrow, v.title, v.subtitle, v.ctaLabel, v.ctaLink, v.imageUrl, str(card.art, "card.art", { max: 20 }),
      str(card.color, "card.color", { max: 20 }), str(card.bg, "card.bg", { max: 200 }), int(b.sortOrder, "sortOrder") || 0,
      str(b.startsAt, "startsAt", { max: 30 }), str(b.endsAt, "endsAt", { max: 30 })).lastInsertRowid;
    ctx.status = 201;
    return { id: Number(id) };
  }));

  router.patch("/api/admin/banners/:id", staff(({ db, body, params }) => {
    const id = int(params.id, "id");
    if (!db.prepare("SELECT 1 FROM promo_banners WHERE id = ?").get(id)) throw notFound("Banner not found");
    for (const [k, max] of Object.entries(BANNER_FIELDS)) {
      if (body[k] !== undefined) db.prepare(`UPDATE promo_banners SET ${BANNER_COLS[k]} = ? WHERE id = ?`).run(str(body[k], k, { max, required: k === "title" }), id);
    }
    if (body.isActive !== undefined) db.prepare("UPDATE promo_banners SET is_active = ? WHERE id = ?").run(body.isActive ? 1 : 0, id);
    if (body.sortOrder !== undefined) db.prepare("UPDATE promo_banners SET sort_order = ? WHERE id = ?").run(int(body.sortOrder, "sortOrder") || 0, id);
    return { ok: true };
  }));

  router.delete("/api/admin/banners/:id", staff(({ db, params }) => {
    db.prepare("DELETE FROM promo_banners WHERE id = ?").run(int(params.id, "id"));
    return { ok: true };
  }));

  router.get("/api/admin/newsletter", staff(({ db }) => ({
    subscribers: db.prepare("SELECT email, source, created_at FROM newsletter_subscribers WHERE unsubscribed_at IS NULL ORDER BY id DESC").all(),
  })));

  // ---- reviews & users -----------------------------------------------------

  router.patch("/api/admin/reviews/:id", staff(({ db, body, params }) => {
    const r = db.prepare("UPDATE reviews SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(oneOf(body.status, "status", ["pending", "published", "hidden"], { required: true }), int(params.id, "id"));
    if (!r.changes) throw notFound("Review not found");
    return { ok: true };
  }));

  router.get("/api/admin/users", staff(({ db, query }) => {
    const q = str(query.get("q"), "q", { max: 100 });
    return {
      users: db.prepare(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at,
               (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
               (SELECT COALESCE(SUM(total_cents), 0) FROM orders o WHERE o.user_id = u.id AND o.status NOT IN ('cancelled', 'refunded')) AS lifetime_cents
        FROM users u WHERE (? IS NULL OR u.email LIKE ?) ORDER BY u.created_at DESC LIMIT 200`).all(q, q ? `%${q}%` : null),
    };
  }));

  // Only admins can change roles or disable accounts.
  router.patch("/api/admin/users/:id", admin((ctx) => {
    const { db, body } = ctx;
    const id = int(ctx.params.id, "id");
    if (id === ctx.user.id) throw new HttpError(400, "You can't change your own role or status", "validation");
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!target) throw notFound("User not found");
    const role = oneOf(body.role, "role", ["customer", "staff", "admin"]) || target.role;
    const active = body.isActive === undefined ? target.is_active : body.isActive ? 1 : 0;
    db.prepare("UPDATE users SET role = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?").run(role, active, id);
    if (!active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    return { ok: true };
  }));

  // ---- reports -------------------------------------------------------------

  router.get("/api/admin/reports/summary", staff(({ db }) => ({
    today: db.prepare("SELECT * FROM v_sales_daily WHERE day = date('now')").get() || { orders: 0, revenue_cents: 0 },
    last30Days: db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS revenue_cents FROM orders
                            WHERE status NOT IN ('cancelled', 'refunded') AND placed_at >= datetime('now', '-30 days')`).get(),
    ordersToShip: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('paid', 'processing')").get().n,
    awaitingPayment: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'").get().n,
    lowStockItems: db.prepare("SELECT COUNT(*) AS n FROM v_low_stock").get().n,
    abandonedCarts: db.prepare("SELECT COUNT(*) AS n FROM v_abandoned_carts").get().n,
    customers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").get().n,
  })));

  router.get("/api/admin/reports/sales", staff(({ db, query }) => {
    const days = int(query.get("days"), "days", { min: 1, max: 366 }) || 30;
    return { days: db.prepare("SELECT * FROM v_sales_daily WHERE day >= date('now', ?) ORDER BY day").all(`-${days - 1} days`) };
  }));

  router.get("/api/admin/reports/low-stock", staff(({ db }) => ({
    items: db.prepare("SELECT * FROM v_low_stock ORDER BY quantity_on_hand, product_name").all(),
  })));

  router.get("/api/admin/reports/popular", staff(({ db, query }) => {
    const limit = int(query.get("limit"), "limit", { min: 1, max: 100 }) || 10;
    return { products: db.prepare("SELECT * FROM v_popular_products ORDER BY units_sold DESC, revenue_cents DESC LIMIT ?").all(limit) };
  }));

  router.get("/api/admin/reports/abandoned-carts", staff(({ db }) => ({
    carts: db.prepare("SELECT * FROM v_abandoned_carts ORDER BY value_cents DESC LIMIT 200").all(),
  })));
};
