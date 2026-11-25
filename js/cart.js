// Cart drawer: items, shipping estimate, checkout form, confirmation.

import { esc, money, showToast, openDialog, setupDialog, dialogHead, closeIcon, renderInto } from "./util.js";
import { state, on, refreshCart, setRegion, setQty, removeItem, placeOrder, MAX_QTY } from "./store.js";
import { art, CART_ICON } from "./art.js";

const dlg = document.getElementById("cart-drawer");
setupDialog(dlg);

let view = "cart";        // cart | checkout | done
let placedOrder = null;

const PAYMENT_METHODS = [
  ["cod", "Cash on delivery", "Pay the rider when your order arrives"],
  ["gcash", "GCash", "We'll send payment instructions after you order"],
  ["maya", "Maya", "We'll send payment instructions after you order"],
  ["stripe", "Credit / debit card", "Visa, Mastercard, JCB"],
  ["paypal", "PayPal", ""],
];

export const paymentLabel = (provider) => PAYMENT_METHODS.find(([id]) => id === provider)?.[1] ?? "-";

const hasProblems = (cart) => cart.items.some((i) => !i.inStock);

function regionSelect(id) {
  return `<select id="${id}" name="region" required>
    <option value="">Select region…</option>
    ${state.rates.map((r) => `<option value="${esc(r.region)}"${r.region === state.region ? " selected" : ""}>${esc(r.region)}</option>`).join("")}
  </select>`;
}

function summaryHTML(c) {
  const ship = c.shipping;
  const shipText = c.shippingCents === null ? '<span class="muted">Select region</span>'
    : c.shippingCents === 0 ? '<span class="free">Free</span>' : money(c.shippingCents);
  const gap = ship?.freeOverCents && c.shippingCents > 0 ? ship.freeOverCents - c.subtotalCents : 0;
  return `
    <dl class="summary">
      <div><dt>Subtotal</dt><dd>${money(c.subtotalCents)}</dd></div>
      <div><dt>Shipping${ship ? ` <span class="muted small">· ${ship.etaDays[0]}–${ship.etaDays[1]} days</span>` : ""}</dt><dd>${shipText}</dd></div>
      <div class="total"><dt>Total</dt><dd>${money(c.totalCents)}</dd></div>
    </dl>
    <p class="muted small vat-note">Includes ${money(c.taxCents)} VAT</p>
    ${gap > 0 ? `<p class="ship-hint">Add ${money(gap)} more for free shipping to ${esc(ship.region)}</p>` : ""}`;
}

function lineIssue(i) {
  if (!i.available) return "No longer available, please remove";
  if (i.inStock) return "";
  return i.stock > 0 ? `Only ${i.stock} left, lower the quantity` : "Sold out, please remove";
}

