import mongoose from "mongoose";

// Models
import User from "./models/User.js";
import Category from "./models/Category.js";
import Brand from "./models/Brand.js";
import Product from "./models/Product.js";
import Banner from "./models/Banner.js";
import ShippingRate from "./models/ShippingRate.js";
import Review from "./models/Review.js";
import Cart from "./models/Cart.js";
import Order from "./models/Order.js";
import NewsletterSubscriber from "./models/NewsletterSubscriber.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/blitzcrank";

let connection = null;
let isConnecting = false;

// ---------------------------------------------------------------------------
// connect — establish a single Mongoose connection (cached for serverless
// and long-running dev servers alike). Call once at application boot.
// ---------------------------------------------------------------------------
export async function connect() {
  if (connection) return connection;
  if (isConnecting) {
    // Wait for the in-flight connection to resolve.
    while (isConnecting) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return connection;
  }
  isConnecting = true;
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      autoIndex: process.env.NODE_ENV !== "production",
      serverSelectionTimeoutMS: 5000,
    });
    connection = conn;
    console.log(`[db] Connected to MongoDB: ${conn.connection.name}`);
    return conn;
  } finally {
    isConnecting = false;
  }
}

// ---------------------------------------------------------------------------
// disconnect — close the Mongoose connection (useful for tests / shutdown).
// ---------------------------------------------------------------------------
export async function disconnect() {
  if (!connection) return;
  await mongoose.connection.close();
  connection = null;
  isConnecting = false;
  console.log("[db] Disconnected from MongoDB");
}

// ---------------------------------------------------------------------------
// Model registry — import these from this module rather than the model files
// directly so the connection lifecycle stays centralized.
// ---------------------------------------------------------------------------
export const models = {
  User,
  Category,
  Brand,
  Product,
  Banner,
  ShippingRate,
  Review,
  Cart,
  Order,
  NewsletterSubscriber,
};

// Convenience named exports (destructure-friendly).
export {
  User,
  Category,
  Brand,
  Product,
  Banner,
  ShippingRate,
  Review,
  Cart,
  Order,
  NewsletterSubscriber,
  mongoose,
};

export default {
  connect,
  disconnect,
  models,
};
