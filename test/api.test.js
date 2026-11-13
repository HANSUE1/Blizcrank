"use strict";
// End-to-end API tests against a fresh in-memory database.
//   npm test

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { openDatabase } = require("../db");
const { seed, seedCatalog, PRODUCTS } = require("../db/seed");
const { createApp } = require("../server/app");

let server, base, db;

test.before(async () => {
  db = openDatabase(":memory:");
  seed(db, { adminEmail: "admin@test.local", adminPassword: "admin-pass-123" });
  server = http.createServer(createApp(db));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

// Minimal cookie-keeping client, one per simulated browser.
function client() {
  const jar = {};
  return async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}),
                 Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, v] = pair.split("=");
      if (/Max-Age=0/.test(c)) delete jar[k]; else jar[k] = v;
    }
    return { status: res.status, body: await res.json() };
  };
}

const ADDRESS = { recipientName: "Juan Dela Cruz", phone: "09171234567", line1: "123 Rizal St", city: "Pasig",
                  province: "Metro Manila", region: "Metro Manila", postalCode: "1600" };

const product = async (api, slug) => (await api("GET", `/api/products/${slug}`)).body.product;

test("catalog lists seeded products and filters by category tree and specs", async () => {
  const api = client();
  const all = await api("GET", "/api/products");
  assert.equal(all.status, 200);
  assert.equal(all.body.products.length, PRODUCTS.length);

  const comps = await api("GET", "/api/products?category=components");
  assert.ok(comps.body.products.length >= 6);
  assert.ok(comps.body.products.every((p) => p.topCategory === "components"));

  const am5 = await api("GET", "/api/products?spec.socket=am5");
  assert.deepEqual(am5.body.products.map((p) => p.slug).sort(), ["amd-ryzen-9-7900x", "msi-mag-b650-tomahawk-wifi"]);
  const fast = await api("GET", "/api/products?min.refresh_rate_hz=165");
  assert.deepEqual(fast.body.products.map((p) => p.slug).sort(), ["rog-strix-scar-16", "rog-strix-xg32vqr"]);

  const pre = await api("GET", "/api/products?preorder=1");
  assert.deepEqual(pre.body.products.map((p) => p.slug).sort(), ["blitzcrank-pulse-x", "blitzcrank-volt75"]);
  assert.equal(pre.body.products[0].badgeLabel, "Pre-order");
  assert.ok(pre.body.products[0].releaseDate);

  const sale = await api("GET", "/api/products?sale=1&sort=discount");
  assert.ok(sale.body.products.length > 0 && sale.body.products.every((p) => p.compareAtCents > p.priceCents));

  const ssd = all.body.products.find((p) => p.slug === "samsung-990-pro");
  assert.equal(ssd.variantCount, 2);
  assert.equal(ssd.fromPriceCents, 649500);

  const msi = all.body.products.find((p) => p.slug === "msi-katana-15");
  assert.equal(msi.priceCents, 5499500);
  assert.equal(msi.badgeLabel, "-13% Off");

  const kb = await product(api, "razer-blackwidow-v4");
  assert.equal(kb.variants.length, 2);
  assert.ok(kb.specs.some((s) => s.key === "polling_rate_hz"));
});

