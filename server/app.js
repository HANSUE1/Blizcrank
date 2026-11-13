"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { HttpError, Router, parseCookies, serializeCookie, readJson } = require("./lib/http");
const { SESSION_COOKIE, getSessionUser } = require("./lib/auth");

const PUBLIC_ROOT = path.join(__dirname, "..");
const BLOCKED_DIRS = new Set(["server", "db", "data", "node_modules", "test"]);
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function createApp(db) {
  const router = new Router();
  for (const r of ["catalog", "auth", "shop", "account", "admin"]) require(`./routes/${r}`)(router);

  function sendJson(res, status, data, cookies) {
    const body = JSON.stringify(data);
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
                      "X-Content-Type-Options": "nosniff" };
    if (cookies.length) headers["Set-Cookie"] = cookies;
    res.writeHead(status, headers);
    res.end(body);
  }

  function serveStatic(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { rel = ""; }
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(PUBLIC_ROOT, rel));
    const parts = path.relative(PUBLIC_ROOT, file).split(path.sep);
    const ext = path.extname(file).toLowerCase();
    const allowed = file.startsWith(PUBLIC_ROOT + path.sep) && MIME[ext] && !BLOCKED_DIRS.has(parts[0]) &&
                    !parts.some((p) => p.startsWith("."));
    if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[ext], "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  }

  return async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
      return serveStatic(req, res, url.pathname);
    }

    const outCookies = [];
    try {
      const route = router.match(req.method, url.pathname);
      if (!route) throw new HttpError(404, "Endpoint not found", "not_found");
      if (route.methodNotAllowed) throw new HttpError(405, "Method not allowed", "method_not_allowed");

      const cookies = parseCookies(req.headers.cookie);
      const ctx = {
        req, res, db, params: route.params, query: url.searchParams, cookies,
        body: await readJson(req),
        user: getSessionUser(db, cookies[SESSION_COOKIE]),
        status: 200,
        setCookie: (name, value, opts) => outCookies.push(serializeCookie(name, value, opts)),
      };
      const result = await route.handler(ctx);
      sendJson(res, ctx.status, result ?? { ok: true }, outCookies);
    } catch (err) {
      let status = err.status || 500;
      let code = err.code || "error";
      let message = err.message;
      // Translate database constraint failures into friendly 4xx errors.
      if (!err.status && /constraint failed/i.test(err.message || "")) {
        if (/quantity_on_hand/.test(err.message)) [status, code, message] = [409, "out_of_stock", "Not enough stock"];
        else if (/UNIQUE/.test(err.message)) [status, code, message] = [409, "duplicate", "That already exists: " + err.message.split(": ")[1]];
        else if (/FOREIGN KEY/.test(err.message)) [status, code, message] = [409, "in_use", "This record is linked to other records"];
        else [status, code, message] = [400, "validation", "Invalid value: " + err.message];
      }
      if (status >= 500) {
        console.error(err);
        message = "Something went wrong";
      }
      sendJson(res, status, { error: { code, message } }, outCookies);
    }
  };
}

module.exports = { createApp };
