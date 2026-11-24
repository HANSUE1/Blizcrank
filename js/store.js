// App state + actions. Components subscribe with on("cart" | "wishlist" | "user", fn).
// Catalog from the server (MongoDB); cart/wishlist/orders in localStorage.

export const state = {
  products: [],        // product cards from api/catalog
  bySlug: {},
  categories: [],      // tree from api/catalog
  categoryName: {},    // slug -> name (incl. children)
  banners: [],
  brands: [],
  rates: [],           // shipping rates
  user: null,          // always null (no auth)
  cart: null,          // client-side cart quote
  region: null,        // chosen shipping region
  wished: {},          // slug -> true
};

const listeners = {};
export const on = (evt, fn) => (listeners[evt] = listeners[evt] || []).push(fn);
export const emit = (evt) => (listeners[evt] || []).forEach((fn) => fn());

// ---- local preferences -------------------------------------------------------

const LS_KEY = "blitzcrank-state";
function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function writeLocal(patch) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...readLocal(), ...patch })); } catch { /* ignore */ }
}

// ---- catalog -------------------------------------------------------------------

export async function loadCatalog() {
  const res = await fetch("api/catalog");
  if (!res.ok) throw new Error("Catalog unavailable");
  const data = await res.json();
  state.products = data.products;
  state.bySlug = Object.fromEntries(data.products.map((x) => [x.slug, x]));
  state.categories = data.categories;
  const walk = (list) => list.forEach((cat) => { state.categoryName[cat.slug] = cat.name; walk(cat.children); });
  walk(data.categories);
  state.banners = data.banners;
  state.brands = data.brands;
  state.rates = data.rates;
  const saved = readLocal().region;
  state.region = state.rates.some((x) => x.region === saved) ? saved : null;
}

// ---- cart (client-side, persisted in localStorage) ----------------------------

const CART_KEY = "blitzcrank-cart";

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function writeCart(items) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

function computeQuote(items) {
  const enriched = items.map((ci) => {
    const p = state.bySlug[ci.productSlug];
    if (!p) return null;
    const v = p.variants.find((x) => x.id === ci.variantId) || p.variants[0];
    const available = p.inStock && v.inStock;
    return {
      id: ci.variantId,
      variantId: v.id,
      productId: p.id,
      productSlug: p.slug,
      productName: p.name,
      variantName: v.name,
      sku: v.sku,
      options: v.options,
      quantity: ci.quantity,
      unitPriceCents: v.priceCents,
      compareAtCents: v.compareAtCents,
      lineTotalCents: v.priceCents * ci.quantity,
      stock: v.stock,
      available,
      inStock: available && v.stock >= ci.quantity,
      card: p.card,
      imageUrl: p.images.find((i) => !i.variantId || i.variantId === v.id)?.thumb || null,
    };
  }).filter(Boolean);

  const subtotalCents = enriched.reduce((s, i) => s + i.lineTotalCents, 0);
  const itemCount = enriched.reduce((s, i) => s + i.quantity, 0);

  let shippingCents = null;
  let shipping = null;
  if (state.region) {
    const rate = state.rates.find((r) => r.region === state.region);
    if (rate) {
      const free = rate.freeOverCents !== null && subtotalCents >= rate.freeOverCents;
      shippingCents = enriched.length === 0 || free ? 0 : rate.feeCents;
      shipping = { region: rate.region, feeCents: rate.feeCents, freeOverCents: rate.freeOverCents, etaDays: rate.etaDays };
    }
  }

  const totalCents = subtotalCents + (shippingCents || 0);
  const taxCents = Math.round((totalCents * 12) / 112);

  return {
    cartId: null, items: enriched, itemCount,
    subtotalCents, discountCents: 0, shippingCents, taxCents, totalCents,
    coupon: null, shipping,
  };
}

export function setCart(cart) { state.cart = cart; emit("cart"); }

export async function refreshCart() {
  setCart(computeQuote(readCart()));
  return state.cart;
}

export async function setRegion(region) {
  state.region = region || null;
  writeLocal({ region: state.region });
  return refreshCart();
}

export async function addToCart(variantId, quantity = 1) {
  const items = readCart();
  const p = state.products.find((x) => x.variants.some((v) => v.id === variantId));
  if (!p) throw new Error("Product not found");
  const existing = items.find((i) => i.variantId === variantId);
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + quantity);
  } else {
    items.push({ variantId, productSlug: p.slug, quantity });
  }
  writeCart(items);
  return refreshCart();
}

export async function setQty(itemId, quantity) {
  const items = readCart();
  const item = items.find((i) => i.variantId === itemId);
  if (!item) return refreshCart();
  if (quantity <= 0) {
    writeCart(items.filter((i) => i.variantId !== itemId));
  } else {
    item.quantity = Math.min(99, quantity);
    writeCart(items);
  }
  return refreshCart();
}

export async function removeItem(itemId) {
  const items = readCart().filter((i) => i.variantId !== itemId);
  writeCart(items);
  return refreshCart();
}

export async function applyCoupon(code) {
  // No server-side coupons; just show a message.
  throw new Error("Coupons are not available in this demo.");
}

export async function removeCoupon() {
  return refreshCart();
}

// ---- user (always null — no auth) --------------------------------------------

export async function loadUser() {
  state.user = null;
}

export async function signIn() {
  state.user = null;
  emit("user");
}

export async function register() {
  state.user = null;
  emit("user");
}

export async function signOut() {
  state.user = null;
  state.wished = {};
  await refreshCart();
  emit("wishlist");
  emit("user");
}

// ---- wishlist (localStorage only) --------------------------------------------

export async function loadWishlist() {
  state.wished = { ...(readLocal().wished || {}) };
  emit("wishlist");
}

export async function toggleWish(slug) {
  const on_ = !state.wished[slug];
  if (on_) state.wished[slug] = true; else delete state.wished[slug];
  emit("wishlist");
  writeLocal({ wished: state.wished });
  return on_;
}

export const wishCount = () => Object.keys(state.wished).filter((s) => state.bySlug[s]).length;