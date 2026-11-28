/* =========================================================
   Presensi — orkestrasi UI.
   Alur: login -> verifikasi lokasi -> selfie -> kirim -> sukses.
   ========================================================= */

import { api } from "./api.js";
import { syncClock, startClock, serverNow } from "./clock.js";
import { locate } from "./geo.js";
import { renderOffice, renderLocation, resizeMap } from "./map.js";
import {
  startCamera,
  stopCamera,
  capturePhoto,
  captureDemoPhoto,
} from "./camera.js";
import { $, $$, el, setBusy, toast, icon } from "./ui.js";
import {
  fmtHM,
  fmtMonthYear,
  fmtWeekday,
  fmtLongDate,
  monthKey,
  dayNumber,
  shortMonth,
  monthIndexOf,
  minutesToHM,
} from "./time.js";

const CFG = window.APP_CONFIG;
const DEMO = api.demo;

const state = {
  screen: "login",
  employee: null,
  token: null,
  today: null,
  month: new Date(),
  location: null,
  coords: null,
  photo: null,
  pendingType: "in",
  simulateOutside: false,
  cameraFallback: false,
  busy: false,
  presenceBusy: false,
  presenceStale: false,
  locateAbort: null,
};

let historySeq = 0;
let detailModal = null;

/* ------------------------------ boot ------------------------------ */

function init() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  $("#brand-name").textContent = CFG.COMPANY_NAME;
  $("#demo-badge").hidden = !DEMO;
  $("#demo-hint").hidden = !DEMO;
  $("#cam-demo").hidden = !DEMO;
  $("#reset-demo").hidden = !DEMO;

  startClock({
    timeEl: $("#clock"),
    secEl: $("#clock-sec"),
    dateEl: $("#hero-date"),
  });
  syncClock();

  bindEvents();
  showScreen("login");
}

function bindEvents() {
  $("#login-form").addEventListener("submit", onLogin);
  $("#toggle-pin").addEventListener("click", togglePin);
  $("#btn-logout").addEventListener("click", logout);
  $("#btn-logout-2").addEventListener("click", logout);

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showScreen(tab.dataset.tab));
  });

  $("#hist-prev").addEventListener("click", () => shiftMonth(-1));
  $("#hist-next").addEventListener("click", () => shiftMonth(1));

  $("#btn-check-in").addEventListener("click", () => startFlow("in"));
  $("#btn-check-out").addEventListener("click", () => startFlow("out"));
  $("#map-refresh").addEventListener("click", refreshPresence);
  $("#map-retry").addEventListener("click", refreshPresence);
  $("#home-correct").addEventListener("click", () => {
    toast("Pengajuan koreksi akan tersedia di versi berikutnya.");
  });

  $("#loc-cancel").addEventListener("click", closeLocate);
  $("#loc-retry").addEventListener("click", runLocation);
  $("#loc-continue").addEventListener("click", () => {
    closeLocate();
    openCamera();
  });
  $("#loc-correct").addEventListener("click", () => {
    toast("Pengajuan koreksi akan tersedia di versi berikutnya.");
  });

  $("#cam-close").addEventListener("click", closeCamera);
  $("#cam-shutter").addEventListener("click", takePhoto);
  $("#cam-demo").addEventListener("click", useDemoPhoto);

  $("#prev-back").addEventListener("click", backToCamera);
  $("#prev-retake").addEventListener("click", backToCamera);
  $("#prev-submit").addEventListener("click", submitAttendance);

  $("#succ-done").addEventListener("click", () => {
    $("#ov-success").hidden = true;
    refreshScrollLock();
    showScreen("home");
  });

  $("#toggle-outside").addEventListener("change", (event) => {
    state.simulateOutside = event.target.checked;
    toast(
      state.simulateOutside
        ? "Simulasi aktif: lokasi akan dianggap di luar radius."
        : "Simulasi luar radius dimatikan."
    );
    if (state.screen === "home") refreshPresence();
    else state.presenceStale = true;
  });

  $("#reset-demo").addEventListener("click", () => {
    api.resetDemo();
    window.location.reload();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("#ov-camera").hidden) closeCamera();
    else if (!$("#ov-preview").hidden) backToCamera();
    else if (!$("#ov-locate").hidden) closeLocate();
  });
}

