"use strict";
// Carts (user or guest), coupon validation and price quotes.
// The same quote() is used for the cart page and at checkout, so the
// customer always pays exactly what they were shown.

const crypto = require("node:crypto");
const { HttpError } = require("./http");
const { transaction } = require("../../db");

const GUEST_COOKIE = "bz_cart";
const VAT_RATE_PERCENT = 12; // Philippine VAT; shelf prices are VAT-inclusive

function findCart(ctx) {
  const { db, user, cookies } = ctx;
  if (user) return db.prepare("SELECT * FROM carts WHERE user_id = ? AND status = 'active'").get(user.id) || null;
  const token = cookies[GUEST_COOKIE];
  if (!token) return null;
  return db.prepare("SELECT * FROM carts WHERE guest_token = ? AND user_id IS NULL AND status = 'active'").get(token) || null;
}

function getOrCreateCart(ctx) {
  const existing = findCart(ctx);
  if (existing) return existing;
  const { db, user } = ctx;
  let id;
  if (user) {
    id = db.prepare("INSERT INTO carts (user_id) VALUES (?)").run(user.id).lastInsertRowid;
  } else {
    const token = crypto.randomBytes(24).toString("base64url");
    id = db.prepare("INSERT INTO carts (guest_token) VALUES (?)").run(token).lastInsertRowid;
    ctx.setCookie(GUEST_COOKIE, token, { maxAge: 60 * 86400 });
    ctx.cookies[GUEST_COOKIE] = token; // so the rest of this request sees the new cart
  }
  return db.prepare("SELECT * FROM carts WHERE id = ?").get(id);
}

function touchCart(db, cartId) {
  db.prepare("UPDATE carts SET updated_at = datetime('now') WHERE id = ?").run(cartId);
}

// On login/register: move the guest cart's items into the user's cart.
function mergeGuestCart(db, guestToken, userId) {
  if (!guestToken) return;
  const guest = db.prepare("SELECT * FROM carts WHERE guest_token = ? AND user_id IS NULL AND status = 'active'").get(guestToken);
  if (!guest) return;
  transaction(db, () => {
    let userCart = db.prepare("SELECT * FROM carts WHERE user_id = ? AND status = 'active'").get(userId);
    if (!userCart) {
      const id = db.prepare("INSERT INTO carts (user_id, coupon_id) VALUES (?, ?)").run(userId, guest.coupon_id).lastInsertRowid;
      userCart = { id, coupon_id: guest.coupon_id };
    }
    db.prepare(`
      INSERT INTO cart_items (cart_id, variant_id, quantity, added_at)
      SELECT ?, variant_id, quantity, added_at FROM cart_items WHERE cart_id = ? AND true
      ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = MIN(99, quantity + excluded.quantity)`)
      .run(userCart.id, guest.id);
    if (!userCart.coupon_id && guest.coupon_id) {
      db.prepare("UPDATE carts SET coupon_id = ? WHERE id = ?").run(guest.coupon_id, userCart.id);
    }
    db.prepare("DELETE FROM carts WHERE id = ?").run(guest.id);
    touchCart(db, userCart.id);
  });
}

function loadCartItems(db, cartId) {
  return db.prepare(`
    SELECT ci.id, ci.variant_id, ci.quantity,
           v.sku, v.name AS variant_name, v.options, v.price_cents, v.compare_at_cents, v.is_active AS variant_active,
           p.id AS product_id, p.slug, p.name AS product_name, p.status AS product_status,
           p.card_art, p.card_art_color, p.card_bg,
           s.stock
    FROM cart_items ci
    JOIN product_variants v ON v.id = ci.variant_id
    JOIN products p         ON p.id = v.product_id
    JOIN v_variant_stock s  ON s.variant_id = v.id
    WHERE ci.cart_id = ?
    ORDER BY ci.added_at, ci.id`).all(cartId);
}

const fmt = (cents) => "₱" + (cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 });

