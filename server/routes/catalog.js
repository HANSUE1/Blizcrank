"use strict";
const { HttpError, notFound, str, int } = require("../lib/http");

function badgeLabel(badge, priceCents, compareAtCents, isPreorder) {
  if (isPreorder) return "Pre-order";
  if (compareAtCents && (badge === "sale" || !badge)) {
    return `-${Math.round((1 - priceCents / compareAtCents) * 100)}% Off`;
  }
  return { hot: "Hot", new: "New", sale: "Sale" }[badge] || null;
}

function productCard(r) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    brand: r.brand,
    category: r.category,
    topCategory: r.top_category,
    badge: r.is_preorder ? "preorder" : r.badge || (r.compare_at_cents ? "sale" : null),
    badgeLabel: badgeLabel(r.badge, r.price_cents, r.compare_at_cents, r.is_preorder),
    isPreorder: !!r.is_preorder,
    releaseDate: r.release_date,
    priceCents: r.price_cents,
    compareAtCents: r.compare_at_cents,
    fromPriceCents: r.from_price_cents ?? r.price_cents,
    variantCount: r.variant_count,
    createdAt: r.created_at,
    rating: r.rating_avg,
    reviewCount: r.rating_count,
    stock: r.stock || 0,
    inStock: (r.stock || 0) > 0,
    defaultVariantId: r.variant_id,
    imageUrl: r.image_url,
    card: { art: r.card_art, color: r.card_art_color, bg: r.card_bg },
  };
}

const LIST_SQL = `
  SELECT p.id, p.slug, p.name, p.description, p.badge, p.is_preorder, p.release_date, p.rating_avg, p.rating_count,
         p.card_art, p.card_art_color, p.card_bg, p.created_at,
         b.name AS brand, c.slug AS category, COALESCE(pc.slug, c.slug) AS top_category,
         v.id AS variant_id, v.price_cents, v.compare_at_cents,
         (SELECT SUM(s.stock) FROM product_variants pv JOIN v_variant_stock s ON s.variant_id = pv.id
           WHERE pv.product_id = p.id AND pv.is_active = 1) AS stock,
         (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1) AS variant_count,
         (SELECT MIN(price_cents) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1) AS from_price_cents,
         (SELECT url FROM product_images im WHERE im.product_id = p.id
           ORDER BY im.is_primary DESC, im.sort_order LIMIT 1) AS image_url
  FROM products p
  JOIN categories c        ON c.id = p.category_id
  LEFT JOIN categories pc  ON pc.id = c.parent_id
  LEFT JOIN brands b       ON b.id = p.brand_id
  JOIN product_variants v  ON v.product_id = p.id AND v.is_default = 1`;

const SORTS = {
  featured: "p.rating_count DESC, p.id",
  newest: "p.created_at DESC, p.id DESC",
  price_asc: "v.price_cents ASC, p.id",
  price_desc: "v.price_cents DESC, p.id",
  rating: "p.rating_avg DESC, p.rating_count DESC",
  discount: "CASE WHEN v.compare_at_cents IS NULL THEN 1 ELSE 1.0 * v.price_cents / v.compare_at_cents END, p.id",
};

const likeEscape = (s) => "%" + s.replace(/[\\%_]/g, (m) => "\\" + m) + "%";