/* ----------------------------- layar ----------------------------- */

function showScreen(name) {
  state.screen = name;

  ["login", "home", "history", "profile"].forEach((key) => {
    const screen = $(`#screen-${key}`);
    if (screen) screen.hidden = key !== name;
  });

  const authed = name !== "login";
  $("#tabbar").hidden = !authed;
  $("#btn-logout").hidden = !authed;

  $$(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === name);
  });

  if (name === "history") renderHistory();
  if (name === "profile") renderProfile();
  if (name === "home") {
    if (state.employee && state.presenceStale) {
      state.presenceStale = false;
      refreshPresence();
    } else {
      resizeMap();
    }
  }

  window.scrollTo({ top: 0 });
}

/* ----------------------------- login ----------------------------- */

async function onLogin(event) {
  event.preventDefault();
  if (state.busy) return;

  const nip = $("#nip").value.trim();
  const pin = $("#pin").value;
  const errorEl = $("#login-error");
  errorEl.hidden = true;

  if (!nip || !pin) {
    errorEl.textContent = "NIP dan PIN wajib diisi.";
    errorEl.hidden = false;
    return;
  }

  state.busy = true;
  setBusy($("#btn-login"), true);

  try {
    const { employee, token } = await api.login(nip, pin);
    state.employee = employee;
    state.token = token;
    state.today = await api.today();

    $("#pin").value = "";
    showScreen("home");
    renderHome();
  } catch (err) {
    errorEl.textContent = err.message || "Gagal masuk. Coba lagi.";
    errorEl.hidden = false;
  } finally {
    state.busy = false;
    setBusy($("#btn-login"), false);
  }
}

function togglePin() {
  const input = $("#pin");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("#toggle-pin .eye-on").hidden = show;
  $("#toggle-pin .eye-off").hidden = !show;
  $("#toggle-pin").setAttribute("aria-label", show ? "Sembunyikan PIN" : "Tampilkan PIN");
}

async function logout() {
  try {
    await api.logout();
  } catch {
    /* logout lokal tetap jalan */
  }

  stopCamera();
  hideAllOverlays();

  if (state.locateAbort) {
    state.locateAbort.abort();
    state.locateAbort = null;
  }

  state.employee = null;
  state.token = null;
  state.today = null;
  state.location = null;
  state.coords = null;
  state.photo = null;
  state.simulateOutside = false;
  state.presenceStale = false;
  $("#toggle-outside").checked = false;

  $("#login-form").reset();
  $("#login-error").hidden = true;
  showScreen("login");
}

/* ----------------------------- home ----------------------------- */

function renderHome() {
  const emp = state.employee;
  if (!emp) return;

  $("#emp-name").textContent = emp.name;
  $("#emp-role").textContent = emp.role;
  $("#emp-avatar").textContent = emp.initials;
  $("#plan-in").textContent = emp.shift.start;
  $("#plan-out").textContent = emp.shift.end;

  const rec = state.today;
  $("#shift-in").textContent = rec?.in || "--:--";
  $("#shift-out").textContent = rec?.out || "--:--";

  renderOffice(emp.site);
  renderPresence();
  updateActions();

  if (!state.location && !state.presenceBusy) refreshPresence();
}

function setBadge(kind, text) {
  const badge = $("#presence-badge");
  badge.className = `badge-soft ${kind}`;
  badge.textContent = text;
}

function setPresenceChecking() {
  $("#presence-icon").className = "status-icon";
  $("#presence-icon").replaceChildren(icon("pin", 22));
  $("#presence-title").textContent = "Memeriksa lokasi…";
  $("#presence-sub").textContent = "Menentukan posisi kamu terhadap area kantor.";
  setBadge("badge-gray", "—");

  $("#map-overlay").hidden = false;
  $("#map-spinner").hidden = false;
  $("#map-overlay-text").textContent = "Mencari lokasi…";
  $("#map-retry").hidden = true;
  $("#map-meta-text").textContent = "Akurasi —";
  $("#map-refresh").disabled = true;
  $("#home-correct").hidden = true;
}

