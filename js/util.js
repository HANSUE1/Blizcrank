// Shared helpers: formatting, escaping, toast, dialogs.

// Centavos -> Philippine pesos: 14999500 -> "₱149,995", 3642 -> "₱36.42".
const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", trailingZeroDisplay: "stripIfInteger" });
export const money = (cents) => PHP.format(cents / 100);

// Anything from the database goes through esc() before it touches innerHTML.
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// 'YYYY-MM-DD' (a calendar day) or an ISO timestamp -> "Dec 12, 2026"
export function fmtDate(s, withTime = false) {
  if (!s) return "";
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  const opts = { month: "short", day: "numeric", year: "numeric" };
  if (withTime) Object.assign(opts, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleString("en-PH", opts);
}

export function starsHTML(rating, count) {
  if (!count) return '<span class="rating-text">No reviews yet</span>';
  const pct = Math.round((rating / 5) * 100);
  return `<span class="stars" aria-hidden="true"><span class="stars-fill" style="width:${pct}%"></span></span>` +
         `<span class="rating-text">${Number(rating).toFixed(1)} (${count})</span>`;
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Replaces root's content and puts keyboard focus back on the matching control (same id and data-* attributes).
export function renderInto(root, html) {
  const el = root.contains(document.activeElement) ? document.activeElement : null;
  const keys = (x) => [...x.attributes].filter((a) => a.name === "id" || a.name.startsWith("data-"))
    .map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join("");
  const item = el?.closest("[data-item]");
  const selector = el && keys(el) && `${item ? `[data-item="${CSS.escape(item.dataset.item)}"] ` : ""}${keys(el)}`;
  root.innerHTML = html;
  if (selector) root.querySelector(selector)?.focus();
}

// ---- toast (a popover, so it shows above open dialogs) ------------------------

let toastTimer = null;

export function showToast(html) {
  const toast = document.getElementById("toast");
  toast.innerHTML = html;
  if (toast.showPopover) {
    if (toast.matches(":popover-open")) toast.hidePopover();
    toast.showPopover(); // re-showing puts it on top of the newest dialog
  }
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    toastTimer = setTimeout(() => { if (toast.hidePopover && toast.matches(":popover-open")) toast.hidePopover(); }, 260);
  }, 2600);
}

// ---- dialogs ----------------------------------------------------------------

export function setupDialog(dlg) {
  // A click on the dimmed backdrop closes it. The press must start there too, so dragging
  // a text selection out of a field, or clicking empty space inside, does not.
  const onBackdrop = (e) => {
    const r = dlg.getBoundingClientRect();
    return e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
  };
  let pressedBackdrop = false;
  dlg.addEventListener("pointerdown", (e) => { pressedBackdrop = onBackdrop(e); });
  dlg.addEventListener("click", (e) => {
    if ((pressedBackdrop && onBackdrop(e)) || e.target.closest("[data-close]")) dlg.close();
  });
  dlg.addEventListener("close", () => document.body.classList.toggle("has-dialog", !!document.querySelector("dialog[open]")));
}

export function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
  document.body.classList.add("has-dialog");
}

export const closeIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

export function dialogHead(title, sub = "") {
  return `<header class="dlg-head"><div><h2 class="dlg-title">${title}</h2>${sub ? `<p class="dlg-sub">${sub}</p>` : ""}</div>` +
         `<button class="icon-btn" type="button" data-close aria-label="Close">${closeIcon}</button></header>`;
}
