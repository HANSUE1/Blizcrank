# Blitzcrank — Gaming Gear Store

A storefront for gaming laptops, PC components, peripherals and consoles. Built on the
MERN stack: MongoDB Atlas, an Express API, a React admin page and Node.js. The storefront is plain
JavaScript and reads the catalog from the API; product photos and look text come from `js/catalog.json`. The cart, wishlist and order history are persisted in `localStorage`.

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

   `npm run dev` builds the admin page first. Use `npm start` to skip the build, and `npm test` to run the tests.

3. Optional, for a new empty database: fill it with the sample catalog.

   ```bash
   npm run seed
   ```

   It stops if the database already has data. `npm run seed -- --reset` deletes the products, categories, brands,
   banners and shipping rates first, including products added on the admin page.

Then open http://localhost:3000 for the store, or http://localhost:3000/admin/ to manage products. A static file server alone will not work, because the page
loads its catalog from `/api/catalog`.

## Project layout

```
index.html            the storefront page
styles.css            all styles
js/main.js            entry point: loads catalog, wires links, search, filters, header counters
js/store.js           shared state (products, cart, orders, wishlist) + client-side actions
server.js             Express app: public files, admin page, API routes, error handling
routes/               Express routers: /api/catalog and /api/products
controllers/          read and write MongoDB through the models
admin/                React admin page (built with Vite into admin/dist)
db/catalog.js         shapes MongoDB documents for the storefront
db/seeds.js           fills an empty database from js/catalog.json
js/catalog.json       photos, look text and variant ids (other fields come from MongoDB)
js/home.js            nav + mega menus, hero carousel, category tiles, brands, newsletter
js/cards.js           product cards, rails, catalog grid filtering/sorting
js/product.js         product quick view (variants, stock, specs)
js/cart.js            cart drawer, shipping estimate, checkout, confirmation
js/account.js         order history, order tracking, shipping rates
js/art.js, util.js    product line art and icons; formatting/dialog helpers
*.test.js             tests for the server and the storefront logic
```

## What works

- Create, read, update and delete products on the admin page (saved to MongoDB)
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
- Server-side stock validation (the cart checks stock in the browser only)
- Coupons
- Admin login: until there is one, the product API only answers requests from this computer
- Newsletter subscription storage (stored locally only)