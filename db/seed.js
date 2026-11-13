"use strict";
// Starter data: catalog, warehouses/stock, shipping rates, coupons, homepage
// banners and an admin account.
//   npm run db:seed    -> seeds an empty database (skips if products exist)
//   npm run db:reset   -> deletes the database file and seeds from scratch
//
// seedCatalog() only ADDS rows that are missing (matched by slug / code / title),
// so it is also used by a migration to top up older databases safely.

const fs = require("node:fs");
const crypto = require("node:crypto");
const { openDatabase, transaction, DEFAULT_PATH } = require("./index");
const { hashPassword } = require("../server/lib/auth");

const peso = (n) => Math.round(n * 100); // pesos -> centavos

const CATEGORIES = [
  // [slug, name, parentSlug, sort]
  ["laptops", "Laptops", null, 1],
  ["components", "Components", null, 2],
  ["peripherals", "Peripherals", null, 3],
  ["consoles", "Consoles", null, 4],
  ["gpus", "Graphics Cards", "components", 1],
  ["cpus", "Processors", "components", 2],
  ["motherboards", "Motherboards", "components", 3],
  ["memory", "Memory", "components", 4],
  ["storage", "Storage", "components", 5],
  ["power-supplies", "Power Supplies", "components", 6],
  ["keyboards", "Keyboards", "peripherals", 1],
  ["mice", "Mice", "peripherals", 2],
  ["headsets", "Headsets", "peripherals", 3],
  ["monitors", "Monitors", "peripherals", 4],
  ["handhelds", "Handheld PCs", "consoles", 1],
  ["controllers", "Controllers", "consoles", 2],
];

const WAREHOUSES = [
  { code: "MNL-01", name: "Manila Main Warehouse", city: "Pasig", priority: 1 },
  { code: "CEB-01", name: "Cebu Hub", city: "Cebu City", priority: 2 },
];

