# Blitzcrank — MongoDB Database Schema

This document describes the MongoDB schema for the Blitzcrank gaming gear storefront. It is **database structure only** — tables/collections, relationships, data types, indexes and validation. No frontend or backend connections are established here.

The implementation lives under `db/` and uses **Mongoose** (Node.js ODM for MongoDB). Every collection is a separate model file in `db/models/`, wired together in `db/index.js`. Seed data derived from `js/catalog.json` lives in `db/seeds.js`.

---

## Collections

| Collection | Purpose |
|------------|---------|
| `users` | Customer accounts (email/password auth ready, admin role) |
| `products` | Catalog products (variants, specs, images embedded) |
| `categories` | Hierarchical category tree |
| `brands` | Product brands |
| `banners` | Hero carousel slides |
| `shippingRates` | Per-region shipping cost & ETA |
| `reviews` | Product reviews (separate — unbounded per product) |
| `carts` | Shopping carts (user-linked or guest session) |
| `orders` | Placed orders (immutable snapshot) |
| `newsletterSubscribers` | Newsletter email signups |

---

## 1. users

Replaces the always-null `user` in `store.js`. Designed to support email/password auth and a future admin role.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `email` | String | ✅ | unique | lowercased, max 254 |
| `passwordHash` | String | ✅ | | bcrypt/argon2 hash |
| `firstName` | String | | | max 100 |
| `lastName` | String | | | max 100 |
| `phone` | String | | | max 30 |
| `studentIdNumber` | String | | | max 50 |
| `course` | String | | | max 100 |
| `role` | String | ✅ (default `customer`) | yes | enum: `customer` \| `admin` \| `student` |
| `emailVerified` | Boolean | ✅ (default `false`) | | |
| `addresses[]` | Embedded doc | | | see Address sub-schema |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**Address sub-schema (embedded, one-to-many)**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_id` | ObjectId | ✅ | per-address id |
| `label` | String | | "Home" / "Work", max 50 |
| `recipientName` | String | ✅ | max 120 |
| `phone` | String | | max 30 |
| `line1` | String | ✅ | max 200 |
| `barangay` | String | | max 120 |
| `city` | String | ✅ | max 120 |
| `province` | String | ✅ | max 120 |
| `postalCode` | String | ✅ | max 12 |
| `region` | String | ✅ | matches a `shippingRates.region` |
| `isDefault` | Boolean | ✅ (default `false`) | |

**Indexes:** `{ email: 1 }` unique, `{ role: 1, email: 1 }`

---

## 2. products

Core catalog entity. **Variants, specs and images are embedded** because they are always read together with the product and each product has few variants (1–3 in the current catalog). Reviews live in their own collection because they can grow without bound per product.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `slug` | String | ✅ | unique | lowercased, max 150 |
| `name` | String | ✅ | | max 255 |
| `description` | String | | | |
| `brandId` | ObjectId → brands | | yes | many-to-one |
| `brandName` | String | | | denormalized for fast reads |
| `categoryId` | ObjectId → categories | | yes | many-to-one |
| `categorySlug` | String | | yes | denormalized |
| `topCategoryId` | ObjectId → categories | | yes | |
| `topCategorySlug` | String | | yes | denormalized |
| `badge` | String | | yes | enum: null, `hot`, `sale`, `new`, `preorder` |
| `badgeLabel` | String | | | max 60 |
| `isPreorder` | Boolean | ✅ | yes | |
| `releaseDate` | Date | | | pre-order ship date |
| `priceCents` | Number | ✅ | | default variant price, cents |
| `compareAtCents` | Number | | | strikethrough price, cents |
| `fromPriceCents` | Number | ✅ | | lowest variant price |
| `variantCount` | Number | ✅ | | |
| `createdAt` | Date | ✅ | yes (-1) | |
| `rating` | Number | ✅ (default 0) | | 0–5 |
| `reviewCount` | Number | ✅ (default 0) | | |
| `stock` | Number | ✅ (default 0) | | aggregated across variants |
| `inStock` | Boolean | ✅ | yes | |
| `defaultVariantId` | ObjectId | | | points to embedded variant `_id` |
| `imageUrl` | String | | | |
| `card` | Embedded | | | `{ art, color, bg }` |
| `variants[]` | Embedded | | | see Variant sub-schema |
| `specs[]` | Embedded | | | `{ key, label, value, unit }` |
| `images[]` | Embedded | | | `{ url, alt, isPrimary, sortOrder }` |
| `isActive` | Boolean | ✅ | yes | soft-delete flag |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**Variant sub-schema (embedded, one-to-many within product)**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_id` | ObjectId | ✅ | per-variant id |
| `sku` | String | ✅ | uppercase, max 100; unique across all products |
| `name` | String | ✅ | max 120 |
| `options` | Mixed | ✅ (default `{}`) | key–value, e.g. `{ ram: "16GB" }` |
| `priceCents` | Number | ✅ | min 0 |
| `compareAtCents` | Number | | min 0, nullable |
| `isDefault` | Boolean | ✅ | |
| `stock` | Number | ✅ | min 0 |
| `inStock` | Boolean | ✅ | |

