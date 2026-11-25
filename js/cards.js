// Product cards (used by rails, the catalog grid and the wishlist) + the catalog grid itself.

import { esc, money, fmtDate, starsHTML } from "./util.js";
import { art, CART_ICON, HEART_ICON } from "./art.js";
import { state } from "./store.js";

// Photo when there is one, otherwise line art. Pass null to force line art.
export function mediaHTML(p, imageUrl = p.imageUrl) {
  if (imageUrl) {
    return `<div class="media-bg is-photo${p.images[0]?.dark ? " is-dark" : ""}"><img class="product-art" src="${esc(imageUrl)}" alt="" loading="lazy" /></div>`;
  }
  return `<div class="media-bg" style="background:${esc(p.card.bg || "#141c30")}">${art(p.card.art, esc(p.card.color))}</div>`;
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

// Up to three facts a shopper can compare without opening the product.
function keySpecsHTML(p) {
  if (!p.specs.length) return "";
  return `<dl class="card-specs">${p.specs.slice(0, 3).map((s) =>
    `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}${s.unit ? " " + esc(s.unit) : ""}</dd></div>`).join("")}</dl>`;
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
        keySpecsHTML(p) +
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

function filterLabel(f) {
  if (f === "all") return "All gear";
  if (f === "deals") return "Deals";
  if (f === "preorders") return "Pre-orders";
  return state.categoryName[f] || f;
}

// Everything a shopper might type: name, brand, category, description, looks, specs, options. Built once per product.
function searchText(p) {
  return p.searchText ??= [p.name, p.brand, state.categoryName[p.category], p.topCategory, p.description,
    p.look?.summary, ...(p.look?.details || []).flat(),
    ...p.specs.flatMap((s) => [s.label, s.value + (s.unit ? " " + s.unit : "")]),
    ...p.variants.flatMap((v) => [v.name, v.look])].filter(Boolean).join(" ").toLowerCase();
}

function visibleProducts() {
  const words = catalog.query.toLowerCase().split(/\s+/).filter(Boolean);
  return state.products
    .filter((p) => matchesFilter(p, catalog.filter))
    .filter((p) => words.every((w) => searchText(p).includes(w)))
    .sort(SORTS[catalog.sort] || SORTS.featured);
}

let shownSlugs = null;

export function renderCatalog() {
  const list = visibleProducts();
  const slugs = list.map((p) => p.slug).join();
  if (slugs !== shownSlugs) { // typing often leaves the results unchanged; do not rebuild and re-animate them
    shownSlugs = slugs;
    document.getElementById("product-grid").innerHTML = list.map(cardHTML).join("");
  }
  document.getElementById("empty-state").hidden = list.length > 0;

  const label = filterLabel(catalog.filter);
  const q = catalog.query.trim();

  // A filter or search turns the home page into a results page, so results are never below the fold.
  const browsing = catalog.filter !== "all" || q !== "";
  if (document.body.classList.contains("is-browsing") !== browsing) {
    document.body.classList.toggle("is-browsing", browsing);
    document.getElementById("catalog").scrollIntoView({ behavior: "instant", block: "start" });
  }
  document.getElementById("featured-title").innerHTML = !browsing ? 'Shop all <span class="gold">gear</span>'
    : q ? `Results for <span class="gold">“${esc(q)}”</span>` : `<span class="gold">${esc(label)}</span>`;
  document.getElementById("catalog-sub").textContent =
    `${browsing && !q ? "" : label + " · "}${list.length} product${list.length === 1 ? "" : "s"}`;

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
