/* =========================================================
   Presensi — orkestrasi UI.
   Alur: login -> verifikasi lokasi -> selfie -> kirim -> sukses.
   ========================================================= */

import { api } from "./api.js";
import { syncClock, startClock, serverNow } from "./clock.js";
import { locate } from "./geo.js";
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
    renderHome();
    showScreen("home");
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

  state.employee = null;
  state.token = null;
  state.today = null;
  state.location = null;
  state.coords = null;
  state.photo = null;
  state.simulateOutside = false;
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

  renderStatusCard(rec);
}

function badgeFor(record) {
  if (!record) return el("span", "badge-soft badge-gray", "Belum absen");
  if (record.status === "terlambat") {
    return el(
      "span",
      "badge-soft badge-amber",
      `Terlambat ${record.lateMinutes} menit`
    );
  }
  return el("span", "badge-soft badge-green", "Tepat waktu");
}

function renderStatusCard(record) {
  const box = $("#home-status");
  box.replaceChildren();

  const head = el("div", "status-head");
  const iconWrap = el("span", "status-icon");
  const textWrap = el("div");

  if (!record || !record.in) {
    iconWrap.appendChild(icon("pin", 22));
    textWrap.append(
      el("div", "status-title", "Belum absen masuk"),
      el(
        "div",
        "status-sub",
        `Jadwal ${state.employee.shift.start} · toleransi ${CFG.SHIFT.lateToleranceMinutes} menit`
      )
    );
    head.append(iconWrap, textWrap);

    const button = el("button", "btn-main", "Mulai Absen");
    button.type = "button";
    button.addEventListener("click", () => startFlow("in"));

    box.append(head, button);
    return;
  }

  if (!record.out) {
    iconWrap.classList.add("ok");
    iconWrap.appendChild(icon("check", 22));
    textWrap.append(
      el("div", "status-title", "Sudah absen masuk"),
      el("div", "status-sub", `${record.distance} m dari ${record.site}`)
    );
    head.append(iconWrap, textWrap);

    const big = el("div", "status-big", record.in);
    const badge = badgeFor(record);

    const button = el("button", "btn-main", "Absen Pulang");
    button.type = "button";
    button.addEventListener("click", () => startFlow("out"));

    box.append(head, big, badge, button);
    return;
  }

  iconWrap.classList.add("ok");
  iconWrap.appendChild(icon("check", 22));
  textWrap.append(
    el("div", "status-title", "Presensi hari ini selesai"),
    el("div", "status-sub", `${record.distance} m dari ${record.site}`)
  );
  head.append(iconWrap, textWrap);

  const big = el("div", "status-big", `${record.in} — ${record.out}`);
  const badge = el("span", "badge-soft badge-green", "Lengkap");

  const button = el("button", "btn-ghost", "Lihat Riwayat");
  button.type = "button";
  button.addEventListener("click", () => showScreen("history"));

  box.append(head, big, badge, button);
}

function startFlow(type) {
  if (state.busy) return;
  if (type === "in" && state.today?.in) {
    toast("Kamu sudah absen masuk hari ini.");
    return;
  }
  if (type === "out" && state.today?.out) {
    toast("Kamu sudah absen pulang hari ini.");
    return;
  }

  state.pendingType = type;
  openLocate();
}

/* ----------------------------- lokasi ----------------------------- */

function openLocate() {
  state.location = null;
  state.coords = null;

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
      signal,
      onProgress: (sample) => {
        $("#loc-acc").textContent = `${sample.accuracy} m`;
      },
    });

    state.coords = coords;

    const result = await api.locationCheck({
      ...coords,
      simulateOutside: state.simulateOutside,
      token: state.token,
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
  state.cameraFallback = true;
  stopCamera();
  $("#cam-video").hidden = true;
  takePhoto();
}

function closeCamera() {
  stopCamera();
  $("#ov-camera").hidden = true;
  $("#ov-preview").hidden = true;
  refreshScrollLock();
}

/* ----------------------------- submit ----------------------------- */

async function submitAttendance() {
  if (state.busy) return;
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
  $("#succ-time").textContent = result.time;

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
  const hadir = records.length;
  const late = records.filter((r) => r.status === "terlambat").length;

  const avg =
    hadir === 0
      ? null
      : records.reduce((sum, r) => {
          const [h, m] = (r.in || "0:0").split(":").map(Number);
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

  const badge =
    record.status === "terlambat"
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
  $("#detail-status").textContent =
    record.status === "terlambat"
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