**Indexes:** `{ slug: 1 }` unique, `{ brandId: 1 }`, `{ categoryId: 1 }`, `{ topCategoryId: 1 }`, `{ isPreorder: 1 }`, `{ inStock: 1 }`, `{ badge: 1 }`, `{ createdAt: -1 }`, `{ "variants.sku": 1 }` unique (partial). Duplicate SKUs within one product rejected by pre-save hook.

---

## 3. categories

Hierarchical category tree (e.g. Components > Graphics Cards). `parentId` forms the many-to-one self relationship; `level` is denormalized so depth queries are cheap without recursive `$graphLookup`.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `slug` | String | ✅ | unique | lowercased, max 100 |
| `name` | String | ✅ | | max 120 |
| `description` | String | | | max 500 |
| `parentId` | ObjectId → categories | | yes | null = top level |
| `level` | Number | ✅ (default 0) | yes | 0 = top-level |
| `productCount` | Number | ✅ (default 0) | | denormalized counter |
| `sortOrder` | Number | ✅ (default 0) | | |
| `isActive` | Boolean | ✅ | | soft-delete flag |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**Indexes:** `{ slug: 1 }` unique, `{ parentId: 1 }`, `{ level: 1 }`

**Validation:** A category cannot be its own parent.

---

## 4. brands

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `slug` | String | ✅ | unique | lowercased |
| `name` | String | ✅ | | max 120 |
| `productCount` | Number | ✅ (default 0) | | denormalized counter |
| `logoUrl` | String | | | max 500 |
| `isActive` | Boolean | ✅ | | |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**Indexes:** `{ slug: 1 }` unique

---

## 5. banners

Hero carousel slides. Replaces the static `banners` array in `catalog.json`.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `eyebrow` | String | | | max 120 |
| `title` | String | ✅ | | max 200 |
| `subtitle` | String | | | max 300 |
| `ctaLabel` | String | | | max 80 |
| `ctaLink` | String | | | max 300 |
| `imageUrl` | String | | | nullable |
| `card` | Embedded | | | `{ art, color, bg }` |
| `isActive` | Boolean | ✅ | yes | |
| `sortOrder` | Number | ✅ | | |
| `startDate`, `endDate` | Date | | | scheduling window |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**Indexes:** `{ isActive: 1, sortOrder: 1 }`

---

## 6. shippingRates

Per-region shipping cost & delivery estimate. Replaces the static `rates` array in `catalog.json`.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `region` | String | ✅ | unique | max 100, e.g. "Metro Manila" |
| `feeCents` | Number | ✅ | | min 0 |
| `freeOverCents` | Number | | | nullable free-shipping threshold |
| `etaDays` | [Number] | ✅ | | length 2, e.g. `[1, 3]` |
| `isActive` | Boolean | ✅ | | |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**Indexes:** `{ region: 1 }` unique

---

## 7. reviews

Product reviews. Separate collection because reviews can grow without bound per product and are moderated independently.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `productId` | ObjectId → products | ✅ | yes | many-to-one |
| `userId` | ObjectId → users | ✅ | yes | many-to-one |
| `orderId` | ObjectId → orders | | yes | verified-purchase link |
| `rating` | Number | ✅ | | enum 1–5 |
| `title` | String | | | max 140 |
| `body` | String | | | max 2000 |
| `isVerifiedPurchase` | Boolean | ✅ (default `false`) | | |
| `isApproved` | Boolean | ✅ (default `true`) | | moderation flag |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**Indexes:** `{ productId: 1, userId: 1 }` unique, `{ productId: 1, isApproved: 1, createdAt: -1 }`

