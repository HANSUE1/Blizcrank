// Serves the storefront, the admin page and the API. The browser never sees MONGODB_URI.

import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, mongoose } from "./db/index.js";
import { catalogRoutes } from "./routes/catalogRoutes.js";
import { productRoutes } from "./routes/productRoutes.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

export const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
  next();
});

app.use("/api/catalog", catalogRoutes);
app.use("/api/products", productRoutes);

// Only these paths are public. Never serve ROOT itself: it holds server code.
app.get(["/", "/index.html"], (req, res) => res.sendFile("index.html", { root: ROOT }));
app.get("/styles.css", (req, res) => res.sendFile("styles.css", { root: ROOT }));
app.use("/js", express.static(join(ROOT, "js")));
app.use("/images", express.static(join(ROOT, "images")));
app.use("/admin", express.static(join(ROOT, "admin/dist")));

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.code === 11000) return res.status(409).json({ error: "A product with that name or SKU already exists." });
  if (err.name === "CastError" || err.name === "ValidationError") return res.status(400).json({ error: err.message });
  if (err.name === "VersionError") return res.status(409).json({ error: "This product changed while you were editing. Reload and try again." });
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error("[server]", err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3000;
  try {
    await connect();
  } catch (err) {
    console.error("[db] Connection failed:", err.message);
    process.exit(1);
  }
  console.log(`[db] Host: ${mongoose.connection.host}`);
  app.listen(port, "localhost", (err) => {
    if (err) {
      console.error("[server]", err.message);
      process.exit(1);
    }
    console.log(`[server] Store: http://localhost:${port}`);
    console.log(`[server] Admin: http://localhost:${port}/admin/`);
  });
}
