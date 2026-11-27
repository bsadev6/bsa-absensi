/* =========================================================
   Jam header — disinkronkan ke waktu server, bukan jam HP.
   ========================================================= */

import { api } from "./api.js";
import { getParts, fmtLongDate, pad } from "./time.js";

let offsetMs = 0;

export async function syncClock() {
  try {
    const t0 = Date.now();
    const serverNow = await api.serverTime();
    const t1 = Date.now();
    if (Number.isFinite(serverNow)) {
      // Asumsi latensi simetris; cukup akurat untuk tampilan.
      offsetMs = serverNow - Math.round((t0 + t1) / 2);
    }
  } catch {
    offsetMs = 0;
  }
}

export function serverNow() {
  return new Date(Date.now() + offsetMs);
}

export function startClock({ timeEl, secEl, dateEl }) {
  const tick = () => {
    const now = serverNow();
    const p = getParts(now);
    timeEl.textContent = `${pad(p.hour)}:${pad(p.minute)}`;
    secEl.textContent = pad(p.second);
    dateEl.textContent = fmtLongDate(now);
  };

  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}
