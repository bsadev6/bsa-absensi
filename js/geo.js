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
  outside = false,
  signal,
} = {}) {
  if (demo) return demoLocate({ onProgress, signal, timeoutMs, outside });
  return realLocate({ onProgress, targetAccuracy, timeoutMs, signal });
}

/* --------------------------- simulasi --------------------------- */

function demoLocate({ onProgress, signal, timeoutMs, outside = false }) {
  const base = {
    lat: CFG.SITE?.lat ?? -6.2088,
    lng: CFG.SITE?.lng ?? 106.8457,
  };

  // Titik akhir: ~20 m dari kantor, atau ~428 m saat simulasi luar radius.
  const spread = outside
    ? { dLat: 0.00385, dLng: 0.0002 }
    : { dLat: 0.00007, dLng: -0.00016 };

  const factors = [1.25, 1.15, 1.08, 1.02, 1];
  const accuracies = [140, 96, 61, 42, 29];
  const samples = accuracies.map((accuracy, i) => ({
    lat: base.lat + spread.dLat * factors[i],
    lng: base.lng + spread.dLng * factors[i],
    accuracy,
  }));

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