// Returns null when the coupon can be used, otherwise a reason.
function couponProblem(db, coupon, subtotalCents, userId) {
  if (!coupon || !coupon.is_active) return "This coupon is not active";
  const now = db.prepare("SELECT datetime('now') AS now").get().now;
  if (coupon.starts_at && coupon.starts_at > now) return "This coupon is not active yet";
  if (coupon.ends_at && coupon.ends_at <= now) return "This coupon has expired";
  if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) return "This coupon has been fully redeemed";
  if (subtotalCents < coupon.min_subtotal_cents) return `Spend at least ${fmt(coupon.min_subtotal_cents)} to use this coupon`;
  if (coupon.per_user_limit !== null) {
    if (!userId) return "Sign in to use this coupon";
    const used = db.prepare("SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?").get(coupon.id, userId).n;
    if (used >= coupon.per_user_limit) return "You've already used this coupon";
  }
  return null;
}

function emptyQuote() {
  return { cartId: null, items: [], itemCount: 0, subtotalCents: 0, discountCents: 0, shippingCents: null,
           taxCents: 0, totalCents: 0, coupon: null, shipping: null };
}

function quote(db, cart, { region, userId } = {}) {
  if (!cart) return emptyQuote();

  const items = loadCartItems(db, cart.id).map((r) => {
    const available = r.product_status === "active" && r.variant_active === 1;
    return {
      id: r.id,
      variantId: r.variant_id,
      productId: r.product_id,
      productSlug: r.slug,
      productName: r.product_name,
      variantName: r.variant_name,
      sku: r.sku,
      options: JSON.parse(r.options),
      quantity: r.quantity,
      unitPriceCents: r.price_cents,
      compareAtCents: r.compare_at_cents,
      lineTotalCents: r.price_cents * r.quantity,
      stock: r.stock,
      available,
      inStock: available && r.stock >= r.quantity,
      card: { art: r.card_art, color: r.card_art_color, bg: r.card_bg },
    };
  });

  const subtotal = items.reduce((s, i) => s + i.lineTotalCents, 0);

  let discount = 0;
  let freeShipping = false;
  let couponInfo = null;
  if (cart.coupon_id) {
    const c = db.prepare("SELECT * FROM coupons WHERE id = ?").get(cart.coupon_id);
    if (c) {
      const problem = couponProblem(db, c, subtotal, userId);
      if (!problem) {
        if (c.discount_type === "percent") {
          discount = Math.floor((subtotal * c.discount_value) / 100);
          if (c.max_discount_cents !== null) discount = Math.min(discount, c.max_discount_cents);
        } else if (c.discount_type === "fixed") {
          discount = c.discount_value;
        } else {
          freeShipping = true;
        }
        discount = Math.min(discount, subtotal);
      }
      couponInfo = { id: c.id, code: c.code, description: c.description, valid: !problem, message: problem };
    }
  }

  let shippingCents = null;
  let shipping = null;
  if (region) {
    const rate = db.prepare("SELECT * FROM shipping_rates WHERE region = ?").get(region);
    if (!rate) throw new HttpError(400, `We don't ship to "${region}" yet`, "bad_region");
    const free = freeShipping || (rate.free_over_cents !== null && subtotal - discount >= rate.free_over_cents);
    shippingCents = items.length === 0 || free ? 0 : rate.fee_cents;
    shipping = { region: rate.region, feeCents: rate.fee_cents, freeOverCents: rate.free_over_cents,
                 etaDays: [rate.eta_min_days, rate.eta_max_days] };
  }

  const total = subtotal - discount + (shippingCents || 0);
  return {
    cartId: cart.id,
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotalCents: subtotal,
    discountCents: discount,
    shippingCents,                                                   // null until a region is chosen
    taxCents: Math.round((total * VAT_RATE_PERCENT) / (100 + VAT_RATE_PERCENT)), // VAT included in total
    totalCents: total,
    coupon: couponInfo,
    shipping,
  };
}

module.exports = { GUEST_COOKIE, findCart, getOrCreateCart, touchCart, mergeGuestCart, couponProblem, quote, fmt };
