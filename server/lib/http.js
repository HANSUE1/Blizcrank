"use strict";
// Tiny HTTP toolkit: router, JSON body parsing, cookies, validation.

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || "error";
  }
}

class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
    this.routes.push({ method, re, keys, handler });
  }
  get(p, h) { this.add("GET", p, h); }
  post(p, h) { this.add("POST", p, h); }
  put(p, h) { this.add("PUT", p, h); }
  patch(p, h) { this.add("PATCH", p, h); }
  delete(p, h) { this.add("DELETE", p, h); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function serializeCookie(name, value, { maxAge } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  if (process.env.NODE_ENV === "production") c += "; Secure";
  return c;
}

const MAX_BODY = 1024 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.method === "GET" || req.method === "HEAD") return resolve({});
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "Request body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (size === 0) return resolve({});
      // Requiring JSON blocks cross-site HTML form posts (simple CSRF defence).
      if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) {
        return reject(new HttpError(415, "Content-Type must be application/json"));
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(body && typeof body === "object" ? body : {});
      } catch {
        reject(new HttpError(400, "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// ---- validation helpers -------------------------------------------------

function str(value, name, { required = false, max = 500, min = 0 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${name} is required`, "validation");
    return null;
  }
  if (typeof value !== "string") throw new HttpError(400, `${name} must be text`, "validation");
  const v = value.trim();
  if (v.length < min) throw new HttpError(400, `${name} must be at least ${min} characters`, "validation");
  if (v.length > max) throw new HttpError(400, `${name} is too long (max ${max})`, "validation");
  if (required && !v) throw new HttpError(400, `${name} is required`, "validation");
  return v;
}

function int(value, name, { required = false, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${name} is required`, "validation");
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${name} must be a whole number between ${min} and ${max}`, "validation");
  }
  return n;
}

function oneOf(value, name, allowed, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${name} is required`, "validation");
    return null;
  }
  if (!allowed.includes(value)) throw new HttpError(400, `${name} must be one of: ${allowed.join(", ")}`, "validation");
  return value;
}

function notFound(what = "Not found") { return new HttpError(404, what, "not_found"); }

module.exports = { HttpError, Router, parseCookies, serializeCookie, readJson, str, int, oneOf, notFound };