function renderPresence() {
  const emp = state.employee;
  if (!emp) return;

  const loc = state.location;
  if (!loc) {
    setPresenceChecking();
    return;
  }

  const site = loc.site || emp.site;

  renderLocation({ user: state.coords, site });

  $("#map-overlay").hidden = true;
  $("#map-refresh").disabled = false;
  $("#map-meta-text").textContent = state.coords
    ? `Akurasi ${state.coords.accuracy} m · radius ${site.radius} m`
    : `Radius ${site.radius} m`;

  const lowAccuracy =
    state.coords && state.coords.accuracy > CFG.LOCATION.maxAccuracy;

  $("#home-correct").hidden = loc.inside;

  if (!loc.inside) {
    $("#presence-icon").className = "status-icon warn";
    $("#presence-icon").replaceChildren(icon("alert", 22));
    $("#presence-title").textContent = "Di luar area kantor";
    $("#presence-sub").textContent = `${loc.distance} m dari ${site.name}`;
    setBadge("badge-amber", "Di luar radius");
    return;
  }

  if (lowAccuracy) {
    $("#presence-icon").className = "status-icon warn";
    $("#presence-icon").replaceChildren(icon("alert", 22));
    $("#presence-title").textContent = "Akurasi lokasi rendah";
    $("#presence-sub").textContent = `Akurasi ${state.coords.accuracy} m. Pindah ke area terbuka lalu perbarui.`;
    setBadge("badge-amber", "Kurang akurat");
    return;
  }

  $("#presence-icon").className = "status-icon ok";
  $("#presence-icon").replaceChildren(icon("check", 22));
  $("#presence-title").textContent = "Di area kantor";
  $("#presence-sub").textContent = `${loc.distance} m dari ${site.name}`;
  setBadge("badge-green", "Tepat lokasi");
}

function renderPresenceError(err) {
  const titles = {
    denied: "Izin lokasi ditolak",
    timeout: "Lokasi tidak terdeteksi",
    unsupported: "GPS tidak didukung",
  };

  $("#presence-icon").className = "status-icon warn";
  $("#presence-icon").replaceChildren(icon("alert", 22));
  $("#presence-title").textContent = titles[err.code] || "Lokasi belum terverifikasi";
  $("#presence-sub").textContent = err.message || "Perbarui lokasi untuk mencoba lagi.";
  setBadge("badge-amber", "Belum terverifikasi");

  $("#map-overlay").hidden = false;
  $("#map-spinner").hidden = true;
  $("#map-overlay-text").textContent = err.message || "Lokasi tidak tersedia.";
  $("#map-retry").hidden = false;
  $("#map-refresh").disabled = false;
  $("#home-correct").hidden = true;
}

async function refreshPresence() {
  if (!state.employee || state.presenceBusy) return;

  state.presenceBusy = true;
  state.presenceStale = false;
  state.location = null;

  if (state.locateAbort) state.locateAbort.abort();
  state.locateAbort = new AbortController();
  const signal = state.locateAbort.signal;

  setPresenceChecking();
  updateActions();

  try {
    const coords = await locate({
      demo: DEMO,
      outside: state.simulateOutside,
      signal,
      onProgress: (sample) => {
        $("#map-meta-text").textContent = `Mencari sinyal · akurasi ${sample.accuracy} m`;
      },
    });
    state.coords = coords;

    const result = await api.locationCheck({
      ...coords,
      simulateOutside: state.simulateOutside,
    });

    state.location = result;
    renderPresence();
  } catch (err) {
    if (err.code !== "aborted") renderPresenceError(err);
  } finally {
    state.presenceBusy = false;
    updateActions();
  }
}

function isLocationReady() {
  const loc = state.location;
  if (!loc?.inside) return false;
  if (state.coords && state.coords.accuracy > CFG.LOCATION.maxAccuracy) return false;
  return true;
}

