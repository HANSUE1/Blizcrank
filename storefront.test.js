import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { state, addToCart, setQty, refreshCart, setRegion, placeOrder, readOrders } from "./js/store.js";
import { fmtDate } from "./js/util.js";

const saved = new Map();
let full = false;
globalThis.localStorage = {
  getItem: (k) => saved.get(k) ?? null,
  setItem: (k, v) => { if (full) throw new Error("QuotaExceededError"); saved.set(k, v); },
};

beforeEach(() => {
  saved.clear();
  full = false;
  const product = {
    slug: "pad", name: "Pad", images: [], card: {},
    variants: [{ id: 1, name: "Standard", priceCents: 1000, stock: 4, inStock: true }, { id: 2, name: "Gold", priceCents: 2000, stock: 0, inStock: false }],
  };
  Object.assign(state, {
    products: [product], bySlug: { pad: product }, region: null,
    rates: [{ region: "Luzon", feeCents: 500, freeOverCents: 3000, etaDays: [1, 2] }],
  });
  refreshCart();
});

test("dates accept a calendar day and an ISO timestamp", () => {
  assert.match(fmtDate("2026-12-12"), /Dec 12, 2026/);
  assert.match(fmtDate("2026-12-12T12:00:00.000Z"), /Dec 1[123], 2026/);
  assert.equal(fmtDate(null), "");
});

test("the cart never holds more than the stock", () => {
  addToCart(1, 3);
  assert.throws(() => addToCart(1, 2), /Only 4 available, and 3 already/);
  assert.throws(() => addToCart(2), /Only 0 available/);
  assert.equal(state.cart.itemCount, 3);
  setQty(1, 0);
  assert.equal(state.cart.items.length, 0);
});

test("a variant removed from the store is flagged, not replaced by another one", () => {
  saved.set("blitzcrank-cart", JSON.stringify([{ variantId: "gone", productSlug: "pad", quantity: 1 }, { variantId: 1, productSlug: "gone", quantity: 1 }]));
  refreshCart();
  const [line, ...rest] = state.cart.items;
  assert.deepEqual([line.available, line.inStock, line.lineTotalCents, rest.length, state.cart.subtotalCents], [false, false, 0, 0, 0]);
});

test("shipping is free from the region's threshold", () => {
  addToCart(1, 2);
  assert.equal(state.cart.shippingCents, null);
  setRegion("Luzon");
  assert.deepEqual([state.cart.shippingCents, state.cart.totalCents], [500, 2500]);
  setQty(1, 3);
  assert.deepEqual([state.cart.shippingCents, state.cart.totalCents], [0, 3000]);
});

test("an order that cannot be stored leaves the cart alone", () => {
  addToCart(1);
  full = true;
  assert.throws(() => placeOrder({ orderNumber: "BZ-1" }), /cart is unchanged/);
  assert.equal(state.cart.itemCount, 1);
  full = false;
  placeOrder({ orderNumber: "BZ-1" });
  assert.deepEqual([readOrders().length, state.cart.itemCount], [1, 0]);
});
