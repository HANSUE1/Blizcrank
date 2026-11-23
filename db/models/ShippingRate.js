import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// ShippingRate — per-region shipping cost & delivery estimate.
// Replaces the static rates array in catalog.json.
// ---------------------------------------------------------------------------

const shippingRateSchema = new mongoose.Schema(
  {
    region: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
      index: true,
    }, // e.g. "Metro Manila"
    feeCents: { type: Number, required: true, min: 0 },
    freeOverCents: { type: Number, default: null, min: 0 }, // null = no free-shipping threshold
    etaDays: { type: [Number], default: [1, 3], validate: (v) => v.length === 2 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("ShippingRate", shippingRateSchema);
