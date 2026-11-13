// Sign in / register, my orders, order tracking, shipping info.

import { api, esc, money, fmtDate, showToast, openDialog, setupDialog, dialogHead, spinner } from "./util.js";
import { state, on, signIn, register, signOut } from "./store.js";

const dlg = document.getElementById("account-dialog");
const info = document.getElementById("info-dialog");
setupDialog(dlg);
setupDialog(info);

let tab = "signin";

const STATUS_LABEL = {
  pending: "Awaiting payment", paid: "Paid", processing: "Preparing", shipped: "Shipped",
  delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};

// ---- auth ----------------------------------------------------------------------

function authView() {
  const signin = tab === "signin";
  return dialogHead(signin ? "Welcome back" : "Create your account",
                    signin ? "Sign in to see your orders and saved wishlist." : "Faster checkout, order history and a wishlist that follows you.") + `
    <div class="tabs" role="tablist">
      <button role="tab" type="button" data-tab="signin" aria-selected="${signin}" class="tab${signin ? " is-active" : ""}">Sign in</button>
      <button role="tab" type="button" data-tab="register" aria-selected="${!signin}" class="tab${signin ? "" : " is-active"}">Create account</button>
    </div>
    <form class="auth-form" id="auth-form">
      ${signin ? "" : `<div class="field-row">
        <label class="field"><span>First name</span><input name="firstName" autocomplete="given-name" maxlength="80" /></label>
        <label class="field"><span>Last name</span><input name="lastName" autocomplete="family-name" maxlength="80" /></label></div>`}
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required /></label>
      <label class="field"><span>Password${signin ? "" : " <small class=\"muted\">(8+ characters)</small>"}</span>
        <input type="password" name="password" autocomplete="${signin ? "current-password" : "new-password"}" minlength="${signin ? 1 : 8}" required /></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-gold btn-block" type="submit">${signin ? "Sign in" : "Create account"}</button>
    </form>`;
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

async function accountView() {
  const u = state.user;
  dlg.innerHTML = dialogHead(`Hi${u.firstName ? ", " + esc(u.firstName) : ""}!`, esc(u.email)) + spinner("Loading your orders…");
  let orders = [];
  try { orders = (await api("GET", "/api/orders")).orders; } catch (err) { showToast(esc(err.message)); }
  if (!dlg.open || !state.user) return;
  dlg.innerHTML = dialogHead(`Hi${u.firstName ? ", " + esc(u.firstName) : ""}!`, esc(u.email)) + `
    <section class="acct-section"><h3 class="pd-h">My orders</h3>${ordersHTML(orders)}</section>
    <div class="acct-actions">
      ${u.role !== "customer" ? `<p class="muted small">You're signed in as <strong>${esc(u.role)}</strong>. Admin tools are available through the API (see README).</p>` : ""}
      <button class="btn btn-ghost btn-block" type="button" data-acct="signout">Sign out</button>
    </div>`;
}

export function openAccount() {
  if (state.user) { openDialog(dlg); accountView(); return; }
  dlg.innerHTML = authView();
  openDialog(dlg);
  dlg.querySelector('input[name="email"]')?.focus();
}

dlg.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-tab]");
  if (t) { tab = t.dataset.tab; dlg.innerHTML = authView(); return; }
  const o = e.target.closest("[data-order]");
  if (o) return openOrder(o.dataset.order);
  if (e.target.closest('[data-acct="signout"]')) {
    try { await signOut(); dlg.close(); showToast("Signed out"); } catch (err) { showToast(esc(err.message)); }
  }
});

dlg.addEventListener("submit", async (e) => {
  if (e.target.id !== "auth-form") return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const errEl = e.target.querySelector(".form-error");
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  errEl.hidden = true;
  try {
    if (tab === "signin") await signIn(f.email, f.password);
    else await register({ email: f.email, password: f.password, firstName: f.firstName, lastName: f.lastName });
    dlg.close();
    showToast(`<span class="gold">⚡</span> ${tab === "signin" ? "Welcome back" : "Welcome to Blitzcrank"}${state.user.firstName ? ", " + esc(state.user.firstName) : ""}!`);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btn.disabled = false;
  }
});

// ---- order detail / tracking ----------------------------------------------------

const STEPS = ["pending", "paid", "shipped", "delivered"];

function orderDetailHTML(o, { canCancel }) {
  const stepIndex = { pending: 0, paid: 1, processing: 1, shipped: 2, delivered: 3 }[o.status];
  const timeline = stepIndex === undefined
    ? `<p class="status s-${esc(o.status)} big">${STATUS_LABEL[o.status] || esc(o.status)}</p>`
    : `<ol class="timeline">${STEPS.map((s, i) =>
        `<li class="${i <= stepIndex ? "is-done" : ""}${i === stepIndex ? " is-current" : ""}"><span></span>${
          ["Order placed", o.payments[0]?.provider === "cod" ? "Confirmed" : "Paid", "Shipped", "Delivered"][i]}</li>`).join("")}</ol>`;
  const ships = o.shipments.length
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
      ${o.discountCents ? `<div class="is-discount"><dt>Discount${o.couponCode ? ` (${esc(o.couponCode)})` : ""}</dt><dd>−${money(o.discountCents)}</dd></div>` : ""}
      <div><dt>Shipping</dt><dd>${o.shippingCents ? money(o.shippingCents) : "Free"}</dd></div>
      <div class="total"><dt>Total</dt><dd>${money(o.totalCents)}</dd></div>
    </dl>
    <p class="muted small">Ship to ${esc(a.name)}, ${esc(a.line1)}, ${esc(a.city)}, ${esc(a.province)} · Payment: ${esc(o.payments[0]?.provider.toUpperCase() || "-")} (${esc(o.paymentStatus)})</p>
    ${canCancel && ["pending", "paid", "processing"].includes(o.status)
      ? `<button class="btn btn-ghost btn-block" type="button" data-cancel="${esc(o.orderNumber)}">Cancel order</button>` : ""}`;
}

async function openOrder(number) {
  info.innerHTML = dialogHead(`Order ${esc(number)}`) + spinner();
  openDialog(info);
  try {
    const o = (await api("GET", `/api/orders/${encodeURIComponent(number)}`)).order;
    info.innerHTML = dialogHead(`Order ${esc(o.orderNumber)}`, `Placed ${fmtDate(o.placedAt, true)}`) +
                     `<div class="info-body">${orderDetailHTML(o, { canCancel: true })}</div>`;
  } catch (err) {
    info.innerHTML = dialogHead("Order") + `<p class="info-body">${esc(err.message)}</p>`;
  }
}

export function openOrderLookup() {
  info.innerHTML = dialogHead("Order status", "Enter the order number from your confirmation and the email you used.") + `
    <form class="info-body" id="lookup-form">
      <label class="field"><span>Order number</span><input name="orderNumber" placeholder="BZ-261113-XXXXX" required maxlength="40" autocomplete="off" /></label>
      <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email" value="${esc(state.user?.email || "")}" /></label>
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

info.addEventListener("submit", async (e) => {
  if (e.target.id !== "lookup-form") return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const errEl = e.target.querySelector(".form-error");
  try {
    const o = (await api("POST", "/api/orders/lookup", f)).order;
    info.innerHTML = dialogHead(`Order ${esc(o.orderNumber)}`, `Placed ${fmtDate(o.placedAt, true)}`) +
                     `<div class="info-body">${orderDetailHTML(o, { canCancel: false })}</div>`;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
});

info.addEventListener("click", async (e) => {
  const c = e.target.closest("[data-cancel]");
  if (!c) return;
  if (!confirm("Cancel this order? Items go back on sale right away.")) return;
  try {
    await api("POST", `/api/orders/${encodeURIComponent(c.dataset.cancel)}/cancel`);
    showToast("Order cancelled");
    info.close();
    if (dlg.open) accountView();
  } catch (err) { showToast(esc(err.message)); }
});

on("user", () => {
  if (dlg.open && state.user) accountView();
});
