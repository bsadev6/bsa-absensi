/* =========================================================
   Geolokasi.
   Mode nyata memakai watchPosition dan memilih sampel terbaik
   dalam jendela waktu, supaya akurasi indoor lebih wajar.
   ========================================================= */

const CFG = window.APP_CONFIG;

function geoError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function locate({
  onProgress,
  targetAccuracy = CFG.LOCATION.targetAccuracy,
  timeoutMs = CFG.LOCATION.timeoutMs,
  demo = false,
  signal,
} = {}) {
  if (demo) return demoLocate({ onProgress, signal, timeoutMs });
  return realLocate({ onProgress, targetAccuracy, timeoutMs, signal });
}

/* --------------------------- simulasi --------------------------- */

function demoLocate({ onProgress, signal, timeoutMs }) {
  const samples = [
    { lat: -6.20882, lng: 106.84564, accuracy: 140 },
    { lat: -6.20879, lng: 106.84561, accuracy: 96 },
    { lat: -6.20876, lng: 106.84558, accuracy: 61 },
    { lat: -6.20874, lng: 106.84555, accuracy: 42 },
    { lat: -6.20873, lng: 106.84554, accuracy: 29 },
  ];

  return new Promise((resolve, reject) => {
    let index = 0;
    let timer = null;

    const cleanup = () => {
      if (timer) clearInterval(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(geoError("aborted", "Pemeriksaan lokasi dibatalkan."));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort);

    timer = setInterval(() => {
      const sample = samples[index];
      onProgress?.(sample);
      index += 1;

      if (index >= samples.length) {
        cleanup();
        resolve(sample);
      }
    }, 380);

    // Jaring pengaman kalau interval terganggu.
    setTimeout(() => {
      if (index >= samples.length) return;
      cleanup();
      reject(geoError("timeout", "Lokasi tidak terdeteksi."));
    }, timeoutMs + 1000);
  });
}

/* --------------------------- mode nyata --------------------------- */

function realLocate({ onProgress, targetAccuracy, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(geoError("unsupported", "Perangkat ini tidak mendukung geolokasi."));
      return;
    }

    let watchId = null;
    let timer = null;
    let best = null;
    let finished = false;

    const cleanup = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (err, value) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (err) reject(err);
      else resolve(value);
    };

    const onAbort = () => finish(geoError("aborted", "Pemeriksaan lokasi dibatalkan."));

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort);

    timer = setTimeout(() => {
      if (best) finish(null, best);
      else finish(geoError("timeout", "Lokasi tidak terdeteksi. Pastikan GPS aktif."));
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const sample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        if (!best || sample.accuracy < best.accuracy) best = sample;
        onProgress?.(best);
        if (best.accuracy <= targetAccuracy) finish(null, best);
      },
      (err) => {
        if (err.code === 1) {
          finish(geoError("denied", "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini."));
        } else if (!best && err.code === 3) {
          finish(geoError("timeout", "Waktu pencarian lokasi habis. Coba lagi."));
        }
        // code 2 (unavailable) -> biarkan timer yang memutuskan.
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    );
  });
}

/* ----------------------- jarak (untuk UI) ----------------------- */

export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
