"use strict";
// Cart, coupons, checkout and the customer's own orders.

const { HttpError, notFound, str, int, oneOf } = require("../lib/http");
const { requireUser } = require("../lib/auth");
const { parseAddress } = require("../lib/address");
const { findCart, getOrCreateCart, touchCart, couponProblem, quote } = require("../lib/cart");
const { PAYMENT_PROVIDERS, placeOrder, cancelOrder, getOrderDetail, orderSummary } = require("../lib/orders");

function sellableVariant(db, variantId) {
  const v = db.prepare(`
    SELECT v.id, v.name, p.name AS product_name, s.stock
    FROM product_variants v JOIN products p ON p.id = v.product_id JOIN v_variant_stock s ON s.variant_id = v.id
    WHERE v.id = ? AND v.is_active = 1 AND p.status = 'active'`).get(variantId);
  if (!v) throw notFound("Product not found");
  return v;
}

function assertStock(v, wanted) {
  if (v.stock <= 0) throw new HttpError(409, `${v.product_name} is out of stock`, "out_of_stock");
  if (wanted > v.stock) throw new HttpError(409, `Only ${v.stock} left of ${v.product_name}`, "out_of_stock");
}

const cartQuote = (ctx) => quote(ctx.db, findCart(ctx), {
  region: str(ctx.query.get("region"), "region", { max: 60 }), userId: ctx.user && ctx.user.id,
});

// Address for checkout: a saved one (addressId) or typed in (address).
function resolveAddress(ctx) {
  const { db, body } = ctx;
  if (body.addressId !== undefined) {
    const user = requireUser(ctx);
    const a = db.prepare("SELECT * FROM addresses WHERE id = ? AND user_id = ?").get(int(body.addressId, "addressId"), user.id);
    if (!a) throw notFound("Address not found");
    return a;
  }
  return parseAddress(body.address);
}

module.exports = function register(router) {
  // ---- cart ----------------------------------------------------------------

  router.get("/api/cart", (ctx) => ({ cart: cartQuote(ctx) }));

  router.post("/api/cart/items", (ctx) => {
    const { db, body } = ctx;
    const variantId = int(body.variantId, "variantId", { required: true, min: 1 });
    const quantity = int(body.quantity ?? 1, "quantity", { min: 1, max: 99 });
    const v = sellableVariant(db, variantId);
    const cart = getOrCreateCart(ctx);
    const existing = db.prepare("SELECT quantity FROM cart_items WHERE cart_id = ? AND variant_id = ?").get(cart.id, variantId);
    const total = (existing ? existing.quantity : 0) + quantity;
    if (total > 99) throw new HttpError(400, "Maximum 99 of one item per order", "validation");
    assertStock(v, total);
    db.prepare(`INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)
                ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = excluded.quantity`).run(cart.id, variantId, total);
    touchCart(db, cart.id);
    ctx.status = 201;
    return { cart: cartQuote(ctx) };
  });

  router.patch("/api/cart/items/:id", (ctx) => {
    const { db, body, params } = ctx;
    const cart = findCart(ctx);
    const item = cart && db.prepare("SELECT * FROM cart_items WHERE id = ? AND cart_id = ?").get(int(params.id, "id"), cart.id);
    if (!item) throw notFound("Cart item not found");
    const quantity = int(body.quantity, "quantity", { required: true, min: 0, max: 99 });
    if (quantity === 0) {
      db.prepare("DELETE FROM cart_items WHERE id = ?").run(item.id);
    } else {
      if (quantity > item.quantity) assertStock(sellableVariant(db, item.variant_id), quantity);
      db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(quantity, item.id);
    }
    touchCart(db, cart.id);
    return { cart: cartQuote(ctx) };
  });

  router.delete("/api/cart/items/:id", (ctx) => {
    const cart = findCart(ctx);
    if (cart) {
      ctx.db.prepare("DELETE FROM cart_items WHERE id = ? AND cart_id = ?").run(int(ctx.params.id, "id"), cart.id);
      touchCart(ctx.db, cart.id);
    }
    return { cart: cartQuote(ctx) };
  });

  router.post("/api/cart/coupon", (ctx) => {
    const { db, body } = ctx;
    const code = str(body.code, "code", { required: true, max: 40 });
    const coupon = db.prepare("SELECT * FROM coupons WHERE code = ?").get(code);
    if (!coupon) throw new HttpError(404, "That coupon code doesn't exist", "coupon_invalid");
    const cart = getOrCreateCart(ctx);
    const subtotal = quote(db, cart).subtotalCents;
    const problem = couponProblem(db, coupon, subtotal, ctx.user && ctx.user.id);
    if (problem) throw new HttpError(400, problem, "coupon_invalid");
    db.prepare("UPDATE carts SET coupon_id = ?, updated_at = datetime('now') WHERE id = ?").run(coupon.id, cart.id);
    return { cart: cartQuote(ctx) };
  });

  router.delete("/api/cart/coupon", (ctx) => {
    const cart = findCart(ctx);
    if (cart) ctx.db.prepare("UPDATE carts SET coupon_id = NULL, updated_at = datetime('now') WHERE id = ?").run(cart.id);
    return { cart: cartQuote(ctx) };
  });

  // ---- checkout ------------------------------------------------------------

  // Body: { email? (guests), addressId | address{...}, paymentProvider, notes? }
  router.post("/api/checkout", (ctx) => {
    const { db, body, user } = ctx;
    const email = user ? user.email : str(body.email, "email", { required: true, max: 254 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address", "validation");
    const address = resolveAddress(ctx);
    const paymentProvider = oneOf(body.paymentProvider, "paymentProvider", PAYMENT_PROVIDERS, { required: true });
    const notes = str(body.notes, "notes", { max: 500 });

    const order = placeOrder(db, { cart: findCart(ctx), user, email, address, paymentProvider, notes });
    ctx.status = 201;
    return { order };
  });

  // ---- my orders -----------------------------------------------------------

  router.get("/api/orders", (ctx) => {
    const user = requireUser(ctx);
    const rows = ctx.db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY placed_at DESC, id DESC LIMIT 100").all(user.id);
    return { orders: rows.map(orderSummary) };
  });

  // Public order tracking: needs both the order number and the email used.
  router.post("/api/orders/lookup", (ctx) => {
    const number = str(ctx.body.orderNumber, "orderNumber", { required: true, max: 40 }).toUpperCase();
    const email = str(ctx.body.email, "email", { required: true, max: 254 });
    const o = ctx.db.prepare("SELECT id FROM orders WHERE order_number = ? AND email = ? COLLATE NOCASE").get(number, email);
    if (!o) throw notFound("No order matches that order number and email");
    const order = getOrderDetail(ctx.db, o.id);
    delete order.userId;
    return { order };
  });

  function myOrder(ctx) {
    const user = requireUser(ctx);
    const o = ctx.db.prepare("SELECT id, user_id FROM orders WHERE order_number = ?").get(ctx.params.number);
    if (!o || (o.user_id !== user.id && user.role === "customer")) throw notFound("Order not found");
    return o;
  }

  router.get("/api/orders/:number", (ctx) => ({ order: getOrderDetail(ctx.db, myOrder(ctx).id) }));

  router.post("/api/orders/:number/cancel", (ctx) => {
    const o = myOrder(ctx);
    return { order: cancelOrder(ctx.db, o.id, { actorId: ctx.user.id, note: "Cancelled by customer" }) };
  });
};
