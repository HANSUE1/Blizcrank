// Entry point: loads data, renders the page and wires up shared interactions.

import { esc, money, showToast, openDialog, setupDialog, dialogHead, renderInto } from "./util.js";
import { state, on, loadCatalog, loadWishlist, refreshCart, addToCart, toggleWish, wishCount } from "./store.js";
import { cardHTML, renderRail, railProducts, renderCatalog, syncHearts, catalog } from "./cards.js";
import { renderNav, renderFilterChips, renderHero, renderCategoryTiles, renderBrands, startAnnouncements, setupNewsletter } from "./home.js";
import { openProduct } from "./product.js";
import { openCart } from "./cart.js";
import { openAccount, openOrderLookup, openShippingInfo } from "./account.js";

const wishDrawer = document.getElementById("wishlist-drawer");
const searchInput = document.getElementById("search-input");
setupDialog(wishDrawer);

// ---- browsing ------------------------------------------------------------------

function browse({ filter = "all", query = "" } = {}) {
  catalog.filter = filter;
  catalog.query = query;
  searchInput.value = query;
  renderCatalog();
}

function browseAndScroll(options) {
  browse(options);
  document.getElementById("catalog").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- navigation links: "#category=gpus", "#product=slug", "#deals", ... -------

function followLink(link) {
  if (!link) return false;
  const [key, value] = link.replace(/^#/, "").split("=");
  if (key === "category") browseAndScroll({ filter: value || "all" });
  else if (key === "home") { browse(); window.scrollTo({ top: 0, behavior: "instant" }); }
  else if (key === "deals" || key === "preorders") browseAndScroll({ filter: key });
  else if (key === "product") openProduct(value);
  else if (key === "order-status") openOrderLookup();
  else if (key === "shipping") openShippingInfo();
  else if (key === "account") openAccount();
  else if (key === "cart") openCart();
  else return false;
  return true;
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-link]");
  if (a && followLink(a.dataset.link)) {
    e.preventDefault();
    if (a.closest(".has-menu")) document.activeElement?.blur(); // close the mega menu
  }
});

// ---- product card actions (grid, rails, wishlist drawer) -----------------------

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  const card = btn && btn.closest(".card[data-slug]");
  const p = card && state.bySlug[card.dataset.slug];
  if (!p) return;
  const action = btn.dataset.action;

  if (action === "open") return openProduct(p.slug);

  if (action === "wish") {
    const added = toggleWish(p.slug);
    showToast(added ? `<span class="gold">♥</span> Saved: ${esc(p.name)}` : "Removed from wishlist");
    return;
  }

  if (action === "add") {
    try {
      addToCart(p.defaultVariantId);
    } catch (err) {
      showToast(esc(err.message));
      return;
    }
    const label = btn.querySelector("span");
    const before = label.textContent;
    btn.disabled = true;
    btn.classList.add("is-added");
    label.textContent = "Added ✓";
    showToast(`<span class="gold">⚡</span> Added to cart · ${money(p.priceCents)} <button class="toast-link" type="button" data-link="#cart">View cart</button>`);
    setTimeout(() => { btn.classList.remove("is-added"); label.textContent = before; btn.disabled = false; }, 1400);
  }
});

// ---- header ----------------------------------------------------------------------

document.getElementById("cart-btn").addEventListener("click", openCart);
document.getElementById("account-btn").addEventListener("click", openAccount);
document.getElementById("wishlist-btn").addEventListener("click", openWishlist);

function setCounter(id, name, n) {
  const badge = document.getElementById(`${id}-count`);
  badge.textContent = n;
  badge.hidden = n === 0;
  document.getElementById(`${id}-btn`).setAttribute("aria-label", `${name}, ${n} item${n === 1 ? "" : "s"}`);
}

function updateCounters() {
  setCounter("cart", "Cart", state.cart ? state.cart.itemCount : 0);
  setCounter("wishlist", "Wishlist", wishCount());
}

// ---- wishlist drawer -----------------------------------------------------------

function renderWishlist() {
  const items = Object.keys(state.wished).map((s) => state.bySlug[s]).filter(Boolean);
  renderInto(wishDrawer, dialogHead(`Wishlist <span class="muted">(${items.length})</span>`, "Saved on this device.") +
    (items.length
      ? `<div class="wish-grid">${items.map(cardHTML).join("")}</div>`
      : `<div class="drawer-empty"><p class="empty-title">Nothing saved yet</p>
           <p class="muted">Tap the heart on any product to save it here.</p>
           <button class="btn btn-gold" type="button" data-close>Browse gear</button></div>`));
}

function openWishlist() {
  renderWishlist();
  openDialog(wishDrawer);
}

// ---- catalog controls -------------------------------------------------------------

document.getElementById("filters").addEventListener("click", (e) => {
  const b = e.target.closest(".filter");
  if (!b) return;
  catalog.filter = b.dataset.category; // keeps the search text: chips narrow the results
  renderCatalog();
});

document.getElementById("sort").addEventListener("change", (e) => {
  catalog.sort = e.target.value;
  renderCatalog();
});

searchInput.addEventListener("input", () => {
  catalog.query = searchInput.value;
  renderCatalog();
});
document.getElementById("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  browseAndScroll({ query: searchInput.value });
});

document.getElementById("clear-filters").addEventListener("click", () => browse());

// Brand chips search by brand.
document.getElementById("brand-strip").addEventListener("click", (e) => {
  const b = e.target.closest("[data-brand]");
  if (b) browseAndScroll({ query: b.dataset.brand });
});

// Rail arrows scroll by roughly one viewport of cards.
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-rail-scroll]");
  if (!b) return;
  const rail = b.closest("[data-rail]").querySelector(".rail");
  rail.scrollBy({ left: Number(b.dataset.railScroll) * rail.clientWidth * 0.85, behavior: "smooth" });
});

// ---- re-render on state changes -------------------------------------------------

on("cart", updateCounters);
on("wishlist", () => {
  updateCounters();
  syncHearts();
  if (wishDrawer.open) renderWishlist();
});

// ---- start ------------------------------------------------------------------------

function showOffline() {
  document.getElementById("catalog-sub").textContent = "";
  document.querySelectorAll("[data-rail], #shop-categories, #hero, .brands, .sort, #clear-filters").forEach((el) => (el.hidden = true));
  const empty = document.getElementById("empty-state");
  empty.querySelector(".empty-title").textContent = "Store is offline";
  empty.querySelector(".empty-sub").textContent = "Please refresh the page.";
  empty.hidden = false;
}

async function init() {
  startAnnouncements();
  setupNewsletter();
  document.getElementById("year").textContent = new Date().getFullYear();

  try {
    await loadCatalog();
  } catch (err) {
    console.error("[store]", err);
    showOffline();
    return;
  } finally {
    document.body.classList.remove("is-loading");
  }
  renderNav();
  renderFilterChips();
  renderHero();
  renderCategoryTiles();
  renderBrands();
  loadWishlist();
  refreshCart();
  const rails = railProducts();
  for (const id of Object.keys(rails)) renderRail(id, rails[id]);
  renderCatalog();
  // Deep links like /#product=sony-ps5-pro or /#category=gpus
  if (location.hash) followLink(location.hash);
}

init();
