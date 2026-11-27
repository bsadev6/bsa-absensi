/* =========================================================
   Konfigurasi aplikasi.
   File ini sengaja terpisah dari build supaya URL backend bisa
   diganti tanpa rebuild (mis. staging vs produksi).
   ========================================================= */

window.APP_CONFIG = {
  // Ganti ke URL backend saat sudah tersedia.
  API_BASE_URL: "http://localhost:3000/api",

  // true = pakai data & alur simulasi (belum butuh backend).
  DEMO_MODE: true,

  TIMEZONE: "Asia/Jakarta",
  COMPANY_NAME: "PT Bintang Selatan Agung",

  SHIFT: {
    start: "08:00",
    end: "16:00",
    lateToleranceMinutes: 10,
  },

  LOCATION: {
    // Akurasi yang dianggap bagus (meter).
    targetAccuracy: 30,
    // Di atas ini, lokasi ditolak dan user diminta cari sinyal lebih baik.
    maxAccuracy: 60,
    timeoutMs: 15000,
  },

  // Titik kantor untuk peta di mode demo. Saat backend aktif, koordinat
  // site datang dari server (respons location-check), bukan dari sini.
  SITE: {
    name: "Kantor Pusat",
    lat: -2.965847527086366,
    lng: 104.70989501874661,
    radius: 150,
  },

  // Umur token verifikasi lokasi (detik).
  LOCATION_TOKEN_TTL_SECONDS: 180,

  PHOTO: {
    maxWidth: 720,
    quality: 0.85,
  },
};