function updateActions() {
  const rec = state.today;
  const ready = isLocationReady();
  const hasIn = Boolean(rec?.in);
  const hasOut = Boolean(rec?.out);

  // Tombol sengaja tidak dimatikan karena absen sudah ada: user bisa salah
  // klik atau perlu absen ulang. Server memakai jam masuk paling awal dan
  // jam pulang paling akhir.
  $("#btn-check-in").disabled = !ready;
  $("#btn-check-out").disabled = !ready;

  let note = "Tombol aktif setelah lokasi terverifikasi di area kantor.";

  const lowAccuracy =
    state.coords && state.coords.accuracy > CFG.LOCATION.maxAccuracy;

  if (state.location && !state.location.inside) {
    note = "Kamu di luar radius kantor. Dekati lokasi lalu tekan Perbarui.";
  } else if (lowAccuracy) {
    note = "Akurasi GPS rendah. Pindah ke area terbuka lalu tekan Perbarui.";
  } else if (ready && hasIn && hasOut) {
    note = "Presensi tercatat. Masih bisa absen lagi; sistem memakai jam masuk paling awal dan jam pulang paling akhir.";
  } else if (ready && hasIn) {
    note = "Sudah absen masuk. Masih bisa absen masuk atau pulang lagi bila perlu.";
  } else if (ready) {
    note = "Lokasi terverifikasi. Pilih absen masuk atau pulang.";
  }

  $("#action-note").textContent = note;
}

function startFlow(type) {
  if (state.busy) return;

  if (!isLocationReady()) {
    toast("Lokasi belum terverifikasi. Perbarui lokasi dulu.", "err");
    refreshPresence();
    return;
  }

  state.pendingType = type;

  // Token lokasi masih segar -> langsung ke kamera, tanpa ulang verifikasi.
  const fresh =
    state.location?.token &&
    (!state.location.expiresAt ||
      state.location.expiresAt - Date.now() > 15000);

  if (fresh) openCamera();
  else openLocate();
}

/* ----------------------------- lokasi ----------------------------- */

function openLocate() {
  state.location = null;
  state.coords = null;
  state.photo = null;

  $("#ov-locate").hidden = false;
  refreshScrollLock();

  $("#loc-icon").className = "sheet-icon";
  $("#loc-icon").replaceChildren(icon("pin", 30));
  $("#loc-title").textContent = "Memeriksa lokasi…";
  $("#loc-sub").textContent = "Pastikan GPS aktif dan kamu berada di area kantor.";
  $("#loc-progress").hidden = false;
  $("#loc-result").hidden = true;
  $("#loc-acc").textContent = "—";
  $("#loc-cancel").hidden = false;
  $("#loc-retry").hidden = true;
  $("#loc-continue").hidden = true;
  $("#loc-correct").hidden = true;

  runLocation();
}

async function runLocation() {
  if (state.locateAbort) state.locateAbort.abort();
  state.locateAbort = new AbortController();

  $("#loc-progress").hidden = false;
  $("#loc-result").hidden = true;
  $("#loc-retry").hidden = true;
  $("#loc-continue").hidden = true;
  $("#loc-correct").hidden = true;
  $("#loc-title").textContent = "Memeriksa lokasi…";
  $("#loc-sub").textContent = "Pastikan GPS aktif dan kamu berada di area kantor.";
  $("#loc-icon").className = "sheet-icon";
  $("#loc-icon").replaceChildren(icon("pin", 30));
  $("#loc-acc").textContent = "—";

  const signal = state.locateAbort.signal;

  try {
    const coords = await locate({
      demo: DEMO,
      outside: state.simulateOutside,
      signal,
      onProgress: (sample) => {
        $("#loc-acc").textContent = `${sample.accuracy} m`;
      },
    });

    state.coords = coords;

    const result = await api.locationCheck({
      ...coords,
      simulateOutside: state.simulateOutside,
    });

    state.location = result;
    renderLocationResult(result, coords);
  } catch (err) {
    if (err.code === "aborted") return;
    renderLocationError(err);
  }
}

function fillLocationRows(result, coords) {
  $("#loc-site").textContent = result.site?.name || "—";
  $("#loc-dist").textContent = `${result.distance} m`;
  $("#loc-radius").textContent = `${result.site?.radius ?? "—"} m`;
  $("#loc-acc2").textContent = `${coords.accuracy} m`;
}

