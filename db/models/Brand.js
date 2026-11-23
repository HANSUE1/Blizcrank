import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Brand — product brands (Asus ROG, MSI, Razer, …). Referenced by Product.
// ---------------------------------------------------------------------------

const brandSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    productCount: { type: Number, default: 0, min: 0 },
    logoUrl: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Brand", brandSchema);
