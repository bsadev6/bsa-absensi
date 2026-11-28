/* =========================================================
   Lapisan API.
   DEMO_MODE = true  -> semua fungsi memakai data simulasi.
   DEMO_MODE = false -> memanggil backend Express di API_BASE_URL.

   Kontrak endpoint yang diasumsikan:
     POST /auth/login                     { nip, pin } -> { token, employee }
     POST /attendance/location-check      { lat, lng, accuracy } -> { inside, distance, site, token, expiresAt }
                                          site: { id, name, lat, lng, radius }
     POST /attendance/punch               multipart: photo, token, lat, lng, accuracy, type
     GET  /attendance/history?month=YYYY-MM
     GET  /attendance/today
     GET  /time                           -> { now: <epoch ms> }

   Absen boleh dikirim berulang. Backend menyimpan jam masuk paling awal
   dan jam pulang paling akhir per tanggal.
   ========================================================= */

import { getParts, fmtHM, dateKey, monthKey, toMinutes } from "./time.js";

const CFG = window.APP_CONFIG;
const DEMO = Boolean(CFG.DEMO_MODE);
const STORE_KEY = "presensi.demo.v1";

const EMPLOYEE = {
  id: "emp-1001",
  nip: "1001",
  name: "Andi Firmansyah",
  role: "Programmer, TI",
  initials: "AF",
  site: {
    id: "site-hq",
    name: CFG.SITE.name,
    lat: CFG.SITE.lat,
    lng: CFG.SITE.lng,
    radius: CFG.SITE.radius,
  },
  shift: { start: CFG.SHIFT.start, end: CFG.SHIFT.end },
  device: { label: "Chrome · Android", registered: true },
};

/* ----------------------------- util ----------------------------- */

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* localStorage bisa diblokir; demo tetap jalan di memori sesi ini. */
  }
}

