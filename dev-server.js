/**
 * Dev server statis minimal (tanpa dependency).
 * Jalankan: bun run dev
 * Catatan: kamera & geolokasi butuh secure context; localhost dianggap aman.
 */

const root = import.meta.dir;
const port = Number(process.env.PORT || 5173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname.endsWith("/")) pathname += "index.html";

    // Cegah path traversal sederhana.
    if (pathname.includes("..")) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = Bun.file(root + pathname);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    const ext = pathname.slice(pathname.lastIndexOf("."));
    return new Response(file, {
      headers: {
        "Content-Type": TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  },
});

console.log(`Presensi dev server: http://localhost:${server.port}`);
