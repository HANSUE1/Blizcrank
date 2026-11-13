// Homepage sections: category nav + mega menus, hero carousel, category tiles,
// brand strip, announcement bar, newsletter.

import { api, esc, showToast, reducedMotion } from "./util.js";
import { state } from "./store.js";
import { art, CATEGORY_ART } from "./art.js";

// ---- navigation --------------------------------------------------------------

export function renderNav() {
  const el = document.getElementById("main-nav");
  const tops = state.categories.map((c) => {
    if (!c.children.length) {
      return `<li class="nav-item"><a class="nav-link" href="#catalog" data-link="#category=${esc(c.slug)}">${esc(c.name)}</a></li>`;
    }
    const kids = c.children.map((k) => {
      const [a, color] = CATEGORY_ART[k.slug] || ["laptop", "#9fb2cf"];
      return `<li><a href="#catalog" data-link="#category=${esc(k.slug)}" class="mega-link">
        <span class="mega-icon">${art(a, color)}</span><span>${esc(k.name)}</span></a></li>`;
    }).join("");
    return `<li class="nav-item has-menu">
      <a class="nav-link" href="#catalog" data-link="#category=${esc(c.slug)}" aria-haspopup="true">${esc(c.name)}
        <svg class="caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></a>
      <div class="mega"><div class="mega-inner">
        <p class="mega-title">${esc(c.name)}</p>
        <ul class="mega-grid">${kids}</ul>
        <a class="mega-all" href="#catalog" data-link="#category=${esc(c.slug)}">Shop all ${esc(c.name.toLowerCase())} →</a>
      </div></div></li>`;
  }).join("");
  el.innerHTML = `
    <ul class="nav-list">
      <li class="nav-item"><a class="nav-link" href="#catalog" data-link="#category=all">All gear</a></li>
      ${tops}
      <li class="nav-item"><a class="nav-link is-hot" href="#catalog" data-link="#deals">Deals</a></li>
      <li class="nav-item"><a class="nav-link" href="#catalog" data-link="#preorders">Pre-orders</a></li>
    </ul>
    <ul class="nav-list nav-aux">
      <li class="nav-item"><button class="nav-link" type="button" data-link="#order-status">Order status</button></li>
      <li class="nav-item"><button class="nav-link" type="button" data-link="#shipping">Shipping</button></li>
    </ul>`;
}

// Chips above the catalog grid.
export function renderFilterChips() {
  const chips = [["all", "All"], ...state.categories.map((c) => [c.slug, c.name]), ["deals", "Deals"], ["preorders", "Pre-orders"]];
  document.getElementById("filters").innerHTML = chips.map(([slug, name]) =>
    `<button class="filter" type="button" data-category="${esc(slug)}" aria-pressed="false">${esc(name)}</button>`).join("");
}

// ---- hero carousel --------------------------------------------------------------

let slide = 0;
let timer = null;