test("guest cart -> register merges cart -> coupon -> checkout snapshots prices and decrements stock", async () => {
  const api = client();
  const mouse = await product(api, "logitech-g903");
  const variantId = mouse.defaultVariantId;
  const stockBefore = mouse.variants[0].stock;

  let r = await api("POST", "/api/cart/items", { variantId, quantity: 2 });
  assert.equal(r.status, 201);
  assert.equal(r.body.cart.itemCount, 2);

  r = await api("POST", "/api/auth/register", { email: "juan@example.com", password: "hunter2hunter2", firstName: "Juan" });
  assert.equal(r.status, 201);
  r = await api("GET", "/api/cart?region=Metro Manila");
  assert.equal(r.body.cart.itemCount, 2, "guest cart merged into account");

  r = await api("POST", "/api/cart/coupon", { code: "welcome10" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await api("GET", "/api/cart?region=Metro Manila");
  const q = r.body.cart;
  assert.equal(q.subtotalCents, 1099000);
  assert.equal(q.discountCents, 109900);            // 10%
  assert.equal(q.shippingCents, 15000);             // ₱9,891 after discount is under the ₱10,000 free-shipping line
  assert.equal(q.totalCents, q.subtotalCents - q.discountCents + q.shippingCents);
  assert.equal(q.taxCents, Math.round((q.totalCents * 12) / 112));

  r = await api("POST", "/api/checkout", { address: ADDRESS, paymentProvider: "gcash" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const order = r.body.order;
  assert.match(order.orderNumber, /^BZ-\d{6}-[A-Z0-9]{5}$/);
  assert.equal(order.items[0].unitPriceCents, 549500);
  assert.equal(order.payments[0].status, "pending");
  assert.equal(order.totalCents, q.totalCents);

  // Price change later must not affect the stored order.
  db.prepare("UPDATE product_variants SET price_cents = 999900, compare_at_cents = NULL WHERE id = ?").run(variantId);
  r = await api("GET", `/api/orders/${order.orderNumber}`);
  assert.equal(r.body.order.items[0].unitPriceCents, 549500);

  assert.equal((await product(api, "logitech-g903")).variants[0].stock, stockBefore - 2);
  r = await api("GET", "/api/cart");
  assert.equal(r.body.cart.itemCount, 0, "cart emptied after checkout");

  // Coupon is one-per-customer.
  await api("POST", "/api/cart/items", { variantId, quantity: 1 });
  r = await api("POST", "/api/cart/coupon", { code: "WELCOME10" });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /already used/);

  // Cancelling restocks.
  r = await api("POST", `/api/orders/${order.orderNumber}/cancel`);
  assert.equal(r.body.order.status, "cancelled");
  assert.equal((await product(api, "logitech-g903")).variants[0].stock, stockBefore);
});

test("cannot oversell", async () => {
  const a = client();
  const b = client();
  const white = (await product(a, "razer-kraken-v4")).variants.find((v) => v.name === "White");
  assert.equal(white.stock, 2);

  let r = await a("POST", "/api/cart/items", { variantId: white.id, quantity: 3 });
  assert.equal(r.status, 409);
  assert.match(r.body.error.message, /Only 2 left/);

  await a("POST", "/api/cart/items", { variantId: white.id, quantity: 2 });
  await b("POST", "/api/cart/items", { variantId: white.id, quantity: 1 });

  r = await a("POST", "/api/checkout", { email: "a@example.com", address: ADDRESS, paymentProvider: "cod" });
  assert.equal(r.status, 201);
  r = await b("POST", "/api/checkout", { email: "b@example.com", address: ADDRESS, paymentProvider: "cod" });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "out_of_stock");
  assert.equal((await product(b, "razer-kraken-v4")).variants.find((v) => v.name === "White").stock, 0);
});

test("admin: role checks, payment + shipment flow, reports", async () => {
  const customer = client();
  await customer("POST", "/api/auth/register", { email: "maria@example.com", password: "password123" });
  assert.equal((await customer("GET", "/api/admin/reports/summary")).status, 403);
  assert.equal((await client()("GET", "/api/admin/orders")).status, 401);

  const cpu = await product(customer, "amd-ryzen-9-7900x");
  await customer("POST", "/api/cart/items", { variantId: cpu.defaultVariantId, quantity: 2 });
  const placed = (await customer("POST", "/api/checkout", { address: ADDRESS, paymentProvider: "stripe" })).body.order;

  const adm = client();
  assert.equal((await adm("POST", "/api/auth/login", { email: "admin@test.local", password: "admin-pass-123" })).status, 200);

  let r = await adm("PATCH", `/api/admin/payments/${placed.payments[0].id}`, { status: "succeeded", providerReference: "pi_test_123" });
  assert.equal(r.body.order.status, "paid");
  assert.equal(r.body.order.paymentStatus, "paid");

  r = await adm("POST", `/api/admin/orders/${placed.id}/shipments`, { carrier: "LBC", trackingNumber: "LBC123" });
  assert.equal(r.body.order.status, "shipped");
  r = await adm("PATCH", `/api/admin/shipments/${r.body.order.shipments[0].id}`, { status: "delivered" });
  assert.equal(r.body.order.status, "delivered");

  // Verified-purchase review updates the product rating cache.
  r = await customer("POST", "/api/products/amd-ryzen-9-7900x/reviews", { rating: 5, title: "Fast", body: "Great chip" });
  assert.equal(r.body.verifiedPurchase, true);
  const after = await product(customer, "amd-ryzen-9-7900x");
  assert.equal(after.reviewCount, 1);
  assert.equal(after.reviews[0].verifiedPurchase, true);

  r = await adm("GET", "/api/admin/reports/low-stock");
  assert.ok(r.body.items.some((i) => i.sku === "AMD-R9-7900X"), "CPU dropped to 2 -> low stock");
  r = await adm("GET", "/api/admin/reports/popular");
  assert.ok(r.body.products.length > 0);
  r = await adm("GET", "/api/admin/reports/sales?days=7");
  assert.ok(r.body.days.length >= 1);

  r = await adm("POST", "/api/admin/inventory/adjust", { variantId: cpu.defaultVariantId, warehouse: "MNL-01", change: 20, reason: "restock" });
  assert.equal(r.status, 200);
  assert.equal((await product(customer, "amd-ryzen-9-7900x")).variants[0].stock, 22);
});

test("admin can add a product; it appears in the shop; wishlist and builds work", async () => {
  const adm = client();
  await adm("POST", "/api/auth/login", { email: "admin@test.local", password: "admin-pass-123" });
  let r = await adm("POST", "/api/admin/products", {
    name: "B650 Tomahawk WiFi", brand: "MSI", category: "motherboards",
    specs: [{ key: "socket", label: "Socket", value: "AM5" }, { key: "memory_type", label: "Memory", value: "DDR5" }],
    variants: [{ sku: "MSI-B650-TMHWK", priceCents: 1399500, stock: { "MNL-01": 5 } }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));

  const shopper = client();
  await shopper("POST", "/api/auth/register", { email: "builder@example.com", password: "password123" });
  const board = await product(shopper, "b650-tomahawk-wifi");
  assert.equal(board.stock, 5);
  const cpu = await product(shopper, "amd-ryzen-9-7900x");

  r = await shopper("POST", "/api/wishlist", { productSlug: "b650-tomahawk-wifi" });
  assert.equal(r.status, 201);
  assert.equal((await shopper("GET", "/api/wishlist")).body.items.length, 1);

  r = await shopper("POST", "/api/builds", { name: "AM5 build", items: [
    { slot: "cpu", variantId: cpu.defaultVariantId }, { slot: "motherboard", variantId: board.defaultVariantId }] });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.build.warnings, []);
  assert.equal(r.body.build.totalCents, cpu.priceCents + board.priceCents);
});

test("brands, banners, newsletter and guest order lookup", async () => {
  const api = client();
  const brands = (await api("GET", "/api/brands")).body.brands;
  assert.ok(brands.some((b) => b.name === "Razer" && b.productCount === 2));

  const banners = (await api("GET", "/api/banners")).body.banners;
  assert.equal(banners.length, 3);
  assert.ok(banners[0].ctaLink.startsWith("#"));

  assert.equal((await api("POST", "/api/newsletter", { email: "fan@example.com" })).status, 201);
  assert.equal((await api("POST", "/api/newsletter", { email: "FAN@example.com" })).status, 201, "re-subscribing is fine");
  assert.equal((await api("POST", "/api/newsletter", { email: "nope" })).status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM newsletter_subscribers").get().n, 1);

  const pad = await product(api, "sony-dualsense");
  await api("POST", "/api/cart/items", { variantId: pad.variants[0].id, quantity: 1 });
  const order = (await api("POST", "/api/checkout", { email: "guest@example.com", address: ADDRESS, paymentProvider: "cod" })).body.order;

  const stranger = client();
  let r = await stranger("POST", "/api/orders/lookup", { orderNumber: order.orderNumber, email: "wrong@example.com" });
  assert.equal(r.status, 404);
  r = await stranger("POST", "/api/orders/lookup", { orderNumber: order.orderNumber.toLowerCase(), email: "GUEST@example.com" });
  assert.equal(r.status, 200);
  assert.equal(r.body.order.items[0].productName, "DualSense Wireless Controller");
});

test("sold-out variant is rejected; seedCatalog is idempotent", async () => {
  const api = client();
  const red = (await product(api, "sony-dualsense")).variants.find((v) => v.name === "Cosmic Red");
  assert.equal(red.inStock, false);
  assert.equal((await api("POST", "/api/cart/items", { variantId: red.id })).status, 409);

  const before = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
  assert.equal(seedCatalog(db), 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products").get().n, before);
});

test("an old (v0) database is upgraded in place without losing data", () => {
  const { DatabaseSync } = require("node:sqlite");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bz-")), "old.db");

  // Recreate the first version: products without the pre-order columns, user_version 0.
  const old = new DatabaseSync(file);
  const v0 = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8")
    .replace(/\n\s*is_preorder[^\n]*\n\s*release_date[^\n]*/, "");
  assert.ok(!v0.includes("is_preorder"));
  old.exec(v0);
  old.exec(`INSERT INTO categories (slug, name) VALUES ('laptops', 'Laptops');
            INSERT INTO products (slug, name, category_id) VALUES ('my-own-product', 'Mine', 1);`);
  old.close();

  const upgraded = openDatabase(file);
  assert.equal(upgraded.prepare("PRAGMA user_version").get().user_version, 2);
  const cols = upgraded.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
  assert.ok(cols.includes("is_preorder") && cols.includes("release_date"));
  assert.ok(upgraded.prepare("SELECT 1 FROM products WHERE slug = 'my-own-product'").get(), "existing data kept");
  assert.equal(upgraded.prepare("SELECT COUNT(*) AS n FROM products").get().n, PRODUCTS.length + 1, "starter products added");
  upgraded.close();
  const again = openDatabase(file);
  assert.equal(again.prepare("PRAGMA user_version").get().user_version, 2, "re-opening is a no-op");
  again.close();
});
