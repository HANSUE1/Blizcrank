// Order lookup, order detail, shipping info.
// Frontend-only: orders stored in localStorage by the checkout flow.

import { esc, money, fmtDate, openDialog, setupDialog, dialogHead, spinner } from "./util.js";
import { state, on } from "./store.js";

const dlg = document.getElementById("account-dialog");
const info = document.getElementById("info-dialog");
setupDialog(dlg);
setupDialog(info);

const STATUS_LABEL = {
  pending: "Awaiting payment", paid: "Paid", processing: "Preparing", shipped: "Shipped",
  delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};

const ORDERS_KEY = "blitzcrank-orders";

function readOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; } catch { return []; }
}

function ordersHTML(orders) {
  if (!orders.length) return '<p class="muted">No orders yet.</p>';
  return `<ul class="order-list">${orders.map((o) => `
    <li><button type="button" class="order-row" data-order="${esc(o.orderNumber)}">
      <span><strong>${esc(o.orderNumber)}</strong><small class="muted">${fmtDate(o.placedAt)}</small></span>
      <span class="status s-${esc(o.status)}">${STATUS_LABEL[o.status] || esc(o.status)}</span>
      <span class="order-total">${money(o.totalCents)}</span>
    </button></li>`).join("")}</ul>`;
}

function accountView() {
  const orders = readOrders();
  dlg.innerHTML = dialogHead("My orders") + `
    <section class="acct-section"><h3 class="pd-h">Order history</h3>${ordersHTML(orders)}</section>
    <div class="acct-actions">
      <button class="btn btn-ghost btn-block" type="button" data-close>Close</button>
    </div>`;
}

export function openAccount() {
  openDialog(dlg);
  accountView();
}

dlg.addEventListener("click", (e) => {
  const o = e.target.closest("[data-order]");
  if (o) return openOrder(o.dataset.order);
});

// ---- order detail / tracking ----------------------------------------------------

const STEPS = ["pending", "paid", "shipped", "delivered"];

function orderDetailHTML(o) {
  const stepIndex = { pending: 0, paid: 1, processing: 1, shipped: 2, delivered: 3 }[o.status];
  const timeline = stepIndex === undefined
    ? `<p class="status s-${esc(o.status)} big">${STATUS_LABEL[o.status] || esc(o.status)}</p>`
    : `<ol class="timeline">${STEPS.map((s, i) =>
        `<li class="${i <= stepIndex ? "is-done" : ""}${i === stepIndex ? " is-current" : ""}"><span></span>${
          ["Order placed", o.payments[0]?.provider === "cod" ? "Confirmed" : "Paid", "Shipped", "Delivered"][i]}</li>`).join("")}</ol>`;
  const ships = (o.shipments || []).length
    ? o.shipments.map((s) => `<p class="small">${esc(s.carrier)}${s.trackingNumber ? ` · tracking <strong>${esc(s.trackingNumber)}</strong>` : ""} · ${esc(s.status.replace(/_/g, " "))}</p>`).join("")
    : "";
  const a = o.shippingAddress;
  return `
    ${timeline}
    ${ships}
    <ul class="lines lines-compact">${o.items.map((i) => `
      <li class="line"><div class="line-info"><p class="line-name">${i.quantity} × ${esc(i.productName)}</p>
        ${i.variantName !== "Standard" ? `<p class="muted small">${esc(i.variantName)}</p>` : ""}</div>
        <span class="line-price">${money(i.lineTotalCents)}</span></li>`).join("")}</ul>
    <dl class="summary">
      <div><dt>Subtotal</dt><dd>${money(o.subtotalCents)}</dd></div>
      ${o.discountCents ? `<div class="is-discount"><dt>Discount</dt><dd>−${money(o.discountCents)}</dd></div>` : ""}
      <div><dt>Shipping</dt><dd>${o.shippingCents ? money(o.shippingCents) : "Free"}</dd></div>
      <div class="total"><dt>Total</dt><dd>${money(o.totalCents)}</dd></div>
    </dl>
    <p class="muted small">Ship to ${esc(a.recipientName || a.name || "")}, ${esc(a.line1)}, ${esc(a.city)}, ${esc(a.province)} · Payment: ${esc(o.payments[0]?.provider.toUpperCase() || "-")} (${esc(o.paymentStatus)})</p>`;
}

async function openOrder(number) {
  info.innerHTML = dialogHead(`Order ${esc(number)}`) + spinner();
  openDialog(info);
  const orders = readOrders();
  const o = orders.find((x) => x.orderNumber === number);
  if (!o) {
    info.innerHTML = dialogHead("Order") + `<p class="info-body">Order not found.</p>`;
    return;
  }
  info.innerHTML = dialogHead(`Order ${esc(o.orderNumber)}`, `Placed ${fmtDate(o.placedAt, true)}`) +
    `<div class="info-body">${orderDetailHTML(o)}</div>`;
}

export function openOrderLookup() {
  info.innerHTML = dialogHead("Order status", "Enter the order number from your confirmation and the email you used.") + `
    <form class="info-body" id="lookup-form">
      <label class="field"><span>Order number</span><input name="orderNumber" placeholder="BZ-XXXXXXXXXXXXXXX" required maxlength="40" autocomplete="off" /></label>
      <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email" /></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-gold btn-block" type="submit">Track order</button>
    </form>`;
  openDialog(info);
}

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

info.addEventListener("submit", (e) => {
  if (e.target.id !== "lookup-form") return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const errEl = e.target.querySelector(".form-error");
  const orders = readOrders();
  const o = orders.find((x) =>
    x.orderNumber.toUpperCase() === f.orderNumber.toUpperCase() &&
    x.email && x.email.toLowerCase() === f.email.toLowerCase()
  );
  if (!o) {
    errEl.textContent = "No order matches that order number and email.";
    errEl.hidden = false;
    return;
  }
  info.innerHTML = dialogHead(`Order ${esc(o.orderNumber)}`, `Placed ${fmtDate(o.placedAt, true)}`) +
    `<div class="info-body">${orderDetailHTML(o)}</div>`;
});

on("user", () => {
  if (dlg.open) accountView();
});