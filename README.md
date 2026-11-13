# Blitzcrank — Gaming Gear Store

Storefront (`index.html`, `styles.css`, `js/`) + SQLite database + JSON API.
No npm packages: it uses Node's built-in `node:sqlite`, so you need **Node.js 22.13 or newer**.

## Run it

```bash
npm start            # http://localhost:3000
```

The first start creates `data/blitzcrank.db`, fills it with the starter catalog and
prints an **admin login + password once**. Save that password.
To pick your own: `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm start` (first run only).

| Command            | What it does                                              |
|--------------------|-----------------------------------------------------------|
| `npm start`        | Run the shop + API (`PORT`, `DB_PATH` env vars optional)  |
| `npm test`         | End-to-end API tests on a throwaway in-memory database    |
| `npm run db:seed`  | Seed an empty database                                    |
| `npm run db:reset` | **Delete** the database and re-seed from scratch          |

## Project layout

```
index.html, styles.css   the storefront page
js/main.js           entry point: loads data, wires links, search, filters, header counters
js/store.js          shared state (products, cart, user, wishlist) + API actions
js/home.js           nav + mega menus, hero carousel, category tiles, brands, newsletter
js/cards.js          product cards, rails, catalog grid filtering/sorting
js/product.js        product quick view (variants, stock, specs, reviews)
js/cart.js           cart drawer, coupon, shipping estimate, checkout, confirmation
js/account.js        sign in/register, my orders, order tracking, shipping rates
js/art.js, util.js   product line art; API/formatting/dialog helpers
db/schema.sql        all tables, indexes, triggers and report views
db/index.js          opens the DB, applies the schema, runs migrations, transaction helper
db/seed.js           starter catalog, warehouses, stock, shipping rates, coupons, banners, admin user
server/index.js      entry point
server/app.js        routing, static files, error handling
server/lib/          auth (scrypt + sessions), cart & pricing, checkout/orders, validation
server/routes/       catalog, auth, shop (cart/checkout/orders), account, admin
test/api.test.js     end-to-end tests
```

## Database

Money is stored as **integer centavos** (`₱1,499.50` → `149950`). Times are UTC.

| Area | Tables |
|---|---|
| Accounts | `users` (role: customer / staff / admin), `sessions`, `addresses` |
| Catalog | `categories` (tree: components → gpus…), `brands`, `products`, `product_variants` (SKU, price, options like color/switch/capacity), `product_specs` (socket, DPI, refresh rate… filterable), `product_images` |
| Inventory | `warehouses`, `inventory` (stock per variant per warehouse), `inventory_movements` (audit log of every change) |
| Cart | `carts` (user or guest cookie), `cart_items`, `coupons`, `shipping_rates` |
| Orders | `orders` (status, payment status, totals, **address snapshot**), `order_items` (**price/name/SKU at time of purchase**), `coupon_redemptions` |
| Payments | `payments` — provider + provider reference only. **No card numbers are ever stored.** |
| Fulfillment | `shipments` (carrier, tracking number, status) |
| Storefront | `promo_banners` (homepage hero slides), `newsletter_subscribers`; pre-orders are `products.is_preorder` + `release_date` |
| Community | `reviews` (1–5 stars, verified-purchase flag; product rating kept in sync by triggers), `wishlist_items`, `saved_builds` + `saved_build_items` |
| Reports (views) | `v_sales_daily`, `v_low_stock`, `v_popular_products`, `v_abandoned_carts`, `v_variant_stock` |

Overselling is prevented twice: checkout checks stock inside a locked transaction, and the
database itself rejects any stock level below zero (`CHECK (quantity_on_hand >= 0)`).
Products that have been ordered can't be hard-deleted. They are archived instead, so order history stays intact.

**Changing the schema:** `schema.sql` always describes the full current schema (new databases get it directly).
For existing databases, append a step to `MIGRATIONS` in `db/index.js`. Each runs once, tracked by `PRAGMA user_version`.

## API

All bodies are JSON. Auth uses an HttpOnly cookie set by login/register.

**Catalog:** `GET /api/categories` · `GET /api/products?category=&q=&brand=&sort=&sale=1&preorder=1&limit=&spec.socket=AM5&min.refresh_rate_hz=144` · `GET /api/products/:slug` · `GET /api/brands` · `GET /api/banners` · `GET /api/shipping-rates` · `POST /api/newsletter {email}`

**Auth:** `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET|PATCH /api/auth/me`

**Cart:** `GET /api/cart?region=Luzon` · `POST /api/cart/items {variantId, quantity}` · `PATCH|DELETE /api/cart/items/:id` · `POST|DELETE /api/cart/coupon {code}`

**Checkout & orders:** `POST /api/checkout {address | addressId, paymentProvider, email (guests)}` · `GET /api/orders` · `GET /api/orders/:number` · `POST /api/orders/:number/cancel` · `POST /api/orders/lookup {orderNumber, email}` (guest tracking)

**Account:** `GET|POST /api/addresses` · `DELETE /api/addresses/:id` · `GET|POST /api/wishlist` · `DELETE /api/wishlist/:productId` · `POST /api/products/:slug/reviews` · `GET|POST /api/builds` · `GET|PUT|DELETE /api/builds/:id` (builds report socket / memory / PSU compatibility warnings)

**Admin (staff/admin only):**
- Products: `GET|POST /api/admin/products` · `PATCH|DELETE /api/admin/products/:id` · `POST /api/admin/products/:id/variants` · `PATCH /api/admin/variants/:id` · `POST /api/admin/products/:id/images` · `POST /api/admin/categories`
- Inventory: `GET /api/admin/inventory?variantId=` · `POST /api/admin/inventory/adjust`
- Orders: `GET /api/admin/orders` · `GET|PATCH /api/admin/orders/:id` · `PATCH /api/admin/payments/:id` · `POST /api/admin/orders/:id/shipments` · `PATCH /api/admin/shipments/:id`
- Storefront: `GET|POST /api/admin/banners` · `PATCH|DELETE /api/admin/banners/:id` · `GET /api/admin/newsletter`
- Other: `GET|POST /api/admin/coupons` · `PATCH /api/admin/coupons/:id` · `PATCH /api/admin/reviews/:id` · `GET /api/admin/users` · `PATCH /api/admin/users/:id` (admin only)
- Reports: `GET /api/admin/reports/summary | sales?days=30 | low-stock | popular | abandoned-carts`

## Payments (next step)

Checkout creates a `pending` payment. Recording the result is currently manual
(`PATCH /api/admin/payments/:id`). To take real payments, create the Stripe PaymentIntent /
PayPal order in `server/lib/orders.js` → `placeOrder`, and add a webhook route that **verifies the
provider's signature** before marking the payment `succeeded`.
