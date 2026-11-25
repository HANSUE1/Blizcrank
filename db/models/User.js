import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// User — customer accounts (replaces the always-null `user` in store.js).
// Auth is out of scope for this schema file, but the collection is designed
// to support email/password auth plus a future admin role.
// ---------------------------------------------------------------------------

const addressSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "Home",
    }, // e.g. "Home", "Work"
    recipientName: {
      type: String,
      trim: true,
      maxlength: 120,
      required: true,
    },
    phone: { type: String, trim: true, maxlength: 30 },
    line1: { type: String, trim: true, maxlength: 200, required: true },
    barangay: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 120, required: true },
    province: { type: String, trim: true, maxlength: 120, required: true },
    postalCode: { type: String, trim: true, maxlength: 12, required: true },
    region: { type: String, trim: true, maxlength: 100, required: true }, // shipping rate region
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true },
    firstName: { type: String, trim: true, maxlength: 100 },
    lastName: { type: String, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30 },
    studentIdNumber: { type: String, trim: true, maxlength: 50 },
    course: { type: String, trim: true, maxlength: 100 },
    role: {
      type: String,
      enum: ["customer", "admin", "student"],
      default: "customer",
      index: true,
    },
    emailVerified: { type: Boolean, default: false },
    addresses: [addressSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.index({ role: 1, email: 1 });

userSchema.virtual("fullName").get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(" ") || this.email;
});

export default mongoose.model("User", userSchema);
