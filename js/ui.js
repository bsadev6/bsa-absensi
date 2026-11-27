/* =========================================================
   Helper UI kecil: selector, elemen, toast, busy state, ikon.
   ========================================================= */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  const label = button.querySelector(".btn-label");
  const spinner = button.querySelector(".btn-spinner");
  if (label) label.hidden = busy;
  if (spinner) spinner.hidden = !busy;
}

export function toast(message, type = "ok") {
  const wrap = document.getElementById("toast-wrap");
  if (!wrap) return;

  const node = el("div", `toast-msg${type === "err" ? " err" : ""}`, message);
  wrap.appendChild(node);

  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transition = "opacity .2s ease";
    setTimeout(() => node.remove(), 220);
  }, 3200);
}

/* Ikon stroke sederhana (bukan data pengguna). */
const ICONS = {
  pin: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  clock:
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert:
    '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
  camera:
    '<rect x="3" y="6" width="18" height="13" rx="3"/><circle cx="12" cy="12.5" r="3.2"/><path d="M8 6l1.2-1.8h5.6L16 6"/>',
  arrow:
    '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
};

export function icon(name, size = 22) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = ICONS[name] || "";
  return svg;
}
