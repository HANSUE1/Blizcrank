"use strict";
// Addresses, wishlist, reviews and saved PC builds.

const { HttpError, notFound, str, int } = require("../lib/http");
const { requireUser } = require("../lib/auth");
const { transaction } = require("../../db");
const { parseAddress, addressOut } = require("../lib/address");

function productBySlugOrId(db, body) {
  const p = body.productId !== undefined
    ? db.prepare("SELECT id FROM products WHERE id = ? AND status = 'active'").get(int(body.productId, "productId"))
    : db.prepare("SELECT id FROM products WHERE slug = ? AND status = 'active'").get(str(body.productSlug, "productSlug", { required: true }));
  if (!p) throw notFound("Product not found");
  return p;
}

// Flags obvious incompatibilities between parts in a build.
function compatibilityWarnings(items) {
  const warnings = [];
  for (const key of ["socket", "memory_type"]) {
    const holders = items.filter((i) => i.specs[key]);
    const values = [...new Set(holders.map((i) => i.specs[key].toUpperCase()))];
    if (values.length > 1) {
      warnings.push(`${key === "socket" ? "Socket" : "Memory type"} mismatch: ` +
        holders.map((i) => `${i.productName} (${i.specs[key]})`).join(" vs "));
    }
  }
  const psu = items.find((i) => i.specs.wattage_w);
  for (const i of items) {
    if (psu && i.specs.psu_min_w && Number(psu.specs.wattage_w) < Number(i.specs.psu_min_w)) {
      warnings.push(`${i.productName} recommends a ${i.specs.psu_min_w}W PSU; ${psu.productName} is ${psu.specs.wattage_w}W`);
    }
  }
  return warnings;
}

function buildDetail(db, build) {
  const items = db.prepare(`
    SELECT bi.slot, bi.quantity, v.id AS variant_id, v.sku, v.name AS variant_name, v.price_cents,
           p.id AS product_id, p.slug, p.name AS product_name, s.stock
    FROM saved_build_items bi
    JOIN product_variants v ON v.id = bi.variant_id
    JOIN products p ON p.id = v.product_id
    JOIN v_variant_stock s ON s.variant_id = v.id
    WHERE bi.build_id = ? ORDER BY bi.slot`).all(build.id).map((r) => {
    const specs = {};
    for (const s of db.prepare("SELECT spec_key, spec_value FROM product_specs WHERE product_id = ?").all(r.product_id)) {
      specs[s.spec_key] = s.spec_value;
    }
    return { slot: r.slot, quantity: r.quantity, variantId: r.variant_id, sku: r.sku, variantName: r.variant_name,
             productId: r.product_id, productSlug: r.slug, productName: r.product_name, unitPriceCents: r.price_cents,
             inStock: r.stock >= r.quantity, specs };
  });
  return {
    id: build.id, name: build.name, notes: build.notes, isPublic: !!build.is_public,
    createdAt: build.created_at, updatedAt: build.updated_at,
    items,
    totalCents: items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0),
    warnings: compatibilityWarnings(items),
  };
}

function saveBuildItems(db, buildId, items) {
  if (!Array.isArray(items)) throw new HttpError(400, "items must be a list", "validation");
  if (items.length > 30) throw new HttpError(400, "A build can have at most 30 parts", "validation");
  db.prepare("DELETE FROM saved_build_items WHERE build_id = ?").run(buildId);
  const ins = db.prepare("INSERT INTO saved_build_items (build_id, slot, variant_id, quantity) VALUES (?, ?, ?, ?)");
  for (const it of items) {
    const variantId = int(it.variantId, "variantId", { required: true, min: 1 });
    if (!db.prepare("SELECT 1 FROM product_variants WHERE id = ?").get(variantId)) throw notFound(`Variant ${variantId} not found`);
    ins.run(buildId, str(it.slot, "slot", { required: true, max: 40 }).toLowerCase(), variantId,
            int(it.quantity ?? 1, "quantity", { min: 1, max: 8 }));
  }
}

