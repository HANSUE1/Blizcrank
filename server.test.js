import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "./server.js";
import { buildCatalog } from "./db/catalog.js";
import { productFields, slugify } from "./controllers/productController.js";

// http.request sends the raw path; fetch would tidy "../" first.
const status = (port, path, { method = "GET", headers } = {}) => new Promise((resolve, reject) => {
  http.request({ host: "127.0.0.1", port, path, method, headers }, (res) => { res.resume(); resolve(res.statusCode); })
    .on("error", reject).end();
});

test("only storefront files are public, and the product API is local only", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  try {
    for (const p of ["/", "/index.html", "/styles.css", "/js/main.js?v=3"]) assert.equal(await status(port, p), 200, p);
    for (const p of ["/.env", "/../.env", "/js/../.env", "/js/../../.env", "/js/..%2f..%2f.env", "/js/%2e%2e/%2e%2e/.env", "/js/..%5c..%5c.env",
      "/admin/../../.env", "/server.js", "/package.json", "/db/index.js", "/controllers/productController.js", "/admin/src/App.jsx", "/.git/config"]) {
      const code = await status(port, p);
      assert.ok(code === 404 || code === 403 || code === 400, `${p} returned ${code}`);
    }
    assert.equal(await status(port, "/api/products", { headers: { Host: "evil.example" } }), 403);
    assert.equal(await status(port, "/api/products", { method: "POST" }), 400);
  } finally {
    server.close();
  }
});

test("product form data is checked and totals come from the variants", () => {
  const variant = (sku, priceCents, stock) => ({ sku, name: "Standard", priceCents, stock });
  const ok = productFields({ name: " Pad ", variants: [variant("a-1", 500, 2), variant("a-2", 300, 4)] });
  assert.deepEqual([ok.name, ok.priceCents, ok.fromPriceCents, ok.stock, ok.inStock, ok.variants[0].sku, ok.variants[0].isDefault],
    ["Pad", 500, 300, 6, true, "A-1", true]);

  const current = [{ _id: "x", sku: "KEEP", options: { ram: "16GB" }, isDefault: true }];
  const edited = productFields({ name: "P", variants: [variant("new", 1, 1), { ...variant("CHANGED", 9, 0), _id: "x" }] }, current);
  assert.deepEqual([edited.variants[1].sku, edited.variants[1].options.ram, edited.variants[1].inStock, edited.priceCents], ["KEEP", "16GB", false, 9]);

  for (const body of [undefined, { name: "x" }, { name: "", variants: [variant("a", 1, 1)] }, { name: { $ne: 1 }, variants: [variant("a", 1, 1)] },
    { name: "x", variants: [null] }, { name: "x", variants: [variant("a", -1, 1)] }, { name: "x", variants: [variant("a", 1.5, 1)] },
    { name: "x", variants: [variant("a", "1", 1)] }, { name: "x", variants: [variant("a", 1, NaN)] }, { name: "x", variants: [variant("a", 1, 1), variant("A", 1, 1)] }]) {
    assert.throws(() => productFields(body), { status: 400 });
  }
  assert.equal(slugify("ROG Strix — 16\""), "rog-strix-16");
});

test("database values win; photos and numeric variant ids come from catalog.json", () => {
  const fallback = {
    products: [{ slug: "a", imageUrl: "a.webp", images: [{ url: "a.webp" }], look: { summary: "s" }, variants: [{ id: 7, sku: "A-1", priceCents: 1 }] }],
    categories: [{ slug: "x", children: [] }, { slug: "y", children: [{ slug: "z" }] }],
  };
  const doc = (slug, sku) => ({
    slug, categorySlug: "z", topCategorySlug: "y", priceCents: 5, imageUrl: null, defaultVariantId: "v2",
    variants: [{ _id: "v1", sku, priceCents: 5 }, { _id: "v2", sku: `${sku}-B`, priceCents: 6 }],
  });
  const out = buildCatalog({
    products: [doc("a", "A-1"), doc("new", "N-1"), { slug: "empty", variants: [] }],
    categories: [{ _id: 2, slug: "y", parentId: null }, { _id: 1, slug: "x", parentId: null }, { _id: 3, slug: "z", parentId: 2 }],
    brands: [],
    rates: [],
    banners: [{ title: "old", endDate: new Date(0) }, { title: "live" }],
  }, fallback);

  const [a, fresh] = out.products;
  assert.equal(out.products.length, 2);
  assert.deepEqual([a.variants[0].id, a.variants[0].priceCents, a.imageUrl, a.look.summary], [7, 5, "a.webp", "s"]);
  assert.deepEqual([fresh.variants[0].id, fresh.defaultVariantId, fresh.images], ["v1", "v2", []]);
  assert.deepEqual(out.categories.map((c) => [c.slug, c.children.map((x) => x.slug)]), [["x", []], ["y", ["z"]]]);
  assert.deepEqual(out.categories.map((c) => c.productCount), [0, 2]);
  assert.deepEqual(out.banners.map((b) => b.title), ["live"]);
});