function lineHTML(i) {
  const name = esc(i.productName);
  const issue = lineIssue(i);
  return `
    <li class="line" data-item="${esc(i.variantId)}">
      <div class="line-art" style="background:${i.imageUrl ? "#fff" : esc(i.card.bg || "#141c30")}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" />` : art(i.card.art, esc(i.card.color))}</div>
      <div class="line-info">
        <p class="line-name">${name}</p>
        ${i.variantName !== "Standard" ? `<p class="muted small">${esc(i.variantName)}</p>` : ""}
        ${issue ? `<p class="line-issue">${issue}</p>` : ""}
        <div class="line-row">
          <div class="qty qty-sm" role="group" aria-label="Quantity for ${name}">
            <button type="button" data-cart="dec" aria-label="Decrease quantity">−</button>
            <output>${i.quantity}</output>
            <button type="button" data-cart="inc" aria-label="Increase quantity" ${i.quantity >= Math.min(MAX_QTY, i.stock) ? "disabled" : ""}>+</button>
          </div>
          <span class="line-price">${money(i.lineTotalCents)}</span>
        </div>
      </div>
      <button class="icon-btn line-remove" type="button" data-cart="remove" aria-label="Remove ${name}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg></button>
    </li>`;
}

function cartView() {
  const c = state.cart;
  if (!c.items.length) {
    return dialogHead("Your cart") + `
      <div class="drawer-empty">
        ${CART_ICON}
        <p class="empty-title">Your cart is empty</p>
        <p class="muted">Find something good in the shop.</p>
        <button class="btn btn-gold" type="button" data-close>Start shopping</button>
      </div>`;
  }
  const problems = hasProblems(c);
  return dialogHead(`Your cart <span class="muted">(${c.itemCount})</span>`) + `
    <ul class="lines">${c.items.map(lineHTML).join("")}</ul>
    <div class="drawer-foot">
      <label class="field field-inline"><span>Ship to</span>${regionSelect("cart-region")}</label>
      ${summaryHTML(c)}
      <button class="btn btn-gold btn-block" type="button" data-cart="checkout" ${problems ? "disabled" : ""}>
        Checkout · ${money(c.totalCents)}</button>
      ${problems ? '<p class="line-issue center">Fix the items above to continue.</p>' : ""}
    </div>`;
}

function checkoutView() {
  const c = state.cart;
  const pay = PAYMENT_METHODS.map(([v, label, note], i) => `
    <label class="pay-option">
      <input type="radio" name="paymentProvider" value="${v}" ${i === 0 ? "checked" : ""} />
      <span><strong>${label}</strong>${note ? `<small>${note}</small>` : ""}</span>
    </label>`).join("");
  return `
    <header class="dlg-head">
      <button class="link-btn" type="button" data-cart="back">← Back to cart</button>
      <button class="icon-btn" type="button" data-close aria-label="Close">${closeIcon}</button>
    </header>
    <form class="checkout" id="checkout-form">
      <h2 class="dlg-title">Checkout</h2>
      <p class="muted small">This is a demo. No payment will be processed and no real order is placed.</p>
      <fieldset>
        <legend class="field-label">Contact</legend>
        <label class="field"><span>Email (to track your order)</span><input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@email.com" /></label>
      </fieldset>
      <fieldset>
        <legend class="field-label">Shipping address</legend>
        <div class="field-row">
          <label class="field"><span>Full name</span><input name="recipientName" autocomplete="name" required maxlength="120" /></label>
          <label class="field"><span>Mobile number</span><input name="phone" type="tel" autocomplete="tel" required maxlength="30" placeholder="09XX XXX XXXX" /></label>
        </div>
        <label class="field"><span>House no., street, building</span><input name="line1" autocomplete="address-line1" required maxlength="200" /></label>
        <div class="field-row">
          <label class="field"><span>Barangay (optional)</span><input name="barangay" maxlength="120" /></label>
          <label class="field"><span>City / municipality</span><input name="city" autocomplete="address-level2" required maxlength="120" /></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Province</span><input name="province" autocomplete="address-level1" required maxlength="120" /></label>
          <label class="field"><span>Postal code</span><input name="postalCode" autocomplete="postal-code" required maxlength="12" inputmode="numeric" /></label>
        </div>
        <label class="field"><span>Region (for shipping)</span>${regionSelect("checkout-region")}</label>
      </fieldset>
      <fieldset>
        <legend class="field-label">Payment</legend>
        <div class="pay-options">${pay}</div>
      </fieldset>
      <label class="field"><span>Order notes (optional)</span><textarea name="notes" rows="2" maxlength="500"></textarea></label>
      <div data-summary>${summaryHTML(c)}</div>
      <button class="btn btn-gold btn-block" type="submit">Place order · ${money(c.totalCents)}</button>
    </form>`;
}

function doneView() {
  const o = placedOrder;
  const payNote = o.payments[0].provider === "cod"
    ? "Pay the rider in cash when your order arrives."
    : "This is a demo order. No payment was processed.";
  return dialogHead("Order placed") + `
    <div class="done">
      <div class="done-check" aria-hidden="true">✓</div>
      <p class="done-title">Thank you for your order!</p>
      <p class="muted">Order number</p>
      <p class="order-no">${esc(o.orderNumber)}</p>
      <dl class="summary">
        <div><dt>Items</dt><dd>${o.items.reduce((s, i) => s + i.quantity, 0)}</dd></div>
        <div><dt>Ship to</dt><dd>${esc(o.shippingAddress.city)}, ${esc(o.shippingAddress.region)}</dd></div>
        <div class="total"><dt>Total</dt><dd>${money(o.totalCents)}</dd></div>
      </dl>
      <p class="muted small">${payNote}</p>
      <p class="muted small">Track it any time with <strong>Order status</strong> using your order number and email.</p>
      <button class="btn btn-gold btn-block" type="button" data-close>Continue shopping</button>
    </div>`;
}

function render() {
  if (!dlg.open) return;
  renderInto(dlg, view === "done" ? doneView() : view === "checkout" ? checkoutView() : cartView());
}

function show(next) {
  view = next;
  render();
  dlg.scrollTop = 0;
  dlg.querySelector("button").focus(); // the control that had focus is gone
}

export function openCart() {
  openDialog(dlg);
  refreshCart();
  show("cart");
}

dlg.addEventListener("click", (e) => {
  const act = e.target.closest("[data-cart]")?.dataset.cart;
  if (!act) return;
  const id = e.target.closest("[data-item]")?.dataset.item;
  const item = state.cart.items.find((i) => String(i.variantId) === id);
  try {
    if (act === "inc") setQty(item.variantId, item.quantity + 1);
    else if (act === "dec") setQty(item.variantId, item.quantity - 1);
    else if (act === "remove") removeItem(item.variantId);
    else if (act === "checkout") show("checkout");
    else if (act === "back") show("cart");
  } catch (err) { showToast(esc(err.message)); }
});

dlg.addEventListener("change", (e) => {
  if (e.target.name === "region") setRegion(e.target.value);
});

function buildOrder(f) {
  const c = state.cart;
  return {
    orderNumber: "BZ-" + Date.now().toString(36).toUpperCase(),
    email: f.email.trim(),
    status: "pending",
    paymentStatus: "unpaid",
    placedAt: new Date().toISOString(),
    items: c.items.map(({ quantity, productName, variantName, lineTotalCents }) => ({ quantity, productName, variantName, lineTotalCents })),
    shippingAddress: {
      recipientName: f.recipientName, phone: f.phone, line1: f.line1, barangay: f.barangay,
      city: f.city, province: f.province, region: f.region, postalCode: f.postalCode,
    },
    notes: f.notes.trim(),
    subtotalCents: c.subtotalCents,
    shippingCents: c.shippingCents,
    taxCents: c.taxCents,
    totalCents: c.totalCents,
    payments: [{ provider: f.paymentProvider, amountCents: c.totalCents, status: "pending" }],
    shipments: [],
  };
}

dlg.addEventListener("submit", (e) => {
  if (e.target.id !== "checkout-form") return;
  e.preventDefault();
  const fields = Object.fromEntries(new FormData(e.target));
  try {
    setRegion(fields.region); // also re-reads the cart, which another tab may have changed
    if (!state.cart.items.length || hasProblems(state.cart)) {
      show("cart");
      showToast("Your cart changed. Please check it before ordering.");
      return;
    }
    const order = buildOrder(fields);
    placeOrder(order);
    placedOrder = order;
    show("done");
  } catch (err) { showToast(esc(err.message)); }
});

// Re-render on cart changes, but never wipe a half-filled checkout form.
on("cart", () => {
  if (view !== "checkout") return render();
  const form = dlg.querySelector("#checkout-form");
  if (!dlg.open || !form) return;
  form.querySelector("[data-summary]").innerHTML = summaryHTML(state.cart);
  form.querySelector('[type="submit"]').textContent = `Place order · ${money(state.cart.totalCents)}`;
});