**Constraint:** One review per user per product.

---

## 8. carts

Shopping carts. Linked to a `user` when signed in, otherwise to a guest `sessionId`. TTL index expires abandoned carts automatically.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `userId` | ObjectId → users | | unique* | null = guest cart |
| `sessionId` | String | | unique* | guest cart identifier |
| `items[]` | Embedded | | | see CartItem sub-schema |
| `region` | String | | | shipping rate region |
| `couponCode` | String | | | |
| `discountCents` | Number | ✅ (default 0) | | min 0 |
| `shippingCents` | Number | | | nullable until region chosen |
| `taxCents` | Number | ✅ (default 0) | | min 0 |
| `subtotalCents` | Number | ✅ (default 0) | | min 0 |
| `totalCents` | Number | ✅ (default 0) | | min 0 |
| `itemCount` | Number | ✅ (default 0) | | min 0 |
| `expiresAt` | Date | | TTL | cart auto-deletion |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**CartItem sub-schema (embedded)**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `variantId` | ObjectId | ✅ | |
| `productId` | ObjectId | ✅ | |
| `productSlug` | String | ✅ | |
| `variantName` | String | ✅ | |
| `sku` | String | ✅ | |
| `quantity` | Number | ✅ | 1–99 |
| `unitPriceCents` | Number | ✅ | min 0 |
| `lineTotalCents` | Number | ✅ | min 0 |

**Indexes:** `{ userId: 1 }` unique (non-null partial), `{ sessionId: 1 }` unique (non-null partial), `{ expiresAt: 1 }` TTL

---

## 9. orders

Placed order. A complete, self-contained, immutable snapshot of the cart at checkout: items, shipping address, financial breakdown, payments and shipments are all embedded.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `orderNumber` | String | ✅ | unique | e.g. `BZ-4m8f9x2`, uppercased |
| `userId` | ObjectId → users | | yes | null = guest order |
| `email` | String | ✅ | yes | lowercased |
| `status` | String | ✅ (default `pending`) | yes | order lifecycle enum |
| `paymentStatus` | String | ✅ (default `unpaid`) | yes | payment lifecycle enum |
| `placedAt` | Date | ✅ | yes (-1) | order time |
| `updatedAt` | Date | ✅ | | auto-updated on save |
| `items[]` | Embedded | | | see OrderItem sub-schema |
| `shippingAddress` | Embedded | ✅ | | snapshot of address |
| `region` | String | ✅ | | shipping rate region |
| `itemCount` | Number | ✅ (default 0) | | min 0 |
| `subtotalCents` | Number | ✅ | | min 0 |
| `discountCents` | Number | ✅ (default 0) | | min 0 |
| `shippingCents` | Number | ✅ | | min 0 |
| `taxCents` | Number | ✅ | | min 0 |
| `totalCents` | Number | ✅ | | min 0 |
| `couponCode` | String | | | |
| `notes` | String | | | max 500 |
| `payments[]` | Embedded | | | see Payment sub-schema |
| `shipments[]` | Embedded | | | see Shipment sub-schema |

**OrderItem sub-schema (embedded)**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `productId` | ObjectId | ✅ | |
| `productSlug` | String | ✅ | |
| `productName` | String | ✅ | |
| `variantId` | ObjectId | ✅ | |
| `variantName` | String | ✅ | |
| `sku` | String | ✅ | |
| `options` | Mixed | ✅ (default `{}`) | |
| `quantity` | Number | ✅ | min 1 |
| `unitPriceCents` | Number | ✅ | min 0 |
| `lineTotalCents` | Number | ✅ | min 0 |

**Payment sub-schema (embedded)**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_id` | ObjectId | ✅ | per-payment id |
| `provider` | String | ✅ | enum: `cod`, `gcash`, `maya`, `stripe`, `paypal` |
| `amountCents` | Number | ✅ | min 0 |
| `status` | String | ✅ (default `pending`) | enum: `pending`, `paid`, `failed`, `refunded` |
| `transactionId` | String | | nullable |
| `paidAt` | Date | | |

**Shipment sub-schema (embedded)**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `_id` | ObjectId | ✅ | per-shipment id |
| `carrier` | String | | |
| `trackingNumber` | String | | |
| `status` | String | ✅ (default `pending`) | enum: `pending`, `shipped`, `in_transit`, `out_for_delivery`, `delivered`, `failed`, `returned` |
| `shippedAt` | Date | | |
| `deliveredAt` | Date | | |

**ShippingAddress sub-schema (embedded)**

`recipientName`, `phone`, `line1`, `barangay`, `city`, `province`, `postalCode`, `region` (all strings, required except barangay).

**Indexes:** `{ orderNumber: 1 }` unique, `{ userId: 1, placedAt: -1 }`, `{ email: 1, placedAt: -1 }`, `{ status: 1, placedAt: -1 }`

**Status enums**
- `status`: `pending`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded`
- `paymentStatus`: `unpaid`, `paid`, `partially_paid`, `refunded`
- Payment provider: `cod` (Cash on delivery), `gcash`, `maya`, `stripe`, `paypal`

