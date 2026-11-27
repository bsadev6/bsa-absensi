/* =========================================================
   Peta lokasi (Leaflet + OpenStreetMap).
   Menampilkan area kantor (radius) dan posisi pengguna.
   ========================================================= */

let map = null;
let officeCircle = null;
let userMarker = null;

export function initMap(el) {
  if (!window.L || !el) return null;
  if (map && map.getContainer() === el) return map;

  if (map) {
    map.remove();
    map = null;
  }

  map = window.L.map(el, {
    zoomControl: false,
    attributionControl: true,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
  });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);

  return map;
}

export function renderOffice(site) {
  const el = document.getElementById("home-map");
  const m = initMap(el);
  if (!m || !site) return false;
  if (typeof site.lat !== "number" || typeof site.lng !== "number") return false;

  if (officeCircle) m.removeLayer(officeCircle);

  officeCircle = window.L.circle([site.lat, site.lng], {
    radius: site.radius,
    color: "#16a34a",
    weight: 1.5,
    fillColor: "#22c55e",
    fillOpacity: 0.16,
  }).addTo(m);

  if (!userMarker) m.setView([site.lat, site.lng], 17, { animate: false });
  setTimeout(() => m.invalidateSize(), 60);
  return true;
}

export function renderLocation({ user, site }) {
  const el = document.getElementById("home-map");
  const m = initMap(el);
  if (!m || !user || !site) return false;

  if (typeof site.lat !== "number" || typeof site.lng !== "number") {
    return false;
  }

  if (officeCircle) m.removeLayer(officeCircle);
  if (userMarker) m.removeLayer(userMarker);

  officeCircle = window.L.circle([site.lat, site.lng], {
    radius: site.radius,
    color: "#16a34a",
    weight: 1.5,
    fillColor: "#22c55e",
    fillOpacity: 0.16,
  }).addTo(m);

  const pin = window.L.divIcon({
    className: "user-pin",
    html: '<span class="user-pin-dot"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  userMarker = window.L.marker([user.lat, user.lng], {
    icon: pin,
    interactive: false,
    keyboard: false,
  }).addTo(m);

  const bounds = officeCircle.getBounds().extend([user.lat, user.lng]).pad(0.12);
  const fit = () => {
    m.invalidateSize();
    m.fitBounds(bounds, { maxZoom: 17, animate: false });
  };
  fit();
  // Peta bisa sempat berukuran 0 saat layar baru ditampilkan.
  setTimeout(fit, 90);
  return true;
}

export function resizeMap() {
  if (map) setTimeout(() => map.invalidateSize(), 40);
}
