import mongoose from "mongoose";

// Category — hierarchical category tree (laptops > gpus, components > cpus, …).
// parentId forms the many-to-one self relationship. level is denormalized to
// make depth queries cheap without recursive $graphLookup.

const categorySchema = new mongoose.Schema(
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
    description: { type: String, trim: true, maxlength: 500 },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    level: { type: Number, default: 0, min: 0, index: true }, // 0 = top-level
    productCount: { type: Number, default: 0, min: 0 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Prevent a category from being its own parent (enforced at app level too).
categorySchema.path("parentId").validate(function (value) {
  return !this._id || !value || value.toString() !== this._id.toString();
}, "A category cannot be its own parent.");

export default mongoose.model("Category", categorySchema);
