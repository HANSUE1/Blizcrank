import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Product — catalog product. Variants, specs and images are embedded because
// they are always read together with the product and each product has few
// variants (1-3 in the current catalog). Reviews live in their own collection
// because they can grow without bound per product.
// ---------------------------------------------------------------------------

const variantSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      uppercase: true,
    }, // unique across all products (app-level + unique index below)
    name: { type: String, required: true, trim: true, maxlength: 120 },
    options: { type: mongoose.Schema.Types.Mixed, default: {} }, // { ram: "16GB", storage: "512GB" }
    priceCents: { type: Number, required: true, min: 0 },
    compareAtCents: { type: Number, default: null, min: 0 },
    isDefault: { type: Boolean, default: false },
    stock: { type: Number, required: true, min: 0, default: 0 },
    inStock: { type: Boolean, default: true },
  },
  { _id: true } // each embedded variant gets its own ObjectId
);

const specSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    unit: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const cardSchema = new mongoose.Schema(
  {
    art: { type: String, trim: true },
    color: { type: String, trim: true },
    bg: { type: String, trim: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 150,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 255 },
    description: { type: String, trim: true },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      index: true,
    },
    brandName: { type: String, trim: true }, // denormalized for fast reads
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      index: true,
    },
    categorySlug: { type: String, trim: true, index: true }, // denormalized
    topCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      index: true,
    },
    topCategorySlug: { type: String, trim: true, index: true }, // denormalized
    badge: {
      type: String,
      enum: [null, "hot", "sale", "new", "preorder"],
      default: null,
      index: true,
    },
    badgeLabel: { type: String, trim: true, maxlength: 60 },
    isPreorder: { type: Boolean, default: false, index: true },
    releaseDate: { type: Date, default: null },
    priceCents: { type: Number, required: true, min: 0 }, // default variant price
    compareAtCents: { type: Number, default: null, min: 0 },
    fromPriceCents: { type: Number, required: true, min: 0 }, // lowest variant price
    variantCount: { type: Number, default: 0, min: 0 },
    createdAt: { type: Date, default: Date.now, index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 }, // aggregated stock across variants
    inStock: { type: Boolean, default: true, index: true },
    defaultVariantId: { type: mongoose.Schema.Types.ObjectId, default: null }, // points to embedded variant._id
    imageUrl: { type: String, trim: true, default: null },
    card: { type: cardSchema, default: {} }, // { art, color, bg }
    isActive: { type: Boolean, default: true, index: true }, // soft-delete flag
    variants: [variantSchema],
    specs: [specSchema],
    images: [imageSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Query helpers used by the storefront.
productSchema.query.byCategory = function (slug) {
  return this.where({ categorySlug: slug, isActive: true });
};
productSchema.query.byTopCategory = function (slug) {
  return this.where({ topCategorySlug: slug, isActive: true });
};
productSchema.query.active = function () {
  return this.where({ isActive: true });
};

// SKU uniqueness across all embedded variants (two variants in different
// products must not share a SKU). A unique index on an embedded array field
// enforces uniqueness across documents, not within one document; within a
// single product duplicate SKUs are rejected by the pre-save hook below.
productSchema.index({ "variants.sku": 1 }, { unique: true, partialFilterExpression: { "variants.sku": { $exists: true } } });

productSchema.pre("save", function (next) {
  const skus = this.variants.map((v) => v.sku);
  if (new Set(skus).size !== skus.length) {
    const err = new Error("Duplicate variant SKU within product");
    err.statusCode = 400;
    return next(err);
  }
  next();
});

export default mongoose.model("Product", productSchema);
