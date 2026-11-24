import { readFile } from "node:fs/promises";
import { models } from "../db/index.js";
import { buildCatalog } from "../db/catalog.js";

const FALLBACK = new URL("../js/catalog.json", import.meta.url);

async function loadCatalog() {
  const find = (model, sort) => model.find({ isActive: { $ne: false } }).sort(sort).lean();
  const [products, categories, brands, banners, rates, fallback] = await Promise.all([
    find(models.Product, { _id: 1 }),
    find(models.Category, { _id: 1 }),
    find(models.Brand, { _id: 1 }),
    find(models.Banner, { sortOrder: 1, _id: 1 }),
    find(models.ShippingRate, { _id: 1 }),
    readFile(FALLBACK, "utf8").then(JSON.parse),
  ]);
  return buildCatalog({ products, categories, brands, banners, rates }, fallback);
}

export async function getCatalog(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const body = JSON.stringify(await loadCatalog());
    res.writeHead(200).end(body);
  } catch (err) {
    console.error("[api] Catalog failed:", err.message);
    res.writeHead(503).end('{"error":"Catalog unavailable"}');
  }
}