---

## 10. newsletterSubscribers

Email newsletter signups. Replaces localStorage persistence.

**Fields**

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | ✅ | PK | |
| `email` | String | ✅ | unique | lowercased, max 254 |
| `subscribedAt` | Date | ✅ | | |
| `isActive` | Boolean | ✅ (default `true`) | | unsubscribe flag |
| `createdAt`, `updatedAt` | Date | ✅ | | timestamps |

**Indexes:** `{ email: 1 }` unique

---

## Relationships (summary)

```
users 1:N orders          (userId on Order; null for guest orders)
users 1:N carts           (userId on Cart; one active cart per user)
users 1:N reviews         (userId on Review)
users 1:N addresses       (embedded in users)
categories 1:N categories (parentId self-reference, tree)
categories 1:N products   (categoryId / topCategoryId on Product)
brands 1:N products       (brandId on Product)
products 1:N reviews      (productId on Review)
orders 1:N payments       (embedded in orders)
orders 1:N shipments      (embedded in orders)
products 1:N variants     (embedded in products)
products 1:N specs        (embedded in products)
products 1:N images       (embedded in products)
carts 1:N cartItems       (embedded in carts)
```

Denormalization used for read performance: `brandName`, `categorySlug`, `topCategorySlug` on Product; `productName`/`sku` snapshots in Order items; shipping address embedded in Order.

---

## Data types (BSON / Mongoose)

- `String` — text fields, slugs, emails
- `Number` — integer cents for all monetary values (matches the existing frontend), counts, ratings
- `Date` — ISO-8601 timestamps
- `ObjectId` — primary keys and references
- `Boolean` — flags
- `Array` — embedded arrays, `etaDays` tuple
- `Mixed` — free-form `options` key–value objects
- Embedded documents — variants, specs, images, addresses, cart items, order items, payments, shipments

---

## Files

```
db/
  index.js          Mongoose connection + model registry
  models/
    User.js
    Category.js
    Brand.js
    Product.js
    Banner.js
    ShippingRate.js
    Review.js
    Cart.js
    Order.js
    NewsletterSubscriber.js
  seeds.js          Seed data derived from js/catalog.json
SCHEMA.md           This document
```

### Running the seed

```bash
# Requires a running MongoDB instance (local: mongodb://127.0.0.1:27017/blitzcrank)
MONGODB_URI=mongodb://127.0.0.1:27017/blitzcrank node --input-type=module db/seeds.js
```

The seed is idempotent: it clears `products`, `categories`, `brands`, `banners` and `shippingRates` before inserting, so it can be re-run against a fresh or existing dev database.

---

## Notes & deliberate trade-offs

1. **No frontend connections** — this layer is pure data. Controllers/services would sit between this schema and any API.
2. **Embedded vs referenced** — variants/specs/images are embedded in `products` (read together, small cardinality). `reviews` is separate (unbounded growth, moderated independently). Order `payments`/`shipments` and the shipping address are embedded in `orders` so each order is a complete, immutable snapshot.
3. **Money** — stored as integer `cents` (e.g. `149995` = ₱1,499.95), matching the existing frontend code. No floating point for currency.
4. **SKU uniqueness** — enforced across products via a unique partial index on `variants.sku` and by a pre-save hook for duplicates within one product.
5. **Guest checkout** — `orders.userId` and `carts.userId` are nullable to support guest purchases (current frontend behavior).
6. **Cart TTL** — `carts.expiresAt` uses a MongoDB TTL index to automatically purge abandoned guest carts.
7. **Auth scope** — `users` supports email/password and roles, but password hashing, token issuance and route protection are intentionally outside this schema's scope.
