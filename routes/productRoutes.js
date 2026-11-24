import express, { Router } from "express";
import { listProducts, getProduct, createProduct, updateProduct, deleteProduct } from "../controllers/productController.js";

// shortcut: no login, so only this computer may use these routes; add authentication before deploying.
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
function requireLocal(req, res, next) {
  if (LOCAL.has(req.hostname)) return next();
  res.status(403).json({ error: "Only available on this computer." });
}

export const productRoutes = Router();

productRoutes.use(requireLocal, express.json());

productRoutes.get("/", listProducts);
productRoutes.get("/:id", getProduct);
productRoutes.post("/", createProduct);
productRoutes.put("/:id", updateProduct);
productRoutes.delete("/:id", deleteProduct);
