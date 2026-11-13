// Product cards (used by rails, the catalog grid and the wishlist) + the catalog grid itself.

import { esc, money, fmtDate, starsHTML } from "./util.js";
import { art } from "./art.js";
import { state } from "./store.js";

const CART_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.2l2.1 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6"/><circle cx="9.6" cy="20" r="1.4"/><circle cx="16.6" cy="20" r="1.4"/></svg>';
const HEART_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3 4.9 13A4.8 4.8 0 0 1 12 6.4 4.8 4.8 0 0 1 19.1 13Z"/></svg>';

export function mediaHTML(p) {
  const inner = p.imageUrl
    ? `<img class="product-art" src="${esc(p.imageUrl)}" alt="" loading="lazy" />`
    : art(p.card.art, esc(p.card.color));
  return `<div class="media-bg" style="background:${esc(p.card.bg || "#141c30")}">${inner}</div>`;
}

export function priceHTML(p) {
  if (p.variantCount > 1 && p.fromPriceCents !== p.priceCents) {
    return `<span class="price"><small>From</small> ${money(p.fromPriceCents)}</span>`;
  }
  return `<span class="price">${money(p.priceCents)}</span>` +
         (p.compareAtCents ? `<span class="price-old">${money(p.compareAtCents)}</span>` : "");
}

// The card's main button: add straight to cart, or open options / show sold out.
function actionButton(p) {
  if (!p.inStock) return `<button class="add-to-cart is-sold-out" type="button" disabled><span>Sold out</span></button>`;
  if (p.variantCount > 1) {
    return `<button class="add-to-cart" type="button" data-action="open"><span>Choose options</span></button>`;
  }
  return `<button class="add-to-cart" type="button" data-action="add">${CART_ICON}<span>${p.isPreorder ? "Pre-order" : "Add to cart"}</span></button>`;
}

export function cardHTML(p) {
  const wished = !!state.wished[p.slug];
  const badge = p.badgeLabel ? `<span class="card-badge ${esc(p.badge)}">${esc(p.badgeLabel)}</span>` : "";
  const release = p.isPreorder && p.releaseDate ? `<p class="card-note">Releases ${fmtDate(p.releaseDate)}</p>` : "";
  const lowStock = p.inStock && !p.isPreorder && p.stock <= 3 ? `<p class="card-note is-warn">Only ${p.stock} left</p>` : "";
  return (
    `<article class="card" data-slug="${esc(p.slug)}">` +
      `<div class="card-media">` +
        `<button class="card-open" type="button" data-action="open" aria-label="Quick view: ${esc(p.name)}">${mediaHTML(p)}` +
          `<span class="quick-view" aria-hidden="true">Quick view</span></button>` +
        badge +
        `<button class="wish-toggle${wished ? " is-wished" : ""}" type="button" data-action="wish" ` +
          `aria-label="${wished ? "Remove from" : "Add to"} wishlist" aria-pressed="${wished}">${HEART_ICON}</button>` +
      `</div>` +
      `<div class="card-body">` +
        `<p class="card-brand">${esc(p.brand)}</p>` +
        `<h3 class="card-title"><button type="button" data-action="open">${esc(p.name)}</button></h3>` +
        `<div class="card-rating">${starsHTML(p.rating, p.reviewCount)}</div>` +
        release + lowStock +
        `<div class="card-price">${priceHTML(p)}</div>` +
        actionButton(p) +
      `</div>` +
    `</article>`
  );
}

// ---- rails -------------------------------------------------------------------

export function renderRail(id, products) {
  const section = document.querySelector(`[data-rail="${id}"]`);
  if (!section) return;
  section.hidden = products.length === 0;
  section.querySelector(".rail").innerHTML = products.map(cardHTML).join("");
}

export function railProducts() {
  const byNewest = [...state.products].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || b.id - a.id);
  const discount = (p) => (p.compareAtCents ? p.priceCents / p.compareAtCents : 1);
  return {
    new: byNewest.filter((p) => !p.isPreorder).slice(0, 10),
    deals: state.products.filter((p) => p.compareAtCents && p.inStock).sort((a, b) => discount(a) - discount(b)),
    preorders: state.products.filter((p) => p.isPreorder),
  };
}

// ---- catalog grid ----------------------------------------------------------

export const catalog = { filter: "all", query: "", sort: "featured" };

const SORTS = {
  featured: (a, b) => b.reviewCount - a.reviewCount || a.id - b.id,
  newest: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || b.id - a.id,
  price_asc: (a, b) => a.fromPriceCents - b.fromPriceCents,
  price_desc: (a, b) => b.fromPriceCents - a.fromPriceCents,
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
};

function matchesFilter(p, f) {
  if (f === "all") return true;
  if (f === "deals") return !!p.compareAtCents;
  if (f === "preorders") return p.isPreorder;
  return p.category === f || p.topCategory === f;
}

export function filterLabel(f) {
  if (f === "all") return "All gear";
  if (f === "deals") return "Deals";
  if (f === "preorders") return "Pre-orders";
  return state.categoryName[f] || f;
}

export function visibleProducts() {
  const q = catalog.query.trim().toLowerCase();
  return state.products
    .filter((p) => matchesFilter(p, catalog.filter))
    .filter((p) => !q || `${p.name} ${p.brand} ${state.categoryName[p.category] || ""} ${p.topCategory}`.toLowerCase().includes(q))
    .sort(SORTS[catalog.sort] || SORTS.featured);
}

export function renderCatalog() {
  const grid = document.getElementById("product-grid");
  const list = visibleProducts();
  grid.innerHTML = list.map(cardHTML).join("");
  document.getElementById("empty-state").hidden = list.length > 0;

  const label = filterLabel(catalog.filter);
  const q = catalog.query.trim();
  document.getElementById("catalog-sub").textContent =
    `${label}${q ? ` · “${q}”` : ""} · ${list.length} product${list.length === 1 ? "" : "s"}`;

  // Highlight the chip for this filter, or its parent category.
  const parent = state.categories.find((c) => c.children.some((ch) => ch.slug === catalog.filter));
  const active = parent ? parent.slug : catalog.filter;
  document.querySelectorAll("#filters .filter").forEach((b) => {
    const on = b.dataset.category === active;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

// Re-render just the heart buttons (cheaper than re-rendering every card).
export function syncHearts() {
  document.querySelectorAll(".card[data-slug]").forEach((card) => {
    const on = !!state.wished[card.dataset.slug];
    const btn = card.querySelector(".wish-toggle");
    if (!btn) return;
    btn.classList.toggle("is-wished", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", `${on ? "Remove from" : "Add to"} wishlist`);
  });
}
