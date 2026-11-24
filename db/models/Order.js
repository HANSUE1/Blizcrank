import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Order — placed order. A complete snapshot of the cart at checkout time:
// items, shipping address, financial breakdown, payments and shipments are
// all embedded so the order record is self-contained and immutable.
// ---------------------------------------------------------------------------

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productSlug: { type: String, required: true, trim: true },
    productName: { type: String, required: true, trim: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    variantName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    lineTotalCents: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ["cod", "gcash", "maya", "stripe", "paypal"],
    }, // cod = Cash on delivery
    amountCents: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    transactionId: { type: String, trim: true, default: null },
    paidAt: { type: Date, default: null },
  },
  { _id: true }
);

const shipmentSchema = new mongoose.Schema(
  {
    carrier: { type: String, trim: true, default: null },
    trackingNumber: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ["pending", "shipped", "in_transit", "out_for_delivery", "delivered", "failed", "returned"],
      default: "pending",
    },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { _id: true }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    barangay: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    province: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    region: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    }, // e.g. BZ-4m8f9x2
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    }, // null = guest order
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    status: {
      type: String,
      enum: ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "partially_paid", "refunded"],
      default: "unpaid",
      index: true,
    },
    placedAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
    items: [orderItemSchema],
    shippingAddress: { type: shippingAddressSchema, required: true },
    region: { type: String, trim: true, required: true },
    itemCount: { type: Number, default: 0, min: 0 },
    subtotalCents: { type: Number, required: true, min: 0 },
    discountCents: { type: Number, default: 0, min: 0 },
    shippingCents: { type: Number, required: true, min: 0 },
    taxCents: { type: Number, required: true, min: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    couponCode: { type: String, trim: true, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    payments: [paymentSchema],
    shipments: [shipmentSchema],
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, placedAt: -1 });
orderSchema.index({ email: 1, placedAt: -1 });
orderSchema.index({ status: 1, placedAt: -1 });

// Keep `updatedAt` in sync with `placedAt`-style writes.
orderSchema.pre("save", function () {
  this.updatedAt = new Date();
});

export default mongoose.model("Order", orderSchema);
