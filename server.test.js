import test from "node:test";
import assert from "node:assert/strict";
import { publicFile } from "./server.js";
import { buildCatalog } from "./db/catalog.js";

test("only storefront files are public", () => {
  for (const p of ["/", "/index.html", "/styles.css", "/js/main.js", "/images/thumbs/a-1.webp"]) assert.ok(publicFile(p), p);
  for (const p of ["/.env", "/../.env", "/js/../.env", "/js/../../.env", "/js/..%2f.env", "/js/%2e%2e/.env", "/js\\..\\.env",
    "/server.js", "/package.json", "/db/index.js", "/.git/config", "/js/.hidden", "/js/", "/js//x"]) assert.equal(publicFile(p), null, p);
});

test("database values win; photos and numeric variant ids come from catalog.json", () => {
  const fallback = {
    products: [{ slug: "a", imageUrl: "a.webp", images: [{ url: "a.webp" }], look: { summary: "s" }, variants: [{ id: 7, sku: "A-1", priceCents: 1 }] }],
    categories: [{ slug: "x", children: [] }, { slug: "y", children: [{ slug: "z" }] }],
  };
  const doc = (slug, sku) => ({
    slug, priceCents: 5, imageUrl: null, defaultVariantId: "v2",
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
  assert.deepEqual(out.banners.map((b) => b.title), ["live"]);
});