export function renderHero() {
  const hero = document.getElementById("hero");
  const banners = state.banners;
  if (!banners.length) { hero.hidden = true; return; }
  hero.querySelector(".hero-track").innerHTML = banners.map((b, i) => `
    <div class="hero-slide${i === 0 ? " is-active" : ""}" role="group" aria-roledescription="slide"
         aria-label="${i + 1} of ${banners.length}" ${i === 0 ? "" : 'aria-hidden="true"'} style="background:${esc(b.card.bg || "#0f1830")}">
      <div class="hero-copy">
        ${b.eyebrow ? `<p class="hero-eyebrow">${esc(b.eyebrow)}</p>` : ""}
        <h2 class="hero-title">${esc(b.title)}</h2>
        ${b.subtitle ? `<p class="hero-sub">${esc(b.subtitle)}</p>` : ""}
        ${b.ctaLabel ? `<a class="btn btn-gold" href="${esc(b.ctaLink && !b.ctaLink.startsWith("#") ? b.ctaLink : "#catalog")}"
            data-link="${esc(b.ctaLink || "")}" ${i === 0 ? "" : 'tabindex="-1"'}>${esc(b.ctaLabel)}</a>` : ""}
      </div>
      <div class="hero-art" aria-hidden="true">${b.imageUrl ? `<img src="${esc(b.imageUrl)}" alt="" />` : art(b.card.art, esc(b.card.color))}</div>
    </div>`).join("");
  hero.querySelector(".hero-dots").innerHTML = banners.map((_, i) =>
    `<button type="button" class="dot${i === 0 ? " is-active" : ""}" data-slide="${i}" aria-label="Show slide ${i + 1}"
       aria-current="${i === 0}"></button>`).join("");
  hero.querySelector(".hero-controls").hidden = banners.length < 2;

  hero.addEventListener("click", (e) => {
    const d = e.target.closest("[data-slide]");
    if (d) { go(Number(d.dataset.slide)); restart(); }
    if (e.target.closest("[data-hero='prev']")) { go(slide - 1); restart(); }
    if (e.target.closest("[data-hero='next']")) { go(slide + 1); restart(); }
  });
  // Pause while the shopper is looking at or using it.
  hero.addEventListener("mouseenter", stop);
  hero.addEventListener("mouseleave", restart);
  hero.addEventListener("focusin", stop);
  hero.addEventListener("focusout", restart);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : restart()));
  restart();
}

function go(i) {
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".hero-dots .dot");
  slide = (i + slides.length) % slides.length;
  slides.forEach((s, n) => {
    const on = n === slide;
    s.classList.toggle("is-active", on);
    if (on) s.removeAttribute("aria-hidden"); else s.setAttribute("aria-hidden", "true");
    s.querySelectorAll("a, button").forEach((x) => (on ? x.removeAttribute("tabindex") : x.setAttribute("tabindex", "-1")));
  });
  dots.forEach((d, n) => { d.classList.toggle("is-active", n === slide); d.setAttribute("aria-current", String(n === slide)); });
}

function stop() { clearInterval(timer); timer = null; }
function restart() {
  stop();
  if (reducedMotion() || state.banners.length < 2) return;
  timer = setInterval(() => go(slide + 1), 6500);
}

// ---- category tiles & brands -------------------------------------------------

export function renderCategoryTiles() {
  const leaves = state.categories.flatMap((c) => (c.children.length ? c.children : [c])).filter((c) =>
    state.products.some((p) => p.category === c.slug || p.topCategory === c.slug));
  document.getElementById("cat-tiles").innerHTML = leaves.map((c) => {
    const [a, color] = CATEGORY_ART[c.slug] || ["laptop", "#9fb2cf"];
    const n = state.products.filter((p) => p.category === c.slug || p.topCategory === c.slug).length;
    return `<a class="cat-tile" href="#catalog" data-link="#category=${esc(c.slug)}">
      <span class="cat-art">${art(a, color)}</span>
      <span class="cat-name">${esc(c.name)}</span><span class="cat-count">${n} item${n === 1 ? "" : "s"}</span></a>`;
  }).join("");
}

export function renderBrands() {
  document.getElementById("brand-strip").innerHTML = state.brands.map((b) =>
    `<li><button type="button" class="brand-chip" data-brand="${esc(b.name)}">${esc(b.name)}</button></li>`).join("");
}

// ---- announcement bar ----------------------------------------------------------

export function startAnnouncements() {
  const msgs = [...document.querySelectorAll(".announce-msg")];
  if (msgs.length < 2 || reducedMotion()) return;
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    msgs[i].classList.remove("is-active");
    i = (i + 1) % msgs.length;
    msgs[i].classList.add("is-active");
  }, 4500);
}

// ---- newsletter ----------------------------------------------------------------

export function setupNewsletter() {
  const form = document.getElementById("newsletter-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      await api("POST", "/api/newsletter", { email: form.elements.email.value, source: "homepage" });
      form.innerHTML = '<p class="newsletter-done"><span class="gold">✓</span> You\'re in! Watch your inbox for drops and deals.</p>';
    } catch (err) {
      showToast(esc(err.message));
      btn.disabled = false;
    }
  });
}
