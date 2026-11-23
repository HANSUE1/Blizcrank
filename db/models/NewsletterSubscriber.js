import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// NewsletterSubscriber — email newsletter signups (replaces localStorage).
// ---------------------------------------------------------------------------

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    subscribedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("NewsletterSubscriber", newsletterSubscriberSchema);