function renderLocationResult(result, coords) {
  $("#loc-progress").hidden = true;
  $("#loc-result").hidden = false;
  fillLocationRows(result, coords);

  if (!result.inside) {
    $("#loc-icon").className = "sheet-icon bad";
    $("#loc-icon").replaceChildren(icon("alert", 30));
    $("#loc-title").textContent = "Di luar area kantor";
    $("#loc-sub").textContent = `Kamu berada ${result.distance} m dari ${result.site?.name || "kantor"}. Radius yang diizinkan ${result.site?.radius ?? "—"} m.`;
    $("#loc-retry").hidden = false;
    $("#loc-continue").hidden = true;
    $("#loc-correct").hidden = false;
    return;
  }

  if (coords.accuracy > CFG.LOCATION.maxAccuracy) {
    $("#loc-icon").className = "sheet-icon bad";
    $("#loc-icon").replaceChildren(icon("alert", 30));
    $("#loc-title").textContent = "Akurasi lokasi rendah";
    $("#loc-sub").textContent = `Akurasi ${coords.accuracy} m. Pindah ke area terbuka lalu coba lagi.`;
    $("#loc-retry").hidden = false;
    $("#loc-continue").hidden = true;
    return;
  }

  $("#loc-icon").className = "sheet-icon ok";
  $("#loc-icon").replaceChildren(icon("check", 30));
  $("#loc-title").textContent = "Di area kantor";
  $("#loc-sub").textContent = "Lokasi terverifikasi. Lanjut ambil selfie untuk menyelesaikan absen.";
  $("#loc-retry").hidden = true;
  $("#loc-continue").hidden = false;
}

function renderLocationError(err) {
  $("#loc-progress").hidden = true;
  $("#loc-result").hidden = true;

  const titles = {
    denied: "Izin lokasi ditolak",
    timeout: "Lokasi tidak terdeteksi",
    unsupported: "GPS tidak didukung",
  };

  $("#loc-icon").className = "sheet-icon bad";
  $("#loc-icon").replaceChildren(icon("alert", 30));
  $("#loc-title").textContent = titles[err.code] || "Gagal memeriksa lokasi";
  $("#loc-sub").textContent = err.message || "Coba lagi beberapa saat.";
  $("#loc-retry").hidden = false;
  $("#loc-continue").hidden = true;
  $("#loc-correct").hidden = false;
}

function closeLocate() {
  if (state.locateAbort) {
    state.locateAbort.abort();
    state.locateAbort = null;
  }
  $("#ov-locate").hidden = true;
  refreshScrollLock();

  if (state.screen === "home") {
    if (state.location) {
      renderPresence();
      updateActions();
    } else {
      refreshPresence();
    }
  }
}

/* ----------------------------- kamera ----------------------------- */

async function openCamera() {
  state.photo = null;
  state.cameraFallback = false;

  $("#ov-camera").hidden = false;
  $("#ov-preview").hidden = true;
  refreshScrollLock();

  const video = $("#cam-video");
  video.hidden = false;
  $("#cam-hint").textContent = "Menyiapkan kamera…";

  try {
    await startCamera(video);
    $("#cam-hint").textContent = "Posisikan wajah di dalam lingkaran";
  } catch (err) {
    if (DEMO) {
      state.cameraFallback = true;
      video.hidden = true;
      $("#cam-hint").textContent =
        "Kamera tidak tersedia — mode demo memakai foto contoh.";
      toast("Kamera tidak tersedia. Mode demo memakai foto contoh.", "err");
    } else {
      toast(err.message || "Kamera tidak dapat dibuka.", "err");
      closeCamera();
    }
  }
}

