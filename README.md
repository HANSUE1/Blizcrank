# Blitzcrank — Gaming Gear Store

A storefront for gaming laptops, PC components, peripherals and consoles. A small Node server
reads the catalog from MongoDB; product photos and look text come from `js/catalog.json`. The cart, wishlist and order history are persisted in `localStorage`.

## Run it

1. Create `.env` in the folder **above** this one, so no static file server can expose it:

   ```
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/blitzcrank
   ```

2. Install and start:

   ```bash
   npm install
   npm run dev
   ```

Then open http://localhost:3000. A static file server alone will not work, because the page
loads its catalog from `/api/catalog`.

## Project layout

```
index.html            the storefront page
styles.css            all styles
js/main.js            entry point: loads catalog, wires links, search, filters, header counters
js/store.js           shared state (products, cart, user, wishlist) + client-side actions
server.js             serves the public files and /api/catalog
db/catalog.js         shapes MongoDB documents for the storefront
js/catalog.json       photos, look text and variant ids (other fields come from MongoDB)
js/home.js            nav + mega menus, hero carousel, category tiles, brands, newsletter
js/cards.js           product cards, rails, catalog grid filtering/sorting
js/product.js         product quick view (variants, stock, specs)
js/cart.js            cart drawer, shipping estimate, checkout, confirmation
js/account.js         order history, order tracking, shipping rates
js/art.js, util.js    product line art; formatting/dialog helpers
```

## What works

- Browse the full product catalog, categories and brands
- Search, filter and sort products client-side
- Product quick view with variants, specs and stock
- Shopping cart with quantity management (persisted in `localStorage`)
- Wishlist (persisted in `localStorage`)
- Shipping region selection and cost estimation
- Demo checkout that generates a local order record
- Order history and tracking (from `localStorage`)

## What does not work (requires a backend)

- User accounts and authentication
- Real payment processing
- Server-side inventory management and stock validation
- Admin panel
- Newsletter subscription storage (stored locally only)