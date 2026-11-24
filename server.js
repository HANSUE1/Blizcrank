// Serves the storefront and its catalog API. The browser never sees MONGODB_URI.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, models, mongoose } from "./db/index.js";
import { buildCatalog } from "./db/catalog.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
};

// Allowlist: only these paths are public, and no segment may start with a dot.
const PUBLIC = /^\/(index\.html|styles\.css|(js|images)(\/[\w-][\w.-]*)+)$/;

export function publicFile(pathname) {
  const path = pathname === "/" ? "/index.html" : pathname;
  return PUBLIC.test(path) ? join(ROOT, path) : null;
}

async function loadCatalog() {
  const find = (model, sort) => model.find({ isActive: { $ne: false } }).sort(sort).lean();
  const [products, categories, brands, banners, rates, fallback] = await Promise.all([
    find(models.Product, { _id: 1 }),
    find(models.Category, { _id: 1 }),
    find(models.Brand, { _id: 1 }),
    find(models.Banner, { sortOrder: 1, _id: 1 }),
    find(models.ShippingRate, { _id: 1 }),
    readFile(join(ROOT, "js/catalog.json"), "utf8").then(JSON.parse),
  ]);
  return buildCatalog({ products, categories, brands, banners, rates }, fallback);
}

async function handle(req, res) {
  const send = (status, type, body) =>
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" }).end(body);

  if (req.method !== "GET" && req.method !== "HEAD") return send(405, "text/plain", "Method not allowed");
  const pathname = req.url.split("?")[0];

  if (pathname === "/api/catalog") {
    try {
      return send(200, TYPES[".json"], JSON.stringify(await loadCatalog()));
    } catch (err) {
      console.error("[api] Catalog failed:", err.message);
      return send(503, TYPES[".json"], '{"error":"Catalog unavailable"}');
    }
  }

  const file = publicFile(pathname);
  const body = file && (await readFile(file).catch(() => null));
  if (!body) return send(404, "text/plain", "Not found");
  send(200, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", body);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3000;
  try {
    await connect();
  } catch (err) {
    console.error("[db] Connection failed:", err.message);
    process.exit(1);
  }
  console.log(`[db] Host: ${mongoose.connection.host}`);
  createServer(handle)
    .on("error", (err) => { console.error("[server]", err.message); process.exit(1); })
    .listen(port, "localhost", () => console.log(`[server] http://localhost:${port}`));
}
