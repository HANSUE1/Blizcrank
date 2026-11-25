// App state + actions. Components subscribe with on("cart" | "wishlist", fn).
// Catalog from the server (MongoDB); cart, wishlist and orders in localStorage.

export const state = {
  products: [],        // product cards from api/catalog
  bySlug: {},
  categories: [],      // tree from api/catalog
  categoryName: {},    // slug -> name (incl. children)
  banners: [],
  brands: [],
  rates: [],           // shipping rates
  cart: null,          // client-side cart quote
  region: null,        // chosen shipping region
  wished: {},          // slug -> true
};

const listeners = {};
export const on = (evt, fn) => (listeners[evt] = listeners[evt] || []).push(fn);
const emit = (evt) => (listeners[evt] || []).forEach((fn) => fn());

// ---- localStorage ------------------------------------------------------------

const PREFS_KEY = "blitzcrank-state";
const CART_KEY = "blitzcrank-cart";
const ORDERS_KEY = "blitzcrank-orders";

export function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

// False when the browser blocks storage or it is full.
export function writeStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const readPrefs = () => readStored(PREFS_KEY, {});
const writePrefs = (patch) => writeStored(PREFS_KEY, { ...readPrefs(), ...patch });

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
  const saved = readPrefs().region;
  state.region = state.rates.some((x) => x.region === saved) ? saved : null;
}

// ---- cart ----------------------------------------------------------------------

export const MAX_QTY = 99;

const readCart = () => readStored(CART_KEY, []);

function writeCart(items) {
  if (!writeStored(CART_KEY, items)) throw new Error("Your browser is blocking storage, so the cart cannot be saved.");
}

// Stands in for a variant that was removed from the store after it went in the cart.
const REMOVED_VARIANT = { name: "Option no longer sold", priceCents: 0, stock: 0, inStock: false };

function computeQuote(saved) {
  const items = saved.flatMap((ci) => {
    const p = state.bySlug[ci.productSlug];
    if (!p) return [];
    const found = p.variants.find((x) => x.id === ci.variantId);
    const v = found ?? REMOVED_VARIANT;
    return {
      variantId: ci.variantId,
      productName: p.name,
      variantName: v.name,
      quantity: ci.quantity,
      lineTotalCents: v.priceCents * ci.quantity,
      stock: v.stock,
      available: Boolean(found),
      inStock: v.inStock && v.stock >= ci.quantity,
      card: p.card,
      imageUrl: p.images.find((i) => !i.variantId || i.variantId === ci.variantId)?.thumb || null,
    };
  });

  const subtotalCents = items.reduce((s, i) => s + i.lineTotalCents, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  const shipping = state.rates.find((r) => r.region === state.region) ?? null;
  let shippingCents = null;
  if (shipping) {
    const free = shipping.freeOverCents !== null && subtotalCents >= shipping.freeOverCents;
    shippingCents = !items.length || free ? 0 : shipping.feeCents;
  }

  const totalCents = subtotalCents + (shippingCents || 0);
  const taxCents = Math.round((totalCents * 12) / 112); // prices already include 12% VAT
  return { items, itemCount, subtotalCents, shipping, shippingCents, taxCents, totalCents };
}

export function refreshCart() {
  state.cart = computeQuote(readCart());
  emit("cart");
}

export function setRegion(region) {
  state.region = region || null;
  writePrefs({ region: state.region });
  refreshCart();
}

export function addToCart(variantId, quantity = 1) {
  const product = state.products.find((x) => x.variants.some((v) => v.id === variantId));
  if (!product) throw new Error("Product not found");
  const items = readCart();
  const existing = items.find((i) => i.variantId === variantId);
  const inCart = existing?.quantity ?? 0;
  const max = Math.min(MAX_QTY, product.variants.find((v) => v.id === variantId).stock);
  if (inCart + quantity > max) {
    throw new Error(`Only ${max} available${inCart ? `, and ${inCart} already in your cart` : ""}.`);
  }
  if (existing) existing.quantity += quantity;
  else items.push({ variantId, productSlug: product.slug, quantity });
  writeCart(items);
  refreshCart();
}

export function setQty(variantId, quantity) {
  const items = readCart();
  const item = items.find((i) => i.variantId === variantId);
  if (item) {
    item.quantity = Math.min(MAX_QTY, quantity);
    writeCart(items.filter((i) => i.quantity > 0));
  }
  refreshCart();
}

export const removeItem = (variantId) => setQty(variantId, 0);

// ---- orders --------------------------------------------------------------------

export const readOrders = () => readStored(ORDERS_KEY, []);

// The cart is emptied only after the order is safely stored.
export function placeOrder(order) {
  if (!writeStored(ORDERS_KEY, [...readOrders(), order])) {
    throw new Error("Your browser is blocking storage, so the order could not be saved. Your cart is unchanged.");
  }
  writeCart([]);
  refreshCart();
}

// ---- wishlist ------------------------------------------------------------------

export function loadWishlist() {
  state.wished = { ...readPrefs().wished };
  emit("wishlist");
}

export function toggleWish(slug) {
  const added = !state.wished[slug];
  if (added) state.wished[slug] = true; else delete state.wished[slug];
  writePrefs({ wished: state.wished });
  emit("wishlist");
  return added;
}

export const wishCount = () => Object.keys(state.wished).filter((s) => state.bySlug[s]).length;
