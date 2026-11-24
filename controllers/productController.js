import { models } from "../db/index.js";
import { CATEGORY_ART } from "../js/art.js";

const { Product, Category, Brand } = models;

const fail = (status, message) => Object.assign(new Error(message), { status });
const isAmount = (n) => Number.isSafeInteger(n) && n >= 0;

export const slugify = (name) =>
  name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 150).replace(/^-+|-+$/g, "");

// Checks the form data and derives the product totals from its variants, so prices and stock cannot disagree.
export function productFields(body, current = []) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) throw fail(400, "Name is required.");
  if (!Array.isArray(body.variants) || !body.variants.length) throw fail(400, "Add at least one variant.");

  const variants = body.variants.map((v) => {
    const old = current.find((x) => String(x._id) === v?._id);
    const variant = {
      ...old,
      sku: old?.sku ?? (typeof v?.sku === "string" ? v.sku.trim().toUpperCase() : ""), // an existing SKU never changes
      name: typeof v?.name === "string" ? v.name.trim() : "",
      priceCents: v?.priceCents,
      compareAtCents: v?.compareAtCents ?? null,
      stock: v?.stock,
      inStock: v?.stock > 0,
    };
    if (!variant.sku || !variant.name) throw fail(400, "Every variant needs an SKU and a name.");
    if (!isAmount(variant.priceCents) || !isAmount(variant.stock)) throw fail(400, "Price and stock must be zero or more.");
    if (variant.compareAtCents !== null && !isAmount(variant.compareAtCents)) throw fail(400, "Old price must be zero or more.");
    return variant;
  });
  if (new Set(variants.map((v) => v.sku)).size !== variants.length) throw fail(400, "Each variant needs a different SKU.");

  const main = variants.find((v) => v.isDefault) ?? variants[0];
  main.isDefault = true;
  const stock = variants.reduce((sum, v) => sum + v.stock, 0);
  return {
    name,
    description: typeof body.description === "string" ? body.description : "",
    variants,
    variantCount: variants.length,
    priceCents: main.priceCents,
    compareAtCents: main.compareAtCents,
    fromPriceCents: Math.min(...variants.map((v) => v.priceCents)),
    stock,
    inStock: stock > 0,
  };
}

async function applyForm(product, body) {
  product.set(productFields(body, product.variants.map((v) => v.toObject())));
  product.defaultVariantId = product.variants.find((v) => v.isDefault)._id;

  // String() stops a request from passing a query operator such as {"$ne": null}.
  const [brand, category] = await Promise.all([
    Brand.findOne({ slug: String(body.brand) }),
    Category.findOne({ slug: String(body.category) }),
  ]);
  if (!brand) throw fail(400, "Choose a brand.");
  if (!category) throw fail(400, "Choose a category.");
  const top = category.parentId ? await Category.findById(category.parentId) : category;
  if (!top) throw fail(400, "That category's parent no longer exists.");
  product.set({
    brandId: brand._id, brandName: brand.name,
    categoryId: category._id, categorySlug: category.slug,
    topCategoryId: top._id, topCategorySlug: top.slug,
  });
}

async function findProduct(id) {
  const product = await Product.findById(id);
  if (!product) throw fail(404, "Product not found.");
  return product;
}

// READ all
export async function listProducts(req, res) {
  res.json(await Product.find().sort({ _id: 1 }).lean());
}

// READ one
export async function getProduct(req, res) {
  res.json(await findProduct(req.params.id));
}

// CREATE
export async function createProduct(req, res) {
  const product = new Product();
  await applyForm(product, req.body);
  product.slug = slugify(product.name);
  if (!product.slug) throw fail(400, "Name needs at least one letter or number.");
  const [art, color] = CATEGORY_ART[product.categorySlug] ?? CATEGORY_ART[product.topCategorySlug] ?? [];
  product.card = { art, color };
  await product.save();
  res.status(201).json(product);
}

// UPDATE
export async function updateProduct(req, res) {
  const product = await findProduct(req.params.id);
  await applyForm(product, req.body);
  await product.save();
  res.json(product);
}

// DELETE
export async function deleteProduct(req, res) {
  const product = await findProduct(req.params.id);
  await product.deleteOne();
  res.status(204).end();
}
