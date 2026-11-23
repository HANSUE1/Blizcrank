import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Cart — shopping cart. Linked to a user when signed in, otherwise to a
// guest sessionId. TTL index expires abandoned carts automatically.
// ---------------------------------------------------------------------------

const cartItemSchema = new mongoose.Schema(
  {
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productSlug: { type: String, required: true, trim: true },
    variantName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1, max: 99, default: 1 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    lineTotalCents: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    sessionId: {
      type: String,
      default: null,
      index: true,
    }, // guest cart identifier
    items: [cartItemSchema],
    region: { type: String, trim: true, default: null },
    couponCode: { type: String, trim: true, default: null },
    discountCents: { type: Number, default: 0, min: 0 },
    shippingCents: { type: Number, default: null },
    taxCents: { type: Number, default: 0, min: 0 },
    subtotalCents: { type: Number, default: 0, min: 0 },
    totalCents: { type: Number, default: 0, min: 0 },
    itemCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null, index: { expires: 0 } }, // TTL: delete when this date passes
  },
  { timestamps: true }
);

// One active cart per user or per session.
cartSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true, $ne: null } } });
cartSchema.index({ sessionId: 1 }, { unique: true, partialFilterExpression: { sessionId: { $exists: true, $ne: null } } });

export default mongoose.model("Cart", cartSchema);