module.exports = function register(router) {
  router.get("/api/categories", ({ db }) => {
    const rows = db.prepare(`
      SELECT c.id, c.slug, c.name, c.description, c.sort_order, pc.slug AS parent,
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
      FROM categories c LEFT JOIN categories pc ON pc.id = c.parent_id
      ORDER BY c.parent_id IS NOT NULL, c.sort_order, c.name`).all();
    const bySlug = {};
    const roots = [];
    for (const r of rows) {
      bySlug[r.slug] = { slug: r.slug, name: r.name, description: r.description, productCount: r.product_count, children: [] };
    }
    for (const r of rows) (r.parent ? bySlug[r.parent].children : roots).push(bySlug[r.slug]);
    return { categories: roots };
  });

  // GET /api/products?category=components&q=rtx&brand=razer&sort=price_asc
  //   &spec.socket=AM5        exact spec match
  //   &min.refresh_rate_hz=144  numeric spec minimum
  //   &sale=1  on sale only    &preorder=1  pre-orders only    &limit=20
  router.get("/api/products", ({ db, query }) => {
    const where = ["p.status = 'active'"];
    const params = [];
    let prefix = "";

    const category = str(query.get("category"), "category", { max: 80 });
    if (category && category !== "all") {
      prefix = `WITH RECURSIVE cat_tree(id) AS (
                  SELECT id FROM categories WHERE slug = ?
                  UNION ALL SELECT c.id FROM categories c JOIN cat_tree t ON c.parent_id = t.id) `;
      params.push(category);
      where.push("p.category_id IN (SELECT id FROM cat_tree)");
    }

    const q = str(query.get("q"), "q", { max: 100 });
    if (q) {
      where.push("(p.name LIKE ? ESCAPE '\\' OR b.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
      params.push(likeEscape(q), likeEscape(q), likeEscape(q));
    }

    const brand = str(query.get("brand"), "brand", { max: 80 });
    if (brand) { where.push("b.slug = ?"); params.push(brand); }
    if (query.get("sale") === "1") where.push("v.compare_at_cents IS NOT NULL");
    if (query.get("preorder") === "1") where.push("p.is_preorder = 1");
    if (query.get("preorder") === "0") where.push("p.is_preorder = 0");
    const limit = int(query.get("limit"), "limit", { min: 1, max: 200 }) || 200;

    for (const [key, value] of query) {
      const m = /^(spec|min|max)\.([a-z0-9_]{1,40})$/.exec(key);
      if (!m) continue;
      if (m[1] === "spec") {
        where.push("EXISTS (SELECT 1 FROM product_specs ps WHERE ps.product_id = p.id AND ps.spec_key = ? AND ps.spec_value = ? COLLATE NOCASE)");
        params.push(m[2], value);
      } else if (Number.isFinite(Number(value))) {
        where.push(`EXISTS (SELECT 1 FROM product_specs ps WHERE ps.product_id = p.id AND ps.spec_key = ? AND ps.num_value ${m[1] === "min" ? ">=" : "<="} ?)`);
        params.push(m[2], Number(value));
      }
    }

    const sort = SORTS[query.get("sort")] || SORTS.featured;
    const rows = db.prepare(`${prefix}${LIST_SQL} WHERE ${where.join(" AND ")} ORDER BY ${sort} LIMIT ${limit}`).all(...params);
    return { products: rows.map(productCard) };
  });

  router.get("/api/products/:slug", ({ db, params }) => {
    const row = db.prepare(`${LIST_SQL} WHERE p.slug = ? AND p.status = 'active'`).get(params.slug);
    if (!row) throw notFound("Product not found");
    const product = productCard(row);

    product.variants = db.prepare(`
      SELECT v.id, v.sku, v.name, v.options, v.price_cents, v.compare_at_cents, v.is_default, s.stock
      FROM product_variants v JOIN v_variant_stock s ON s.variant_id = v.id
      WHERE v.product_id = ? AND v.is_active = 1 ORDER BY v.is_default DESC, v.id`).all(row.id)
      .map((v) => ({ id: v.id, sku: v.sku, name: v.name, options: JSON.parse(v.options), priceCents: v.price_cents,
                     compareAtCents: v.compare_at_cents, isDefault: !!v.is_default, stock: v.stock, inStock: v.stock > 0 }));

    product.specs = db.prepare("SELECT spec_key, label, spec_value, unit FROM product_specs WHERE product_id = ? ORDER BY rowid")
      .all(row.id).map((s) => ({ key: s.spec_key, label: s.label, value: s.spec_value, unit: s.unit }));

    product.images = db.prepare("SELECT id, variant_id, url, alt FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order")
      .all(row.id).map((i) => ({ id: i.id, variantId: i.variant_id, url: i.url, alt: i.alt }));

    product.reviews = db.prepare(`
      SELECT r.id, r.rating, r.title, r.body, r.is_verified_purchase, r.created_at,
             u.first_name || CASE WHEN u.last_name <> '' THEN ' ' || substr(u.last_name, 1, 1) || '.' ELSE '' END AS author
      FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ? AND r.status = 'published'
      ORDER BY r.created_at DESC LIMIT 20`).all(row.id)
      .map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, author: r.author,
                     verifiedPurchase: !!r.is_verified_purchase, createdAt: r.created_at }));
    return { product };
  });

  router.get("/api/brands", ({ db }) => ({
    brands: db.prepare(`
      SELECT b.slug, b.name, COUNT(p.id) AS product_count
      FROM brands b JOIN products p ON p.brand_id = b.id AND p.status = 'active'
      GROUP BY b.id ORDER BY product_count DESC, b.name`).all()
      .map((b) => ({ slug: b.slug, name: b.name, productCount: b.product_count })),
  }));

  // Active homepage banners (within their optional start/end dates).
  router.get("/api/banners", ({ db }) => ({
    banners: db.prepare(`
      SELECT * FROM promo_banners
      WHERE is_active = 1
        AND (starts_at IS NULL OR starts_at <= datetime('now'))
        AND (ends_at IS NULL OR ends_at > datetime('now'))
      ORDER BY sort_order, id`).all()
      .map((b) => ({ id: b.id, eyebrow: b.eyebrow, title: b.title, subtitle: b.subtitle, ctaLabel: b.cta_label,
                     ctaLink: b.cta_link, imageUrl: b.image_url, card: { art: b.card_art, color: b.card_art_color, bg: b.card_bg } })),
  }));

  router.post("/api/newsletter", (ctx) => {
    const email = str(ctx.body.email, "email", { required: true, max: 254 }).toLowerCase();
    if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address", "validation");
    ctx.db.prepare(`INSERT INTO newsletter_subscribers (email, user_id, source) VALUES (?, ?, ?)
                    ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL`)
      .run(email, ctx.user ? ctx.user.id : null, str(ctx.body.source, "source", { max: 40 }) || "footer");
    ctx.status = 201;
    return { ok: true };
  });

  router.get("/api/shipping-rates", ({ db }) => ({
    rates: db.prepare("SELECT region, fee_cents, free_over_cents, eta_min_days, eta_max_days FROM shipping_rates ORDER BY fee_cents").all()
      .map((r) => ({ region: r.region, feeCents: r.fee_cents, freeOverCents: r.free_over_cents, etaDays: [r.eta_min_days, r.eta_max_days] })),
  }));
};
