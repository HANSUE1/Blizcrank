import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Review — product reviews. Separate collection because reviews can grow
// without bound per product and are moderated independently.
// ---------------------------------------------------------------------------

const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    }, // verified purchase link
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 140, default: "" },
    body: { type: String, trim: true, maxlength: 2000, default: "" },
    isVerifiedPurchase: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One review per user per product.
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, isApproved: 1, createdAt: -1 });

export default mongoose.model("Review", reviewSchema);
