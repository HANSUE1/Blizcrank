/**
 * Fills the catalog collections from js/catalog.json.
 *
 *   npm run seed                 an empty database only
 *   npm run seed -- --reset      DELETES products, categories, brands, banners and shipping rates first
 *
 * Requires MONGODB_URI (defaults to mongodb://127.0.0.1:27017/blitzcrank).
 */

import catalog from "../js/catalog.json" with { type: "json" };
import { connect, disconnect, models, mongoose } from "./index.js";

const { Product, Category, Brand, Banner, ShippingRate } = models;
const SEEDED = [Product, Category, Brand, Banner, ShippingRate];

async function seedCategories() {
  const idBySlug = new Map();
  const add = async (list, parentId, level) => {
    for (const { slug, name, description, productCount, children = [] } of list) {
      const doc = await Category.create({ slug, name, description, productCount, parentId, level });
      idBySlug.set(slug, doc._id);
      await add(children, doc._id, level + 1);
    }
  };
  await add(catalog.categories, null, 0);
  return idBySlug;
}

async function seedBrands() {
  const docs = await Brand.insertMany(catalog.brands.map(({ slug, name, productCount }) => ({ slug, name, productCount })));
  return new Map(docs.map((b) => [b.name, b._id]));
}

function productDoc(p, brandIds, categoryIds) {
  const variants = p.variants.map(({ sku, name, options, priceCents, compareAtCents, isDefault, stock, inStock }) => ({
    _id: new mongoose.Types.ObjectId(), sku, name, options, priceCents, compareAtCents, isDefault, stock, inStock,
  }));
  return {
    slug: p.slug, name: p.name, description: p.description,
    brandId: brandIds.get(p.brand), brandName: p.brand,
    categoryId: categoryIds.get(p.category), categorySlug: p.category,
    topCategoryId: categoryIds.get(p.topCategory), topCategorySlug: p.topCategory,
    badge: p.badge, badgeLabel: p.badgeLabel,
    isPreorder: p.isPreorder, releaseDate: p.releaseDate,
    priceCents: p.priceCents, compareAtCents: p.compareAtCents, fromPriceCents: p.fromPriceCents,
    variantCount: variants.length, variants,
    defaultVariantId: (variants.find((v) => v.isDefault) ?? variants[0])._id,
    stock: p.stock, inStock: p.inStock,
    createdAt: p.createdAt, rating: p.rating, reviewCount: p.reviewCount,
    card: p.card, specs: p.specs,
    // imageUrl and images stay empty: photos come from js/catalog.json (see db/catalog.js).
  };
}

async function main() {
  await connect();

  if (process.argv.includes("--reset")) {
    for (const model of SEEDED) await model.deleteMany({});
  } else {
    for (const model of SEEDED) {
      if (await model.exists({})) {
        throw new Error(`"${model.collection.name}" already has data. Run again with --reset to delete and replace it.`);
      }
    }
  }

  const categoryIds = await seedCategories();
  const brandIds = await seedBrands();
  const products = await Product.insertMany(catalog.products.map((p) => productDoc(p, brandIds, categoryIds)));
  await Banner.insertMany(catalog.banners.map(({ id, ...banner }) => ({ ...banner, sortOrder: id })));
  await ShippingRate.insertMany(catalog.rates);

  console.log(`[seed] Categories: ${categoryIds.size}, brands: ${brandIds.size}, products: ${products.length}`);
  await disconnect();
}

main().catch((err) => {
  console.error("[seed] Failed:", err.message);
  process.exit(1);
});