module.exports = function register(router) {
  // ---- addresses -----------------------------------------------------------

  router.get("/api/addresses", (ctx) => {
    const user = requireUser(ctx);
    return { addresses: ctx.db.prepare("SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id").all(user.id).map(addressOut) };
  });

  router.post("/api/addresses", (ctx) => {
    const user = requireUser(ctx);
    const a = parseAddress(ctx.body);
    const id = transaction(ctx.db, () => {
      const first = !ctx.db.prepare("SELECT 1 FROM addresses WHERE user_id = ?").get(user.id);
      const makeDefault = first || ctx.body.isDefault === true;
      if (makeDefault) ctx.db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(user.id);
      return ctx.db.prepare(`
        INSERT INTO addresses (user_id, label, recipient_name, phone, line1, line2, barangay, city, province, region, postal_code, country, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        user.id, a.label, a.recipient_name, a.phone, a.line1, a.line2, a.barangay, a.city, a.province, a.region,
        a.postal_code, a.country, makeDefault ? 1 : 0).lastInsertRowid;
    });
    ctx.status = 201;
    return { address: addressOut(ctx.db.prepare("SELECT * FROM addresses WHERE id = ?").get(id)) };
  });

  router.delete("/api/addresses/:id", (ctx) => {
    const user = requireUser(ctx);
    const r = ctx.db.prepare("DELETE FROM addresses WHERE id = ? AND user_id = ?").run(int(ctx.params.id, "id"), user.id);
    if (!r.changes) throw notFound("Address not found");
    return { ok: true };
  });

  // ---- wishlist ------------------------------------------------------------

  router.get("/api/wishlist", (ctx) => {
    const user = requireUser(ctx);
    const items = ctx.db.prepare(`
      SELECT w.product_id, w.variant_id, w.created_at, p.slug, p.name, b.name AS brand,
             v.price_cents, v.compare_at_cents, s.stock
      FROM wishlist_items w
      JOIN products p ON p.id = w.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      JOIN product_variants v ON v.id = COALESCE(w.variant_id,
            (SELECT id FROM product_variants WHERE product_id = p.id AND is_default = 1))
      JOIN v_variant_stock s ON s.variant_id = v.id
      WHERE w.user_id = ? AND p.status = 'active'
      ORDER BY w.created_at DESC`).all(user.id)
      .map((r) => ({ productId: r.product_id, variantId: r.variant_id, productSlug: r.slug, name: r.name, brand: r.brand,
                     priceCents: r.price_cents, compareAtCents: r.compare_at_cents, inStock: r.stock > 0, addedAt: r.created_at }));
    return { items };
  });

  router.post("/api/wishlist", (ctx) => {
    const user = requireUser(ctx);
    const p = productBySlugOrId(ctx.db, ctx.body);
    const variantId = int(ctx.body.variantId, "variantId", { min: 1 });
    if (variantId && !ctx.db.prepare("SELECT 1 FROM product_variants WHERE id = ? AND product_id = ?").get(variantId, p.id)) {
      throw notFound("Variant not found");
    }
    ctx.db.prepare(`INSERT INTO wishlist_items (user_id, product_id, variant_id) VALUES (?, ?, ?)
                    ON CONFLICT (user_id, product_id) DO UPDATE SET variant_id = excluded.variant_id`).run(user.id, p.id, variantId);
    ctx.status = 201;
    return { ok: true };
  });

  router.delete("/api/wishlist/:productId", (ctx) => {
    const user = requireUser(ctx);
    ctx.db.prepare("DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?").run(user.id, int(ctx.params.productId, "productId"));
    return { ok: true };
  });

  // ---- reviews -------------------------------------------------------------

  // Creates or updates the signed-in customer's review of a product.
  router.post("/api/products/:slug/reviews", (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const p = db.prepare("SELECT id FROM products WHERE slug = ? AND status = 'active'").get(ctx.params.slug);
    if (!p) throw notFound("Product not found");
    const rating = int(body.rating, "rating", { required: true, min: 1, max: 5 });
    const title = str(body.title, "title", { max: 120 }) || "";
    const text = str(body.body, "body", { max: 4000 }) || "";
    const verified = db.prepare(`
      SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = ? AND oi.product_id = ? AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
      LIMIT 1`).get(user.id, p.id) ? 1 : 0;
    db.prepare(`
      INSERT INTO reviews (product_id, user_id, rating, title, body, is_verified_purchase)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (product_id, user_id) DO UPDATE SET
        rating = excluded.rating, title = excluded.title, body = excluded.body,
        is_verified_purchase = excluded.is_verified_purchase, updated_at = datetime('now')`)
      .run(p.id, user.id, rating, title, text, verified);
    ctx.status = 201;
    return { ok: true, verifiedPurchase: !!verified };
  });

  // ---- saved builds --------------------------------------------------------

  router.get("/api/builds", (ctx) => {
    const user = requireUser(ctx);
    const builds = ctx.db.prepare("SELECT * FROM saved_builds WHERE user_id = ? ORDER BY updated_at DESC").all(user.id);
    return { builds: builds.map((b) => buildDetail(ctx.db, b)) };
  });

  router.get("/api/builds/:id", (ctx) => {
    const b = ctx.db.prepare("SELECT * FROM saved_builds WHERE id = ?").get(int(ctx.params.id, "id"));
    if (!b || (!b.is_public && (!ctx.user || ctx.user.id !== b.user_id))) throw notFound("Build not found");
    return { build: buildDetail(ctx.db, b) };
  });

  // Body: { name, notes?, isPublic?, items: [{ slot: "cpu", variantId, quantity? }] }
  router.post("/api/builds", (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const id = transaction(db, () => {
      const id = db.prepare("INSERT INTO saved_builds (user_id, name, notes, is_public) VALUES (?, ?, ?, ?)")
        .run(user.id, str(body.name, "name", { required: true, max: 80 }), str(body.notes, "notes", { max: 1000 }),
             body.isPublic === true ? 1 : 0).lastInsertRowid;
      saveBuildItems(db, id, body.items || []);
      return id;
    });
    ctx.status = 201;
    return { build: buildDetail(db, db.prepare("SELECT * FROM saved_builds WHERE id = ?").get(id)) };
  });

  router.put("/api/builds/:id", (ctx) => {
    const user = requireUser(ctx);
    const { db, body } = ctx;
    const b = db.prepare("SELECT * FROM saved_builds WHERE id = ? AND user_id = ?").get(int(ctx.params.id, "id"), user.id);
    if (!b) throw notFound("Build not found");
    transaction(db, () => {
      db.prepare("UPDATE saved_builds SET name = ?, notes = ?, is_public = ?, updated_at = datetime('now') WHERE id = ?")
        .run(str(body.name, "name", { max: 80 }) || b.name, body.notes === undefined ? b.notes : str(body.notes, "notes", { max: 1000 }),
             body.isPublic === undefined ? b.is_public : body.isPublic === true ? 1 : 0, b.id);
      if (body.items !== undefined) saveBuildItems(db, b.id, body.items);
    });
    return { build: buildDetail(db, db.prepare("SELECT * FROM saved_builds WHERE id = ?").get(b.id)) };
  });

  router.delete("/api/builds/:id", (ctx) => {
    const user = requireUser(ctx);
    const r = ctx.db.prepare("DELETE FROM saved_builds WHERE id = ? AND user_id = ?").run(int(ctx.params.id, "id"), user.id);
    if (!r.changes) throw notFound("Build not found");
    return { ok: true };
  });
};