async function takePhoto() {
  if (state.busy) return;
  if ($("#ov-camera").hidden) return;
  if (!state.coords) {
    toast("Lokasi belum siap. Tunggu verifikasi lokasi selesai.", "err");
    return;
  }

  const meta = {
    name: state.employee?.name || "",
    sub: `${fmtHM(serverNow())} · ${state.coords.lat.toFixed(5)}, ${state.coords.lng.toFixed(5)}`,
  };

  try {
    const shot = state.cameraFallback
      ? await captureDemoPhoto(meta)
      : await capturePhoto($("#cam-video"), meta);

    state.photo = shot;
    $("#prev-img").src = shot.dataUrl;
    $("#ov-camera").hidden = true;
    $("#ov-preview").hidden = false;
    refreshScrollLock();
  } catch (err) {
    toast(err.message || "Gagal mengambil foto.", "err");
  }
}

function backToCamera() {
  $("#ov-preview").hidden = true;
  $("#ov-camera").hidden = false;
  refreshScrollLock();
}

function useDemoPhoto() {
  if (!DEMO) return;
  if ($("#ov-camera").hidden) return;
  state.cameraFallback = true;
  stopCamera();
  $("#cam-video").hidden = true;
  takePhoto();
}

function closeCamera() {
  stopCamera();
  state.photo = null;
  $("#ov-camera").hidden = true;
  $("#ov-preview").hidden = true;
  refreshScrollLock();
}

/* ----------------------------- submit ----------------------------- */

async function submitAttendance() {
  if (state.busy) return;
  if ($("#ov-preview").hidden) return;
  if (!state.photo || !state.location?.token) {
    toast("Sesi verifikasi tidak lengkap. Ulangi dari awal.", "err");
    closeCamera();
    return;
  }

  state.busy = true;
  setBusy($("#prev-submit"), true);

  try {
    const result = await api.punch({
      type: state.pendingType,
      token: state.location.token,
      blob: state.photo.blob,
      coords: state.coords,
    });

    state.today = result.record;
    if (state.location) state.location.token = null;

    stopCamera();
    $("#ov-preview").hidden = true;
    renderHome();
    showSuccess(result);
  } catch (err) {
    toast(err.message || "Gagal mengirim absen.", "err");
    if (/kedaluwarsa|expired/i.test(err.message || "")) {
      closeCamera();
      openLocate();
    }
  } finally {
    state.busy = false;
    setBusy($("#prev-submit"), false);
  }
}

function showSuccess(result) {
  const isIn = state.pendingType === "in";
  const record = result.record;

  $("#succ-title").textContent = isIn
    ? "Absen masuk tercatat"
    : "Absen pulang tercatat";
  $("#succ-time").textContent = (isIn ? record.in : record.out) || result.time;

  const badge = $("#succ-badge");
  if (isIn && record.status === "terlambat") {
    badge.className = "badge-soft badge-amber";
    badge.textContent = `Terlambat ${record.lateMinutes} menit`;
  } else if (isIn) {
    badge.className = "badge-soft badge-green";
    badge.textContent = "Tepat waktu";
  } else {
    badge.className = "badge-soft badge-green";
    badge.textContent = "Pulang tercatat";
  }

  $("#succ-meta").textContent = `${state.employee.name} · ${record.distance} m dari ${record.site}`;

  $("#ov-success").hidden = false;
  refreshScrollLock();
}

/* ----------------------------- riwayat ----------------------------- */

function shiftMonth(delta) {
  const next = new Date(state.month);
  next.setDate(1);
  next.setMonth(next.getMonth() + delta);
  state.month = next;
  renderHistory();
}

async function renderHistory() {
  const key = monthKey(state.month);
  const seq = ++historySeq;

  $("#hist-month").textContent = fmtMonthYear(state.month);
  $("#hist-next").disabled = key >= monthKey(new Date());

  const list = $("#history-list");
  const empty = $("#history-empty");
  list.replaceChildren(el("p", "empty-state", "Memuat riwayat…"));
  empty.hidden = true;

  let records = [];
  try {
    records = await api.history(key);
  } catch (err) {
    if (seq !== historySeq) return;
    list.replaceChildren();
    toast(err.message || "Gagal memuat riwayat.", "err");
    return;
  }

  if (seq !== historySeq) return;

  renderSummary(records);
  list.replaceChildren();

  if (!records.length) {
    empty.hidden = false;
    return;
  }

  records.forEach((record) => list.appendChild(historyItem(record)));
}

