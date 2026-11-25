// Order history, order detail and tracking, shipping info.
// Orders are stored in localStorage by the checkout flow.

import { esc, money, fmtDate, openDialog, setupDialog, dialogHead } from "./util.js";
import { state, readOrders } from "./store.js";
import { paymentLabel } from "./cart.js";

const dlg = document.getElementById("account-dialog");
const info = document.getElementById("info-dialog");
setupDialog(dlg);
setupDialog(info);

const STATUS_LABEL = {
  pending: "Order placed", paid: "Paid", processing: "Preparing", shipped: "Shipped",
  delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};
const statusLabel = (o) => STATUS_LABEL[o.status] || esc(o.status);

function ordersHTML(orders) {
  if (!orders.length) return '<p class="muted">No orders yet.</p>';
  return `<ul class="order-list">${orders.map((o) => `
    <li><button type="button" class="order-row" data-order="${esc(o.orderNumber)}">
      <span><strong>${esc(o.orderNumber)}</strong><small class="muted">${fmtDate(o.placedAt)}</small></span>
      <span class="status s-${esc(o.status)}">${statusLabel(o)}</span>
      <span class="order-total">${money(o.totalCents)}</span>
    </button></li>`).join("")}</ul>`;
}

export function openAccount() {
  dlg.innerHTML = dialogHead("My orders") + `
    <section class="acct-section"><h3 class="pd-h">Order history</h3>${ordersHTML(readOrders().reverse())}</section>
    <div class="acct-actions">
      <button class="btn btn-ghost btn-block" type="button" data-close>Close</button>
    </div>`;
  openDialog(dlg);
}

dlg.addEventListener("click", (e) => {
  const row = e.target.closest("[data-order]");
  const order = row && readOrders().find((o) => o.orderNumber === row.dataset.order);
  if (order) showOrder(order);
});

// ---- order detail / tracking ----------------------------------------------------

const STEP_OF_STATUS = { pending: 0, paid: 1, processing: 1, shipped: 2, delivered: 3 };

function timelineHTML(o) {
  const current = STEP_OF_STATUS[o.status];
  if (current === undefined) return `<p class="status s-${esc(o.status)} big">${statusLabel(o)}</p>`;
  const steps = ["Order placed", o.payments[0]?.provider === "cod" ? "Confirmed" : "Paid", "Shipped", "Delivered"];
  return `<ol class="timeline">${steps.map((label, i) =>
    `<li class="${i <= current ? "is-done" : ""}${i === current ? " is-current" : ""}"${i === current ? ' aria-current="step"' : ""}><span></span>${label}</li>`).join("")}</ol>`;
}

function showOrder(o) {
  const a = o.shippingAddress;
  const shipments = (o.shipments || []).map((s) =>
    `<p class="small">${esc(s.carrier)}${s.trackingNumber ? ` · tracking <strong>${esc(s.trackingNumber)}</strong>` : ""} · ${esc(s.status.replace(/_/g, " "))}</p>`).join("");
  info.innerHTML = dialogHead(`Order ${esc(o.orderNumber)}`, `Placed ${fmtDate(o.placedAt, true)}`) + `
    <div class="info-body">
      ${timelineHTML(o)}
      ${shipments}
      <ul class="lines lines-compact">${o.items.map((i) => `
        <li class="line"><div class="line-info"><p class="line-name">${i.quantity} × ${esc(i.productName)}</p>
          ${i.variantName !== "Standard" ? `<p class="muted small">${esc(i.variantName)}</p>` : ""}</div>
          <span class="line-price">${money(i.lineTotalCents)}</span></li>`).join("")}</ul>
      <dl class="summary">
        <div><dt>Subtotal</dt><dd>${money(o.subtotalCents)}</dd></div>
        <div><dt>Shipping</dt><dd>${o.shippingCents ? money(o.shippingCents) : "Free"}</dd></div>
        <div class="total"><dt>Total</dt><dd>${money(o.totalCents)}</dd></div>
      </dl>
      <p class="muted small">Ship to ${[a.recipientName || a.name, a.line1, a.barangay, a.city, a.province].filter(Boolean).map(esc).join(", ")} · Payment: ${esc(paymentLabel(o.payments[0]?.provider))} (${esc(o.paymentStatus)})</p>
      ${o.notes ? `<p class="muted small">Notes: ${esc(o.notes)}</p>` : ""}
    </div>`;
  openDialog(info);
}

export function openOrderLookup() {
  info.innerHTML = dialogHead("Order status", "Enter the order number from your confirmation and the email you used.") + `
    <form class="info-body" id="lookup-form">
      <label class="field"><span>Order number</span><input name="orderNumber" placeholder="BZ-XXXXXXXX" required maxlength="40" autocomplete="off" /></label>
      <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email" /></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-gold btn-block" type="submit">Track order</button>
    </form>`;
  openDialog(info);
}

info.addEventListener("submit", (e) => {
  if (e.target.id !== "lookup-form") return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const same = (a, b) => (a || "").trim().toLowerCase() === b.trim().toLowerCase();
  const order = readOrders().find((o) => same(o.orderNumber, f.orderNumber) && same(o.email, f.email));
  if (order) return showOrder(order);
  const error = e.target.querySelector(".form-error");
  error.textContent = "No order matches that order number and email.";
  error.hidden = false;
});

// ---- shipping rates ---------------------------------------------------------------

export function openShippingInfo() {
  info.innerHTML = dialogHead("Shipping & delivery", "Rates are per order. Prices include VAT.") + `
    <div class="info-body">
      <table class="specs rates"><thead><tr><th>Region</th><th>Fee</th><th>Free over</th><th>Delivery</th></tr></thead><tbody>
      ${state.rates.map((r) => `<tr><th scope="row">${esc(r.region)}</th><td>${money(r.feeCents)}</td>
        <td>${r.freeOverCents ? money(r.freeOverCents) : "-"}</td><td>${r.etaDays[0]}–${r.etaDays[1]} days</td></tr>`).join("")}
      </tbody></table>
      <p class="muted small">Orders ship from our Manila and Cebu warehouses. You'll get a tracking number once your order is on its way. Cash on delivery is available nationwide.</p>
    </div>`;
  openDialog(info);
}
