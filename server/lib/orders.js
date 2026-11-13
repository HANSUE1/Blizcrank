"use strict";
// Checkout, stock allocation, cancellation and order read models.

const crypto = require("node:crypto");
const { HttpError, notFound } = require("./http");
const { transaction } = require("../../db");
const { quote } = require("./cart");

const PAYMENT_PROVIDERS = ["stripe", "paypal", "gcash", "maya", "cod"];

function newOrderNumber() {
  const d = new Date();
  const ymd = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I
  let code = "";
  for (const b of crypto.randomBytes(5)) code += alphabet[b % alphabet.length];
  return `BZ-${ymd}-${code}`;
}

// Take `qty` units from warehouses in priority order. The inventory CHECK
// (quantity_on_hand >= 0) is the last line of defence against overselling.
function allocateStock(db, { variantId, quantity, orderId, label }) {
  const rows = db.prepare(`
    SELECT i.warehouse_id, i.quantity_on_hand
    FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id
    WHERE i.variant_id = ? AND w.is_active = 1 AND i.quantity_on_hand > 0
    ORDER BY w.priority, w.id`).all(variantId);

  const take = db.prepare(`UPDATE inventory SET quantity_on_hand = quantity_on_hand - ?, updated_at = datetime('now')
                           WHERE variant_id = ? AND warehouse_id = ?`);
  const log = db.prepare(`INSERT INTO inventory_movements (variant_id, warehouse_id, change, reason, order_id)
                          VALUES (?, ?, ?, 'sale', ?)`);
  let remaining = quantity;
  for (const r of rows) {
    if (remaining === 0) break;
    const n = Math.min(remaining, r.quantity_on_hand);
    take.run(n, variantId, r.warehouse_id);
    log.run(variantId, r.warehouse_id, -n, orderId);
    remaining -= n;
  }
  if (remaining > 0) {
    const have = quantity - remaining;
    throw new HttpError(409, have > 0 ? `Only ${have} left of ${label}` : `${label} is out of stock`, "out_of_stock");
  }
}

