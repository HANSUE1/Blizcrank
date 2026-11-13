// Entry point: loads data, renders the page and wires up shared interactions.

import { esc, money, showToast, openDialog, setupDialog, dialogHead } from "./util.js";
import { state, on, loadCatalog, loadUser, loadWishlist, refreshCart, addToCart, toggleWish, wishCount } from "./store.js";
import { cardHTML, renderRail, railProducts, renderCatalog, syncHearts, catalog } from "./cards.js";
import { renderNav, renderFilterChips, renderHero, renderCategoryTiles, renderBrands, startAnnouncements, setupNewsletter } from "./home.js";
import { openProduct } from "./product.js";
import { openCart } from "./cart.js";
import { openAccount, openOrderLookup, openShippingInfo } from "./account.js";

const wishDrawer = document.getElementById("wishlist-drawer");
setupDialog(wishDrawer);

// ---- navigation links: "#category=gpus", "#product=slug", "#deals", ... -------

function showFilter(filter) {
  catalog.filter = filter;
  renderCatalog();
  document.getElementById("catalog").scrollIntoView({ behavior: "smooth", block: "start" });
}

function followLink(link) {
  if (!link) return false;
  const [key, value] = link.replace(/^#/, "").split("=");
  if (key === "category") showFilter(value || "all");
  else if (key === "deals" || key === "preorders") showFilter(key);
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
    a.closest(".has-menu")?.querySelector(".nav-link")?.blur(); // close hover menu
    if (wishDrawer.open && a.closest("#wishlist-drawer")) wishDrawer.close();
  }
});

// ---- product card actions (grid, rails, wishlist drawer) -----------------------

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  const card = btn && btn.closest(".card[data-slug]");
  if (!card) return;
  const p = state.bySlug[card.dataset.slug];
  if (!p) return;
  const action = btn.dataset.action;

  if (action === "open") return openProduct(p.slug);

  if (action === "wish") {
    try {
      const added = await toggleWish(p.slug);
      showToast(added ? `<span class="gold">♥</span> Saved: ${esc(p.name)}` : `Removed from wishlist`);
    } catch (err) { showToast(esc(err.message)); }
    return;
  }

  if (action === "add" && !btn.disabled) {
    btn.disabled = true;
    const label = btn.querySelector("span");
    const before = label.textContent;
    try {
      await addToCart(p.defaultVariantId, 1);
      btn.classList.add("is-added");
      label.textContent = "Added ✓";
      showToast(`<span class="gold">⚡</span> Added to cart · ${money(p.priceCents)} <button class="toast-link" type="button" data-link="#cart">View cart</button>`);
      setTimeout(() => { btn.classList.remove("is-added"); label.textContent = before; btn.disabled = false; }, 1400);
    } catch (err) {
      showToast(esc(err.message));
      btn.disabled = false;
    }
  }
});

// ---- header ----------------------------------------------------------------------

document.getElementById("cart-btn").addEventListener("click", openCart);
document.getElementById("account-btn").addEventListener("click", openAccount);
document.getElementById("wishlist-btn").addEventListener("click", openWishlist);

function updateCounters() {
  const cartBadge = document.getElementById("cart-count");
  const wishBadge = document.getElementById("wishlist-count");
  const n = state.cart ? state.cart.itemCount : 0;
  cartBadge.textContent = n;
  cartBadge.hidden = n === 0;
  const w = wishCount();
  wishBadge.textContent = w;
  wishBadge.hidden = w === 0;
  document.getElementById("account-label").textContent = state.user ? (state.user.firstName || "Account") : "Sign in";
  document.getElementById("cart-btn").setAttribute("aria-label", `Cart, ${n} item${n === 1 ? "" : "s"}`);
  document.getElementById("wishlist-btn").setAttribute("aria-label", `Wishlist, ${w} item${w === 1 ? "" : "s"}`);
}

// ---- wishlist drawer -----------------------------------------------------------

