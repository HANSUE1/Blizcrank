"use strict";
const crypto = require("node:crypto");
const { HttpError } = require("./http");

const SESSION_COOKIE = "bz_session";
const SESSION_DAYS = 30;

// scrypt$<salt>$<hash>  (both base64url)
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64url"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at)
              VALUES (?, ?, datetime('now', ?))`).run(sha256(token), userId, `+${SESSION_DAYS} days`);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

function getSessionUser(db, token) {
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.is_active = 1`).get(sha256(token)) || null;
}

function destroySession(db, token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, "Please sign in", "unauthenticated");
  return ctx.user;
}

function requireRole(ctx, ...roles) {
  const user = requireUser(ctx);
  if (!roles.includes(user.role)) throw new HttpError(403, "You don't have access to this", "forbidden");
  return user;
}

const requireStaff = (ctx) => requireRole(ctx, "staff", "admin");
const requireAdmin = (ctx) => requireRole(ctx, "admin");

module.exports = {
  SESSION_COOKIE, sha256, hashPassword, verifyPassword, createSession, getSessionUser, destroySession,
  requireUser, requireStaff, requireAdmin,
};
