// Cart drawer: items, coupon, shipping estimate, checkout form, confirmation.

import { api, esc, money, showToast, openDialog, setupDialog, dialogHead, spinner } from "./util.js";
import { state, on, refreshCart, setRegion, setQty, removeItem, applyCoupon, removeCoupon } from "./store.js";
import { art } from "./art.js";
import { openAccount } from "./account.js";

const dlg = document.getElementById("cart-drawer");
setupDialog(dlg);

let view = "cart";        // cart | checkout | done
let placedOrder = null;
let busy = false;

const PAYMENT_METHODS = [
  ["cod", "Cash on delivery", "Pay the rider when your order arrives"],
  ["gcash", "GCash", "We'll send payment instructions after you order"],
  ["maya", "Maya", "We'll send payment instructions after you order"],
  ["stripe", "Credit / debit card", "Visa, Mastercard, JCB"],
  ["paypal", "PayPal", ""],
];

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
  let hint = "";
  if (ship && c.shippingCents > 0 && ship.freeOverCents) {
    const gap = ship.freeOverCents - (c.subtotalCents - c.discountCents);
    if (gap > 0) hint = `<p class="ship-hint">Add ${money(gap)} more for free shipping to ${esc(ship.region)}</p>`;
  }
  return `
    <dl class="summary">
      <div><dt>Subtotal</dt><dd>${money(c.subtotalCents)}</dd></div>
      ${c.discountCents ? `<div class="is-discount"><dt>Discount${c.coupon ? ` (${esc(c.coupon.code)})` : ""}</dt><dd>−${money(c.discountCents)}</dd></div>` : ""}
      <div><dt>Shipping${ship ? ` <span class="muted small">· ${ship.etaDays[0]}–${ship.etaDays[1]} days</span>` : ""}</dt><dd>${shipText}</dd></div>
      <div class="total"><dt>Total</dt><dd>${money(c.totalCents)}</dd></div>
    </dl>
    <p class="muted small vat-note">Includes ${money(c.taxCents)} VAT</p>
    ${hint}`;
}

function cartView() {
  const c = state.cart;
  if (!c || c.items.length === 0) {
    return dialogHead("Your cart") + `
      <div class="drawer-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.2l2.1 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6"/><circle cx="9.6" cy="20" r="1.4"/><circle cx="16.6" cy="20" r="1.4"/></svg>
        <p class="empty-title">Your cart is empty</p>
        <p class="muted">Find something good in the shop.</p>
        <button class="btn btn-gold" type="button" data-close>Start shopping</button>
      </div>`;
  }
  const problems = c.items.some((i) => !i.inStock);
  const items = c.items.map((i) => {
    const issue = !i.available ? "No longer available, please remove"
      : !i.inStock ? (i.stock > 0 ? `Only ${i.stock} left, lower the quantity` : "Sold out, please remove") : "";
    return `
      <li class="line" data-item="${i.id}">
        <div class="line-art" style="background:${esc(i.card.bg || "#141c30")}">${art(i.card.art, esc(i.card.color))}</div>
        <div class="line-info">
          <p class="line-name">${esc(i.productName)}</p>
          ${i.variantName !== "Standard" ? `<p class="muted small">${esc(i.variantName)}</p>` : ""}
          ${issue ? `<p class="line-issue">${esc(issue)}</p>` : ""}
          <div class="line-row">
            <div class="qty qty-sm" aria-label="Quantity for ${esc(i.productName)}">
              <button type="button" data-cart="dec" aria-label="Decrease quantity">−</button>
              <output>${i.quantity}</output>
              <button type="button" data-cart="inc" aria-label="Increase quantity" ${i.quantity >= Math.min(99, i.stock) ? "disabled" : ""}>+</button>
            </div>
            <span class="line-price">${money(i.lineTotalCents)}</span>
          </div>
        </div>
        <button class="icon-btn line-remove" type="button" data-cart="remove" aria-label="Remove ${esc(i.productName)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg></button>
      </li>`;
  }).join("");

  const coupon = c.coupon
    ? `<div class="coupon-applied${c.coupon.valid ? "" : " is-invalid"}">
         <span><strong>${esc(c.coupon.code)}</strong> ${esc(c.coupon.valid ? c.coupon.description : c.coupon.message)}</span>
         <button class="link-btn" type="button" data-cart="uncoupon">Remove</button></div>`
    : `<form class="coupon-form" id="coupon-form">
         <label class="sr-only" for="coupon-code">Coupon code</label>
         <input id="coupon-code" name="code" placeholder="Coupon code" autocomplete="off" maxlength="40" required />
         <button class="btn btn-ghost" type="submit">Apply</button></form>`;

  return dialogHead(`Your cart <span class="muted">(${c.itemCount})</span>`) + `
    <ul class="lines">${items}</ul>
    <div class="drawer-foot">
      ${coupon}
      <label class="field field-inline"><span>Ship to</span>${regionSelect("cart-region")}</label>
      ${summaryHTML(c)}
      <button class="btn btn-gold btn-block" type="button" data-cart="checkout" ${problems ? "disabled" : ""}>
        Checkout · ${money(c.totalCents)}</button>
      ${problems ? '<p class="line-issue center">Fix the items above to continue.</p>' : ""}
    </div>`;
}

