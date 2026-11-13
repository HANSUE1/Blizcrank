// Product quick view: gallery art, variant picker, stock, quantity, specs, reviews.

import { api, esc, money, fmtDate, starsHTML, showToast, openDialog, setupDialog, closeIcon, spinner } from "./util.js";
import { state, on, addToCart, toggleWish } from "./store.js";
import { mediaHTML } from "./cards.js";
import { openAccount } from "./account.js";

const dlg = document.getElementById("product-dialog");
setupDialog(dlg);

let current = null;   // full product from /api/products/:slug
let variant = null;
let qty = 1;

function stockText(v) {
  if (!v.inStock) return '<span class="stock is-out">Sold out</span>';
  if (current.isPreorder) return `<span class="stock is-pre">Pre-order · ships ${esc(fmtDate(current.releaseDate))}</span>`;
  if (v.stock <= 3) return `<span class="stock is-low">Only ${v.stock} left in stock</span>`;
  return '<span class="stock is-in">In stock · ships in 1–2 days</span>';
}

function reviewFormHTML() {
  if (!state.user) {
    return `<p class="muted">Bought this? <button class="link-btn" type="button" data-pd="signin">Sign in</button> to write a review.</p>`;
  }
  const stars = [5, 4, 3, 2, 1].map((n) =>
    `<input type="radio" id="rv-${n}" name="rating" value="${n}" required /><label for="rv-${n}" title="${n} star${n > 1 ? "s" : ""}">★</label>`).join("");
  return `
    <form class="review-form" id="review-form">
      <p class="field-label">Your rating</p>
      <div class="star-input" role="radiogroup" aria-label="Rating">${stars}</div>
      <label class="field"><span>Title</span><input name="title" maxlength="120" /></label>
      <label class="field"><span>Review</span><textarea name="body" rows="3" maxlength="4000"></textarea></label>
      <button class="btn btn-ghost" type="submit">Post review</button>
    </form>`;
}

function render() {
  const p = current;
  const v = variant;
  const wished = !!state.wished[p.slug];
  const maxQty = Math.max(1, Math.min(99, v.stock));
  const price = `<span class="price">${money(v.priceCents)}</span>` +
                (v.compareAtCents ? `<span class="price-old">${money(v.compareAtCents)}</span>` +
                  `<span class="save">Save ${money(v.compareAtCents - v.priceCents)}</span>` : "");

  const variants = p.variants.length > 1 ? `
    <fieldset class="variants">
      <legend class="field-label">Option: <strong>${esc(v.name)}</strong></legend>
      <div class="chips">${p.variants.map((x) =>
        `<button type="button" class="chip${x.id === v.id ? " is-active" : ""}${x.inStock ? "" : " is-out"}" data-variant="${x.id}"
           aria-pressed="${x.id === v.id}">${esc(x.name)}${x.inStock ? "" : " · sold out"}</button>`).join("")}</div>
    </fieldset>` : "";

  const specs = p.specs.length ? `
    <table class="specs"><tbody>${p.specs.map((s) =>
      `<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.value)}${s.unit ? " " + esc(s.unit) : ""}</td></tr>`).join("")}</tbody></table>` : "";

  const reviews = p.reviews.length
    ? p.reviews.map((r) => `
        <article class="review">
          <div class="review-head"><span class="card-rating">${starsHTML(r.rating, 1).replace(/\(1\)/, "")}</span>
            ${r.verifiedPurchase ? '<span class="verified">Verified purchase</span>' : ""}</div>
          ${r.title ? `<h4>${esc(r.title)}</h4>` : ""}
          ${r.body ? `<p>${esc(r.body)}</p>` : ""}
          <p class="muted small">${esc(r.author)} · ${fmtDate(r.createdAt)}</p>
        </article>`).join("")
    : '<p class="muted">No reviews yet. Be the first.</p>';

  dlg.innerHTML = `
    <div class="pd">
      <button class="icon-btn pd-close" type="button" data-close aria-label="Close">${closeIcon}</button>
      <div class="pd-media">${mediaHTML(p)}${p.badgeLabel ? `<span class="card-badge ${esc(p.badge)}">${esc(p.badgeLabel)}</span>` : ""}</div>
      <div class="pd-info">
        <p class="card-brand">${esc(p.brand)}</p>
        <h2 class="pd-title" id="pd-title">${esc(p.name)}</h2>
        <div class="card-rating">${starsHTML(p.rating, p.reviewCount)}</div>
        <div class="pd-price">${price}</div>
        <p class="pd-vat muted small">VAT included</p>
        ${variants}
        <p class="pd-stock">${stockText(v)}</p>
        <div class="pd-buy">
          <div class="qty" aria-label="Quantity">
            <button type="button" data-qty="-1" aria-label="Decrease quantity" ${qty <= 1 ? "disabled" : ""}>−</button>
            <output aria-live="polite">${qty}</output>
            <button type="button" data-qty="1" aria-label="Increase quantity" ${qty >= maxQty ? "disabled" : ""}>+</button>
          </div>
          <button class="btn btn-gold" type="button" data-pd="add" ${v.inStock ? "" : "disabled"}>
            ${v.inStock ? (p.isPreorder ? "Pre-order now" : "Add to cart") : "Sold out"}</button>
          <button class="icon-btn wish-big${wished ? " is-wished" : ""}" type="button" data-pd="wish"
            aria-label="${wished ? "Remove from" : "Add to"} wishlist" aria-pressed="${wished}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.3 4.9 13A4.8 4.8 0 0 1 12 6.4 4.8 4.8 0 0 1 19.1 13Z"/></svg></button>
        </div>
        <ul class="pd-perks">
          <li>100% brand new &amp; official local warranty</li>
          <li>Cash on delivery, GCash, Maya and cards</li>
        </ul>
        <p class="pd-desc">${esc(p.description)}</p>
      </div>
      <div class="pd-more">
        ${specs ? `<section><h3 class="pd-h">Specifications</h3>${specs}</section>` : ""}
        <section><h3 class="pd-h">Reviews ${p.reviewCount ? `<span class="muted">(${p.reviewCount})</span>` : ""}</h3>
          ${reviews}${reviewFormHTML()}</section>
      </div>
    </div>`;
  dlg.setAttribute("aria-labelledby", "pd-title");
}

