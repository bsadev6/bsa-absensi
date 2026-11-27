/* =========================================================
   Helper waktu — semua tampilan memakai zona waktu kantor,
   bukan zona waktu perangkat.
   ========================================================= */

const TZ = (window.APP_CONFIG && window.APP_CONFIG.TIMEZONE) || "Asia/Jakarta";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const longDateFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthYearFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  month: "long",
  year: "numeric",
});

const shortDayFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  weekday: "long",
});

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const pad = (n) => String(n).padStart(2, "0");

export function getParts(date = new Date()) {
  const out = {};
  for (const part of partsFmt.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

export function fmtHM(date = new Date()) {
  const p = getParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function fmtHMS(date = new Date()) {
  const p = getParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

export function fmtLongDate(date = new Date()) {
  return longDateFmt.format(date);
}

export function fmtMonthYear(date = new Date()) {
  return monthYearFmt.format(date);
}

export function fmtWeekday(date = new Date()) {
  return shortDayFmt.format(date);
}

export function dateKey(date = new Date()) {
  const p = getParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function monthKey(date = new Date()) {
  const p = getParts(date);
  return `${p.year}-${pad(p.month)}`;
}

export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

export function minutesToHM(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export function shortMonth(monthIndex) {
  return MONTHS_SHORT[monthIndex] || "";
}

export function dayNumber(dateKeyStr) {
  return Number(String(dateKeyStr).slice(8, 10));
}

export function monthIndexOf(dateKeyStr) {
  return Number(String(dateKeyStr).slice(5, 7)) - 1;
}

export { pad, TZ };