function renderWishlist() {
  const items = Object.keys(state.wished).map((s) => state.bySlug[s]).filter(Boolean);
  wishDrawer.innerHTML = dialogHead(`Wishlist <span class="muted">(${items.length})</span>`,
    state.user ? "Saved to your account." : "Saved on this device. Sign in to keep it everywhere.") +
    (items.length
      ? `<div class="wish-grid">${items.map(cardHTML).join("")}</div>`
      : `<div class="drawer-empty"><p class="empty-title">Nothing saved yet</p>
           <p class="muted">Tap the heart on any product to save it here.</p>
           <button class="btn btn-gold" type="button" data-close>Browse gear</button></div>`);
}

function openWishlist() {
  renderWishlist();
  openDialog(wishDrawer);
}

// ---- catalog controls -------------------------------------------------------------

document.getElementById("filters").addEventListener("click", (e) => {
  const b = e.target.closest(".filter");
  if (!b) return;
  catalog.filter = b.dataset.category;
  renderCatalog();
});

document.getElementById("sort").addEventListener("change", (e) => {
  catalog.sort = e.target.value;
  renderCatalog();
});

const searchInput = document.getElementById("search-input");
searchInput.addEventListener("input", () => {
  catalog.query = searchInput.value;
  renderCatalog();
});
document.getElementById("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  catalog.query = searchInput.value;
  catalog.filter = "all";
  renderCatalog();
  document.getElementById("catalog").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("clear-filters").addEventListener("click", () => {
  catalog.filter = "all";
  catalog.query = "";
  searchInput.value = "";
  renderCatalog();
});

// Brand chips search by brand.
document.getElementById("brand-strip").addEventListener("click", (e) => {
  const b = e.target.closest("[data-brand]");
  if (!b) return;
  searchInput.value = b.dataset.brand;
  catalog.query = b.dataset.brand;
  catalog.filter = "all";
  renderCatalog();
  document.getElementById("catalog").scrollIntoView({ behavior: "smooth", block: "start" });
});

// Rail arrows scroll by roughly one viewport of cards.
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-rail-scroll]");
  if (!b) return;
  const rail = b.closest("[data-rail]").querySelector(".rail");
  rail.scrollBy({ left: Number(b.dataset.railScroll) * rail.clientWidth * 0.85, behavior: "smooth" });
});

// ---- re-render on state changes -------------------------------------------------

function renderProducts() {
  const rails = railProducts();
  renderRail("new", rails.new);
  renderRail("deals", rails.deals);
  renderRail("preorders", rails.preorders);
  renderCatalog();
}

on("cart", updateCounters);
on("user", updateCounters);
on("wishlist", () => {
  updateCounters();
  syncHearts();
  if (wishDrawer.open) renderWishlist();
});

// ---- start ------------------------------------------------------------------------

startAnnouncements();
setupNewsletter();
document.getElementById("year").textContent = new Date().getFullYear();

(async function init() {
  try {
    await Promise.all([loadCatalog(), loadUser()]);
  } catch (err) {
    document.getElementById("catalog-sub").textContent = "";
    document.getElementById("product-grid").innerHTML = "";
    document.querySelectorAll("[data-rail], #shop-categories, #hero").forEach((s) => (s.hidden = true));
    const empty = document.getElementById("empty-state");
    empty.querySelector(".empty-title").textContent = "Store is offline";
    empty.querySelector(".empty-sub").textContent = "Start the server with npm start, then open http://localhost:3000";
    document.getElementById("clear-filters").hidden = true;
    empty.hidden = false;
    document.body.classList.remove("is-loading");
    return;
  }
  renderNav();
  renderFilterChips();
  renderHero();
  renderCategoryTiles();
  renderBrands();
  await Promise.all([loadWishlist(), refreshCart()]).catch((err) => showToast(esc(err.message)));
  renderProducts();
  updateCounters();
  document.body.classList.remove("is-loading");
  // Deep links like /#product=sony-ps5-pro or /#category=gpus
  if (location.hash) followLink(location.hash);
})();

