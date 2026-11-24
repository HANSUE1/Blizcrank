// Serves the storefront and its catalog API. The browser never sees MONGODB_URI.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, mongoose } from "./db/index.js";
import { catalogRoutes } from "./routes/catalogRoutes.js";

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

async function handle(req, res) {
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const send = (status, type, body) => res.writeHead(status, { "Content-Type": type }).end(body);

  if (req.method !== "GET" && req.method !== "HEAD") return send(405, "text/plain", "Method not allowed");
  const pathname = req.url.split("?")[0];

  // HEAD shares the GET route; Node drops the body.
  const route = catalogRoutes[`GET ${pathname}`];
  if (route) return route(req, res);

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