function placeOrder(db, { cart, user, email, address, paymentProvider, notes }) {
  if (!cart) throw new HttpError(400, "Your cart is empty", "empty_cart");

  return transaction(db, () => {
    const q = quote(db, cart, { region: address.region, userId: user && user.id });
    if (q.items.length === 0) throw new HttpError(400, "Your cart is empty", "empty_cart");
    const gone = q.items.find((i) => !i.available);
    if (gone) throw new HttpError(409, `${gone.productName} is no longer available — remove it to continue`, "unavailable");
    if (q.coupon && !q.coupon.valid) throw new HttpError(409, q.coupon.message, "coupon_invalid");

    let orderId;
    let orderNumber;
    for (let attempt = 0; !orderId; attempt++) {
      orderNumber = newOrderNumber();
      try {
        orderId = Number(db.prepare(`
          INSERT INTO orders (order_number, user_id, email, subtotal_cents, discount_cents, shipping_cents, tax_cents,
                              total_cents, coupon_id, coupon_code, ship_name, ship_phone, ship_line1, ship_line2,
                              ship_barangay, ship_city, ship_province, ship_region, ship_postal_code, ship_country, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          orderNumber, user ? user.id : null, email, q.subtotalCents, q.discountCents, q.shippingCents, q.taxCents,
          q.totalCents, q.coupon ? q.coupon.id : null, q.coupon ? q.coupon.code : null,
          address.recipient_name, address.phone, address.line1, address.line2 || null, address.barangay || null,
          address.city, address.province, address.region, address.postal_code, address.country || "PH", notes || null,
        ).lastInsertRowid);
      } catch (err) {
        if (attempt < 4 && /UNIQUE constraint failed: orders.order_number/.test(err.message)) continue;
        throw err;
      }
    }

    const insItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, sku, options,
                               unit_price_cents, quantity, line_total_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const i of q.items) {
      insItem.run(orderId, i.productId, i.variantId, i.productName, i.variantName, i.sku, JSON.stringify(i.options),
                  i.unitPriceCents, i.quantity, i.lineTotalCents);
      allocateStock(db, { variantId: i.variantId, quantity: i.quantity, orderId,
                          label: i.variantName === "Standard" ? i.productName : `${i.productName} (${i.variantName})` });
    }

    if (q.coupon) {
      const used = db.prepare(`UPDATE coupons SET times_used = times_used + 1
                               WHERE id = ? AND (usage_limit IS NULL OR times_used < usage_limit)`).run(q.coupon.id);
      if (used.changes === 0) throw new HttpError(409, "This coupon has been fully redeemed", "coupon_invalid");
      db.prepare("INSERT INTO coupon_redemptions (coupon_id, order_id, user_id, discount_cents) VALUES (?, ?, ?, ?)")
        .run(q.coupon.id, orderId, user ? user.id : null, q.discountCents);
    }

    // A pending payment record. With a real provider you would create the
    // Stripe PaymentIntent / PayPal order here, store its id in
    // provider_reference, and let a signature-verified webhook mark it
    // succeeded. Card numbers never touch this server.
    db.prepare("INSERT INTO payments (order_id, provider, amount_cents) VALUES (?, ?, ?)")
      .run(orderId, paymentProvider, q.totalCents);

    db.prepare("UPDATE carts SET status = 'converted', updated_at = datetime('now') WHERE id = ?").run(cart.id);
    return getOrderDetail(db, orderId);
  });
}

function cancelOrder(db, orderId, { actorId = null, note = null } = {}) {
  return transaction(db, () => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) throw notFound("Order not found");
    if (!["pending", "paid", "processing"].includes(order.status)) {
      throw new HttpError(409, `An order that is ${order.status} can't be cancelled`, "bad_status");
    }

    // Put stock back exactly where it was taken from.
    const taken = db.prepare(`SELECT variant_id, warehouse_id, SUM(change) AS change
                              FROM inventory_movements WHERE order_id = ? AND reason IN ('sale', 'cancel')
                              GROUP BY variant_id, warehouse_id HAVING SUM(change) < 0`).all(orderId);
    for (const t of taken) {
      db.prepare(`UPDATE inventory SET quantity_on_hand = quantity_on_hand + ?, updated_at = datetime('now')
                  WHERE variant_id = ? AND warehouse_id = ?`).run(-t.change, t.variant_id, t.warehouse_id);
      db.prepare(`INSERT INTO inventory_movements (variant_id, warehouse_id, change, reason, order_id, note, created_by)
                  VALUES (?, ?, ?, 'cancel', ?, ?, ?)`).run(t.variant_id, t.warehouse_id, -t.change, orderId, note, actorId);
    }

    const redemption = db.prepare("SELECT * FROM coupon_redemptions WHERE order_id = ?").get(orderId);
    if (redemption) {
      db.prepare("UPDATE coupons SET times_used = MAX(0, times_used - 1) WHERE id = ?").run(redemption.coupon_id);
      db.prepare("DELETE FROM coupon_redemptions WHERE id = ?").run(redemption.id);
    }

    db.prepare(`UPDATE payments SET status = 'cancelled', updated_at = datetime('now')
                WHERE order_id = ? AND status IN ('pending', 'authorized')`).run(orderId);
    db.prepare(`UPDATE orders SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?`).run(orderId);

    const detail = getOrderDetail(db, orderId);
    // Money already captured has to be refunded through the provider.
    detail.refundRequired = order.payment_status === "paid";
    return detail;
  });
}

function orderSummary(o) {
  return {
    id: o.id, orderNumber: o.order_number, email: o.email, status: o.status, paymentStatus: o.payment_status,
    fulfillmentStatus: o.fulfillment_status, currency: o.currency, subtotalCents: o.subtotal_cents,
    discountCents: o.discount_cents, shippingCents: o.shipping_cents, taxCents: o.tax_cents, totalCents: o.total_cents,
    couponCode: o.coupon_code, placedAt: o.placed_at, cancelledAt: o.cancelled_at,
  };
}

function getOrderDetail(db, orderId) {
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!o) throw notFound("Order not found");
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(orderId).map((i) => ({
    id: i.id, productId: i.product_id, variantId: i.variant_id, productName: i.product_name, variantName: i.variant_name,
    sku: i.sku, options: JSON.parse(i.options), unitPriceCents: i.unit_price_cents, quantity: i.quantity,
    lineTotalCents: i.line_total_cents,
  }));
  const payments = db.prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY id").all(orderId).map((p) => ({
    id: p.id, provider: p.provider, providerReference: p.provider_reference, amountCents: p.amount_cents,
    currency: p.currency, status: p.status, failureReason: p.failure_reason, createdAt: p.created_at, updatedAt: p.updated_at,
  }));
  const shipments = db.prepare("SELECT * FROM shipments WHERE order_id = ? ORDER BY id").all(orderId).map((s) => ({
    id: s.id, carrier: s.carrier, trackingNumber: s.tracking_number, status: s.status,
    shippedAt: s.shipped_at, deliveredAt: s.delivered_at,
  }));
  return {
    ...orderSummary(o),
    userId: o.user_id,
    notes: o.notes,
    shippingAddress: {
      name: o.ship_name, phone: o.ship_phone, line1: o.ship_line1, line2: o.ship_line2, barangay: o.ship_barangay,
      city: o.ship_city, province: o.ship_province, region: o.ship_region, postalCode: o.ship_postal_code,
      country: o.ship_country,
    },
    items, payments, shipments,
  };
}

module.exports = { PAYMENT_PROVIDERS, placeOrder, cancelOrder, getOrderDetail, orderSummary };
