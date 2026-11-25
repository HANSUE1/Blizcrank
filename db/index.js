import mongoose from "mongoose";
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

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/blitzcrank";

export async function connect() {
  await mongoose.connect(MONGODB_URI, {
    autoIndex: process.env.NODE_ENV !== "production",
    serverSelectionTimeoutMS: 5000,
  });
  console.log(`[db] Connected to MongoDB: ${mongoose.connection.name}`);
}

export async function disconnect() {
  await mongoose.disconnect();
  console.log("[db] Disconnected from MongoDB");
}

// Import models from here, not from the model files, so every model is registered.
export const models = {
  User, Category, Brand, Product, Banner, ShippingRate, Review, Cart, Order, NewsletterSubscriber,
};

export { mongoose };
