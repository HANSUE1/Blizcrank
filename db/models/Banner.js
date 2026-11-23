import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Banner — hero carousel slides (text + CTA + card art). Replaces the static
// banners array in catalog.json.
// ---------------------------------------------------------------------------

const bannerSchema = new mongoose.Schema(
  {
    eyebrow: { type: String, trim: true, maxlength: 120 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subtitle: { type: String, trim: true, maxlength: 300 },
    ctaLabel: { type: String, trim: true, maxlength: 80 },
    ctaLink: { type: String, trim: true, maxlength: 300 },
    imageUrl: { type: String, trim: true, default: null },
    card: {
      art: { type: String, trim: true },
      color: { type: String, trim: true },
      bg: { type: String, trim: true },
    },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: true }
);

bannerSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model("Banner", bannerSchema);