export async function openProduct(slug) {
  dlg.innerHTML = `<div class="pd-loading">${spinner()}</div>`;
  openDialog(dlg);
  try {
    current = (await api("GET", `/api/products/${encodeURIComponent(slug)}`)).product;
    variant = current.variants.find((v) => v.inStock) || current.variants[0];
    qty = 1;
    render();
  } catch (err) {
    dlg.innerHTML = `<div class="pd-loading"><p>${esc(err.message)}</p><button class="btn btn-ghost" data-close>Close</button></div>`;
  }
}

dlg.addEventListener("click", async (e) => {
  if (!current) return;
  const vBtn = e.target.closest("[data-variant]");
  if (vBtn) {
    variant = current.variants.find((v) => v.id === Number(vBtn.dataset.variant));
    qty = Math.min(qty, Math.max(1, variant.stock));
    return render();
  }
  const qBtn = e.target.closest("[data-qty]");
  if (qBtn) {
    qty = Math.max(1, Math.min(99, variant.stock, qty + Number(qBtn.dataset.qty)));
    return render();
  }
  const act = e.target.closest("[data-pd]")?.dataset.pd;
  if (act === "add") {
    const btn = e.target.closest("button");
    btn.disabled = true;
    try {
      await addToCart(variant.id, qty);
      showToast(`<span class="gold">⚡</span> Added ${qty} × ${esc(current.name)}`);
      dlg.close();
    } catch (err) {
      showToast(esc(err.message));
      btn.disabled = false;
    }
  } else if (act === "wish") {
    try {
      const added = await toggleWish(current.slug);
      showToast(added ? '<span class="gold">♥</span> Saved to wishlist' : "Removed from wishlist");
    } catch (err) { showToast(esc(err.message)); }
  } else if (act === "signin") {
    openAccount();
  }
});

dlg.addEventListener("submit", async (e) => {
  if (e.target.id !== "review-form") return;
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api("POST", `/api/products/${current.slug}/reviews`,
      { rating: Number(f.get("rating")), title: f.get("title"), body: f.get("body") });
    showToast(r.verifiedPurchase ? "Thanks! Your verified review is posted." : "Thanks! Your review is posted.");
    const keep = variant.id;
    current = (await api("GET", `/api/products/${current.slug}`)).product;
    variant = current.variants.find((v) => v.id === keep) || current.variants[0];
    render();
  } catch (err) { showToast(esc(err.message)); }
});

// Keep the heart / review form in sync if the user signs in from inside the dialog.
on("wishlist", () => { if (dlg.open && current) render(); });
on("user", () => { if (dlg.open && current) render(); });