function computeStatus(hhmm) {
  const late = toMinutes(hhmm) - toMinutes(CFG.SHIFT.start) - CFG.SHIFT.lateToleranceMinutes;
  return late > 0
    ? { status: "terlambat", lateMinutes: late }
    : { status: "tepat", lateMinutes: 0 };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* -------------------------- demo store -------------------------- */

function seedMonth(year, month, upToDay) {
  const out = [];
  for (let day = 1; day <= upToDay; day += 1) {
    // 05:00 UTC = 12:00 WIB pada tanggal yang sama.
    const dt = new Date(Date.UTC(year, month - 1, day, 5));
    const weekday = dt.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    const inMin = 7 * 60 + 40 + randomInt(0, 49);
    const outMin = 16 * 60 + randomInt(0, 55);
    const hhmm = `${String(Math.floor(inMin / 60)).padStart(2, "0")}:${String(inMin % 60).padStart(2, "0")}`;
    const status = computeStatus(hhmm);

    out.push({
      id: `demo-${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`,
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      in: hhmm,
      out: `${String(Math.floor(outMin / 60)).padStart(2, "0")}:${String(outMin % 60).padStart(2, "0")}`,
      status: status.status,
      lateMinutes: status.lateMinutes,
      distance: randomInt(9, 85),
      accuracy: randomInt(12, 38),
      site: EMPLOYEE.site.name,
      source: "app",
    });
  }
  return out;
}

function ensureStore() {
  let store = loadStore();
  if (store && Array.isArray(store.records)) return store;

  const now = getParts();
  const current = seedMonth(now.year, now.month, Math.max(now.day - 1, 0));
  const prev = new Date(Date.UTC(now.year, now.month - 2, 1, 5));
  const prevSeed = seedMonth(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 28);

  store = { v: 1, records: [...prevSeed, ...current] };
  saveStore(store);
  return store;
}

/* ---------------------------- request ---------------------------- */

// Token sesi disimpan di memori (bukan localStorage) dan dipakai otomatis
// untuk semua request yang butuh login.
let sessionToken = null;

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  const isForm = body instanceof FormData;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  if (auth && sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

  const res = await fetch(`${CFG.API_BASE_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respons tanpa body */
  }

  if (!res.ok) {
    const err = new Error(data?.message || `Permintaan gagal (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/* ------------------------------ API ------------------------------ */

export const api = {
  demo: DEMO,
  employeeTemplate: EMPLOYEE,

  async login(nip, pin) {
    if (!DEMO) {
      const data = await request("/auth/login", {
        method: "POST",
        body: { nip, pin },
        auth: false,
      });
      sessionToken = data.token;
      return data;
    }
    await delay(650);
    if (nip === "1001" && pin === "1234") {
      sessionToken = "demo-token";
      return { token: "demo-token", employee: { ...EMPLOYEE } };
    }
    const err = new Error("NIP atau PIN salah. Coba lagi.");
    err.code = "INVALID_CREDENTIALS";
    throw err;
  },

  async logout() {
    if (DEMO) {
      await delay(150);
      sessionToken = null;
      return { ok: true };
    }
    try {
      return await request("/auth/logout", { method: "POST" });
    } finally {
      sessionToken = null;
    }
  },

  async serverTime() {
    if (DEMO) return Date.now();
    const data = await request("/time", { auth: false });
    return Number(data.now);
  },

  /**
   * Verifikasi lokasi di server. Server yang menentukan inside/outside.
   * Simulasi luar radius hanya aktif di DEMO_MODE.
   */
  async locationCheck({ lat, lng, accuracy, simulateOutside = false }) {
    if (!DEMO) {
      return request("/attendance/location-check", {
        method: "POST",
        body: { lat, lng, accuracy },
      });
    }

    await delay(850);

    if (simulateOutside) {
      return {
        inside: false,
        distance: 428,
        site: EMPLOYEE.site,
        token: null,
        expiresAt: null,
      };
    }

    return {
      inside: true,
      distance: 20,
      site: EMPLOYEE.site,
      token: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      expiresAt: Date.now() + CFG.LOCATION_TOKEN_TTL_SECONDS * 1000,
      coords: { lat, lng, accuracy },
    };
  },

  async punch({ type, token, blob, coords }) {
    if (!DEMO) {
      const form = new FormData();
      form.append("type", type);
      form.append("token", token);
      form.append("lat", String(coords.lat));
      form.append("lng", String(coords.lng));
      form.append("accuracy", String(coords.accuracy));
      if (blob) form.append("photo", blob, "selfie.jpg");
      return request("/attendance/punch", { method: "POST", body: form });
    }

    await delay(1150);

    const store = ensureStore();
    const today = dateKey();
    const hm = fmtHM();
    let record = store.records.find((r) => r.date === today);

    const base = {
      id: `rec-${today}`,
      date: today,
      in: null,
      out: null,
      distance: 20,
      accuracy: Math.round(coords?.accuracy || 24),
      site: EMPLOYEE.site.name,
      source: "app",
      status: "tepat",
      lateMinutes: 0,
    };

    // Aturan: absen masuk memakai jam paling awal, absen pulang paling akhir.
    if (type === "in") {
      record = record || { ...base };
      if (!record.in || toMinutes(hm) < toMinutes(record.in)) record.in = hm;
      const status = computeStatus(record.in);
      record.status = status.status;
      record.lateMinutes = status.lateMinutes;
      record.distance = 20;
      record.accuracy = Math.round(coords?.accuracy || 24);
      if (!store.records.includes(record)) store.records.push(record);
    } else {
      record = record || { ...base };
      if (!record.out || toMinutes(hm) > toMinutes(record.out)) record.out = hm;
      record.distance = 20;
      record.accuracy = Math.round(coords?.accuracy || 24);
      if (!record.in) {
        record.status = "tepat";
        record.lateMinutes = 0;
      }
      if (!store.records.includes(record)) store.records.push(record);
    }

    saveStore(store);
    return { record: { ...record }, time: hm, type };
  },

  async today() {
    if (!DEMO) return request("/attendance/today");
    const store = ensureStore();
    const rec = store.records.find((r) => r.date === dateKey());
    return rec ? { ...rec } : null;
  },

  async history(month) {
    if (!DEMO) {
      return request(`/attendance/history?month=${encodeURIComponent(month)}`);
    }
    await delay(350);
    const store = ensureStore();
    return store.records
      .filter((r) => r.date.startsWith(month))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((r) => ({ ...r }));
  },

  resetDemo() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* noop */
    }
  },
};

export { EMPLOYEE };
