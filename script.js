/* ============================================================
   Blitzcrank — Gaming Gear Store
   ============================================================ */

(function () {
  "use strict";

  /* ----------------------------------------------------------
     Product illustrations (inline SVG line art per category)
     ---------------------------------------------------------- */

  var ART = {
    laptop:
      '<svg class="product-art" viewBox="0 0 120 90" fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M22 18h76a4 4 0 0 1 4 4v38H18V22a4 4 0 0 1 4-4Z"/>' +
      '<path d="M10 72h100l-8-12H18l-8 12Z"/>' +
      '<path d="M52 72h16" stroke-width="3.2"/>' +
      '<path d="M30 30h36M30 38h24" opacity=".45"/>' +
      '<circle cx="88" cy="34" r="7" opacity=".6"/></svg>',
    gpu:
      '<svg class="product-art" viewBox="0 0 120 90" fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="14" y="26" width="92" height="38" rx="5"/>' +
      '<circle cx="42" cy="45" r="11"/><circle cx="78" cy="45" r="11"/>' +
      '<path d="M42 34v-4M42 60v-4M31 45h-4M53 45h-4M78 34v-4M78 60v-4M89 45h-4M67 45h-4" opacity=".55"/>' +
      '<path d="M20 64v8h38v-8M14 34h-4v16h4" opacity=".7"/></svg>',
    cpu:
      '<svg class="product-art" viewBox="0 0 120 90" fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="34" y="19" width="52" height="52" rx="6"/>' +
      '<rect x="47" y="32" width="26" height="26" rx="3" opacity=".7"/>' +
      '<path d="M44 19v-8M60 19v-8M76 19v-8M44 79v-8M60 79v-8M76 79v-8M34 29h-8M34 45h-8M34 61h-8M94 29h-8M94 45h-8M94 61h-8"/></svg>',
    keyboard:
      '<svg class="product-art" viewBox="0 0 120 90" fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="10" y="28" width="100" height="36" rx="6"/>' +
      '<path d="M20 38h6M32 38h6M44 38h6M56 38h6M68 38h6M80 38h6M92 38h6M20 48h6M32 48h6M44 48h6M80 48h6M92 48h6M56 48h18" opacity=".65"/>' +
      '<path d="M30 56h60" opacity=".65"/></svg>',
    mouse:
      '<svg class="product-art" viewBox="0 0 120 90" fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M60 12c17 0 24 12 24 30s-7 36-24 36-24-18-24-36 7-30 24-30Z"/>' +
      '<path d="M60 12v24M42 32h36" opacity=".6"/>' +
      '<rect x="56" y="22" width="8" height="12" rx="4" opacity=".85"/></svg>',
    headset:
      '<svg class="product-art" viewBox="0 0 120 90" fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M26 56v-8a34 34 0 0 1 68 0v8"/>' +
      '<rect x="18" y="50" width="16" height="26" rx="6"/>' +
      '<rect x="86" y="50" width="16" height="26" rx="6"/>' +
      '<path d="M94 76v4a10 10 0 0 1-10 10H64" opacity=".6"/></svg>',
    monitor:
      '<svg class="product-art" viewBox="0 0 120 90" fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M14 16h92a2 2 0 0 1 2 2v40a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2Z"/>' +
      '<path d="M52 60l-4 12M68 60l4 12M40 72h40" />' +
      '<path d="M22 50c10-14 24-22 38-24" opacity=".5"/></svg>'
  };

  /* ----------------------------------------------------------
     Catalog
     ---------------------------------------------------------- */

  var PRODUCTS = [
    {
      id: "rog-strix-scar-16",
      brand: "Asus ROG",
      title: "ROG Strix Scar 16 (2025) — RTX 5080, 240Hz OLED",
      category: "laptops",
      price: 149995, oldPrice: 169995,
      rating: 4.9, reviews: 312,
      badge: { type: "hot", label: "Hot" },
      art: "laptop", artColor: "#8fa7d4",
      bg: "linear-gradient(140deg,#2a3550 0%,#141c30 55%,#0d1322 100%)"
    },
    {
      id: "msi-katana-15",
      brand: "MSI",
      title: "Katana 15 Gaming Laptop — RTX 5060, 15.6″ 144Hz",
      category: "laptops",
      price: 54995, oldPrice: 62995,
      rating: 4.7, reviews: 188,
      badge: { type: "sale", label: "-13% Off" },
      art: "laptop", artColor: "#d98a8a",
      bg: "linear-gradient(140deg,#4a3328 0%,#241812 55%,#140d09 100%)"
    },
    {
      id: "pny-rtx-5060-ti",
      brand: "PNY",
      title: "GeForce RTX 5060 Ti 16GB Dual Fan Graphics Card",
      category: "components",
      price: 32995, oldPrice: null,
      rating: 4.8, reviews: 96,
      badge: { type: "hot", label: "Hot" },
      art: "gpu", artColor: "#9fb2cf",
      bg: "linear-gradient(140deg,#39425a 0%,#1a2032 55%,#0e1320 100%)"
    },
    {
      id: "amd-ryzen-9-7900x",
      brand: "AMD",
      title: "Ryzen 9 7900X 12-Core AM5 Processor",
      category: "components",
      price: 24995, oldPrice: 28995,
      rating: 4.9, reviews: 240,
      badge: { type: "sale", label: "-14% Off" },
      art: "cpu", artColor: "#86c79b",
      bg: "linear-gradient(140deg,#1f4536 0%,#122a21 55%,#0a1712 100%)"
    },
    {
      id: "razer-blackwidow-v4",
      brand: "Razer",
      title: "BlackWidow V4 Pro — Green Switch, Full RGB",
      category: "peripherals",
      price: 11995, oldPrice: null,
      rating: 4.8, reviews: 154,
      badge: { type: "new", label: "New" },
      art: "keyboard", artColor: "#b48fd4",
      bg: "linear-gradient(140deg,#3a2a52 0%,#1e1530 55%,#110b1d 100%)"
    },
    {
      id: "logitech-g903",
      brand: "Logitech G",
      title: "G903 Lightspeed Wireless Gaming Mouse",
      category: "peripherals",
      price: 5495, oldPrice: 6495,
      rating: 4.7, reviews: 421,
      badge: { type: "sale", label: "-15% Off" },
      art: "mouse", artColor: "#9ccbe0",
      bg: "linear-gradient(140deg,#2b4252 0%,#152430 55%,#0c141c 100%)"
    },
    {
      id: "razer-kraken-v4",
      brand: "Razer",
      title: "Kraken V4 Pro Wireless Headset — THX Spatial",
      category: "peripherals",
      price: 9995, oldPrice: null,
      rating: 4.6, reviews: 87,
      badge: { type: "new", label: "New" },
      art: "headset", artColor: "#7fd0a8",
      bg: "linear-gradient(140deg,#15383a 0%,#0e2426 55%,#081416 100%)"
    },
    {
      id: "rog-strix-xg32vqr",
      brand: "Asus ROG",
      title: "Strix XG32VQR 32″ Curved 165Hz QHD Monitor",
      category: "peripherals",
      price: 21995, oldPrice: 25995,
      rating: 4.8, reviews: 133,
      badge: { type: "sale", label: "-15% Off" },
      art: "monitor", artColor: "#e0b670",
      bg: "linear-gradient(140deg,#5a4426 0%,#2e2213 55%,#18120a 100%)"
    }
  ];

  /* ----------------------------------------------------------
     State (persisted per browser)
     ---------------------------------------------------------- */

  var BASE_CART = 3;       // items already "in cart" in the design
  var BASE_WISHLIST = 5;   // items already wishlisted in the design

  var state = {
    category: "all",
    query: "",
    cartAdds: 0,
    wished: {}
  };

  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem("blitzcrank-state"));
      if (saved && typeof saved === "object") {
        state.cartAdds = typeof saved.cartAdds === "number" ? saved.cartAdds : 0;
        state.wished = saved.wished && typeof saved.wished === "object" ? saved.wished : {};
      }
    } catch (e) { /* storage unavailable — run in-memory */ }
  }

  function saveState() {
    try {
      localStorage.setItem("blitzcrank-state", JSON.stringify({
        cartAdds: state.cartAdds,
        wished: state.wished
      }));
    } catch (e) { /* ignore */ }
  }

  /* ----------------------------------------------------------
     DOM refs
     ---------------------------------------------------------- */

  var grid = document.getElementById("product-grid");
  var emptyState = document.getElementById("empty-state");
  var cartCount = document.getElementById("cart-count");
  var wishlistCount = document.getElementById("wishlist-count");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  /* ----------------------------------------------------------
     Helpers
     ---------------------------------------------------------- */

  function peso(n) {
    return "₱" + n.toLocaleString("en-PH");
  }

  function wishedCount() {
    var n = 0;
    for (var k in state.wished) if (state.wished[k]) n++;
    return n;
  }

  function updateCounters() {
    cartCount.textContent = String(BASE_CART + state.cartAdds);
    wishlistCount.textContent = String(BASE_WISHLIST + wishedCount());
  }

  function showToast(html) {
    toast.innerHTML = html;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2200);
  }

  /* ----------------------------------------------------------
     Rendering
     ---------------------------------------------------------- */

  function cardHTML(p) {
    var badge = p.badge
      ? '<span class="card-badge ' + p.badge.type + '">' + p.badge.label + "</span>"
      : "";

    var oldPrice = p.oldPrice
      ? '<span class="price-old">' + peso(p.oldPrice) + "</span>"
      : "";

    var starsPct = Math.round((p.rating / 5) * 100);
    var art = ART[p.art].replace(/\{c\}/g, p.artColor);
    var wished = state.wished[p.id] ? " is-wished" : "";

    return (
      '<article class="card" data-id="' + p.id + '">' +
        '<div class="card-media">' +
          '<div class="media-bg" style="background:' + p.bg + '">' + art + "</div>" +
          badge +
          '<button class="wish-toggle' + wished + '" type="button" aria-label="Toggle wishlist" aria-pressed="' + (state.wished[p.id] ? "true" : "false") + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.3 4.9 13A4.8 4.8 0 0 1 12 6.4 4.8 4.8 0 0 1 19.1 13Z"/></svg>' +
          "</button>" +
        "</div>" +
        '<div class="card-body">' +
          '<p class="card-brand">' + p.brand + "</p>" +
          '<h2 class="card-title">' + p.title + "</h2>" +
          '<div class="card-rating">' +
            '<span class="stars" aria-hidden="true"><span class="stars-fill" style="width:' + starsPct + '%"></span></span>' +
            '<span class="rating-text">' + p.rating.toFixed(1) + " (" + p.reviews + ")</span>" +
          "</div>" +
          '<div class="card-price"><span class="price">' + peso(p.price) + "</span>" + oldPrice + "</div>" +
          '<button class="add-to-cart" type="button">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.2l2.1 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6"/><circle cx="9.6" cy="20" r="1.4"/><circle cx="16.6" cy="20" r="1.4"/></svg>' +
            "<span>Add to Cart</span>" +
          "</button>" +
        "</div>" +
      "</article>"
    );
  }

  function render() {
    var q = state.query.trim().toLowerCase();
    var visible = PRODUCTS.filter(function (p) {
      var inCategory = state.category === "all" || p.category === state.category;
      var matches = !q || (p.title + " " + p.brand + " " + p.category).toLowerCase().indexOf(q) !== -1;
      return inCategory && matches;
    });

    grid.innerHTML = visible.map(cardHTML).join("");
    emptyState.hidden = visible.length > 0;
  }

  /* ----------------------------------------------------------
     Events
     ---------------------------------------------------------- */

  // Category filters
  document.getElementById("filters").addEventListener("click", function (e) {
    var btn = e.target.closest(".filter");
    if (!btn) return;
    this.querySelectorAll(".filter").forEach(function (f) {
      f.classList.remove("is-active");
      f.setAttribute("aria-selected", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
    state.category = btn.dataset.category;
    render();
  });

  // Search (live + submit)
  var searchInput = document.getElementById("search-input");
  searchInput.addEventListener("input", function () {
    state.query = this.value;
    render();
  });
  document.getElementById("search-form").addEventListener("submit", function (e) {
    e.preventDefault();
    state.query = searchInput.value;
    render();
  });

  // Card actions (delegated)
  grid.addEventListener("click", function (e) {
    var card = e.target.closest(".card");
    if (!card) return;
    var product = PRODUCTS.find(function (p) { return p.id === card.dataset.id; });
    if (!product) return;

    var wishBtn = e.target.closest(".wish-toggle");
    if (wishBtn) {
      state.wished[product.id] = !state.wished[product.id];
      wishBtn.classList.toggle("is-wished", !!state.wished[product.id]);
      wishBtn.setAttribute("aria-pressed", state.wished[product.id] ? "true" : "false");
      updateCounters();
      saveState();
      showToast(state.wished[product.id]
        ? '<span class="gold">♥</span> Added to wishlist — ' + product.brand
        : "Removed from wishlist — " + product.brand);
      return;
    }

    var addBtn = e.target.closest(".add-to-cart");
    if (addBtn) {
      state.cartAdds++;
      updateCounters();
      saveState();
      addBtn.classList.add("is-added");
      addBtn.querySelector("span").textContent = "Added ✓";
      setTimeout(function () {
        addBtn.classList.remove("is-added");
        addBtn.querySelector("span").textContent = "Add to Cart";
      }, 1400);
      showToast('<span class="gold">⚡</span> Added to cart — ' + peso(product.price));
    }
  });

  // Header buttons
  document.getElementById("cart-btn").addEventListener("click", function () {
    showToast("Cart — " + (BASE_CART + state.cartAdds) + " item(s)");
  });
  document.getElementById("wishlist-btn").addEventListener("click", function () {
    showToast("Wishlist — " + (BASE_WISHLIST + wishedCount()) + " item(s)");
  });
  document.getElementById("account-btn").addEventListener("click", function () {
    showToast("Account — sign in coming soon");
  });

  /* ----------------------------------------------------------
     Init
     ---------------------------------------------------------- */

  loadState();
  updateCounters();
  render();
})();