function renderSummary(records) {
  const withIn = records.filter((r) => r.in);
  const hadir = withIn.length;
  const late = withIn.filter((r) => r.status === "terlambat").length;

  const avg =
    hadir === 0
      ? null
      : withIn.reduce((sum, r) => {
          const [h, m] = r.in.split(":").map(Number);
          return sum + h * 60 + m;
        }, 0) / hadir;

  $("#sum-hadir").textContent = String(hadir);
  $("#sum-late").textContent = String(late);
  $("#sum-avg").textContent = avg === null ? "--:--" : minutesToHM(avg);
}

function historyItem(record) {
  const item = el("button", "history-item");
  item.type = "button";

  const chip = el("span", "date-chip");
  chip.append(
    el("b", "", String(dayNumber(record.date))),
    el("span", "", shortMonth(monthIndexOf(record.date)))
  );

  const main = el("div", "hist-main");
  main.appendChild(el("div", "hist-day", weekdayOf(record.date)));

  const times = el("div", "hist-times");
  times.append(document.createTextNode("Masuk "));
  times.append(el("b", "", record.in || "--:--"));
  times.append(document.createTextNode(" · Pulang "));
  times.append(el("b", "", record.out || "--:--"));

  main.appendChild(times);

  const badge = !record.in
    ? el("span", "badge-soft badge-amber", "Tanpa masuk")
    : record.status === "terlambat"
      ? el("span", "badge-soft badge-amber", `Telat ${record.lateMinutes}m`)
      : el("span", "badge-soft badge-green", "Tepat");

  item.append(chip, main, badge);
  item.addEventListener("click", () => openDetail(record));
  return item;
}

function weekdayOf(key) {
  return fmtWeekday(dateFromKey(key));
}

function dateFromKey(key) {
  // 05:00 UTC = 12:00 WIB, aman dari pergeseran tanggal.
  return new Date(`${key}T05:00:00Z`);
}

function openDetail(record) {
  if (!detailModal) {
    detailModal = window.bootstrap.Modal.getOrCreateInstance($("#detail-modal"));
  }

  const date = dateFromKey(record.date);
  $("#detail-sub").textContent = fmtLongDate(date);
  $("#detail-in").textContent = record.in || "--:--";
  $("#detail-out").textContent = record.out || "--:--";
  $("#detail-status").textContent = !record.in
    ? "Belum absen masuk"
    : record.status === "terlambat"
      ? `Terlambat ${record.lateMinutes} mnt`
      : "Tepat waktu";
  $("#detail-dist").textContent = `${record.distance} m`;
  $("#detail-photo-note").textContent = `Akurasi ${record.accuracy} m · ${record.site}`;

  detailModal.show();
}

/* ----------------------------- profil ----------------------------- */

function renderProfile() {
  const emp = state.employee;
  if (!emp) return;

  $("#prof-avatar").textContent = emp.initials;
  $("#prof-name").textContent = emp.name;
  $("#prof-role").textContent = emp.role;
  $("#prof-nip").textContent = emp.nip;
  $("#prof-site").textContent = emp.site.name;
  $("#prof-radius").textContent = `${emp.site.radius} m`;
  $("#prof-shift").textContent = `${emp.shift.start} — ${emp.shift.end}`;

  const device = $("#prof-device");
  device.textContent = emp.device.registered
    ? "Perangkat terdaftar"
    : "Perangkat belum terdaftar";
  device.className = `badge-soft ${emp.device.registered ? "badge-green" : "badge-amber"}`;

  $("#toggle-outside").checked = state.simulateOutside;
}

/* ----------------------------- util ----------------------------- */

function refreshScrollLock() {
  const open = ["ov-locate", "ov-camera", "ov-preview", "ov-success"].some(
    (id) => !document.getElementById(id).hidden
  );
  document.body.style.overflow = open ? "hidden" : "";
}

function hideAllOverlays() {
  ["ov-locate", "ov-camera", "ov-preview", "ov-success"].forEach((id) => {
    document.getElementById(id).hidden = true;
  });
  refreshScrollLock();
}

init();
