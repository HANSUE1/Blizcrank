import fallback from "../js/catalog.json" with { type: "json" };
import { models } from "../db/index.js";
import { buildCatalog } from "../db/catalog.js";

async function loadCatalog() {
  const find = (model, sort) => model.find({ isActive: { $ne: false } }).sort(sort).lean();
  const [products, categories, brands, banners, rates] = await Promise.all([
    find(models.Product, { _id: 1 }),
    find(models.Category, { _id: 1 }),
    find(models.Brand, { _id: 1 }),
    find(models.Banner, { sortOrder: 1, _id: 1 }),
    find(models.ShippingRate, { _id: 1 }),
  ]);
  return buildCatalog({ products, categories, brands, banners, rates }, fallback);
}

export async function getCatalog(req, res) {
  try {
    res.json(await loadCatalog());
  } catch (err) {
    console.error("[api] Catalog failed:", err.message);
    res.status(503).json({ error: "Catalog unavailable" });
  }
}
