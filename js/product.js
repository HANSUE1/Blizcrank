// Product quick view: gallery art, variant picker, stock, quantity, specs.
// Frontend-only: product data from state.bySlug (loaded from catalog.json).

import { esc, money, fmtDate, starsHTML, showToast, openDialog, setupDialog, closeIcon } from "./util.js";
import { state, on, addToCart, toggleWish } from "./store.js";
import { mediaHTML } from "./cards.js";

const dlg = document.getElementById("product-dialog");
setupDialog(dlg);

let current = null;
let variant = null;
let qty = 1;

function stockText(v) {
  if (!v.inStock) return '<span class="stock is-out">Sold out</span>';
  if (current.isPreorder) return `<span class="stock is-pre">Pre-order · ships ${esc(fmtDate(current.releaseDate))}</span>`;
  if (v.stock <= 3) return `<span class="stock is-low">Only ${v.stock} left in stock</span>`;
  return '<span class="stock is-in">In stock · ships in 1–2 days</span>';
}

// Outline of the product drawn to scale beside a bank card (85.6 × 54 mm), an object everyone has held.
function sizeHTML({ size, view }) {
  if (!size) return "";
  const [w, h] = size;
  const [cw, ch] = [85.6, 54];
  const gap = Math.max(w, cw) * 0.12;
  const W = w + gap + cw;
  const H = Math.max(h, ch);
  const label = `${(w / 10).toFixed(1)} cm wide, ${(h / 10).toFixed(1)} cm tall`;
  return `<figure class="pd-size">
      <svg viewBox="0 0 ${W} ${H}" style="max-width:${Math.min(340, 150 * W / H)}px" role="img" aria-label="Outline ${label}, beside a bank card">
        <rect class="pd-size-item" x="0" y="${H - h}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.05}"/>
        <rect class="pd-size-card" x="${w + gap}" y="${H - ch}" width="${cw}" height="${ch}" rx="3.2"/>
      </svg>
      <figcaption>${esc(view)}, to scale. Dashed outline is a bank card.</figcaption>
    </figure>`;
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
           aria-pressed="${x.id === v.id}">${x.swatch ? `<span class="swatch" style="background:${esc(x.swatch)}"></span>` : ""}${esc(x.name)}${x.inStock ? "" : " · sold out"}</button>`).join("")}</div>
    </fieldset>` : "";

  const specs = p.specs.length ? `
    <table class="specs"><tbody>${p.specs.map((s) =>
      `<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.value)}${s.unit ? " " + esc(s.unit) : ""}</td></tr>`).join("")}</tbody></table>` : "";

  const look = p.look ? `
    <section class="pd-look" aria-labelledby="pd-look-title"><h3 class="pd-h" id="pd-look-title">What it looks like</h3>
      <div><p class="pd-look-text">${v.look ? `<strong>${esc(v.name)}.</strong> ${esc(v.look)} ` : ""}${esc(p.look.summary)}</p>${sizeHTML(p.look)}</div>
      <dl class="pd-facts">${p.look.details.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join("")}</dl>
    </section>` : "";

  dlg.innerHTML = `
    <div class="pd">
      <button class="icon-btn pd-close" type="button" data-close aria-label="Close">${closeIcon}</button>
      <div class="pd-media">${mediaHTML(p)}${p.badgeLabel ? `<span class="card-badge ${esc(p.badge)}">${esc(p.badgeLabel)}</span>` : ""}</div>
      <div class="pd-info">
        <p class="card-brand">${esc(p.brand)}</p>
        <h2 class="pd-title" id="pd-title">${esc(p.name)}</h2>
        <div class="card-rating">${starsHTML(p.rating, p.reviewCount)}</div>
        <p class="pd-desc">${esc(p.description)}</p>
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
      </div>
      ${look}
      <div class="pd-more">
        ${specs ? `<section><h3 class="pd-h">Specifications</h3>${specs}</section>` : ""}
        <section><h3 class="pd-h">Reviews</h3>
          <p class="muted">${p.reviewCount ? `Rated ${Number(p.rating).toFixed(1)} out of 5 from ${p.reviewCount} reviews.` : "No reviews yet."}</p></section>
      </div>
    </div>`;
  dlg.setAttribute("aria-labelledby", "pd-title");
}

export async function openProduct(slug) {
  dlg.innerHTML = '<div class="pd-loading"><div class="loading" role="status"><span class="spin" aria-hidden="true"></span>Loading…</div></div>';
  openDialog(dlg);
  const p = state.bySlug[slug];
  if (!p) {
    dlg.innerHTML = '<div class="pd-loading"><p>Product not found.</p><button class="btn btn-ghost" data-close>Close</button></div>';
    return;
  }
  current = p;
  variant = p.variants.find((v) => v.inStock) || p.variants[0];
  qty = 1;
  render();
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
  }
});

on("wishlist", () => { if (dlg.open && current) render(); });