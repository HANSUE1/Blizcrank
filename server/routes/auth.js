"use strict";
const { HttpError, str } = require("../lib/http");
const auth = require("../lib/auth");
const { GUEST_COOKIE, mergeGuestCart } = require("../lib/cart");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Used when the email doesn't exist, so login takes the same time either way.
const DUMMY_HASH = auth.hashPassword("not-a-real-password");

const publicUser = (u) => u && ({
  id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, phone: u.phone, role: u.role,
});

function startSession(ctx, userId) {
  const { token, maxAge } = auth.createSession(ctx.db, userId);
  ctx.setCookie(auth.SESSION_COOKIE, token, { maxAge });
  mergeGuestCart(ctx.db, ctx.cookies[GUEST_COOKIE], userId);
  ctx.setCookie(GUEST_COOKIE, "", { maxAge: 0 });
}

module.exports = function register(router) {
  router.post("/api/auth/register", (ctx) => {
    const { db, body } = ctx;
    const email = str(body.email, "email", { required: true, max: 254 }).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address", "validation");
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 200) throw new HttpError(400, "Password must be 8–200 characters", "validation");
    const firstName = str(body.firstName, "firstName", { max: 80 }) || "";
    const lastName = str(body.lastName, "lastName", { max: 80 }) || "";
    const phone = str(body.phone, "phone", { max: 30 });

    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      throw new HttpError(409, "An account with this email already exists", "email_taken");
    }
    const id = Number(db.prepare("INSERT INTO users (email, password_hash, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)")
      .run(email, auth.hashPassword(password), firstName, lastName, phone).lastInsertRowid);
    startSession(ctx, id);
    ctx.status = 201;
    return { user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) };
  });

  router.post("/api/auth/login", (ctx) => {
    const { db, body } = ctx;
    const email = str(body.email, "email", { required: true, max: 254 });
    const password = typeof body.password === "string" ? body.password : "";
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND is_active = 1").get(email);
    const ok = auth.verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "Wrong email or password", "bad_credentials");
    startSession(ctx, user.id);
    return { user: publicUser(user) };
  });

  router.post("/api/auth/logout", (ctx) => {
    auth.destroySession(ctx.db, ctx.cookies[auth.SESSION_COOKIE]);
    ctx.setCookie(auth.SESSION_COOKIE, "", { maxAge: 0 });
    return { ok: true };
  });

  router.get("/api/auth/me", (ctx) => ({ user: publicUser(ctx.user) }));

  router.patch("/api/auth/me", (ctx) => {
    const user = auth.requireUser(ctx);
    const b = ctx.body;
    const fields = {
      first_name: str(b.firstName, "firstName", { max: 80 }),
      last_name: str(b.lastName, "lastName", { max: 80 }),
      phone: str(b.phone, "phone", { max: 30 }),
    };
    for (const [col, val] of Object.entries(fields)) {
      if (val !== null) ctx.db.prepare(`UPDATE users SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`).run(val, user.id);
    }
    if (b.newPassword !== undefined) {
      const user2 = ctx.db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
      if (!auth.verifyPassword(String(b.currentPassword || ""), user2.password_hash)) {
        throw new HttpError(401, "Current password is wrong", "bad_credentials");
      }
      if (typeof b.newPassword !== "string" || b.newPassword.length < 8 || b.newPassword.length > 200) {
        throw new HttpError(400, "Password must be 8–200 characters", "validation");
      }
      ctx.db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
        .run(auth.hashPassword(b.newPassword), user.id);
      // Sign out everywhere else.
      ctx.db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
        .run(user.id, auth.sha256(ctx.cookies[auth.SESSION_COOKIE]));
    }
    return { user: publicUser(ctx.db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) };
  });
};

module.exports.publicUser = publicUser;
