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
2. **Verifikasi lokasi** (simulasi GPS dengan akurasi yang membaik).
3. **Selfie** lewat `getUserMedia`, crop 3:4, watermark nama/jam/koordinat.
4. **Kirim absen** + layar sukses.
5. **Riwayat** per bulan + ringkasan + modal detail.
6. **Profil** + simulasi "di luar radius" untuk menguji state gagal.

State gagal yang sudah ditangani: izin GPS ditolak, timeout, akurasi rendah,
di luar radius, izin kamera ditolak, dan kamera tidak tersedia (fallback foto
demo saat `DEMO_MODE`).

## Struktur

```
index.html            semua layar + overlay
config.js             API base URL, mode demo, shift, ambang akurasi
css/tokens.css        font + design token
css/app.css           seluruh styling aplikasi
js/app.js             state machine & orkestrasi UI
js/api.js             lapisan API + data demo
js/clock.js           jam tersinkron server
js/geo.js             watchPosition + pemilihan sampel terbaik
js/camera.js          getUserMedia, crop, watermark, JPEG
js/time.js            helper waktu zona Asia/Jakarta
js/ui.js              helper DOM, toast, ikon
dev-server.js         server statis lokal (Bun)
vendor/               Bootstrap 5.3.3 + font (self-host)
```

## Beralih ke backend nyata

1. Set `DEMO_MODE: false` di `config.js`.
2. Set `API_BASE_URL` ke endpoint Express, mis. `https://api.domain.com/api`.
3. Pastikan backend mengirim header CORS hanya untuk origin GitHub Pages.
4. Kontrak endpoint yang diasumsikan ada di komentar `js/api.js`:

| Method | Path | Keterangan |
|---|---|---|
| POST | `/auth/login` | `{ nip, pin }` → `{ token, employee }` |
| POST | `/attendance/location-check` | `{ lat, lng, accuracy }` → `{ inside, distance, site, token, expiresAt }` |
| POST | `/attendance/punch` | multipart: `photo`, `token`, `lat`, `lng`, `accuracy`, `type` |
| GET | `/attendance/history?month=YYYY-MM` | daftar absensi |
| GET | `/attendance/today` | absensi hari ini |
| GET | `/time` | `{ now: <epoch ms> }` untuk sinkron jam |

Token dari `location-check` **wajib** dikirim saat punch. Backend harus:
- menghitung jarak sendiri (jangan percaya `inside` dari client),
- memvalidasi TTL token dan mencocokkan koordinat saat punch,
- menempel watermark otoritatif dan menyimpan foto di object storage.

## Deploy ke GitHub Pages

- Repo ini memakai workflow `.github/workflows/deploy-pages.yml` yang mengunggah
  seluruh isi repo.
- Di GitHub: **Settings → Pages → Source: GitHub Actions**.
- Semua path sudah relatif, jadi aman untuk project site (`/nama-repo/`).
- `.nojekyll` sudah disertakan.
- `config.js` bisa diganti tanpa rebuild.
- Jangan taruh secret apa pun di frontend.

## Catatan keamanan

- Token akses sebaiknya disimpan di memori, bukan `localStorage`.
- Jangan memakai `innerHTML` untuk data dari API. Kode ini hanya memakai
  `innerHTML` untuk ikon statis.
- PIN hanya dikirim ke backend lewat HTTPS.
- Tambahkan CSP di GitHub Pages bila memungkinkan.
