// Shared helpers: API calls, formatting, escaping, toast, dialogs.

export function api(method, path, body) {
  return fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then((res) =>
    res.json().catch(() => ({})).then((data) => {
      if (!res.ok) {
        const err = new Error((data.error && data.error.message) || `Request failed (${res.status})`);
        err.status = res.status;
        err.code = data.error && data.error.code;
        throw err;
      }
      return data;
    })
  );
}

export const money = (cents) => "₱" + (cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 });

// Anything from the database goes through esc() before it touches innerHTML.
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS' (UTC) -> "Dec 12, 2026"
export function fmtDate(s, withTime = false) {
  if (!s) return "";
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s.replace(" ", "T") + "Z");
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

// ---- toast (a popover, so it shows above open dialogs) ------------------------

const toast = document.getElementById("toast");
let toastTimer = null;

export function showToast(html) {
  toast.innerHTML = html;
  if (toast.showPopover) {
    if (toast.matches(":popover-open")) toast.hidePopover();
    toast.showPopover(); // re-showing puts it on top of the newest dialog
  }
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => { if (toast.hidePopover && toast.matches(":popover-open")) toast.hidePopover(); }, 260);
  }, 2600);
}

// ---- dialogs ----------------------------------------------------------------

export function setupDialog(dlg) {
  // Click on the dimmed backdrop closes it.
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) dlg.close(); });
  dlg.addEventListener("close", () => document.body.classList.toggle("has-dialog", !!document.querySelector("dialog[open]")));
}

export function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
  document.body.classList.add("has-dialog");
}

export const closeIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

export function dialogHead(title, sub = "") {
  return `<header class="dlg-head"><div><h2 class="dlg-title">${title}</h2>${sub ? `<p class="dlg-sub">${sub}</p>` : ""}</div>` +
         `<button class="icon-btn" type="button" data-close aria-label="Close">${closeIcon}</button></header>`;
}

export function spinner(label = "Loading…") {
  return `<div class="loading" role="status"><span class="spin" aria-hidden="true"></span>${esc(label)}</div>`;
}
