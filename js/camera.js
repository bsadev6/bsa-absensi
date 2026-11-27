/* =========================================================
   Kamera selfie: getUserMedia -> crop 3:4 -> watermark -> JPEG.
   Watermark di sini hanya untuk pratinjau; backend tetap wajib
   menempel watermark otoritatif.
   ========================================================= */

const CFG = window.APP_CONFIG;

let stream = null;

const CAMERA_TIMEOUT_MS = 12000;

export function cameraSupported() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function startCamera(videoEl) {
  if (!cameraSupported()) {
    const err = new Error("Kamera tidak didukung browser ini.");
    err.code = "unsupported";
    throw err;
  }

  stopCamera();

  let settled = false;

  const request = navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    })
    .then((result) => {
      if (settled) {
        // Izin baru diberikan setelah timeout: jangan tinggalkan stream aktif.
        result.getTracks().forEach((track) => track.stop());
        throw Object.assign(new Error("Kamera tidak merespons."), {
          code: "timeout",
        });
      }
      return result;
    });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      settled = true;
      reject(
        Object.assign(
          new Error("Kamera tidak merespons. Periksa izin kamera lalu coba lagi."),
          { code: "timeout" }
        )
      );
    }, CAMERA_TIMEOUT_MS);
  });

  try {
    stream = await Promise.race([request, timeout]);
  } catch (err) {
    const code =
      err.code === "timeout"
        ? "timeout"
        : err && err.name === "NotAllowedError"
          ? "denied"
          : "unavailable";

    const message =
      code === "timeout"
        ? err.message
        : code === "denied"
          ? "Izin kamera ditolak. Aktifkan izin kamera untuk situs ini."
          : "Kamera tidak dapat dibuka.";

    const e = new Error(message);
    e.code = code;
    throw e;
  }

  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch {
    /* autoplay bisa diblokir; video tetap tampil setelah gesture. */
  }
  return stream;
}

export function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
}

function drawWatermark(ctx, w, h, meta) {
  const barH = Math.round(h * 0.16);
  const grad = ctx.createLinearGradient(0, h - barH, 0, h);
  grad.addColorStop(0, "rgba(4, 8, 20, 0)");
  grad.addColorStop(1, "rgba(4, 8, 20, 0.86)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - barH, w, barH);

  const pad = Math.round(w * 0.05);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(w * 0.045)}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillText(meta.name || "", pad, h - pad - Math.round(h * 0.035));

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = `500 ${Math.round(w * 0.032)}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillText(meta.sub || "", pad, h - pad);

  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(w - pad, h - pad - Math.round(w * 0.008), Math.round(w * 0.014), 0, Math.PI * 2);
  ctx.fill();
}

function finishCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Gagal memproses foto."));
          return;
        }
        resolve({ blob, dataUrl: canvas.toDataURL("image/jpeg", CFG.PHOTO.quality) });
      },
      "image/jpeg",
      CFG.PHOTO.quality
    );
  });
}

export async function capturePhoto(videoEl, meta) {
  const vw = videoEl.videoWidth || 720;
  const vh = videoEl.videoHeight || 960;

  const targetW = Math.min(CFG.PHOTO.maxWidth, 720);
  const targetH = Math.round((targetW * 4) / 3);
  const targetRatio = targetW / targetH;

  let sw = vw;
  let sh = vh;
  let sx = 0;
  let sy = 0;

  if (vw / vh > targetRatio) {
    sw = Math.round(vh * targetRatio);
    sx = Math.round((vw - sw) / 2);
  } else {
    sh = Math.round(vw / targetRatio);
    sy = Math.round((vh - sh) / 2);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");

  // Cermin agar hasil sama dengan pratinjau.
  ctx.save();
  ctx.translate(targetW, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, targetW, targetH);
  ctx.restore();

  drawWatermark(ctx, targetW, targetH, meta);
  return finishCanvas(canvas);
}

/**
 * Foto contoh untuk mode demo saat kamera tidak tersedia.
 * Jelas diberi label supaya tidak disangka foto asli.
 */
export async function captureDemoPhoto(meta) {
  const w = 720;
  const h = 960;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#233a72");
  bg.addColorStop(1, "#0a1431");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Siluet sederhana.
  ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.44, 132, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.82, 230, 190, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.font = `700 ${Math.round(w * 0.038)}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("FOTO DEMO", w / 2, h * 0.56);
  ctx.font = `500 ${Math.round(w * 0.03)}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillText("kamera tidak tersedia", w / 2, h * 0.61);
  ctx.textAlign = "start";

  drawWatermark(ctx, w, h, meta);
  return finishCanvas(canvas);
}