function checkoutView() {
  const c = state.cart;
  const u = state.user;
  const pay = PAYMENT_METHODS.map(([v, label, note], i) => `
    <label class="pay-option">
      <input type="radio" name="paymentProvider" value="${v}" ${i === 0 ? "checked" : ""} />
      <span><strong>${label}</strong>${note ? `<small>${note}</small>` : ""}</span>
    </label>`).join("");
  return `
    <header class="dlg-head">
      <button class="link-btn" type="button" data-cart="back">← Back to cart</button>
      <button class="icon-btn" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </header>
    <form class="checkout" id="checkout-form">
      <h2 class="dlg-title">Checkout</h2>
      ${u ? `<p class="muted small">Signed in as ${esc(u.email)}</p>` : `
        <p class="muted small">Have an account? <button class="link-btn" type="button" data-cart="signin">Sign in</button> for faster checkout.</p>
        <label class="field"><span>Email for order updates</span><input type="email" name="email" autocomplete="email" required /></label>`}
      <fieldset>
        <legend class="field-label">Shipping address</legend>
        <div class="field-row">
          <label class="field"><span>Full name</span><input name="recipientName" autocomplete="name" required maxlength="120" /></label>
          <label class="field"><span>Mobile number</span><input name="phone" type="tel" autocomplete="tel" required maxlength="30" placeholder="09XX XXX XXXX" /></label>
        </div>
        <label class="field"><span>House no., street, building</span><input name="line1" autocomplete="address-line1" required maxlength="200" /></label>
        <div class="field-row">
          <label class="field"><span>Barangay</span><input name="barangay" maxlength="120" /></label>
          <label class="field"><span>City / municipality</span><input name="city" autocomplete="address-level2" required maxlength="120" /></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Province</span><input name="province" autocomplete="address-level1" required maxlength="120" /></label>
          <label class="field"><span>Postal code</span><input name="postalCode" autocomplete="postal-code" required maxlength="12" inputmode="numeric" /></label>
        </div>
        <label class="field"><span>Region (for shipping)</span>${regionSelect("checkout-region")}</label>
        ${u ? '<label class="check"><input type="checkbox" name="saveAddress" checked /> Save this address to my account</label>' : ""}
      </fieldset>
      <fieldset>
        <legend class="field-label">Payment</legend>
        <div class="pay-options">${pay}</div>
      </fieldset>
      <label class="field"><span>Order notes (optional)</span><textarea name="notes" rows="2" maxlength="500"></textarea></label>
      ${summaryHTML(c)}
      <button class="btn btn-gold btn-block" type="submit" ${busy ? "disabled" : ""}>Place order · ${money(c.totalCents)}</button>
      <p class="muted small center">By placing your order you agree to our terms. Prices include VAT.</p>
    </form>`;
}