// spec: [key, label, value, unit?] — numeric values also get num_value.
// rating: [average, count] carried over from the original storefront design
// (real reviews recalculate it); new products start with no rating.
// stock: [MNL-01, CEB-01]. For pre-orders, stock = reservation slots.
const PRODUCTS = [
  {
    slug: "rog-strix-scar-16", brand: "Asus ROG", category: "laptops", badge: "hot",
    name: "ROG Strix Scar 16 (2025) — RTX 5080, 240Hz OLED",
    description: "Flagship 16-inch gaming laptop with RTX 5080 graphics and a 240Hz OLED panel.",
    rating: [4.9, 312],
    art: ["laptop", "#8fa7d4", "linear-gradient(140deg,#2a3550 0%,#141c30 55%,#0d1322 100%)"],
    specs: [["gpu", "GPU", "RTX 5080"], ["screen_size_in", "Screen size", "16", "in"],
            ["refresh_rate_hz", "Refresh rate", "240", "Hz"], ["panel", "Panel", "OLED"],
            ["ram_gb", "Memory", "32", "GB"], ["storage_gb", "Storage", "2000", "GB"]],
    variants: [{ sku: "ASU-SCAR16-5080", name: "Standard", price: 149995, compareAt: 169995, stock: [6, 2] }],
  },
  {
    slug: "msi-katana-15", brand: "MSI", category: "laptops", badge: "sale",
    name: "Katana 15 Gaming Laptop — RTX 5060, 15.6″ 144Hz",
    description: "Budget-friendly 15.6-inch gaming laptop with RTX 5060 graphics.",
    rating: [4.7, 188],
    art: ["laptop", "#d98a8a", "linear-gradient(140deg,#4a3328 0%,#241812 55%,#140d09 100%)"],
    specs: [["gpu", "GPU", "RTX 5060"], ["screen_size_in", "Screen size", "15.6", "in"],
            ["refresh_rate_hz", "Refresh rate", "144", "Hz"], ["ram_gb", "Memory", "16", "GB"]],
    variants: [
      { sku: "MSI-KAT15-5060-16", name: "16GB / 512GB", options: { ram: "16GB", storage: "512GB" }, price: 54995, compareAt: 62995, stock: [12, 4] },
      { sku: "MSI-KAT15-5060-32", name: "32GB / 1TB", options: { ram: "32GB", storage: "1TB" }, price: 61995, compareAt: 69995, stock: [3, 0] },
    ],
  },
  {
    slug: "pny-rtx-5060-ti", brand: "PNY", category: "gpus", badge: "hot",
    name: "GeForce RTX 5060 Ti 16GB Dual Fan Graphics Card",
    description: "16GB GDDR7 dual-fan RTX 5060 Ti for high-refresh 1440p gaming.",
    rating: [4.8, 96],
    art: ["gpu", "#9fb2cf", "linear-gradient(140deg,#39425a 0%,#1a2032 55%,#0e1320 100%)"],
    specs: [["vram_gb", "VRAM", "16", "GB"], ["interface", "Interface", "PCIe 5.0 x8"],
            ["tdp_w", "Board power", "180", "W"], ["psu_min_w", "Recommended PSU", "550", "W"]],
    variants: [{ sku: "PNY-5060TI-16G", name: "Standard", price: 32995, stock: [20, 8] }],
  },
  {
    slug: "amd-ryzen-9-7900x", brand: "AMD", category: "cpus", badge: "sale",
    name: "Ryzen 9 7900X 12-Core AM5 Processor",
    description: "12 cores / 24 threads, boost up to 5.6GHz, AM5 socket.",
    rating: [4.9, 240],
    art: ["cpu", "#86c79b", "linear-gradient(140deg,#1f4536 0%,#122a21 55%,#0a1712 100%)"],
    specs: [["socket", "Socket", "AM5"], ["cores", "Cores", "12"], ["threads", "Threads", "24"],
            ["boost_ghz", "Max boost", "5.6", "GHz"], ["tdp_w", "TDP", "170", "W"],
            ["memory_type", "Memory type", "DDR5"]],
    variants: [{ sku: "AMD-R9-7900X", name: "Boxed", price: 24995, compareAt: 28995, stock: [4, 0] }],
  },
  {
    slug: "razer-blackwidow-v4", brand: "Razer", category: "keyboards", badge: "new",
    name: "BlackWidow V4 Pro — Green Switch, Full RGB",
    description: "Full-size mechanical keyboard with command dial, macro keys and per-key RGB.",
    rating: [4.8, 154],
    art: ["keyboard", "#b48fd4", "linear-gradient(140deg,#3a2a52 0%,#1e1530 55%,#110b1d 100%)"],
    specs: [["layout", "Layout", "Full size"], ["connection", "Connection", "Wired USB-C"],
            ["polling_rate_hz", "Polling rate", "8000", "Hz"]],
    variants: [
      { sku: "RZR-BWV4P-GRN", name: "Green (Clicky)", options: { switch: "Green" }, price: 11995, stock: [15, 6] },
      { sku: "RZR-BWV4P-YEL", name: "Yellow (Linear)", options: { switch: "Yellow" }, price: 11995, stock: [8, 2] },
    ],
  },
  {
    slug: "logitech-g903", brand: "Logitech G", category: "mice", badge: "sale",
    name: "G903 Lightspeed Wireless Gaming Mouse",
    description: "Ambidextrous wireless gaming mouse with HERO 25K sensor.",
    rating: [4.7, 421],
    art: ["mouse", "#9ccbe0", "linear-gradient(140deg,#2b4252 0%,#152430 55%,#0c141c 100%)"],
    specs: [["dpi", "Max DPI", "25600"], ["connection", "Connection", "Lightspeed wireless"],
            ["weight_g", "Weight", "110", "g"]],
    variants: [{ sku: "LOG-G903-BLK", name: "Black", options: { color: "Black" }, price: 5495, compareAt: 6495, stock: [30, 10] }],
  },
  {
    slug: "razer-kraken-v4", brand: "Razer", category: "headsets", badge: "new",
    name: "Kraken V4 Pro Wireless Headset — THX Spatial",
    description: "Wireless headset with haptics, THX Spatial Audio and a control hub.",
    rating: [4.6, 87],
    art: ["headset", "#7fd0a8", "linear-gradient(140deg,#15383a 0%,#0e2426 55%,#081416 100%)"],
    specs: [["connection", "Connection", "2.4GHz / Bluetooth"], ["driver_mm", "Drivers", "40", "mm"],
            ["battery_h", "Battery", "70", "h"]],
    variants: [
      { sku: "RZR-KRV4P-BLK", name: "Black", options: { color: "Black" }, price: 9995, stock: [10, 3] },
      { sku: "RZR-KRV4P-WHT", name: "White", options: { color: "White" }, price: 9995, stock: [2, 0] },
    ],
  },
  {
    slug: "rog-strix-xg32vqr", brand: "Asus ROG", category: "monitors", badge: "sale",
    name: "Strix XG32VQR 32″ Curved 165Hz QHD Monitor",
    description: "31.5-inch 1800R curved VA panel, 2560×1440 at 165Hz with FreeSync Premium Pro.",
    rating: [4.8, 133],
    art: ["monitor", "#e0b670", "linear-gradient(140deg,#5a4426 0%,#2e2213 55%,#18120a 100%)"],
    specs: [["screen_size_in", "Screen size", "31.5", "in"], ["resolution", "Resolution", "2560×1440"],
            ["refresh_rate_hz", "Refresh rate", "165", "Hz"], ["panel", "Panel", "VA, curved"]],
    variants: [{ sku: "ASU-XG32VQR", name: "Standard", price: 21995, compareAt: 25995, stock: [5, 1] }],
  },

  // ---- added in catalog v2 ----
  {
    slug: "sony-ps5-pro", brand: "Sony PlayStation", category: "consoles", badge: "hot",
    name: "PlayStation 5 Pro Console — 2TB",
    description: "The most powerful PlayStation, with an upgraded GPU, advanced ray tracing and AI upscaling. Disc drive sold separately.",
    art: ["console", "#c9d4ea", "linear-gradient(140deg,#25324d 0%,#121a2e 55%,#0a1020 100%)"],
    specs: [["storage_gb", "Storage", "2000", "GB"], ["output", "Video output", "4K 120Hz / 8K"],
            ["disc_drive", "Disc drive", "Sold separately"]],
    variants: [{ sku: "SNY-PS5PRO-2TB", name: "Standard", price: 43995, stock: [8, 3] }],
  },
  {
    slug: "nintendo-switch-2", brand: "Nintendo", category: "consoles", badge: "new",
    name: "Nintendo Switch 2 Console",
    description: "Play at home on the TV or on the go with a larger 7.9-inch 1080p screen and magnetic Joy-Con 2 controllers.",
    art: ["handheld", "#ef8a8a", "linear-gradient(140deg,#4a2226 0%,#261215 55%,#150a0c 100%)"],
    specs: [["screen_size_in", "Screen size", "7.9", "in"], ["resolution", "Resolution", "1920×1080"],
            ["refresh_rate_hz", "Refresh rate", "120", "Hz"], ["storage_gb", "Storage", "256", "GB"]],
    variants: [
      { sku: "NIN-SW2-STD", name: "Standard", price: 27995, stock: [15, 5] },
      { sku: "NIN-SW2-MKW", name: "Mario Kart World Bundle", options: { bundle: "Mario Kart World" }, price: 30995, stock: [6, 2] },
    ],
  },
  {
    slug: "xbox-series-x", brand: "Microsoft Xbox", category: "consoles",
    name: "Xbox Series X 1TB Console",
    description: "True 4K gaming at up to 120 frames per second with a 1TB custom NVMe SSD and Quick Resume.",
    art: ["console", "#86c79b", "linear-gradient(140deg,#1d3a2b 0%,#10221a 55%,#09140f 100%)"],
    specs: [["storage_gb", "Storage", "1000", "GB"], ["output", "Video output", "4K 120Hz"],
            ["disc_drive", "Disc drive", "4K UHD Blu-ray"]],
    variants: [{ sku: "MSX-XSX-1TB", name: "Standard", price: 33995, stock: [4, 1] }],
  },
  {
    slug: "asus-rog-ally-x", brand: "Asus ROG", category: "handhelds", badge: "sale",
    name: "ROG Ally X Handheld — Ryzen Z1 Extreme, 24GB / 1TB",
    description: "Windows handheld gaming PC with a 7-inch 120Hz display, 80Wh battery and 24GB LPDDR5X memory.",
    art: ["handheld", "#b8c1d4", "linear-gradient(140deg,#2d3342 0%,#171b25 55%,#0d1017 100%)"],
    specs: [["processor", "Processor", "Ryzen Z1 Extreme"], ["screen_size_in", "Screen size", "7", "in"],
            ["refresh_rate_hz", "Refresh rate", "120", "Hz"], ["ram_gb", "Memory", "24", "GB"],
            ["storage_gb", "Storage", "1000", "GB"]],
    variants: [{ sku: "ASU-ALLYX-1TB", name: "Standard", price: 49995, compareAt: 54995, stock: [5, 2] }],
  },
  {
    slug: "sony-dualsense", brand: "Sony PlayStation", category: "controllers",
    name: "DualSense Wireless Controller",
    description: "Haptic feedback, adaptive triggers and a built-in microphone for PS5.",
    art: ["controller", "#dfe5f2", "linear-gradient(140deg,#2f3a52 0%,#18203a 55%,#0e1324 100%)"],
    specs: [["connection", "Connection", "Bluetooth / USB-C"], ["platform", "Platform", "PS5, PC"]],
    variants: [
      { sku: "SNY-DS-WHT", name: "White", options: { color: "White" }, price: 3995, stock: [25, 10] },
      { sku: "SNY-DS-BLK", name: "Midnight Black", options: { color: "Midnight Black" }, price: 3995, stock: [18, 6] },
      { sku: "SNY-DS-RED", name: "Cosmic Red", options: { color: "Cosmic Red" }, price: 3995, stock: [0, 0] },
    ],
  },
  {
    slug: "msi-mag-b650-tomahawk-wifi", brand: "MSI", category: "motherboards",
    name: "MAG B650 Tomahawk WiFi ATX Motherboard",
    description: "AM5 ATX board with DDR5, PCIe 5.0 M.2, 2.5G LAN and Wi-Fi 6E.",
    art: ["motherboard", "#9fb2cf", "linear-gradient(140deg,#2a3346 0%,#151b28 55%,#0c1018 100%)"],
    specs: [["socket", "Socket", "AM5"], ["chipset", "Chipset", "B650"], ["memory_type", "Memory type", "DDR5"],
            ["form_factor", "Form factor", "ATX"]],
    variants: [{ sku: "MSI-MAG-B650-TMHWK-WIFI", name: "Standard", price: 13995, stock: [6, 2] }],
  },
  {
    slug: "corsair-vengeance-ddr5-32gb", brand: "Corsair", category: "memory", badge: "sale",
    name: "Vengeance RGB DDR5 32GB (2×16GB) 6000MHz CL30",
    description: "Dual-channel DDR5 kit tuned for AM5 and Intel platforms, with ten-zone RGB.",
    art: ["ram", "#e0b670", "linear-gradient(140deg,#4a3a22 0%,#261d10 55%,#151008 100%)"],
    specs: [["memory_type", "Memory type", "DDR5"], ["capacity_gb", "Capacity", "32", "GB"],
            ["speed_mhz", "Speed", "6000", "MHz"], ["cas_latency", "CAS latency", "CL30"]],
    variants: [{ sku: "COR-VEN-D5-32-6000", name: "Black", options: { color: "Black" }, price: 6995, compareAt: 7995, stock: [20, 6] }],
  },
  {
    slug: "samsung-990-pro", brand: "Samsung", category: "storage",
    name: "990 PRO NVMe M.2 SSD — PCIe 4.0",
    description: "Up to 7,450MB/s reads for fast load times in games and creative apps.",
    art: ["ssd", "#9ccbe0", "linear-gradient(140deg,#20384a 0%,#112029 55%,#0a1318 100%)"],
    specs: [["interface", "Interface", "PCIe 4.0 x4 NVMe"], ["read_mbps", "Sequential read", "7450", "MB/s"],
            ["form_factor", "Form factor", "M.2 2280"]],
    variants: [
      { sku: "SAM-990PRO-1TB", name: "1TB", options: { capacity: "1TB" }, price: 6495, stock: [14, 5] },
      { sku: "SAM-990PRO-2TB", name: "2TB", options: { capacity: "2TB" }, price: 10995, stock: [9, 3] },
    ],
  },
  {
    slug: "corsair-rm850e", brand: "Corsair", category: "power-supplies",
    name: "RM850e 850W 80 Plus Gold Fully Modular PSU",
    description: "Quiet, fully modular ATX 3.1 power supply with a native 12V-2x6 GPU cable.",
    art: ["psu", "#b8c1d4", "linear-gradient(140deg,#2b303c 0%,#161920 55%,#0c0e13 100%)"],
    specs: [["wattage_w", "Wattage", "850", "W"], ["efficiency", "Efficiency", "80 Plus Gold"],
            ["modular", "Modular", "Fully modular"]],
    variants: [{ sku: "COR-RM850E", name: "Standard", price: 7495, stock: [10, 4] }],
  },
  {
    slug: "blitzcrank-volt75", brand: "Blitzcrank Labs", category: "keyboards",
    preorder: "2026-12-12",
    name: "Volt75 Wireless Mechanical Keyboard — Founders Edition",
    description: "Our first in-house keyboard: a 75% gasket-mounted board with tri-mode wireless and hot-swap switches. Limited Founders Edition run.",
    art: ["keyboard", "#e0a93f", "linear-gradient(140deg,#4a3818 0%,#261c0c 55%,#140f06 100%)"],
    specs: [["layout", "Layout", "75%"], ["connection", "Connection", "2.4GHz / Bluetooth / USB-C"],
            ["hot_swap", "Hot-swap", "Yes"]],
    variants: [
      { sku: "BZL-VOLT75-GLD", name: "Gold Linear", options: { switch: "Gold Linear" }, price: 8495, stock: [50, 0] },
      { sku: "BZL-VOLT75-SLV", name: "Silver Tactile", options: { switch: "Silver Tactile" }, price: 8495, stock: [30, 0] },
    ],
  },
  {
    slug: "blitzcrank-pulse-x", brand: "Blitzcrank Labs", category: "controllers",
    preorder: "2026-12-19",
    name: "Pulse X Wireless Controller — Gold Edition",
    description: "Hall-effect sticks and triggers, back paddles and a 1000Hz wired mode. Works with PC, Switch and mobile.",
    art: ["controller", "#f0c05c", "linear-gradient(140deg,#463414 0%,#241a0a 55%,#130e05 100%)"],
    specs: [["connection", "Connection", "2.4GHz / Bluetooth / USB-C"], ["sticks", "Sticks", "Hall effect"],
            ["platform", "Platform", "PC, Switch, Android, iOS"]],
    variants: [{ sku: "BZL-PULSEX-GLD", name: "Gold Edition", price: 4295, stock: [60, 20] }],
  },
];

