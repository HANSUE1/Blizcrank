// App state + actions. Components subscribe with on("cart" | "wishlist" | "user", fn).

import { api } from "./util.js";

export const state = {
  products: [],        // product cards from /api/products
  bySlug: {},
  categories: [],      // tree from /api/categories
  categoryName: {},    // slug -> name (incl. children)
  banners: [],
  brands: [],
  rates: [],           // shipping rates
  user: null,
  cart: null,          // quote from /api/cart
  region: null,        // chosen shipping region
  wished: {},          // slug -> true
};

const listeners = {};
export const on = (evt, fn) => (listeners[evt] = listeners[evt] || []).push(fn);
export const emit = (evt) => (listeners[evt] || []).forEach((fn) => fn());

// ---- local preferences (best effort; storage can be unavailable) -------------

const LS_KEY = "blitzcrank-state";
function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function writeLocal(patch) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...readLocal(), ...patch })); } catch { /* ignore */ }
}

// ---- catalog -------------------------------------------------------------------

export async function loadCatalog() {
  const [p, c, b, br, r] = await Promise.all([
    api("GET", "/api/products"), api("GET", "/api/categories"), api("GET", "/api/banners"),
    api("GET", "/api/brands"), api("GET", "/api/shipping-rates"),
  ]);
  state.products = p.products;
  state.bySlug = Object.fromEntries(p.products.map((x) => [x.slug, x]));
  state.categories = c.categories;
  const walk = (list) => list.forEach((cat) => { state.categoryName[cat.slug] = cat.name; walk(cat.children); });
  walk(c.categories);
  state.banners = b.banners;
  state.brands = br.brands;
  state.rates = r.rates;
  const saved = readLocal().region;
  state.region = state.rates.some((x) => x.region === saved) ? saved : null;
}

// ---- cart ------------------------------------------------------------------------

const cartPath = () => "/api/cart" + (state.region ? "?region=" + encodeURIComponent(state.region) : "");

export function setCart(cart) { state.cart = cart; emit("cart"); }

export async function refreshCart() {
  setCart((await api("GET", cartPath())).cart);
  return state.cart;
}

export async function setRegion(region) {
  state.region = region || null;
  writeLocal({ region: state.region });
  return refreshCart();
}

// Mutations return the cart without a region; re-quote so shipping stays shown.
async function mutateCart(method, path, body) {
  await api(method, path, body);
  return refreshCart();
}

export const addToCart = (variantId, quantity = 1) => mutateCart("POST", "/api/cart/items", { variantId, quantity });
export const setQty = (itemId, quantity) => mutateCart("PATCH", `/api/cart/items/${itemId}`, { quantity });
export const removeItem = (itemId) => mutateCart("DELETE", `/api/cart/items/${itemId}`);
export const applyCoupon = (code) => mutateCart("POST", "/api/cart/coupon", { code });
export const removeCoupon = () => mutateCart("DELETE", "/api/cart/coupon");

// ---- user ------------------------------------------------------------------------

export async function loadUser() {
  state.user = (await api("GET", "/api/auth/me")).user;
}

async function afterSignIn(user) {
  state.user = user;
  // Move anything hearted while signed out into the account wishlist.
  const local = Object.keys(readLocal().wished || {});
  await Promise.all(local.map((slug) => api("POST", "/api/wishlist", { productSlug: slug }).catch(() => {})));
  writeLocal({ wished: {} });
  await Promise.all([loadWishlist(), refreshCart()]); // server merged the guest cart
  emit("user");
}

export async function signIn(email, password) {
  await afterSignIn((await api("POST", "/api/auth/login", { email, password })).user);
}

export async function register(fields) {
  await afterSignIn((await api("POST", "/api/auth/register", fields)).user);
}

export async function signOut() {
  await api("POST", "/api/auth/logout");
  state.user = null;
  state.wished = {};
  await refreshCart();
  emit("wishlist");
  emit("user");
}

// ---- wishlist (account when signed in, this browser otherwise) ---------------

export async function loadWishlist() {
  if (state.user) {
    const items = (await api("GET", "/api/wishlist")).items;
    state.wished = Object.fromEntries(items.map((i) => [i.productSlug, true]));
  } else {
    state.wished = { ...(readLocal().wished || {}) };
  }
  emit("wishlist");
}

export async function toggleWish(slug) {
  const on_ = !state.wished[slug];
  if (on_) state.wished[slug] = true; else delete state.wished[slug];
  emit("wishlist");
  try {
    if (state.user) {
      if (on_) await api("POST", "/api/wishlist", { productSlug: slug });
      else await api("DELETE", `/api/wishlist/${state.bySlug[slug].id}`);
    } else {
      writeLocal({ wished: state.wished });
    }
  } catch (err) {
    if (on_) delete state.wished[slug]; else state.wished[slug] = true; // undo
    emit("wishlist");
    throw err;
  }
  return on_;
}

export const wishCount = () => Object.keys(state.wished).filter((s) => state.bySlug[s]).length;
