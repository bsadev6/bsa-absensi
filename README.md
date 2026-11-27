# Presensi — Frontend

Aplikasi presensi karyawan (mobile-first) dengan Bootstrap 5 + HTML/CSS + vanilla JS.
Ini adalah **repo frontend** yang berdiri sendiri; backend Express + Postgres berada
di repo terpisah. Aplikasi statis ini di-deploy ke GitHub Pages dan saat ini
berjalan dengan **data demo**.

## Menjalankan

Dari folder ini:

```bash
bun run dev
# buka http://localhost:5173
```

Alternatif tanpa Bun:

```bash
python -m http.server 5173
```

> Kamera dan geolokasi memerlukan secure context. `localhost` dianggap aman,
> tetapi membuka `index.html` langsung lewat `file://` **tidak** akan bekerja
> (ES modules diblokir CORS). Selalu lewat server lokal.

Akun demo: **NIP 1001 / PIN 1234**.

## Alur yang sudah ada

1. **Login** NIP + PIN.
2. **Beranda** menampilkan peta area kantor (Leaflet + OpenStreetMap), posisi
   pengguna, jarak, dan akurasi. Tombol **Absen Masuk** dan **Absen Pulang**
   terpisah, aktif hanya saat lokasi terverifikasi di dalam radius.
3. **Verifikasi lokasi** (simulasi GPS dengan akurasi yang membaik).
4. **Selfie** lewat `getUserMedia`, crop 3:4, watermark nama/jam/koordinat.
5. **Kirim absen** + layar sukses.
6. **Riwayat** per bulan + ringkasan + modal detail.
7. **Profil** + simulasi "di luar radius" untuk menguji state gagal.

State gagal yang sudah ditangani: izin GPS ditolak, timeout, akurasi rendah,
di luar radius, izin kamera ditolak, dan kamera tidak tersedia (fallback foto
demo saat `DEMO_MODE`).

## Struktur

```
index.html            semua layar + overlay
config.js             API base URL, mode demo, shift, ambang akurasi, titik kantor demo
css/tokens.css        font + design token
css/app.css           seluruh styling aplikasi
js/app.js             state machine & orkestrasi UI
js/api.js             lapisan API + data demo
js/clock.js           jam tersinkron server
js/geo.js             watchPosition + pemilihan sampel terbaik
js/map.js             peta Leaflet: area kantor + posisi pengguna
js/camera.js          getUserMedia, crop, watermark, JPEG
js/time.js            helper waktu zona Asia/Jakarta
js/ui.js              helper DOM, toast, ikon
dev-server.js         server statis lokal (Bun)
vendor/               Bootstrap 5.3.3, Leaflet 1.9.4, font (self-host)
```

## Beralih ke backend nyata

1. Set `DEMO_MODE: false` di `config.js`.
2. Set `API_BASE_URL` ke endpoint Express, mis. `https://api.domain.com/api`.
3. Pastikan backend mengirim header CORS hanya untuk origin GitHub Pages.
4. Kontrak endpoint yang diasumsikan ada di komentar `js/api.js`:

| Method | Path | Keterangan |
|---|---|---|
| POST | `/auth/login` | `{ nip, pin }` → `{ token, employee }` |
| POST | `/attendance/location-check` | `{ lat, lng, accuracy }` → `{ inside, distance, site, token, expiresAt }`; `site` berisi `{ id, name, lat, lng, radius }` |
| POST | `/attendance/punch` | multipart: `photo`, `token`, `lat`, `lng`, `accuracy`, `type` (`in`/`out`) |
| GET | `/attendance/history?month=YYYY-MM` | daftar absensi |
| GET | `/attendance/today` | absensi hari ini |
| GET | `/time` | `{ now: <epoch ms> }` untuk sinkron jam |

Token dari `location-check` **wajib** dikirim saat punch. Backend harus:
- menghitung jarak sendiri (jangan percaya `inside` dari client),
- memvalidasi TTL token dan mencocokkan koordinat saat punch,
- menempel watermark otoritatif dan menyimpan foto di object storage.

**Aturan absen berulang:** tombol absen tidak dikunci di frontend. User boleh
mengirim absen masuk/pulang lebih dari sekali (mis. salah klik). Saat menyimpan,
backend memakai **jam masuk paling awal** dan **jam pulang paling akhir** untuk
setiap tanggal. Absen pulang tanpa absen masuk tetap dicatat, lalu ditandai
sebagai anomali/tanpa masuk pada laporan.

## Deploy ke GitHub Pages

- Repo ini memakai workflow `.github/workflows/deploy-pages.yml` yang mengunggah
  seluruh isi repo.
- Di GitHub: **Settings → Pages → Source: GitHub Actions**.
- Semua path sudah relatif, jadi aman untuk project site (`/nama-repo/`).
- `.nojekyll` sudah disertakan.
- `config.js` bisa diganti tanpa rebuild.
- Jangan taruh secret apa pun di frontend.
- Peta memakai tile OpenStreetMap. Untuk trafik produksi yang ramai, ganti ke
  tile provider berbayar atau self-host agar tidak melanggar usage policy OSM.

## Catatan keamanan

- Token akses sebaiknya disimpan di memori, bukan `localStorage`.
- Jangan memakai `innerHTML` untuk data dari API. Kode ini hanya memakai
  `innerHTML` untuk ikon statis.
- PIN hanya dikirim ke backend lewat HTTPS.
- Tambahkan CSP di GitHub Pages bila memungkinkan.