const SHIPPING_RATES = [
  // region, fee, free over, eta min, eta max
  ["Metro Manila", 150, 10000, 1, 3],
  ["Luzon", 250, 15000, 3, 5],
  ["Visayas", 350, 20000, 4, 7],
  ["Mindanao", 400, 20000, 5, 9],
];

const COUPONS = [
  { code: "WELCOME10", description: "10% off your first order (max ₱2,000)", type: "percent", value: 10,
    maxDiscount: peso(2000), perUser: 1 },
  { code: "BLITZ500", description: "₱500 off orders ₱5,000+", type: "fixed", value: peso(500), minSubtotal: peso(5000) },
  { code: "FREESHIP", description: "Free shipping", type: "free_shipping", value: 0 },
];

const BANNERS = [
  { eyebrow: "New season, new rig", title: "Build faster with RTX 50-series",
    subtitle: "Graphics cards, AM5 processors and DDR5 kits, in stock and ready to ship from Manila.",
    cta: "Shop components", link: "#category=components",
    art: ["gpu", "#9fb2cf", "linear-gradient(120deg,#1a2540 0%,#0f1830 50%,#0a1122 100%)"] },
  { eyebrow: "Pre-order now", title: "Volt75 Founders Edition",
    subtitle: "Our first in-house keyboard. 75% gasket-mount, tri-mode wireless, ships December 12.",
    cta: "Reserve yours", link: "#product=blitzcrank-volt75",
    art: ["keyboard", "#f0c05c", "linear-gradient(120deg,#3a2a10 0%,#22180a 50%,#120d05 100%)"] },
  { eyebrow: "Handheld season", title: "Play anywhere",
    subtitle: "Switch 2, ROG Ally X and controllers, with free shipping in Metro Manila on ₱10,000+.",
    cta: "Shop consoles", link: "#category=consoles",
    art: ["handheld", "#ef8a8a", "linear-gradient(120deg,#3a1c22 0%,#211015 50%,#12090c 100%)"] },
];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Inserts any starter rows that don't exist yet. Returns how many products were added.
function seedCatalog(db) {
  return transaction(db, () => {
    const idOf = (table, col, val) => {
      const r = db.prepare(`SELECT id FROM ${table} WHERE ${col} = ?`).get(val);
      return r ? r.id : null;
    };

    for (const [slug, name, parent, sort] of CATEGORIES) {
      if (idOf("categories", "slug", slug)) continue;
      db.prepare("INSERT INTO categories (slug, name, parent_id, sort_order) VALUES (?, ?, ?, ?)")
        .run(slug, name, parent ? idOf("categories", "slug", parent) : null, sort);
    }

    for (const w of WAREHOUSES) {
      if (idOf("warehouses", "code", w.code)) continue;
      db.prepare("INSERT INTO warehouses (code, name, city, priority) VALUES (?, ?, ?, ?)").run(w.code, w.name, w.city, w.priority);
    }
    const whIds = WAREHOUSES.map((w) => idOf("warehouses", "code", w.code));

    const insProduct = db.prepare(`
      INSERT INTO products (slug, name, description, brand_id, category_id, badge, is_preorder, release_date,
                            rating_avg, rating_count, card_art, card_art_color, card_bg)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insSpec = db.prepare(
      "INSERT INTO product_specs (product_id, spec_key, label, spec_value, num_value, unit) VALUES (?, ?, ?, ?, ?, ?)");
    const insVariant = db.prepare(`
      INSERT INTO product_variants (product_id, sku, name, options, price_cents, compare_at_cents, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insStock = db.prepare(
      "INSERT INTO inventory (variant_id, warehouse_id, quantity_on_hand, reorder_level) VALUES (?, ?, ?, ?)");
    const insMove = db.prepare(
      "INSERT INTO inventory_movements (variant_id, warehouse_id, change, reason, note) VALUES (?, ?, ?, 'initial', 'Seed stock')");

    let added = 0;
    for (const p of PRODUCTS) {
      if (idOf("products", "slug", p.slug)) continue;
      if (p.variants.some((v) => idOf("product_variants", "sku", v.sku))) continue; // SKU already used by an admin-made product

      let brandId = db.prepare("SELECT id FROM brands WHERE name = ? COLLATE NOCASE").get(p.brand)?.id;
      if (!brandId) brandId = Number(db.prepare("INSERT INTO brands (slug, name) VALUES (?, ?)").run(slugify(p.brand), p.brand).lastInsertRowid);

      const [ratingAvg, ratingCount] = p.rating || [0, 0];
      const productId = Number(insProduct.run(
        p.slug, p.name, p.description, brandId, idOf("categories", "slug", p.category), p.badge || null,
        p.preorder ? 1 : 0, p.preorder || null, ratingAvg, ratingCount, p.art[0], p.art[1], p.art[2]).lastInsertRowid);

      for (const [key, label, value, unit] of p.specs) {
        const num = Number(value);
        insSpec.run(productId, key, label, value, Number.isFinite(num) ? num : null, unit || null);
      }

      p.variants.forEach((v, i) => {
        const variantId = Number(insVariant.run(
          productId, v.sku, v.name, JSON.stringify(v.options || {}),
          peso(v.price), v.compareAt ? peso(v.compareAt) : null, i === 0 ? 1 : 0).lastInsertRowid);
        v.stock.forEach((qty, w) => {
          insStock.run(variantId, whIds[w], qty, 3);
          if (qty > 0) insMove.run(variantId, whIds[w], qty);
        });
      });
      added++;
    }

    for (const [region, fee, freeOver, a, b] of SHIPPING_RATES) {
      if (idOf("shipping_rates", "region", region)) continue;
      db.prepare("INSERT INTO shipping_rates (region, fee_cents, free_over_cents, eta_min_days, eta_max_days) VALUES (?, ?, ?, ?, ?)")
        .run(region, peso(fee), peso(freeOver), a, b);
    }

    for (const c of COUPONS) {
      if (idOf("coupons", "code", c.code)) continue;
      db.prepare(`INSERT INTO coupons (code, description, discount_type, discount_value, min_subtotal_cents, max_discount_cents, per_user_limit)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(c.code, c.description, c.type, c.value, c.minSubtotal || 0, c.maxDiscount || null, c.perUser || null);
    }

    BANNERS.forEach((b, i) => {
      if (idOf("promo_banners", "title", b.title)) return;
      db.prepare(`INSERT INTO promo_banners (eyebrow, title, subtitle, cta_label, cta_link, card_art, card_art_color, card_bg, sort_order)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(b.eyebrow, b.title, b.subtitle, b.cta, b.link, b.art[0], b.art[1], b.art[2], i + 1);
    });

    return added;
  });
}

// Full first-time seed: catalog + admin account.
function seed(db, { adminEmail = "admin@blitzcrank.local", adminPassword } = {}) {
  return transaction(db, () => {
    seedCatalog(db);
    const password = adminPassword || crypto.randomBytes(9).toString("base64url");
    db.prepare("INSERT INTO users (email, password_hash, first_name, role) VALUES (?, ?, 'Admin', 'admin')")
      .run(adminEmail, hashPassword(password));
    return { adminEmail, password, generated: !adminPassword };
  });
}

module.exports = { seed, seedCatalog, PRODUCTS };

if (require.main === module) {
  const reset = process.argv.includes("--reset");
  const file = process.env.DB_PATH || DEFAULT_PATH;
  if (reset) for (const f of [file, file + "-wal", file + "-shm"]) fs.rmSync(f, { force: true });

  const db = openDatabase(file);
  if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n > 0) {
    console.log("Database already has products — nothing to do. Use `npm run db:reset` to start over.");
    process.exit(0);
  }
  const admin = seed(db, {
    adminEmail: process.env.ADMIN_EMAIL || undefined,
    adminPassword: process.env.ADMIN_PASSWORD || undefined,
  });
  console.log(`Seeded ${PRODUCTS.length} products into ${file}`);
  console.log(`Admin login: ${admin.adminEmail}` + (admin.generated ? `  password: ${admin.password}  (save this; it is not shown again)` : ""));
  db.close();
}