function doneView() {
  const o = placedOrder;
  const payNote = o.payments[0]?.provider === "cod"
    ? "Pay the rider in cash when your order arrives."
    : "Your payment is pending. Our team will confirm it and update your order status once it's received.";
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
      <p class="muted small">Track it any time with <strong>Order status</strong> using your order number and ${esc(o.email)}.</p>
      <button class="btn btn-gold btn-block" type="button" data-close>Continue shopping</button>
    </div>`;
}

function render() {
  if (!dlg.open) return;
  dlg.innerHTML = view === "done" ? doneView() : view === "checkout" ? checkoutView() : cartView();
}

export async function openCart() {
  view = "cart";
  dlg.innerHTML = dialogHead("Your cart") + spinner();
  openDialog(dlg);
  try { await refreshCart(); } catch (err) { showToast(esc(err.message)); }
  render();
}

async function prefillAddress() {
  if (!state.user) return;
  try {
    const a = (await api("GET", "/api/addresses")).addresses[0];
    const form = dlg.querySelector("#checkout-form");
    if (!a || !form) return;
    for (const k of ["recipientName", "phone", "line1", "barangay", "city", "province", "postalCode"]) {
      if (form.elements[k] && a[k]) form.elements[k].value = a[k];
    }
    if (a.region && state.region !== a.region) { await setRegion(a.region); }
    if (form.elements.saveAddress) form.elements.saveAddress.checked = false;
  } catch { /* prefill is optional */ }
}

dlg.addEventListener("click", async (e) => {
  const act = e.target.closest("[data-cart]")?.dataset.cart;
  if (!act || busy) return;
  const line = e.target.closest("[data-item]");
  const item = line && state.cart.items.find((i) => i.id === Number(line.dataset.item));
  try {
    if (act === "inc") await setQty(item.id, item.quantity + 1);
    else if (act === "dec") await (item.quantity <= 1 ? removeItem(item.id) : setQty(item.id, item.quantity - 1));
    else if (act === "remove") await removeItem(item.id);
    else if (act === "uncoupon") await removeCoupon();
    else if (act === "checkout") { view = "checkout"; render(); prefillAddress(); }
    else if (act === "back") { view = "cart"; render(); }
    else if (act === "signin") openAccount();
  } catch (err) { showToast(esc(err.message)); }
});

dlg.addEventListener("change", async (e) => {
  if (e.target.name !== "region") return;
  // Keep what the shopper typed: only the summary needs updating.
  try {
    await setRegion(e.target.value);
  } catch (err) { showToast(esc(err.message)); }
});

dlg.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.id === "coupon-form") {
    try {
      await applyCoupon(e.target.elements.code.value.trim());
      showToast('<span class="gold">✓</span> Coupon applied');
    } catch (err) { showToast(esc(err.message)); }
    return;
  }
  if (e.target.id !== "checkout-form") return;

  const f = Object.fromEntries(new FormData(e.target));
  const address = { recipientName: f.recipientName, phone: f.phone, line1: f.line1, barangay: f.barangay, city: f.city,
                    province: f.province, region: f.region, postalCode: f.postalCode };
  const submit = e.target.querySelector('[type="submit"]');
  busy = true;
  submit.disabled = true;
  submit.textContent = "Placing order…";
  try {
    const body = { paymentProvider: f.paymentProvider, notes: f.notes || undefined };
    if (state.user && f.saveAddress) {
      body.addressId = (await api("POST", "/api/addresses", address)).address.id;
    } else {
      body.address = address;
      if (!state.user) body.email = f.email;
    }
    placedOrder = (await api("POST", "/api/checkout", body)).order;
    view = "done";
    await refreshCart();
  } catch (err) {
    showToast(esc(err.message));
    submit.disabled = false;
    submit.textContent = "Place order";
  } finally {
    busy = false;
  }
});

// Re-render on cart changes, but never wipe a half-filled checkout form.
on("cart", () => {
  if (!dlg.open) return;
  if (view === "checkout") {
    const form = dlg.querySelector("#checkout-form");
    const old = form && form.querySelector(".summary");
    if (old) {
      const tmp = document.createElement("div");
      tmp.innerHTML = summaryHTML(state.cart);
      old.nextElementSibling?.classList.contains("vat-note") && old.nextElementSibling.remove();
      form.querySelector(".ship-hint")?.remove();
      old.replaceWith(...tmp.childNodes);
      const btn = form.querySelector('[type="submit"]');
      if (btn && !busy) btn.textContent = `Place order · ${money(state.cart.totalCents)}`;
    }
    if (!state.cart.items.length) { view = "cart"; render(); }
    return;
  }
  render();
});
on("user", () => { if (dlg.open && view === "checkout") { render(); prefillAddress(); } });
