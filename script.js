const STORAGE_KEY = "minhasViagens.v0.6.7";
const LEGACY_KEYS = ["minhasViagens.v0.6.6", "minhasViagens.v0.6.5", "minhasViagens.v0.6.4", "minhasViagens.v0.6.3", "minhasViagens.v0.6.2", "minhasViagens.v0.6.1", "minhasViagens.v0.6", "minhasViagens.v0.5", "minhasViagens.v0.4", "minhasViagens.v0.3", "minhasViagens.v0.2", "minhasViagens.v0.1"];
const CITY_SEARCH_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const OSRM_ENDPOINTS = [
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/"
];
const MEDIA_DB_NAME = "minhasViagensMedia.v1";
const MEDIA_STORE = "media";
const AIRPORTS_CSV_URLS = [
  "https://davidmegginson.github.io/ourairports-data/airports.csv",
  "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv"
];
const DEFAULT_ROUTE_COLOR = "#2f6d50";

const state = {
  trips: [],
  startPlace: null,
  endPlace: null,
  stopPlaces: [],
  pendingTrip: null,
  routeAlternatives: [],
  selectedRouteIndex: null,
  previewLayers: [],
  drawing: false,
  draft: null,
  draftPoints: [],
  draftLine: null,
  draftMarkers: [],
  draftManualHistory: [],
  editingTripId: null,
  editVisibleLine: null,
  editHitLine: null,
  editGuideLine: null,
  editDragging: false,
  editDragStart: null,
  editDragLast: null,
  editDragProgress: 0,
  editBusy: false,
  editSnapshot: null,
  airports: null,
  airportsPromise: null,
  pointEditor: null,
  achievementTimer: null,
  activeTripDetailId: null,
  tripLineLayers: new Map(),
  editingPlacesTripId: null,
  editStartPlace: null,
  editEndPlace: null,
  editStopPlaces: []
};

const map = L.map("map", { zoomControl: true }).setView([-14.235, -51.9253], 4);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const tripLayers = L.layerGroup().addTo(map);
const pointLayers = L.layerGroup().addTo(map);
const previewGroup = L.layerGroup().addTo(map);
const editGroup = L.layerGroup().addTo(map);

const els = {
  newTripBtn: document.getElementById("newTripBtn"),
  tripsTabBtn: document.getElementById("tripsTabBtn"),
  achievementsTabBtn: document.getElementById("achievementsTabBtn"),
  tripsPanel: document.getElementById("tripsPanel"),
  tripDetailPanel: document.getElementById("tripDetailPanel"),
  tripDetailContent: document.getElementById("tripDetailContent"),
  backToTripsBtn: document.getElementById("backToTripsBtn"),
  achievementsPanel: document.getElementById("achievementsPanel"),
  cityAchievementCount: document.getElementById("cityAchievementCount"),
  roadAchievementCount: document.getElementById("roadAchievementCount"),
  cityAchievementList: document.getElementById("cityAchievementList"),
  roadAchievementList: document.getElementById("roadAchievementList"),
  tripDialog: document.getElementById("tripDialog"),
  tripForm: document.getElementById("tripForm"),
  tripName: document.getElementById("tripName"),
  tripDate: document.getElementById("tripDate"),
  tripMode: document.getElementById("tripMode"),
  tripColor: document.getElementById("tripColor"),
  newTripColorWheel: document.getElementById("newTripColorWheel"),
  startAddress: document.getElementById("startAddress"),
  endAddress: document.getElementById("endAddress"),
  startSuggestions: document.getElementById("startSuggestions"),
  endSuggestions: document.getElementById("endSuggestions"),
  startStatus: document.getElementById("startStatus"),
  endStatus: document.getElementById("endStatus"),
  startSelected: document.getElementById("startSelected"),
  endSelected: document.getElementById("endSelected"),
  stopsContainer: document.getElementById("stopsContainer"),
  addStopBtn: document.getElementById("addStopBtn"),
  tripNotes: document.getElementById("tripNotes"),
  formMessage: document.getElementById("formMessage"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
  cancelDialogBtn: document.getElementById("cancelDialogBtn"),
  manualFromDialogBtn: document.getElementById("manualFromDialogBtn"),
  suggestRoutesBtn: document.getElementById("suggestRoutesBtn"),
  routeChooser: document.getElementById("routeChooser"),
  routeChooserTitle: document.getElementById("routeChooserTitle"),
  routeChooserEndpoints: document.getElementById("routeChooserEndpoints"),
  routeOptions: document.getElementById("routeOptions"),
  closeRouteChooserBtn: document.getElementById("closeRouteChooserBtn"),
  manualRouteBtn: document.getElementById("manualRouteBtn"),
  saveSelectedRouteBtn: document.getElementById("saveSelectedRouteBtn"),
  drawBanner: document.getElementById("drawBanner"),
  drawTitle: document.getElementById("drawTitle"),
  drawRouteText: document.getElementById("drawRouteText"),
  undoPointBtn: document.getElementById("undoPointBtn"),
  finishTripBtn: document.getElementById("finishTripBtn"),
  cancelTripBtn: document.getElementById("cancelTripBtn"),
  editBanner: document.getElementById("editBanner"),
  finishEditBtn: document.getElementById("finishEditBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  achievementToast: document.getElementById("achievementToast"),
  achievementToastTitle: document.getElementById("achievementToastTitle"),
  achievementToastSubtitle: document.getElementById("achievementToastSubtitle"),
  tripList: document.getElementById("tripList"),
  tripCount: document.getElementById("tripCount"),
  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),
  routePointDialog: document.getElementById("routePointDialog"),
  routePointForm: document.getElementById("routePointForm"),
  routePointDialogTitle: document.getElementById("routePointDialogTitle"),
  routePointDescription: document.getElementById("routePointDescription"),
  routePointMedia: document.getElementById("routePointMedia"),
  routePointMediaPreview: document.getElementById("routePointMediaPreview"),
  pointFormMessage: document.getElementById("pointFormMessage"),
  closePointDialogBtn: document.getElementById("closePointDialogBtn"),
  cancelPointDialogBtn: document.getElementById("cancelPointDialogBtn"),
  deletePointBtn: document.getElementById("deletePointBtn"),
  editPlacesDialog: document.getElementById("editPlacesDialog"),
  editPlacesForm: document.getElementById("editPlacesForm"),
  editStartAddress: document.getElementById("editStartAddress"),
  editStartSuggestions: document.getElementById("editStartSuggestions"),
  editStartStatus: document.getElementById("editStartStatus"),
  editStartSelected: document.getElementById("editStartSelected"),
  editStopsContainer: document.getElementById("editStopsContainer"),
  editAddStopBtn: document.getElementById("editAddStopBtn"),
  editEndAddress: document.getElementById("editEndAddress"),
  editEndSuggestions: document.getElementById("editEndSuggestions"),
  editEndStatus: document.getElementById("editEndStatus"),
  editEndSelected: document.getElementById("editEndSelected"),
  editPlacesMessage: document.getElementById("editPlacesMessage"),
  closeEditPlacesBtn: document.getElementById("closeEditPlacesBtn"),
  cancelEditPlacesBtn: document.getElementById("cancelEditPlacesBtn"),
  saveEditPlacesBtn: document.getElementById("saveEditPlacesBtn")
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortText(text, max = 82) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 47, g: 109, b: 80 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const part = value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  v = clamp(v, 0, 1);
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

function drawColorWheel(canvas, selectedHex) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) / 2 - 2;
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + .5 - cx, dy = y + .5 - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const index = (y * w + x) * 4;
      if (distance > radius) {
        image.data[index + 3] = 0;
        continue;
      }
      const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const saturation = clamp(distance / radius, 0, 1);
      const rgb = hsvToRgb(hue, saturation, .96);
      image.data[index] = Math.round(rgb.r);
      image.data[index + 1] = Math.round(rgb.g);
      image.data[index + 2] = Math.round(rgb.b);
      image.data[index + 3] = 255;
    }
  }
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(image, 0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + .5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(20,30,25,.28)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const hsv = rgbToHsv(hexToRgb(selectedHex));
  const angle = hsv.h * Math.PI / 180;
  const markerRadius = radius * clamp(hsv.s, 0, 1);
  const mx = cx + Math.cos(angle) * markerRadius;
  const my = cy + Math.sin(angle) * markerRadius;
  ctx.beginPath();
  ctx.arc(mx, my, Math.max(3.5, radius * .09), 0, Math.PI * 2);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mx, my, Math.max(4.8, radius * .12), 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function setupColorWheel(canvas, initialColor, onInput, onCommit) {
  let color = initialColor || DEFAULT_ROUTE_COLOR;
  let dragging = false;
  const colorFromPointer = event => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    let dx = (event.clientX - rect.left) * scaleX - cx;
    let dy = (event.clientY - rect.top) * scaleY - cy;
    const radius = Math.min(canvas.width, canvas.height) / 2 - 2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > radius && distance > 0) {
      const factor = radius / distance;
      dx *= factor;
      dy *= factor;
    }
    const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const saturation = clamp(Math.sqrt(dx * dx + dy * dy) / radius, 0, 1);
    color = rgbToHex(hsvToRgb(hue, saturation, .96));
    drawColorWheel(canvas, color);
    canvas.setAttribute("aria-valuetext", color.toUpperCase());
    onInput?.(color);
  };

  const start = event => {
    event.preventDefault();
    dragging = true;
    canvas.classList.add("dragging");
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    colorFromPointer(event);
  };
  const move = event => {
    if (!dragging) return;
    event.preventDefault();
    colorFromPointer(event);
  };
  const finish = event => {
    if (!dragging) return;
    if (event?.clientX != null) colorFromPointer(event);
    dragging = false;
    canvas.classList.remove("dragging");
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
    onCommit?.(color);
  };
  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  canvas.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const hsv = rgbToHsv(hexToRgb(color));
    if (event.key === "ArrowLeft") hsv.h -= 5;
    if (event.key === "ArrowRight") hsv.h += 5;
    if (event.key === "ArrowUp") hsv.s = clamp(hsv.s + .05, 0, 1);
    if (event.key === "ArrowDown") hsv.s = clamp(hsv.s - .05, 0, 1);
    color = rgbToHex(hsvToRgb(hsv.h, hsv.s, .96));
    drawColorWheel(canvas, color);
    canvas.setAttribute("aria-valuetext", color.toUpperCase());
    onInput?.(color);
    onCommit?.(color);
  });
  drawColorWheel(canvas, color);
  canvas.setAttribute("aria-valuetext", color.toUpperCase());
  return {
    setColor(nextColor) {
      color = nextColor || DEFAULT_ROUTE_COLOR;
      drawColorWheel(canvas, color);
      canvas.setAttribute("aria-valuetext", color.toUpperCase());
    },
    getColor() { return color; }
  };
}

let newTripColorWheelController = null;

function formatDate(dateStr) {
  if (!dateStr) return "Sem data";
  const parts = dateStr.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function modeLabel(mode) {
  return { carro: "Carro", moto: "Moto", bicicleta: "Bicicleta", "a-pe": "A pé", aviao: "Avião", outro: "Outro" }[mode] || "Outro";
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km`
    : `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h ${m ? `${m} min` : ""}`.trim() : `${m} min`;
}

function normalizeKey(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

function parseRoadCode(label) {
  const value = String(label || "").toUpperCase().replace(/[–—]/g, "-").trim();
  const match = value.match(/\b(BR|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*[- ]?\s*(\d{2,3})\b/);
  if (!match) return null;
  return { prefix: match[1], number: match[2], federal: match[1] === "BR" };
}

function roadShieldMarkup(label, size = "achievement") {
  const parsed = parseRoadCode(label);
  if (!parsed) return `<span class="road-shield-fallback">${escapeHtml(label)}</span>`;
  const { prefix, number, federal } = parsed;
  if (federal) {
    return `<svg class="road-emblem-svg ${size}" viewBox="0 0 100 110" role="img" aria-label="${escapeHtml(`${prefix}-${number}`)}">
      <path d="M3 3H97V81L50 107L3 81Z" fill="#078807" stroke="#078807" stroke-width="4"/>
      <path d="M8 8H92V77L50 100L8 77Z" fill="none" stroke="#fff" stroke-width="3"/>
      <text x="50" y="38" fill="#fff" font-size="31">${prefix}</text>
      <text x="50" y="76" fill="#fff" font-size="42">${number}</text>
    </svg>`;
  }
  return `<svg class="road-emblem-svg ${size}" viewBox="0 0 100 110" role="img" aria-label="${escapeHtml(`${prefix}-${number}`)}">
    <path d="M50 3L97 23L82 107H18L3 23Z" fill="#fff" stroke="#111" stroke-width="3"/>
    <path d="M50 9L91 27L77 101H23L9 27Z" fill="none" stroke="#111" stroke-width="5"/>
    <text x="50" y="42" fill="#111" font-size="28">${prefix}</text>
    <text x="50" y="78" fill="#111" font-size="39">${number}</text>
  </svg>`;
}

function roadMapIcon(label) {
  return L.divIcon({
    className: "",
    html: `<div class="road-map-shield-wrap">${roadShieldMarkup(label, "map")}</div>`,
    iconSize: [44, 50],
    iconAnchor: [22, 25]
  });
}

function ensureTripSchema(trip) {
  if (!trip.id) trip.id = uid();
  if (!Array.isArray(trip.pointsOfInterest)) trip.pointsOfInterest = [];
  if (!Array.isArray(trip.routeWaypoints)) trip.routeWaypoints = [];
  if (!Array.isArray(trip.stopPlaces)) trip.stopPlaces = [];
  if (!Array.isArray(trip.roadLabels)) trip.roadLabels = [];
  if (!trip.color) trip.color = DEFAULT_ROUTE_COLOR;
  if (!Array.isArray(trip.flightAirports)) trip.flightAirports = [];
  if (!trip.createdAt) trip.createdAt = new Date().toISOString();
  if (!trip.conquests || typeof trip.conquests !== "object") trip.conquests = {};
  if (!Array.isArray(trip.conquests.cities)) trip.conquests.cities = cityConquestsForTrip(trip);
  if (!Array.isArray(trip.conquests.roads)) trip.conquests.roads = [];

  // Migração v0.6.5: as conquistas de rodovias passam a usar exatamente
  // as placas principais exibidas sobre a rota. Isso remove referências
  // secundárias do OSM que podiam criar BRs indevidas em viagens antigas.
  if (trip.roadLabels.length) {
    const uniqueRoads = [];
    const seen = new Set();
    for (const badge of trip.roadLabels) {
      const label = cleanRoadRef(typeof badge === "string" ? badge : badge?.label);
      if (!label || !isHighwayRef(label)) continue;
      const key = normalizeKey(label);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRoads.push(label);
      }
    }
    trip.conquests.roads = uniqueRoads;
  }
  trip.conquests.cities = cityConquestsForTrip(trip);
  return trip;
}

function loadTrips() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    state.trips = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(state.trips)) state.trips = [];
    state.trips = state.trips.map(ensureTripSchema);
    if (raw) saveTrips();
  } catch {
    state.trips = [];
  }
}

function saveTrips() {
  const payload = JSON.stringify(state.trips);
  try {
    localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch (firstError) {
    // Versões antigas podem duplicar rotas grandes e consumir a cota do navegador.
    for (const key of LEGACY_KEYS) {
      try { localStorage.removeItem(key); } catch {}
    }
    try {
      localStorage.setItem(STORAGE_KEY, payload);
      return true;
    } catch (secondError) {
      console.error("Falha ao salvar viagens", secondError);
      alert("O navegador ficou sem espaço para salvar a rota. Exporte um backup e remova viagens antigas ou mídias pesadas.");
      return false;
    }
  }
}

function tripLatLngs(trip) {
  if (trip.routeGeometry?.coordinates?.length) {
    return trip.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng]);
  }
  if (Array.isArray(trip.points)) {
    return trip.points.map(p => [p.lat, p.lng]);
  }
  return [];
}

function cityConquestsForTrip(trip) {
  const places = [trip.startPlace, ...(trip.stopPlaces || []), trip.endPlace].filter(Boolean);
  const unique = new Map();
  for (const place of places) {
    const label = place.label || [place.city, place.region, place.country].filter(Boolean).join(", ");
    if (!label) continue;
    const key = normalizeKey(label);
    if (!unique.has(key)) {
      unique.set(key, {
        label,
        city: place.city || label,
        region: place.region || "",
        country: place.country || ""
      });
    }
  }
  return [...unique.values()];
}

function cleanRoadRef(raw) {
  let value = String(raw || "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  value = value.replace(/\b(BR|SP|PR|SC|RS|MG|GO|MT|MS|BA|RJ|ES|PE|CE|PB|RN|SE|AL|TO|MA|PI|PA|AM|RO|RR|AC|AP|DF)\s*-?\s*(\d{1,4})\b/gi, (_, uf, n) => `${uf.toUpperCase()}-${n}`);
  return value;
}


function normalizeSimple(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isHighwayRef(value) {
  const cleaned = cleanRoadRef(value);
  return /^(BR|SP|PR|SC|RS|MG|GO|MT|MS|BA|RJ|ES|PE|CE|PB|RN|SE|AL|TO|MA|PI|PA|AM|RO|RR|AC|AP|DF)-\d{1,4}$/i.test(cleaned)
    || /\b(ruta|route|rodovia|estrada)\s*[\w-]*\d+/i.test(cleaned);
}

function roadRefsFromStep(step) {
  const refs = [];
  const add = raw => {
    for (const token of String(raw || "").split(/[;,/]/)) {
      const cleaned = cleanRoadRef(token);
      if (cleaned && isHighwayRef(cleaned) && !refs.includes(cleaned)) refs.push(cleaned);
    }
  };
  add(step?.ref);
  const name = String(step?.name || "");
  const br = name.match(/\b(?:BR|SP|PR|SC|RS|MG|GO|MT|MS|BA|RJ|ES|PE|CE|PB|RN|SE|AL|TO|MA|PI|PA|AM|RO|RR|AC|AP|DF)\s*-?\s*\d{1,4}\b/gi) || [];
  br.forEach(add);
  const ruta = name.match(/\b(?:Ruta|Route|Rodovia|Estrada)\s+[A-Za-z-]*\s*\d+[A-Za-z-]*/gi) || [];
  ruta.forEach(add);
  return refs;
}

function extractRoadLabelsFromRoute(route) {
  const groups = [];
  let current = null;
  const finish = () => {
    if (!current) return;
    const coords = current.coords;
    if (coords.length) {
      const middle = coords[Math.floor(coords.length / 2)];
      groups.push({ label: current.label, lat: middle[1], lng: middle[0] });
    }
    current = null;
  };

  for (const leg of route?.legs || []) {
    for (const step of leg.steps || []) {
      const refs = roadRefsFromStep(step);
      const label = refs[0] || "";
      if (!label) {
        finish();
        continue;
      }
      let coords = step?.geometry?.coordinates || [];
      if (!coords.length && Array.isArray(step?.maneuver?.location)) coords = [step.maneuver.location];
      if (!current || normalizeKey(current.label) !== normalizeKey(label)) {
        finish();
        current = { label, coords: [...coords] };
      } else {
        current.coords.push(...coords);
      }
    }
  }
  finish();
  return groups;
}

function csvSplitLine(line) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(value); value = "";
    } else value += ch;
  }
  out.push(value);
  return out;
}

async function loadCommercialAirports() {
  if (state.airports) return state.airports;
  if (state.airportsPromise) return state.airportsPromise;
  state.airportsPromise = (async () => {
    let text = null;
    let lastError = null;
    for (const url of AIRPORTS_CSV_URLS) {
      try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        text = await response.text();
        if (text && text.includes("scheduled_service") && text.includes("iata_code")) break;
      } catch (error) {
        lastError = error;
        text = null;
      }
    }
    if (!text) throw lastError || new Error("Não foi possível carregar a base de aeroportos");
    const lines = text.split(/\r?\n/);
    const header = csvSplitLine(lines.shift() || "");
    const idx = Object.fromEntries(header.map((name, i) => [name, i]));
    const airports = [];
    for (const line of lines) {
      if (!line) continue;
      const row = csvSplitLine(line);
      if (row[idx.scheduled_service] !== "yes") continue;
      const iata = row[idx.iata_code] || "";
      if (!iata) continue;
      const type = row[idx.type] || "";
      if (!["large_airport", "medium_airport", "small_airport"].includes(type)) continue;
      const lat = Number(row[idx.latitude_deg]);
      const lng = Number(row[idx.longitude_deg]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      airports.push({
        iata,
        icao: row[idx.gps_code] || "",
        name: row[idx.name] || iata,
        municipality: row[idx.municipality] || "",
        countryCode: row[idx.iso_country] || "",
        region: row[idx.iso_region] || "",
        type,
        lat,
        lng
      });
    }
    state.airports = airports;
    return airports;
  })();
  try { return await state.airportsPromise; }
  finally { state.airportsPromise = null; }
}

function haversineKm(a, b) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function findAirportForPlace(place) {
  const airports = await loadCommercialAirports();
  const cityKey = normalizeSimple(place.city);
  const countryCode = String(place.countryCode || "").toUpperCase();
  const sameCountry = airports.filter(a => !countryCode || a.countryCode === countryCode);
  const exact = sameCountry.filter(a => normalizeSimple(a.municipality) === cityKey);
  const pool = exact.length ? exact : sameCountry;
  const ranked = pool
    .map(a => ({ ...a, distanceKm: haversineKm(place, a) }))
    .filter(a => exact.length || a.distanceKm <= 55)
    .sort((a, b) => {
      const weight = t => t === "large_airport" ? 0 : t === "medium_airport" ? 1 : 2;
      if (exact.length && weight(a.type) !== weight(b.type)) return weight(a.type) - weight(b.type);
      return a.distanceKm - b.distanceKm;
    });
  return ranked[0] || null;
}

function airportLabel(airport) {
  if (!airport) return "";
  return `${airport.name} (${airport.iata})`;
}

function greatCircleLeg(start, end, steps = 80) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const lat1 = toRad(start.lat), lon1 = toRad(start.lng);
  const lat2 = toRad(end.lat), lon2 = toRad(end.lng);
  const cosD = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const d = Math.acos(Math.max(-1, Math.min(1, cosD)));
  if (d < 1e-8) return [[start.lng, start.lat], [end.lng, end.lat]];
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x*x + y*y)))]);
  }
  return points;
}

function buildFlightRoute(airports) {
  const coordinates = [];
  let distanceMeters = 0;
  for (let i = 0; i < airports.length - 1; i++) {
    const a = airports[i], b = airports[i + 1];
    const leg = greatCircleLeg(a, b, 80);
    if (coordinates.length) leg.shift();
    coordinates.push(...leg);
    distanceMeters += haversineKm(a, b) * 1000;
  }
  return {
    geometry: { type: "LineString", coordinates },
    distance: distanceMeters,
    duration: null,
    legs: [],
    flightAirports: airports
  };
}

function extractHighwaysFromRoute(route) {
  // A conquista usa a mesma referência PRINCIPAL que gera as placas do mapa.
  // Alguns trechos do OpenStreetMap possuem várias refs secundárias no mesmo
  // caminho; usar todas elas criava rodovias que a viagem não percorreu.
  const roads = new Map();
  for (const badge of extractRoadLabelsFromRoute(route)) {
    const cleaned = cleanRoadRef(badge?.label);
    if (!cleaned || !isHighwayRef(cleaned)) continue;
    const key = normalizeKey(cleaned);
    if (!roads.has(key)) roads.set(key, cleaned);
  }
  return [...roads.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

function getAchievementSnapshot(excludeTripId = null) {
  const cities = new Map();
  const roads = new Map();
  const ordered = state.trips.slice().reverse();

  for (const trip of ordered) {
    if (trip.id === excludeTripId) continue;
    ensureTripSchema(trip);
    for (const city of trip.conquests.cities || []) {
      const label = city.label || city.city;
      const key = normalizeKey(label);
      if (key && !cities.has(key)) cities.set(key, { ...city, label, tripName: trip.name, date: trip.date });
    }
    for (const road of trip.conquests.roads || []) {
      const key = normalizeKey(road);
      if (key && !roads.has(key)) roads.set(key, { label: road, tripName: trip.name, date: trip.date });
    }
  }
  return { cities, roads };
}

function setTripConquests(trip, route = null) {
  trip.conquests = {
    cities: cityConquestsForTrip(trip),
    roads: trip.mode === "aviao" ? [] : (route ? extractHighwaysFromRoute(route) : (trip.conquests?.roads || []))
  };
}

function newConquestsAgainstSnapshot(trip, snapshot) {
  const items = [];
  for (const city of trip.conquests?.cities || []) {
    const label = city.label || city.city;
    if (label && !snapshot.cities.has(normalizeKey(label))) items.push({ type: "city", label });
  }
  for (const road of trip.conquests?.roads || []) {
    if (road && !snapshot.roads.has(normalizeKey(road))) items.push({ type: "road", label: road });
  }
  return items;
}

function renderAchievements() {
  const snapshot = getAchievementSnapshot();
  const cityItems = [...snapshot.cities.values()];
  const roadItems = [...snapshot.roads.values()];
  els.cityAchievementCount.textContent = String(cityItems.length);
  els.roadAchievementCount.textContent = String(roadItems.length);

  const renderList = (container, items, type) => {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = `<p class="empty">Nenhuma ${type === "city" ? "cidade" : "rodovia"} conquistada ainda.</p>`;
      return;
    }
    items.sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true })).forEach(item => {
      const card = document.createElement("div");
      card.className = `achievement-card${type === "road" ? " road-achievement-card" : ""}`;
      card.innerHTML = `
        <span class="achievement-icon">${type === "city" ? "●" : roadShieldMarkup(item.label, "achievement")}</span>
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <small>${escapeHtml(item.tripName || "Viagem")}${item.date ? ` · ${formatDate(item.date)}` : ""}</small>
        </div>`;
      container.appendChild(card);
    });
  };

  renderList(els.cityAchievementList, cityItems, "city");
  renderList(els.roadAchievementList, roadItems, "road");
}

function celebrateConquests(items, tripName) {
  if (!items.length) return;
  clearTimeout(state.achievementTimer);
  const labels = items.slice(0, 5).map(item => item.label);
  els.achievementToastTitle.textContent = items.length === 1 ? items[0].label : `${items.length} novas conquistas`;
  els.achievementToastSubtitle.textContent = `${labels.join(" · ")}${items.length > 5 ? ` · +${items.length - 5}` : ""}${tripName ? ` — ${tripName}` : ""}`;
  els.achievementToast.classList.remove("hidden");
  state.achievementTimer = setTimeout(() => els.achievementToast.classList.add("hidden"), 3800);
}

function showTripList() {
  state.activeTripDetailId = null;
  els.tripsPanel.classList.remove("hidden");
  els.tripDetailPanel.classList.add("hidden");
  els.achievementsPanel.classList.add("hidden");
  els.tripsTabBtn.classList.add("active");
  els.achievementsTabBtn.classList.remove("active");
  els.tripsTabBtn.setAttribute("aria-selected", "true");
  els.achievementsTabBtn.setAttribute("aria-selected", "false");
  renderTrips();
}

function openTripDetails(tripId) {
  const trip = state.trips.find(item => item.id === tripId);
  if (!trip) return;
  state.activeTripDetailId = tripId;
  els.tripsPanel.classList.add("hidden");
  els.tripDetailPanel.classList.remove("hidden");
  els.achievementsPanel.classList.add("hidden");
  els.tripsTabBtn.classList.add("active");
  els.achievementsTabBtn.classList.remove("active");
  els.tripsTabBtn.setAttribute("aria-selected", "true");
  els.achievementsTabBtn.setAttribute("aria-selected", "false");
  renderTrips();
  focusTrip(trip);
  els.tripDetailPanel.scrollIntoView({ block: "start" });
}

function switchSidebarTab(tab) {
  if (tab === "achievements") {
    state.activeTripDetailId = null;
    els.tripsPanel.classList.add("hidden");
    els.tripDetailPanel.classList.add("hidden");
    els.achievementsPanel.classList.remove("hidden");
    els.tripsTabBtn.classList.remove("active");
    els.achievementsTabBtn.classList.add("active");
    els.tripsTabBtn.setAttribute("aria-selected", "false");
    els.achievementsTabBtn.setAttribute("aria-selected", "true");
    renderTrips();
    return;
  }
  showTripList();
}

async function deleteTrip(trip) {
  if (!confirm(`Excluir a viagem "${trip.name}"?`)) return;
  if (state.editingTripId === trip.id) finishRouteEdit();
  state.trips = state.trips.filter(t => t.id !== trip.id);
  saveTrips();
  try { await deleteMediaByTrip(trip.id); } catch {}
  state.activeTripDetailId = null;
  showTripList();
}

function renderTripDetail() {
  const trip = state.trips.find(item => item.id === state.activeTripDetailId);
  if (!trip) {
    els.tripDetailContent.innerHTML = '<p class="empty">Viagem não encontrada.</p>';
    return;
  }
  ensureTripSchema(trip);
  const latlngs = tripLatLngs(trip);
  const startAddress = trip.startPlace?.label || trip.startAddress || "Partida não informada";
  const endAddress = trip.endPlace?.label || trip.endAddress || "Chegada não informada";
  const distance = Number.isFinite(trip.distance) ? formatDistance(trip.distance) : `${latlngs.length} pontos`;
  const routeColor = trip.color || DEFAULT_ROUTE_COLOR;
  const stopList = (trip.stopPlaces || []).map(place => place.label || place.city).filter(Boolean);
  const roads = trip.conquests?.roads || [];
  els.tripDetailContent.innerHTML = `
    <article class="trip-detail-card">
      <div class="trip-detail-title-row">
        <h2>${escapeHtml(trip.name || "Viagem")}</h2>
        <button type="button" class="edit-name-btn" title="Editar nome da viagem" aria-label="Editar nome da viagem">✎</button>
      </div>
      <div class="trip-name-editor hidden">
        <input type="text" class="trip-name-edit-input" maxlength="80" value="${escapeHtml(trip.name || "Viagem")}" aria-label="Novo nome da viagem">
        <button type="button" class="save-name-btn primary-btn small">Salvar</button>
        <button type="button" class="cancel-name-btn ghost-btn small">Cancelar</button>
      </div>
      <div class="trip-meta">${formatDate(trip.date)} · ${modeLabel(trip.mode)} · ${distance}</div>
      <div class="trip-route">
        <div><span>De:</span> <strong>${escapeHtml(shortText(startAddress, 80))}</strong></div>
        ${stopList.length ? `<div><span>Paradas:</span> <strong>${escapeHtml(stopList.join(" → "))}</strong></div>` : ""}
        <div><span>Para:</span> <strong>${escapeHtml(shortText(endAddress, 80))}</strong></div>
        ${Number.isFinite(trip.duration) ? `<div><span>Tempo estimado:</span> <strong>${formatDuration(trip.duration)}</strong></div>` : ""}
        ${trip.pointsOfInterest.length ? `<div><span>Pontos adicionados:</span> <strong>${trip.pointsOfInterest.length}</strong></div>` : ""}
        ${trip.notes ? `<div><span>Observações:</span> <strong>${escapeHtml(trip.notes)}</strong></div>` : ""}
      </div>
      <div class="detail-section-title">Rodovias desta viagem</div>
      ${roads.length
        ? `<div class="detail-road-list">${roads.map(road => `<span title="${escapeHtml(road)}">${roadShieldMarkup(road, "achievement")}</span>`).join("")}</div>`
        : `<p class="micro-hint detail-no-roads">Nenhuma rodovia foi identificada automaticamente nesta viagem.</p>`}
      <div class="trip-detail-actions">
        <button type="button" class="focus-btn">Ver no mapa</button>
        <button type="button" class="edit-places-btn" ${!["carro", "moto"].includes(trip.mode) ? "disabled" : ""}>Editar cidades</button>
        <button type="button" class="edit-route-btn" ${latlngs.length < 2 || !["carro", "moto"].includes(trip.mode) ? "disabled" : ""}>Ajustar rota</button>
        <button type="button" class="refresh-roads-btn" ${latlngs.length < 2 || !["carro", "moto"].includes(trip.mode) ? "disabled" : ""}>Atualizar rodovias</button>
        <div class="trip-detail-color-wheel-wrap" title="Arraste pelo globo para mudar a cor da rota">
          <canvas class="trip-color-wheel color-wheel" width="68" height="68" tabindex="0" role="slider" aria-label="Cor da rota ${escapeHtml(trip.name || "Viagem")}"></canvas>
        </div>
        <button type="button" class="delete-btn">Excluir</button>
      </div>
    </article>`;

  const titleRow = els.tripDetailContent.querySelector(".trip-detail-title-row");
  const editor = els.tripDetailContent.querySelector(".trip-name-editor");
  const nameInput = els.tripDetailContent.querySelector(".trip-name-edit-input");
  els.tripDetailContent.querySelector(".edit-name-btn")?.addEventListener("click", () => {
    titleRow?.classList.add("hidden");
    editor?.classList.remove("hidden");
    nameInput?.focus();
    nameInput?.select();
  });
  els.tripDetailContent.querySelector(".cancel-name-btn")?.addEventListener("click", () => {
    renderTripDetail();
  });
  els.tripDetailContent.querySelector(".save-name-btn")?.addEventListener("click", () => {
    const nextName = String(nameInput?.value || "").trim();
    if (!nextName) {
      nameInput?.focus();
      return;
    }
    trip.name = nextName.slice(0, 80);
    saveTrips();
    renderTrips();
  });
  nameInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.tripDetailContent.querySelector(".save-name-btn")?.click();
    }
    if (event.key === "Escape") renderTripDetail();
  });

  els.tripDetailContent.querySelector(".focus-btn")?.addEventListener("click", () => focusTrip(trip));
  els.tripDetailContent.querySelector(".edit-places-btn")?.addEventListener("click", () => openEditPlacesDialog(trip));
  els.tripDetailContent.querySelector(".edit-route-btn")?.addEventListener("click", () => beginRouteEdit(trip));
  els.tripDetailContent.querySelector(".refresh-roads-btn")?.addEventListener("click", () => refreshTripRoads(trip));
  const detailColorWheel = els.tripDetailContent.querySelector(".trip-color-wheel");
  if (detailColorWheel) {
    setupColorWheel(detailColorWheel, routeColor, color => {
      trip.color = color;
      const line = state.tripLineLayers.get(trip.id);
      if (line) line.setStyle({ color });
    }, color => {
      trip.color = color;
      saveTrips();
    });
  }
  els.tripDetailContent.querySelector(".delete-btn")?.addEventListener("click", () => deleteTrip(trip));
}

function renderTrips() {
  tripLayers.clearLayers();
  pointLayers.clearLayers();
  state.tripLineLayers.clear();
  els.tripList.innerHTML = "";
  els.tripCount.textContent = String(state.trips.length);

  if (!state.trips.length) {
    state.activeTripDetailId = null;
    els.tripList.innerHTML = '<p class="empty">Nenhuma viagem cadastrada ainda.</p>';
    els.tripDetailPanel.classList.add("hidden");
    els.tripsPanel.classList.remove("hidden");
    renderAchievements();
    return;
  }

  const hasFocusedTrip = Boolean(state.activeTripDetailId);

  state.trips.forEach(trip => {
    ensureTripSchema(trip);
    const latlngs = tripLatLngs(trip);
    const startAddress = trip.startPlace?.label || trip.startAddress || "Partida não informada";
    const endAddress = trip.endPlace?.label || trip.endAddress || "Chegada não informada";
    const routeColor = trip.color || DEFAULT_ROUTE_COLOR;
    const isFocused = !hasFocusedTrip || state.activeTripDetailId === trip.id;

    const card = document.createElement("article");
    card.className = `trip-card${state.activeTripDetailId === trip.id ? " active" : ""}`;
    card.innerHTML = `
      <div class="trip-compact-row">
        <input class="trip-toggle" type="checkbox" ${trip.visible !== false ? "checked" : ""} aria-label="Mostrar viagem ${escapeHtml(trip.name || "Viagem")}">
        <button type="button" class="trip-name-btn" title="Abrir detalhes de ${escapeHtml(trip.name || "Viagem")}">${escapeHtml(trip.name || "Viagem")}</button>
      </div>`;

    const toggle = card.querySelector(".trip-toggle");
    toggle.style.accentColor = routeColor;
    toggle.addEventListener("change", event => {
      trip.visible = event.target.checked;
      saveTrips();
      renderTrips();
    });
    card.querySelector(".trip-name-btn").addEventListener("click", () => openTripDetails(trip.id));
    els.tripList.appendChild(card);

    if (trip.visible !== false && latlngs.length >= 2 && state.editingTripId !== trip.id) {
      const line = L.polyline(latlngs, {
        color: routeColor,
        weight: hasFocusedTrip ? (isFocused ? 7 : 3) : 5,
        opacity: hasFocusedTrip ? (isFocused ? .98 : .22) : .9,
        dashArray: trip.mode === "aviao" ? "12 10" : null,
        interactive: !hasFocusedTrip || isFocused
      });
      line.bindPopup(`
        <div class="popup-title">${escapeHtml(trip.name || "Viagem")}</div>
        <div class="popup-meta">${formatDate(trip.date)} · ${modeLabel(trip.mode)}</div>
        <div class="popup-detail"><b>Partida:</b> ${escapeHtml(startAddress)}</div>
        <div class="popup-detail"><b>Chegada:</b> ${escapeHtml(endAddress)}</div>
        ${Number.isFinite(trip.distance) ? `<div class="popup-detail"><b>Distância:</b> ${formatDistance(trip.distance)}</div>` : ""}
        <div class="popup-detail"><b>Dica:</b> clique na rota para adicionar um ponto com foto ou vídeo.</div>`);
      line.on("click", event => {
        if ((!hasFocusedTrip || isFocused) && !state.drawing && !state.editingTripId && els.routeChooser.classList.contains("hidden")) {
          openRoutePointDialog(trip, event.latlng);
        }
      });
      tripLayers.addLayer(line);
      state.tripLineLayers.set(trip.id, line);
      if (isFocused && hasFocusedTrip) line.bringToFront();

      const endpointOpacity = hasFocusedTrip && !isFocused ? .25 : 1;
      tripLayers.addLayer(L.circleMarker(latlngs[0], {
        radius: hasFocusedTrip && isFocused ? 7 : 6,
        weight: 2,
        color: routeColor,
        fillColor: "#fff",
        fillOpacity: endpointOpacity,
        opacity: endpointOpacity
      }));
      tripLayers.addLayer(L.circleMarker(latlngs[latlngs.length - 1], {
        radius: hasFocusedTrip && isFocused ? 8 : 7,
        weight: 2,
        color: routeColor,
        fillColor: routeColor,
        fillOpacity: endpointOpacity,
        opacity: endpointOpacity
      }));

      // Quando uma viagem está selecionada, apenas as placas dela permanecem no mapa.
      if ((!hasFocusedTrip || isFocused) && trip.mode !== "aviao") {
        for (const badge of trip.roadLabels || []) {
          if (!Number.isFinite(Number(badge.lat)) || !Number.isFinite(Number(badge.lng))) continue;
          tripLayers.addLayer(L.marker([badge.lat, badge.lng], {
            interactive: false,
            icon: roadMapIcon(badge.label)
          }));
        }
      } else if ((!hasFocusedTrip || isFocused) && trip.mode === "aviao" && trip.flightAirports?.length) {
        for (const airport of trip.flightAirports) {
          const marker = L.marker([airport.lat, airport.lng], {
            icon: L.divIcon({ className: "", html: '<div class="flight-airport-marker">✈</div>', iconSize: [24,24], iconAnchor: [12,12] })
          });
          marker.bindTooltip(`${escapeHtml(airport.name)}${airport.iata ? ` (${escapeHtml(airport.iata)})` : ""}`);
          tripLayers.addLayer(marker);
        }
      }
    }

    // Ao destacar uma viagem, também escondemos os pontos das demais para reduzir ruído visual.
    if (trip.visible !== false && (!hasFocusedTrip || isFocused)) {
      for (const point of trip.pointsOfInterest) {
        const marker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({ className: "", html: '<div class="route-poi-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })
        });
        marker.bindTooltip(shortText(point.description || "Ponto da viagem", 55));
        marker.on("click", () => openRoutePointDialog(trip, null, point));
        pointLayers.addLayer(marker);
      }
    }
  });

  renderAchievements();
  if (state.activeTripDetailId) renderTripDetail();
}

function focusTrip(trip) {
  const latlngs = tripLatLngs(trip);
  if (!latlngs.length) return;
  map.fitBounds(L.latLngBounds(latlngs).pad(.15), { maxZoom: 14 });
}

function resetPlaceSelection(kind) {
  state[`${kind}Place`] = null;
  els[`${kind}Selected`].textContent = "Nenhuma cidade selecionada.";
  els[`${kind}Selected`].classList.remove("ok");
  setAirportDisplay(kind, null);
  updateRouteButtons();
}

function placeFromCityResult(result) {
  const details = [result.admin1, result.country].filter(Boolean);
  return {
    label: [result.name, ...details].join(", "),
    city: result.name,
    region: result.admin1 || "",
    country: result.country || "",
    countryCode: result.country_code || "",
    lat: Number(result.latitude),
    lng: Number(result.longitude),
    geonamesId: result.id || null
  };
}

function setAirportDisplay(kind, airport = null) {
  const el = els[`${kind}Airport`];
  if (!el) return;
  if (!airport) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = `✈ ${airportLabel(airport)} · ${airport.municipality || "aeroporto comercial"}`;
  el.classList.remove("hidden");
}

async function verifyAirportForKind(kind, silent = false) {
  const place = state[`${kind}Place`];
  if (!place) return false;
  if (els.tripMode.value !== "aviao") {
    delete place.airport;
    setAirportDisplay(kind, null);
    return true;
  }
  const status = els[`${kind}Status`];
  status.textContent = "Aeroporto…";
  try {
    const airport = await findAirportForPlace(place);
    if (!airport) {
      delete place.airport;
      setAirportDisplay(kind, null);
      if (!silent) setFormMessage(`${place.city} não possui aeroporto comercial compatível na base atual. Escolha outra cidade para o modo avião.`);
      return false;
    }
    place.airport = airport;
    setAirportDisplay(kind, airport);
    return true;
  } catch {
    delete place.airport;
    setAirportDisplay(kind, null);
    if (!silent) setFormMessage("Não foi possível carregar a base de aeroportos agora. Tente novamente com internet ativa.");
    return false;
  } finally {
    status.textContent = "";
    updateRouteButtons();
  }
}

function refreshFlightAirports() {
  els.manualFromDialogBtn.classList.remove("hidden");
  els.suggestRoutesBtn.textContent = "Sugerir rotas";
  setFormMessage("");
  updateRouteButtons();
}

function updateRouteButtons() {
  const stopsReady = state.stopPlaces.every(item => item.place);
  const ready = Boolean(state.startPlace && state.endPlace && stopsReady && els.tripName.value.trim());
  els.suggestRoutesBtn.disabled = !ready;
  els.manualFromDialogBtn.disabled = !ready;
}

function setFormMessage(message = "") {
  els.formMessage.textContent = message;
  els.formMessage.classList.toggle("hidden", !message);
}

function makeAutocomplete(kind) {
  const input = els[`${kind}Address`];
  const list = els[`${kind}Suggestions`];
  const status = els[`${kind}Status`];
  const selected = els[`${kind}Selected`];
  let timer = null;
  let controller = null;
  const hide = () => list.classList.add("hidden");

  input.addEventListener("input", () => {
    resetPlaceSelection(kind);
    clearTimeout(timer);
    if (controller) controller.abort();
    const q = input.value.trim();
    list.innerHTML = "";
    if (q.length < 2) {
      status.textContent = "";
      hide();
      return;
    }

    timer = setTimeout(async () => {
      controller = new AbortController();
      status.textContent = "Buscando…";
      try {
        const url = `${CITY_SEARCH_ENDPOINT}?name=${encodeURIComponent(q)}&count=10&language=pt&format=json`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Falha na busca");
        const data = await response.json();
        let results = Array.isArray(data.results) ? data.results : [];
        const cityResults = results.filter(item => !item.feature_code || String(item.feature_code).startsWith("PPL"));
        if (cityResults.length) results = cityResults;
        list.innerHTML = "";

        if (!results.length) {
          list.innerHTML = '<div class="suggestion-empty">Nenhuma cidade encontrada.</div>';
          list.classList.remove("hidden");
          return;
        }

        results.slice(0, 8).forEach(result => {
          if (!Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) return;
          const details = [result.admin1, result.country].filter(Boolean).join(" · ");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "suggestion";
          btn.setAttribute("role", "option");
          btn.innerHTML = `<strong>${escapeHtml(result.name || "Cidade")}</strong><span>${escapeHtml(details)}</span>`;
          btn.addEventListener("click", async () => {
            const place = placeFromCityResult(result);
            state[`${kind}Place`] = place;
            input.value = place.label;
            selected.textContent = `✓ ${place.label}`;
            selected.classList.add("ok");
            status.textContent = "";
            hide();
            setFormMessage("");
            updateRouteButtons();
          });
          list.appendChild(btn);
        });
        if (!list.children.length) list.innerHTML = '<div class="suggestion-empty">Nenhuma cidade encontrada.</div>';
        list.classList.remove("hidden");
      } catch (error) {
        if (error.name !== "AbortError") {
          list.innerHTML = '<div class="suggestion-empty">Não foi possível consultar as cidades agora.</div>';
          list.classList.remove("hidden");
        }
      } finally {
        status.textContent = "";
      }
    }, 250);
  });

  input.addEventListener("focus", () => {
    if (list.children.length) list.classList.remove("hidden");
  });
  document.addEventListener("click", event => {
    if (!input.parentElement.contains(event.target)) hide();
  });
}


function resetStopsForm() {
  state.stopPlaces = [];
  if (els.stopsContainer) els.stopsContainer.innerHTML = "";
  updateRouteButtons();
}

function addStopField(existingPlace = null) {
  if (!els.stopsContainer) return;
  const entry = { id: uid(), place: existingPlace ? { ...existingPlace } : null };
  state.stopPlaces.push(entry);

  const row = document.createElement("div");
  row.className = "stop-row";
  row.dataset.stopId = entry.id;
  row.innerHTML = `
    <div class="stop-number" aria-hidden="true">${state.stopPlaces.length}</div>
    <div class="stop-search-column">
      <div class="search-wrap">
        <input class="stop-address" maxlength="180" placeholder="Ex.: Franca, SP" autocomplete="off" aria-autocomplete="list" />
        <span class="search-status stop-status"></span>
        <div class="suggestions stop-suggestions hidden" role="listbox"></div>
      </div>
      <small class="selected-place stop-selected">${existingPlace ? `✓ ${escapeHtml(existingPlace.label || existingPlace.city || "Parada")}` : "Nenhuma cidade selecionada."}</small>
    </div>
    <button type="button" class="remove-stop-btn" title="Remover parada" aria-label="Remover parada">×</button>`;

  const input = row.querySelector(".stop-address");
  const list = row.querySelector(".stop-suggestions");
  const status = row.querySelector(".stop-status");
  const selected = row.querySelector(".stop-selected");
  const removeBtn = row.querySelector(".remove-stop-btn");
  if (existingPlace) {
    input.value = existingPlace.label || existingPlace.city || "";
    selected.classList.add("ok");
  }

  let timer = null;
  let controller = null;
  const hide = () => list.classList.add("hidden");

  input.addEventListener("input", () => {
    entry.place = null;
    selected.textContent = "Nenhuma cidade selecionada.";
    selected.classList.remove("ok");
    updateRouteButtons();
    clearTimeout(timer);
    if (controller) controller.abort();
    const q = input.value.trim();
    list.innerHTML = "";
    if (q.length < 2) {
      status.textContent = "";
      hide();
      return;
    }
    timer = setTimeout(async () => {
      controller = new AbortController();
      status.textContent = "Buscando…";
      try {
        const url = `${CITY_SEARCH_ENDPOINT}?name=${encodeURIComponent(q)}&count=10&language=pt&format=json`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Falha na busca");
        const data = await response.json();
        let results = Array.isArray(data.results) ? data.results : [];
        const cityResults = results.filter(item => !item.feature_code || String(item.feature_code).startsWith("PPL"));
        if (cityResults.length) results = cityResults;
        list.innerHTML = "";
        if (!results.length) {
          list.innerHTML = '<div class="suggestion-empty">Nenhuma cidade encontrada.</div>';
          list.classList.remove("hidden");
          return;
        }
        results.slice(0, 8).forEach(result => {
          if (!Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) return;
          const details = [result.admin1, result.country].filter(Boolean).join(" · ");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "suggestion";
          btn.setAttribute("role", "option");
          btn.innerHTML = `<strong>${escapeHtml(result.name || "Cidade")}</strong><span>${escapeHtml(details)}</span>`;
          btn.addEventListener("click", () => {
            entry.place = placeFromCityResult(result);
            input.value = entry.place.label;
            selected.textContent = `✓ ${entry.place.label}`;
            selected.classList.add("ok");
            status.textContent = "";
            hide();
            setFormMessage("");
            updateRouteButtons();
          });
          list.appendChild(btn);
        });
        if (!list.children.length) list.innerHTML = '<div class="suggestion-empty">Nenhuma cidade encontrada.</div>';
        list.classList.remove("hidden");
      } catch (error) {
        if (error.name !== "AbortError") {
          list.innerHTML = '<div class="suggestion-empty">Não foi possível consultar as cidades agora.</div>';
          list.classList.remove("hidden");
        }
      } finally {
        status.textContent = "";
      }
    }, 250);
  });

  input.addEventListener("focus", () => {
    if (list.children.length) list.classList.remove("hidden");
  });
  document.addEventListener("click", event => {
    if (!row.contains(event.target)) hide();
  });
  removeBtn.addEventListener("click", () => {
    state.stopPlaces = state.stopPlaces.filter(item => item.id !== entry.id);
    row.remove();
    [...els.stopsContainer.querySelectorAll(".stop-number")].forEach((el, index) => { el.textContent = String(index + 1); });
    updateRouteButtons();
  });

  els.stopsContainer.appendChild(row);
  input.focus();
  updateRouteButtons();
}

function pendingStops() {
  return state.stopPlaces.map(item => item.place).filter(Boolean).map(place => ({ ...place }));
}


function setEditPlacesMessage(message = "") {
  els.editPlacesMessage.textContent = message;
  els.editPlacesMessage.classList.toggle("hidden", !message);
}

function updateEditPlacesButton() {
  const trip = state.trips.find(item => item.id === state.editingPlacesTripId);
  const stopsReady = state.editStopPlaces.every(item => item.place);
  const supported = Boolean(trip && ["carro", "moto"].includes(trip.mode));
  const ready = Boolean(state.editStartPlace && state.editEndPlace && stopsReady && supported);
  els.saveEditPlacesBtn.disabled = !ready;
}

function makeEditEndpointAutocomplete(kind) {
  const cap = kind === "start" ? "Start" : "End";
  const input = els[`edit${cap}Address`];
  const list = els[`edit${cap}Suggestions`];
  const status = els[`edit${cap}Status`];
  const selected = els[`edit${cap}Selected`];
  const stateKey = `edit${cap}Place`;
  let timer = null;
  let controller = null;
  const hide = () => list.classList.add("hidden");

  input.addEventListener("input", () => {
    state[stateKey] = null;
    selected.textContent = "Nenhuma cidade selecionada.";
    selected.classList.remove("ok");
    setEditPlacesMessage("");
    updateEditPlacesButton();
    clearTimeout(timer);
    if (controller) controller.abort();
    const q = input.value.trim();
    list.innerHTML = "";
    if (q.length < 2) {
      status.textContent = "";
      hide();
      return;
    }
    timer = setTimeout(async () => {
      controller = new AbortController();
      status.textContent = "Buscando…";
      try {
        const url = `${CITY_SEARCH_ENDPOINT}?name=${encodeURIComponent(q)}&count=10&language=pt&format=json`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Falha na busca");
        const data = await response.json();
        let results = Array.isArray(data.results) ? data.results : [];
        const cityResults = results.filter(item => !item.feature_code || String(item.feature_code).startsWith("PPL"));
        if (cityResults.length) results = cityResults;
        list.innerHTML = "";
        if (!results.length) {
          list.innerHTML = '<div class="suggestion-empty">Nenhuma cidade encontrada.</div>';
          list.classList.remove("hidden");
          return;
        }
        results.slice(0, 8).forEach(result => {
          if (!Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) return;
          const details = [result.admin1, result.country].filter(Boolean).join(" · ");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "suggestion";
          btn.setAttribute("role", "option");
          btn.innerHTML = `<strong>${escapeHtml(result.name || "Cidade")}</strong><span>${escapeHtml(details)}</span>`;
          btn.addEventListener("click", () => {
            const place = placeFromCityResult(result);
            state[stateKey] = place;
            input.value = place.label;
            selected.textContent = `✓ ${place.label}`;
            selected.classList.add("ok");
            status.textContent = "";
            hide();
            setEditPlacesMessage("");
            updateEditPlacesButton();
          });
          list.appendChild(btn);
        });
        if (!list.children.length) list.innerHTML = '<div class="suggestion-empty">Nenhuma cidade encontrada.</div>';
        list.classList.remove("hidden");
      } catch (error) {
        if (error.name !== "AbortError") {
          list.innerHTML = '<div class="suggestion-empty">Não foi possível consultar as cidades agora.</div>';
          list.classList.remove("hidden");
        }
      } finally {
        status.textContent = "";
      }
    }, 250);
  });

  input.addEventListener("focus", () => {
    if (list.children.length) list.classList.remove("hidden");
  });
  document.addEventListener("click", event => {
    if (!input.parentElement.contains(event.target)) hide();
  });
}

function renumberEditStops() {
  [...els.editStopsContainer.querySelectorAll(".stop-number")].forEach((el, index) => {
    el.textContent = String(index + 1);
  });
}

function updateEditStopMoveButtons() {
  const rows = [...els.editStopsContainer.querySelectorAll(".edit-stop-row")];
  rows.forEach((row, index) => {
    const up = row.querySelector(".move-stop-up");
    const down = row.querySelector(".move-stop-down");
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === rows.length - 1;
  });
}

function addEditStopField(existingPlace = null, shouldFocus = true) {
  const entry = { id: uid(), place: existingPlace ? { ...existingPlace } : null };
  state.editStopPlaces.push(entry);
  const row = document.createElement("div");
  row.className = "stop-row edit-stop-row";
  row.dataset.stopId = entry.id;
  row.innerHTML = `
    <div class="stop-number" aria-hidden="true">${state.editStopPlaces.length}</div>
    <div class="stop-search-column">
      <div class="search-wrap">
        <input class="stop-address" maxlength="180" placeholder="Ex.: Franca, SP" autocomplete="off" aria-autocomplete="list" />
        <span class="search-status stop-status"></span>
        <div class="suggestions stop-suggestions hidden" role="listbox"></div>
      </div>
      <small class="selected-place stop-selected">${existingPlace ? `✓ ${escapeHtml(existingPlace.label || existingPlace.city || "Parada")}` : "Nenhuma cidade selecionada."}</small>
    </div>
    <div class="edit-stop-actions">
      <button type="button" class="move-stop-up" title="Mover parada para cima" aria-label="Mover parada para cima">↑</button>
      <button type="button" class="move-stop-down" title="Mover parada para baixo" aria-label="Mover parada para baixo">↓</button>
      <button type="button" class="remove-stop-btn" title="Remover parada" aria-label="Remover parada">×</button>
    </div>`;

  const input = row.querySelector(".stop-address");
  const list = row.querySelector(".stop-suggestions");
  const status = row.querySelector(".stop-status");
  const selected = row.querySelector(".stop-selected");
  const removeBtn = row.querySelector(".remove-stop-btn");
  const upBtn = row.querySelector(".move-stop-up");
  const downBtn = row.querySelector(".move-stop-down");
  if (existingPlace) {
    input.value = existingPlace.label || existingPlace.city || "";
    selected.classList.add("ok");
  }

  let timer = null;
  let controller = null;
  const hide = () => list.classList.add("hidden");
  input.addEventListener("input", () => {
    entry.place = null;
    selected.textContent = "Nenhuma cidade selecionada.";
    selected.classList.remove("ok");
    updateEditPlacesButton();
    clearTimeout(timer);
    if (controller) controller.abort();
    const q = input.value.trim();
    list.innerHTML = "";
    if (q.length < 2) {
      status.textContent = "";
      hide();
      return;
    }
    timer = setTimeout(async () => {
      controller = new AbortController();
      status.textContent = "Buscando…";
      try {
        const url = `${CITY_SEARCH_ENDPOINT}?name=${encodeURIComponent(q)}&count=10&language=pt&format=json`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Falha na busca");
        const data = await response.json();
        let results = Array.isArray(data.results) ? data.results : [];
        const cityResults = results.filter(item => !item.feature_code || String(item.feature_code).startsWith("PPL"));
        if (cityResults.length) results = cityResults;
        list.innerHTML = "";
        if (!results.length) {
          list.innerHTML = '<div class="suggestion-empty">Nenhuma cidade encontrada.</div>';
          list.classList.remove("hidden");
          return;
        }
        results.slice(0, 8).forEach(result => {
          if (!Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) return;
          const details = [result.admin1, result.country].filter(Boolean).join(" · ");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "suggestion";
          btn.innerHTML = `<strong>${escapeHtml(result.name || "Cidade")}</strong><span>${escapeHtml(details)}</span>`;
          btn.addEventListener("click", () => {
            entry.place = placeFromCityResult(result);
            input.value = entry.place.label;
            selected.textContent = `✓ ${entry.place.label}`;
            selected.classList.add("ok");
            status.textContent = "";
            hide();
            setEditPlacesMessage("");
            updateEditPlacesButton();
          });
          list.appendChild(btn);
        });
        if (!list.children.length) list.innerHTML = '<div class="suggestion-empty">Nenhuma cidade encontrada.</div>';
        list.classList.remove("hidden");
      } catch (error) {
        if (error.name !== "AbortError") {
          list.innerHTML = '<div class="suggestion-empty">Não foi possível consultar as cidades agora.</div>';
          list.classList.remove("hidden");
        }
      } finally {
        status.textContent = "";
      }
    }, 250);
  });
  input.addEventListener("focus", () => {
    if (list.children.length) list.classList.remove("hidden");
  });
  document.addEventListener("click", event => {
    if (!row.contains(event.target)) hide();
  });
  const moveEntry = delta => {
    const index = state.editStopPlaces.findIndex(item => item.id === entry.id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.editStopPlaces.length) return;
    [state.editStopPlaces[index], state.editStopPlaces[nextIndex]] = [state.editStopPlaces[nextIndex], state.editStopPlaces[index]];
    if (delta < 0) {
      const previous = row.previousElementSibling;
      if (previous) els.editStopsContainer.insertBefore(row, previous);
    } else {
      const next = row.nextElementSibling;
      if (next) els.editStopsContainer.insertBefore(next, row);
    }
    renumberEditStops();
    updateEditStopMoveButtons();
  };
  upBtn.addEventListener("click", () => moveEntry(-1));
  downBtn.addEventListener("click", () => moveEntry(1));
  removeBtn.addEventListener("click", () => {
    state.editStopPlaces = state.editStopPlaces.filter(item => item.id !== entry.id);
    row.remove();
    renumberEditStops();
    updateEditStopMoveButtons();
    updateEditPlacesButton();
  });
  els.editStopsContainer.appendChild(row);
  updateEditStopMoveButtons();
  if (shouldFocus) input.focus();
  updateEditPlacesButton();
}

function editPlaceFallback(trip, kind) {
  const endpoints = getTripEndpoints(trip);
  const point = kind === "start" ? endpoints.start : endpoints.end;
  const label = kind === "start" ? (trip.startAddress || "Partida atual") : (trip.endAddress || "Chegada atual");
  if (!point) return null;
  return { label, city: label, region: "", country: "", countryCode: "", lat: point.lat, lng: point.lng, geonamesId: null };
}

function openEditPlacesDialog(trip) {
  if (!trip || state.drawing || state.editingTripId || !els.routeChooser.classList.contains("hidden")) return;
  state.editingPlacesTripId = trip.id;
  state.editStartPlace = trip.startPlace ? { ...trip.startPlace } : editPlaceFallback(trip, "start");
  state.editEndPlace = trip.endPlace ? { ...trip.endPlace } : editPlaceFallback(trip, "end");
  state.editStopPlaces = [];
  els.editStopsContainer.innerHTML = "";

  const startLabel = state.editStartPlace?.label || state.editStartPlace?.city || "";
  const endLabel = state.editEndPlace?.label || state.editEndPlace?.city || "";
  els.editStartAddress.value = startLabel;
  els.editEndAddress.value = endLabel;
  els.editStartSelected.textContent = state.editStartPlace ? `✓ ${startLabel}` : "Nenhuma cidade selecionada.";
  els.editEndSelected.textContent = state.editEndPlace ? `✓ ${endLabel}` : "Nenhuma cidade selecionada.";
  els.editStartSelected.classList.toggle("ok", Boolean(state.editStartPlace));
  els.editEndSelected.classList.toggle("ok", Boolean(state.editEndPlace));
  els.editStartSuggestions.innerHTML = "";
  els.editEndSuggestions.innerHTML = "";
  els.editStartSuggestions.classList.add("hidden");
  els.editEndSuggestions.classList.add("hidden");
  els.editStartStatus.textContent = "";
  els.editEndStatus.textContent = "";
  (trip.stopPlaces || []).forEach(place => addEditStopField(place, false));

  if (!["carro", "moto"].includes(trip.mode)) {
    setEditPlacesMessage("Nesta versão, o recálculo automático após editar cidades está disponível para viagens de carro e moto.");
  } else {
    setEditPlacesMessage("");
  }
  updateEditPlacesButton();
  els.editPlacesDialog.showModal();
}

function closeEditPlacesDialog() {
  if (els.editPlacesDialog.open) els.editPlacesDialog.close();
  state.editingPlacesTripId = null;
  state.editStartPlace = null;
  state.editEndPlace = null;
  state.editStopPlaces = [];
  els.editStopsContainer.innerHTML = "";
  setEditPlacesMessage("");
}

async function saveEditedPlaces(event) {
  event.preventDefault();
  const trip = state.trips.find(item => item.id === state.editingPlacesTripId);
  if (!trip) {
    closeEditPlacesDialog();
    return;
  }
  if (!["carro", "moto"].includes(trip.mode)) {
    setEditPlacesMessage("O recálculo automático desta edição está disponível para carro e moto.");
    return;
  }
  if (!state.editStartPlace) {
    setEditPlacesMessage("Escolha uma cidade válida para a partida.");
    els.editStartAddress.focus();
    return;
  }
  const incompleteStop = state.editStopPlaces.find(item => !item.place);
  if (incompleteStop) {
    setEditPlacesMessage("Selecione uma cidade válida para cada parada adicionada, ou remova a parada vazia.");
    els.editStopsContainer.querySelector(`[data-stop-id="${incompleteStop.id}"] .stop-address`)?.focus();
    return;
  }
  if (!state.editEndPlace) {
    setEditPlacesMessage("Escolha uma cidade válida para a chegada.");
    els.editEndAddress.focus();
    return;
  }

  const before = getAchievementSnapshot();
  const nextStart = { ...state.editStartPlace };
  const nextStops = state.editStopPlaces.map(item => ({ ...item.place }));
  const nextEnd = { ...state.editEndPlace };
  els.saveEditPlacesBtn.disabled = true;
  els.saveEditPlacesBtn.textContent = "Recalculando…";
  setEditPlacesMessage("");

  try {
    const route = await fetchRouteResilient([nextStart, ...nextStops, nextEnd]);
    if (!route) throw new Error("Nenhuma rota encontrada");

    trip.startPlace = nextStart;
    trip.stopPlaces = nextStops;
    trip.endPlace = nextEnd;
    trip.startAddress = nextStart.label || nextStart.city || "";
    trip.endAddress = nextEnd.label || nextEnd.city || "";
    // Pontos de ajuste antigos pertencem à geometria anterior e poderiam puxar a nova rota para lugares errados.
    trip.routeWaypoints = [];
    trip.routeSource = "osrm";
    trip.routeAlternativeIndex = 0;
    applyRouteToTrip(trip, route);

    const newItems = newConquestsAgainstSnapshot(trip, before);
    saveTrips();
    closeEditPlacesDialog();
    renderTrips();
    focusTrip(trip);
    celebrateConquests(newItems, trip.name);
  } catch (error) {
    console.error("Falha ao recalcular viagem após editar cidades", error);
    const reason = error?.message ? ` Motivo: ${error.message}` : "";
    setEditPlacesMessage(`Não foi possível recalcular a rota. Nenhuma alteração foi salva.${reason}`);
  } finally {
    els.saveEditPlacesBtn.textContent = "Salvar e recalcular rota";
    updateEditPlacesButton();
  }
}

function openTripDialog() {
  if (state.drawing || state.editingTripId || !els.routeChooser.classList.contains("hidden")) return;
  els.tripForm.reset();
  els.tripDate.value = "";
  els.tripColor.value = DEFAULT_ROUTE_COLOR;
  newTripColorWheelController?.setColor(DEFAULT_ROUTE_COLOR);
  els.manualFromDialogBtn.classList.remove("hidden");
  els.suggestRoutesBtn.textContent = "Sugerir rotas";
  state.startPlace = null;
  state.endPlace = null;
  resetStopsForm();
  els.startSelected.textContent = "Nenhuma cidade selecionada.";
  els.endSelected.textContent = "Nenhuma cidade selecionada.";
  els.startSelected.classList.remove("ok");
  els.endSelected.classList.remove("ok");
  els.startSuggestions.classList.add("hidden");
  els.endSuggestions.classList.add("hidden");
  setFormMessage("");
  updateRouteButtons();
  els.tripDialog.showModal();
  setTimeout(() => els.tripName.focus(), 50);
}

function closeTripDialog() {
  if (els.tripDialog.open) els.tripDialog.close();
}

function validateBaseForm() {
  if (!els.tripName.value.trim()) {
    els.tripName.focus();
    els.tripName.reportValidity();
    return false;
  }
  if (!state.startPlace) {
    setFormMessage("Escolha uma cidade na lista de sugestões para a partida.");
    els.startAddress.focus();
    return false;
  }
  const incompleteStop = state.stopPlaces.find(item => !item.place);
  if (incompleteStop) {
    setFormMessage("Selecione uma cidade válida para cada parada adicionada, ou remova a parada vazia.");
    els.stopsContainer?.querySelector(`[data-stop-id="${incompleteStop.id}"] .stop-address`)?.focus();
    return false;
  }
  if (!state.endPlace) {
    setFormMessage("Escolha uma cidade na lista de sugestões para a chegada.");
    els.endAddress.focus();
    return false;
  }
  setFormMessage("");
  return true;
}

function capturePendingTrip() {
  return ensureTripSchema({
    id: uid(),
    name: els.tripName.value.trim(),
    date: els.tripDate.value,
    mode: els.tripMode.value,
    color: els.tripColor.value || DEFAULT_ROUTE_COLOR,
    startPlace: { ...state.startPlace },
    stopPlaces: pendingStops(),
    endPlace: { ...state.endPlace },
    startAddress: state.startPlace.label,
    endAddress: state.endPlace.label,
    notes: els.tripNotes.value.trim(),
    visible: true,
    createdAt: new Date().toISOString(),
    pointsOfInterest: [],
    routeWaypoints: [],
    roadLabels: [],
    flightAirports: []
  });
}

async function fetchJsonWithTimeout(url, timeoutMs = 14000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRoutingPoint(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lng = Number(point?.lng ?? point?.lon ?? point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Uma das cidades está sem coordenadas válidas.");
  }
  return { ...point, lat, lng };
}

function normalizeRoutingPoints(points) {
  const clean = (points || []).map(normalizeRoutingPoint);
  const deduped = [];
  for (const point of clean) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.lat - point.lat) < 1e-7 && Math.abs(previous.lng - point.lng) < 1e-7) continue;
    deduped.push(point);
  }
  if (deduped.length < 2) throw new Error("A rota precisa ter ao menos dois pontos diferentes.");
  return deduped;
}

async function fetchOsrmRoute(points, alternatives = false) {
  const cleanPoints = normalizeRoutingPoints(points);
  const coords = cleanPoints.map(point => `${point.lng},${point.lat}`).join(";");
  const radiuses = cleanPoints.map(() => "unlimited").join(";");
  const attempts = [];
  for (const endpoint of OSRM_ENDPOINTS) {
    const alt = alternatives ? (endpoint.includes("project-osrm") ? "3" : "true") : "false";
    // Primeiro permite que o roteador procure a via dirigível mais próxima do centro da cidade.
    // Se o servidor não aceitar esse parâmetro, fazemos a mesma consulta sem ele.
    attempts.push({ endpoint, alt, radiuses: true });
    attempts.push({ endpoint, alt, radiuses: false });
  }
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const radiusQuery = attempt.radiuses ? `&radiuses=${encodeURIComponent(radiuses)}` : "";
      const url = `${attempt.endpoint}${coords}?alternatives=${attempt.alt}&steps=true&geometries=geojson&overview=full&continue_straight=false${radiusQuery}`;
      const data = await fetchJsonWithTimeout(url, 22000);
      if (data.code !== "Ok" || !Array.isArray(data.routes) || !data.routes.length) {
        throw new Error(data.message || data.code || "Nenhuma rota encontrada");
      }
      return data.routes;
    } catch (error) {
      lastError = error;
      console.warn("Roteador indisponível, tentando alternativa", error);
    }
  }
  throw lastError || new Error("Não foi possível calcular a rota");
}

function mergeOsrmRoutes(routeParts) {
  const coordinates = [];
  const legs = [];
  let distance = 0;
  let duration = 0;
  let hasDuration = true;

  for (const route of routeParts) {
    const partCoords = route?.geometry?.coordinates || [];
    partCoords.forEach((coord, index) => {
      const previous = coordinates[coordinates.length - 1];
      if (index === 0 && previous && previous[0] === coord[0] && previous[1] === coord[1]) return;
      coordinates.push(coord);
    });
    if (Array.isArray(route?.legs)) legs.push(...route.legs);
    distance += Number(route?.distance) || 0;
    if (Number.isFinite(Number(route?.duration))) duration += Number(route.duration);
    else hasDuration = false;
  }

  if (coordinates.length < 2) throw new Error("Os trechos foram calculados, mas a geometria da rota ficou incompleta.");
  return {
    geometry: { type: "LineString", coordinates },
    distance,
    duration: hasDuration ? duration : null,
    legs
  };
}

async function fetchRouteResilient(points) {
  const cleanPoints = normalizeRoutingPoints(points);
  try {
    const routes = await fetchOsrmRoute(cleanPoints, false);
    if (routes[0]) return routes[0];
  } catch (fullRouteError) {
    // Uma rota com várias paradas pode ser recusada mesmo quando cada trecho é válido.
    // Nesse caso reconstruímos início → parada 1 → ... → fim, trecho por trecho.
    if (cleanPoints.length <= 2) throw fullRouteError;
    console.warn("Rota completa falhou; tentando trecho por trecho.", fullRouteError);
  }

  const routeParts = [];
  for (let i = 0; i < cleanPoints.length - 1; i++) {
    const segmentRoutes = await fetchOsrmRoute([cleanPoints[i], cleanPoints[i + 1]], false);
    if (!segmentRoutes[0]) throw new Error(`Não foi encontrada rota entre os pontos ${i + 1} e ${i + 2}.`);
    routeParts.push(segmentRoutes[0]);
  }
  return mergeOsrmRoutes(routeParts);
}

async function requestRoutes() {
  if (!validateBaseForm()) return;
  const mode = els.tripMode.value;
  if (!["carro", "moto"].includes(mode)) {
    setFormMessage("Para este meio de transporte, use “Desenhar manualmente”.");
    return;
  }

  els.suggestRoutesBtn.disabled = true;
  els.suggestRoutesBtn.textContent = "Calculando…";
  setFormMessage("");
  try {
    const routePoints = [state.startPlace, ...pendingStops(), state.endPlace];
    const routes = await fetchOsrmRoute(routePoints, true);
    state.pendingTrip = capturePendingTrip();
    state.routeAlternatives = routes;
    state.selectedRouteIndex = 0;
    closeTripDialog();
    showRouteChooser();
  } catch (error) {
    console.error("Falha ao criar rota:", error);
    setFormMessage("Os roteadores automáticos não responderam. Você ainda pode usar “Desenhar manualmente” e salvar a viagem normalmente.");
  } finally {
    els.suggestRoutesBtn.textContent = "Sugerir rotas";
    updateRouteButtons();
  }
}

function routeViaText(route) {
  const names = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      const ref = cleanRoadRef(step.ref);
      const name = ref || String(step.name || "").trim();
      if (name && !names.includes(name)) names.push(name);
      if (names.length >= 4) break;
    }
    if (names.length >= 4) break;
  }
  return names.length ? `Via ${names.join(" → ")}` : "Trajeto calculado pela malha viária do OpenStreetMap";
}

function showRouteChooser() {
  els.routeChooserTitle.textContent = "Escolha a rota percorrida";
  els.manualRouteBtn.classList.remove("hidden");
  els.saveSelectedRouteBtn.textContent = "Salvar rota escolhida";
  renderRouteAlternatives();
  els.routeChooserEndpoints.textContent = [state.pendingTrip.startPlace, ...(state.pendingTrip.stopPlaces || []), state.pendingTrip.endPlace]
    .map(place => place?.label || place?.city)
    .filter(Boolean)
    .join(" → ");
  els.routeChooser.classList.remove("hidden");
  els.saveSelectedRouteBtn.disabled = false;
  fitAllPreviewRoutes();
}

function renderRouteAlternatives() {
  previewGroup.clearLayers();
  state.previewLayers = [];
  els.routeOptions.innerHTML = "";

  state.routeAlternatives.forEach((route, index) => {
    const selected = index === state.selectedRouteIndex;
    const label = index === 0 ? "Rota recomendada" : `Alternativa ${index + 1}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `route-option${selected ? " active" : ""}`;
    btn.innerHTML = `
      <div class="route-option-top">
        <span class="route-option-title">${label}</span>
        <span class="route-option-stats">${formatDistance(route.distance)} · ${formatDuration(route.duration)}</span>
      </div>
      <span class="route-option-via">${escapeHtml(shortText(routeViaText(route), 135))}</span>`;
    btn.addEventListener("click", () => selectRoute(index));
    els.routeOptions.appendChild(btn);

    const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const line = L.polyline(latlngs, {
      color: selected ? (state.pendingTrip?.color || DEFAULT_ROUTE_COLOR) : "#7a827d",
      weight: selected ? 7 : 4,
      opacity: selected ? .95 : .55
    }).addTo(previewGroup);
    line.on("click", () => selectRoute(index));
    state.previewLayers[index] = line;
  });

  const start = state.pendingTrip.startPlace;
  const end = state.pendingTrip.endPlace;
  L.marker([start.lat, start.lng]).bindTooltip("Partida").addTo(previewGroup);
  (state.pendingTrip.stopPlaces || []).forEach((stop, index) => {
    L.marker([stop.lat, stop.lng]).bindTooltip(`Parada ${index + 1}: ${escapeHtml(stop.city || stop.label || "")}`).addTo(previewGroup);
  });
  L.marker([end.lat, end.lng]).bindTooltip("Chegada").addTo(previewGroup);
}
function selectRoute(index) {
  state.selectedRouteIndex = index;
  renderRouteAlternatives();
  const route = state.routeAlternatives[index];
  const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  map.fitBounds(L.latLngBounds(latlngs).pad(.1), { maxZoom: 15 });
}

function fitAllPreviewRoutes() {
  const all = [];
  state.routeAlternatives.forEach(route => route.geometry.coordinates.forEach(([lng, lat]) => all.push([lat, lng])));
  if (all.length) map.fitBounds(L.latLngBounds(all).pad(.12), { maxZoom: 14 });
}

function applyRouteToTrip(trip, route) {
  trip.routeGeometry = route.geometry;
  trip.distance = route.distance;
  trip.duration = Number.isFinite(route.duration) ? route.duration : null;
  trip.points = [];
  trip.roadLabels = extractRoadLabelsFromRoute(route);
  (trip.stopPlaces || []).forEach(stop => {
    if (Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))) {
      stop.progress = nearestRouteProgress(trip, L.latLng(stop.lat, stop.lng));
    }
  });
  setTripConquests(trip, route);
}

function saveSelectedRoute() {
  const route = state.routeAlternatives[state.selectedRouteIndex];
  if (!route || !state.pendingTrip) return;
  const trip = state.pendingTrip;
  const before = getAchievementSnapshot();
  trip.routeSource = "osrm";
  trip.routeAlternativeIndex = state.selectedRouteIndex;
  applyRouteToTrip(trip, route);
  const newItems = newConquestsAgainstSnapshot(trip, before);
  state.trips.unshift(trip);
  saveTrips();
  cleanupRouteChooser();
  renderTrips();
  focusTrip(trip);
  celebrateConquests(newItems, trip.name);
}

function cleanupRouteChooser() {
  previewGroup.clearLayers();
  state.previewLayers = [];
  state.routeAlternatives = [];
  state.selectedRouteIndex = null;
  state.pendingTrip = null;
  els.routeChooser.classList.add("hidden");
}

function beginManualFromForm() {
  if (!validateBaseForm()) return;
  state.pendingTrip = capturePendingTrip();
  closeTripDialog();
  beginManualDrawing(state.pendingTrip);
}

function beginManualFromChooser() {
  if (!state.pendingTrip) return;
  const trip = { ...state.pendingTrip };
  cleanupRouteChooser();
  beginManualDrawing(trip);
}

function beginManualDrawing(trip) {
  state.draft = trip;
  state.drawing = true;
  state.draftManualHistory = [];
  const fixedPlaces = [trip.startPlace, ...(trip.stopPlaces || []), trip.endPlace].filter(Boolean);
  state.draftPoints = fixedPlaces.map((place, index) => ({
    id: `fixed-${index}`,
    lat: Number(place.lat),
    lng: Number(place.lng),
    fixed: true
  }));
  state.draftMarkers = [];
  state.draftLine = L.polyline(state.draftPoints.map(p => [p.lat, p.lng]), {
    color: "#111827", weight: 5, dashArray: "10 8", opacity: .8
  }).addTo(map);

  state.draftPoints.forEach((point, index) => {
    const isStart = index === 0;
    const isEnd = index === state.draftPoints.length - 1;
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: isStart || isEnd ? 7 : 6,
      weight: 2,
      color: "#111827",
      fillColor: isEnd ? "#111827" : (isStart ? "#fff" : "#f3d481"),
      fillOpacity: 1
    }).addTo(map);
    if (!isStart && !isEnd) marker.bindTooltip(`Parada ${index}`);
    state.draftMarkers.push(marker);
  });

  els.drawTitle.textContent = trip.name;
  els.drawRouteText.textContent = trip.stopPlaces?.length
    ? "Partida, paradas e chegada já estão fixadas. Clique perto de qualquer trecho para acrescentar pontos ao caminho."
    : "Partida e chegada já estão fixadas. Clique no mapa para adicionar pontos intermediários ao caminho.";
  els.drawBanner.classList.remove("hidden");
  map.getContainer().style.cursor = "crosshair";
  map.fitBounds(L.latLngBounds(state.draftPoints.map(point => [point.lat, point.lng])).pad(.2));
}

function nearestDraftInsertIndex(latlng) {
  if (state.draftPoints.length < 2) return state.draftPoints.length - 1;
  const target = map.latLngToLayerPoint(latlng);
  let bestIndex = 1;
  let bestDistance = Infinity;
  for (let i = 0; i < state.draftPoints.length - 1; i++) {
    const a = map.latLngToLayerPoint([state.draftPoints[i].lat, state.draftPoints[i].lng]);
    const b = map.latLngToLayerPoint([state.draftPoints[i + 1].lat, state.draftPoints[i + 1].lng]);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * abx + (target.y - a.y) * aby) / ab2));
    const px = a.x + t * abx;
    const py = a.y + t * aby;
    const dx = target.x - px;
    const dy = target.y - py;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i + 1;
    }
  }
  return bestIndex;
}

function addDraftPoint(latlng) {
  if (!state.drawing) return;
  const point = {
    id: uid(),
    lat: Number(latlng.lat.toFixed(6)),
    lng: Number(latlng.lng.toFixed(6)),
    fixed: false
  };
  const insertAt = nearestDraftInsertIndex(latlng);
  state.draftPoints.splice(insertAt, 0, point);
  const marker = L.circleMarker([point.lat, point.lng], { radius: 5, weight: 2, color: "#111827", fillColor: "#fff", fillOpacity: 1 }).addTo(map);
  state.draftMarkers.splice(insertAt, 0, marker);
  state.draftManualHistory.push(point.id);
  updateDraftLine();
}


function updateDraftLine() {
  if (state.draftLine) state.draftLine.setLatLngs(state.draftPoints.map(p => [p.lat, p.lng]));
}

function undoDraftPoint() {
  const id = state.draftManualHistory.pop();
  if (!id) return;
  const index = state.draftPoints.findIndex(point => point.id === id);
  if (index < 0) return;
  state.draftPoints.splice(index, 1);
  const marker = state.draftMarkers.splice(index, 1)[0];
  if (marker) map.removeLayer(marker);
  updateDraftLine();
}

async function finishManualTrip() {
  if (!state.drawing || !state.draft) return;
  els.finishTripBtn.disabled = true;
  els.finishTripBtn.textContent = "Salvando…";
  const trip = state.draft;
  const points = state.draftPoints.map(p => ({ lat: p.lat, lng: p.lng }));
  const manualAdjustments = state.draftPoints.filter(p => !p.fixed).map(p => ({ lat: p.lat, lng: p.lng }));
  const before = getAchievementSnapshot();

  try {
    if (["carro", "moto"].includes(trip.mode)) {
      const routes = await fetchOsrmRoute(points, false);
      trip.routeSource = "manual-osrm";
      trip.routeWaypoints = manualAdjustments.map(p => ({ ...p }));
      applyRouteToTrip(trip, routes[0]);
      trip.routeWaypoints = trip.routeWaypoints.map(point => ({
        ...point,
        progress: nearestRouteProgress(trip, L.latLng(point.lat, point.lng))
      }));
    } else {
      trip.routeSource = "manual";
      trip.points = points;
      trip.routeGeometry = null;
      setTripConquests(trip, null);
    }
  } catch {
    trip.routeSource = "manual";
    trip.points = points;
    trip.routeGeometry = null;
    setTripConquests(trip, null);
  }

  const newItems = newConquestsAgainstSnapshot(trip, before);
  state.trips.unshift(trip);
  saveTrips();
  stopDrawing();
  renderTrips();
  focusTrip(trip);
  celebrateConquests(newItems, trip.name);
  els.finishTripBtn.disabled = false;
  els.finishTripBtn.textContent = "Concluir viagem";
}

function stopDrawing() {
  if (state.draftLine) map.removeLayer(state.draftLine);
  state.draftMarkers.forEach(marker => map.removeLayer(marker));
  state.draftLine = null;
  state.draftMarkers = [];
  state.draftPoints = [];
  state.draft = null;
  state.drawing = false;
  els.drawBanner.classList.add("hidden");
  map.getContainer().style.cursor = "";
}

function cancelDrawing() {
  if (!state.drawing) return;
  if (confirm("Cancelar esta viagem?")) stopDrawing();
}

function getTripEndpoints(trip) {
  const latlngs = tripLatLngs(trip);
  const start = trip.startPlace && Number.isFinite(trip.startPlace.lat) ? { lat: trip.startPlace.lat, lng: trip.startPlace.lng } : latlngs.length ? { lat: latlngs[0][0], lng: latlngs[0][1] } : null;
  const last = latlngs[latlngs.length - 1];
  const end = trip.endPlace && Number.isFinite(trip.endPlace.lat) ? { lat: trip.endPlace.lat, lng: trip.endPlace.lng } : last ? { lat: last[0], lng: last[1] } : null;
  return { start, end };
}


function orderedIntermediateRoutePoints(trip, adjustmentWaypoints = trip.routeWaypoints || []) {
  const items = [];
  (trip.stopPlaces || []).forEach((stop, index) => {
    if (!Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.lng))) return;
    const progress = Number.isFinite(Number(stop.progress))
      ? Number(stop.progress)
      : nearestRouteProgress(trip, L.latLng(stop.lat, stop.lng));
    items.push({ lat: Number(stop.lat), lng: Number(stop.lng), progress, kind: "stop", order: index });
  });
  (adjustmentWaypoints || []).forEach((point, index) => {
    if (!Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return;
    const progress = Number.isFinite(Number(point.progress))
      ? Number(point.progress)
      : nearestRouteProgress(trip, L.latLng(point.lat, point.lng));
    items.push({ lat: Number(point.lat), lng: Number(point.lng), progress, kind: "adjustment", order: index });
  });
  items.sort((a, b) => {
    const diff = a.progress - b.progress;
    if (Math.abs(diff) > 0.000001) return diff;
    if (a.kind !== b.kind) return a.kind === "stop" ? -1 : 1;
    return a.order - b.order;
  });
  return items;
}

function tripRoutingPoints(trip, adjustmentWaypoints = trip.routeWaypoints || []) {
  const endpoints = getTripEndpoints(trip);
  if (!endpoints.start || !endpoints.end) return [];
  return [
    endpoints.start,
    ...orderedIntermediateRoutePoints(trip, adjustmentWaypoints).map(item => ({ lat: item.lat, lng: item.lng })),
    endpoints.end
  ];
}

async function refreshTripRoads(trip) {
  if (!["carro", "moto"].includes(trip.mode)) return;
  const button = els.tripDetailContent.querySelector(".refresh-roads-btn");
  if (button) {
    button.disabled = true;
    button.textContent = "Atualizando…";
  }
  try {
    const points = tripRoutingPoints(trip);
    if (points.length < 2) throw new Error("Pontos insuficientes");
    const routes = await fetchOsrmRoute(points, false);
    const route = routes[0];
    trip.roadLabels = extractRoadLabelsFromRoute(route);
    trip.conquests.roads = extractHighwaysFromRoute(route);
    saveTrips();
    renderTrips();
  } catch (error) {
    console.error("Falha ao atualizar rodovias", error);
    alert("Não foi possível reidentificar as rodovias desta viagem agora.");
    renderTripDetail();
  }
}

function nearestRouteProgress(trip, latlng) {
  const latlngs = tripLatLngs(trip);
  if (latlngs.length < 2) return 0;
  const target = map.latLngToLayerPoint(latlng);
  let bestDistance = Infinity;
  let bestProgress = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = map.latLngToLayerPoint(latlngs[i]);
    const b = map.latLngToLayerPoint(latlngs[i + 1]);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * abx + (target.y - a.y) * aby) / ab2));
    const px = a.x + t * abx;
    const py = a.y + t * aby;
    const dx = target.x - px;
    const dy = target.y - py;
    const dist = dx * dx + dy * dy;
    if (dist < bestDistance) {
      bestDistance = dist;
      bestProgress = (i + t) / (latlngs.length - 1);
    }
  }
  return bestProgress;
}

function nearestLatLngOnRoute(trip, latlng) {
  const latlngs = tripLatLngs(trip);
  if (latlngs.length < 2) return latlng;
  const target = map.latLngToLayerPoint(latlng);
  let bestDistance = Infinity;
  let bestPoint = target;
  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = map.latLngToLayerPoint(latlngs[i]);
    const b = map.latLngToLayerPoint(latlngs[i + 1]);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * abx + (target.y - a.y) * aby) / ab2));
    const p = L.point(a.x + t * abx, a.y + t * aby);
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDistance) {
      bestDistance = dist;
      bestPoint = p;
    }
  }
  return map.layerPointToLatLng(bestPoint);
}

function beginRouteEdit(trip) {
  if (state.drawing || state.editingTripId || !["carro", "moto"].includes(trip.mode)) return;
  const latlngs = tripLatLngs(trip);
  if (latlngs.length < 2) return;
  state.editingTripId = trip.id;
  state.editSnapshot = JSON.parse(JSON.stringify({
    routeGeometry: trip.routeGeometry || null,
    routeWaypoints: trip.routeWaypoints || [],
    stopPlaces: trip.stopPlaces || [],
    roadLabels: trip.roadLabels || [],
    distance: trip.distance ?? null,
    duration: trip.duration ?? null,
    conquests: trip.conquests || { cities: [], roads: [] }
  }));
  editGroup.clearLayers();
  renderTrips();
  createEditLayers(trip);
  els.editBanner.classList.remove("hidden");
  focusTrip(trip);
}

function createEditLayers(trip) {
  editGroup.clearLayers();
  const latlngs = tripLatLngs(trip);
  const color = trip.color || DEFAULT_ROUTE_COLOR;
  state.editVisibleLine = L.polyline(latlngs, { color, weight: 6, opacity: .95 }).addTo(editGroup);
  state.editHitLine = L.polyline(latlngs, { color: "#000", weight: 24, opacity: 0, interactive: true, className: "edit-route-hit" }).addTo(editGroup);
  state.editHitLine.on("mousedown", event => startEditDrag(trip, event));
  const endpoints = getTripEndpoints(trip);
  if (endpoints.start) L.circleMarker([endpoints.start.lat, endpoints.start.lng], { radius: 6, weight: 2, color, fillColor: "#fff", fillOpacity: 1 }).addTo(editGroup);
  if (endpoints.end) L.circleMarker([endpoints.end.lat, endpoints.end.lng], { radius: 7, weight: 2, color, fillColor: color, fillOpacity: 1 }).addTo(editGroup);

  for (const badge of trip.roadLabels || []) {
    L.marker([badge.lat, badge.lng], {
      interactive: false,
      icon: roadMapIcon(badge.label)
    }).addTo(editGroup);
  }

  (trip.routeWaypoints || []).forEach((point, index) => {
    const marker = L.marker([point.lat, point.lng], {
      draggable: true,
      keyboard: true,
      icon: L.divIcon({
        className: "",
        html: `<div class="route-adjust-marker" style="--route-color:${escapeHtml(color)}"></div>`,
        iconSize: [18,18],
        iconAnchor: [9,9]
      })
    }).addTo(editGroup);
    marker.bindTooltip(`Ponto de ajuste ${index + 1}`, { direction: "top", offset: [0,-8] });
    marker.bindPopup(`<div class="waypoint-popup"><strong>Ponto de ajuste ${index + 1}</strong><button type="button" class="waypoint-delete" aria-label="Excluir ponto de ajuste">🗑 Excluir ajuste</button></div>`);
    marker.on("popupopen", event => {
      const btn = event.popup.getElement()?.querySelector(".waypoint-delete");
      if (btn) btn.addEventListener("click", () => deleteRouteWaypoint(trip, index), { once: true });
    });
    marker.on("dragstart", () => map.dragging.disable());
    marker.on("dragend", async event => {
      map.dragging.enable();
      await moveRouteWaypoint(trip, index, event.target.getLatLng());
    });
  });
}

function startEditDrag(trip, event) {
  if (state.editBusy || state.editDragging || state.editingTripId !== trip.id) return;
  if (event.originalEvent?.button != null && event.originalEvent.button !== 0) return;
  state.editDragging = true;
  state.editDragStart = event.latlng;
  state.editDragLast = event.latlng;
  state.editDragProgress = nearestRouteProgress(trip, event.latlng);
  map.dragging.disable();
  if (event.originalEvent) {
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation();
  }
  const snapped = nearestLatLngOnRoute(trip, event.latlng);
  state.editGuideLine = L.polyline([[snapped.lat, snapped.lng], [snapped.lat, snapped.lng]], { color: "#111827", weight: 4, dashArray: "7 7", opacity: .75 }).addTo(editGroup);
}

function updateEditDrag(event) {
  if (!state.editDragging || !state.editGuideLine) return;
  state.editDragLast = event.latlng;
  const trip = state.trips.find(t => t.id === state.editingTripId);
  if (!trip) return;
  const latlngs = tripLatLngs(trip);
  const index = Math.max(1, Math.min(latlngs.length - 2, Math.round(state.editDragProgress * (latlngs.length - 1))));
  const before = latlngs[Math.max(0, index - 2)];
  const after = latlngs[Math.min(latlngs.length - 1, index + 2)];
  state.editGuideLine.setLatLngs([before, [event.latlng.lat, event.latlng.lng], after]);
}

async function applyEditedWaypoints(trip, nextWaypoints, message) {
  if (state.editBusy || state.editingTripId !== trip.id) return false;
  const endpoints = getTripEndpoints(trip);
  if (!endpoints.start || !endpoints.end) return false;
  state.editBusy = true;
  els.finishEditBtn.disabled = true;
  els.cancelEditBtn.disabled = true;
  const copy = els.editBanner.querySelector(".draw-copy span");
  const originalText = copy.textContent;
  copy.textContent = message || "Recalculando a rota…";
  try {
    const beforeAchievements = getAchievementSnapshot();
    const routePoints = tripRoutingPoints(trip, nextWaypoints);
    const routes = await fetchOsrmRoute(routePoints, false);
    trip.routeWaypoints = nextWaypoints.map(p => ({ ...p }));
    applyRouteToTrip(trip, routes[0]);
    trip.routeWaypoints = trip.routeWaypoints.map(point => ({
      ...point,
      progress: nearestRouteProgress(trip, L.latLng(point.lat, point.lng))
    }));
    saveTrips();
    const newItems = newConquestsAgainstSnapshot(trip, beforeAchievements);
    renderTrips();
    createEditLayers(trip);
    celebrateConquests(newItems, trip.name);
    return true;
  } catch {
    alert("Não foi possível recalcular esse ajuste. Tente outro ponto da via.");
    createEditLayers(trip);
    return false;
  } finally {
    state.editBusy = false;
    els.finishEditBtn.disabled = false;
    els.cancelEditBtn.disabled = false;
    copy.textContent = originalText;
  }
}

async function finishEditDrag() {
  if (!state.editDragging) return;
  const trip = state.trips.find(t => t.id === state.editingTripId);
  const endLatLng = state.editDragLast;
  const startLatLng = state.editDragStart;
  state.editDragging = false;
  map.dragging.enable();
  if (state.editGuideLine) editGroup.removeLayer(state.editGuideLine);
  state.editGuideLine = null;
  if (!trip || !endLatLng || !startLatLng) return;
  if (map.distance(startLatLng, endLatLng) < 35) return;

  const nextWaypoints = (trip.routeWaypoints || []).map(point => ({
    lat: point.lat,
    lng: point.lng,
    progress: nearestRouteProgress(trip, L.latLng(point.lat, point.lng))
  }));
  nextWaypoints.push({ lat: endLatLng.lat, lng: endLatLng.lng, progress: state.editDragProgress });
  nextWaypoints.sort((a, b) => a.progress - b.progress);
  if (nextWaypoints.length > 14) nextWaypoints.splice(0, nextWaypoints.length - 14);
  await applyEditedWaypoints(trip, nextWaypoints, "Recalculando a rota pelo ponto arrastado…");
}

async function moveRouteWaypoint(trip, index, latlng) {
  if (state.editBusy || !trip.routeWaypoints?.[index]) return;
  const next = trip.routeWaypoints.map(p => ({ ...p }));
  next[index].lat = latlng.lat;
  next[index].lng = latlng.lng;
  await applyEditedWaypoints(trip, next, "Recalculando após mover o ponto de ajuste…");
}

async function deleteRouteWaypoint(trip, index) {
  if (state.editBusy || !trip.routeWaypoints?.[index]) return;
  const next = trip.routeWaypoints.map(p => ({ ...p }));
  next.splice(index, 1);
  map.closePopup();
  await applyEditedWaypoints(trip, next, "Recalculando sem o ponto removido…");
}

function finishRouteEdit() {
  if (!state.editingTripId || state.editBusy) return;
  state.editDragging = false;
  state.editBusy = false;
  state.editingTripId = null;
  state.editVisibleLine = null;
  state.editHitLine = null;
  state.editGuideLine = null;
  state.editSnapshot = null;
  editGroup.clearLayers();
  map.dragging.enable();
  els.editBanner.classList.add("hidden");
  renderTrips();
}

function cancelRouteEdit() {
  if (!state.editingTripId || state.editBusy) return;
  const trip = state.trips.find(t => t.id === state.editingTripId);
  if (trip && state.editSnapshot) {
    trip.routeGeometry = state.editSnapshot.routeGeometry;
    trip.routeWaypoints = state.editSnapshot.routeWaypoints;
    trip.stopPlaces = state.editSnapshot.stopPlaces || trip.stopPlaces || [];
    trip.roadLabels = state.editSnapshot.roadLabels;
    trip.distance = state.editSnapshot.distance;
    trip.duration = state.editSnapshot.duration;
    trip.conquests = state.editSnapshot.conquests;
    saveTrips();
  }
  finishRouteEdit();
}

function openMediaDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB indisponível"));
    const request = indexedDB.open(MEDIA_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
      store.createIndex("pointId", "pointId", { unique: false });
      store.createIndex("tripId", "tripId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getMediaForPoint(pointId) {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readonly");
    const request = tx.objectStore(MEDIA_STORE).index("pointId").getAll(pointId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveMediaFiles(tripId, pointId, files) {
  if (!files.length) return;
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    const store = tx.objectStore(MEDIA_STORE);
    files.forEach(file => store.put({
      id: uid(), tripId, pointId, name: file.name, type: file.type || "application/octet-stream", size: file.size, createdAt: new Date().toISOString(), blob: file
    }));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Falha ao salvar mídia")); };
  });
}

async function deleteMediaIds(ids) {
  if (!ids.length) return;
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    const store = tx.objectStore(MEDIA_STORE);
    ids.forEach(id => store.delete(id));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function deleteMediaByTrip(tripId) {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    const store = tx.objectStore(MEDIA_STORE);
    const index = store.index("tripId");
    const request = index.openCursor(IDBKeyRange.only(tripId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function clearPointEditorUrls() {
  for (const url of state.pointEditor?.objectUrls || []) URL.revokeObjectURL(url);
  if (state.pointEditor) state.pointEditor.objectUrls = [];
}

async function openRoutePointDialog(trip, latlng = null, existingPoint = null) {
  if (state.drawing || state.editingTripId) return;
  clearPointEditorUrls();
  const snapped = existingPoint ? L.latLng(existingPoint.lat, existingPoint.lng) : nearestLatLngOnRoute(trip, latlng);
  const pointId = existingPoint?.id || uid();
  state.pointEditor = {
    tripId: trip.id,
    pointId,
    isExisting: Boolean(existingPoint),
    lat: snapped.lat,
    lng: snapped.lng,
    existingMedia: [],
    pendingFiles: [],
    removedIds: new Set(),
    objectUrls: []
  };
  els.routePointDialogTitle.textContent = existingPoint ? "Editar ponto" : "Adicionar ponto";
  els.routePointDescription.value = existingPoint?.description || "";
  els.routePointMedia.value = "";
  els.deletePointBtn.classList.toggle("hidden", !existingPoint);
  els.pointFormMessage.classList.add("hidden");
  els.pointFormMessage.textContent = "";
  els.routePointMediaPreview.innerHTML = '<p class="empty">Carregando mídia…</p>';
  els.routePointDialog.showModal();

  try {
    state.pointEditor.existingMedia = await getMediaForPoint(pointId);
  } catch {
    state.pointEditor.existingMedia = [];
  }
  renderPointMediaPreview();
}

function renderPointMediaPreview() {
  if (!state.pointEditor) return;
  clearPointEditorUrls();
  const editor = state.pointEditor;
  const items = [
    ...editor.existingMedia.filter(item => !editor.removedIds.has(item.id)).map(item => ({ kind: "existing", id: item.id, name: item.name, type: item.type, blob: item.blob })),
    ...editor.pendingFiles.map(item => ({ kind: "pending", id: item.id, name: item.file.name, type: item.file.type, blob: item.file }))
  ];
  els.routePointMediaPreview.innerHTML = "";
  if (!items.length) {
    els.routePointMediaPreview.innerHTML = '<p class="empty">Nenhuma mídia adicionada.</p>';
    return;
  }

  items.forEach(item => {
    const url = URL.createObjectURL(item.blob);
    editor.objectUrls.push(url);
    const wrapper = document.createElement("div");
    wrapper.className = "media-item";
    const media = item.type.startsWith("video/")
      ? `<video src="${url}" muted controls preload="metadata"></video>`
      : `<img src="${url}" alt="${escapeHtml(item.name)}">`;
    wrapper.innerHTML = `${media}<button class="remove-media" type="button" aria-label="Remover mídia">×</button><span>${escapeHtml(item.name)}</span>`;
    wrapper.querySelector(".remove-media").addEventListener("click", () => {
      if (item.kind === "existing") editor.removedIds.add(item.id);
      else editor.pendingFiles = editor.pendingFiles.filter(file => file.id !== item.id);
      renderPointMediaPreview();
    });
    els.routePointMediaPreview.appendChild(wrapper);
  });
}

function closeRoutePointDialog() {
  clearPointEditorUrls();
  state.pointEditor = null;
  if (els.routePointDialog.open) els.routePointDialog.close();
}

async function saveRoutePoint(event) {
  event.preventDefault();
  const editor = state.pointEditor;
  if (!editor) return;
  const trip = state.trips.find(t => t.id === editor.tripId);
  if (!trip) return closeRoutePointDialog();
  const description = els.routePointDescription.value.trim();
  let point = trip.pointsOfInterest.find(p => p.id === editor.pointId);
  if (!point) {
    point = { id: editor.pointId, lat: editor.lat, lng: editor.lng, description, createdAt: new Date().toISOString() };
    trip.pointsOfInterest.push(point);
  } else {
    point.description = description;
  }
  saveTrips();

  try {
    await deleteMediaIds([...editor.removedIds]);
    await saveMediaFiles(trip.id, point.id, editor.pendingFiles.map(item => item.file));
  } catch {
    alert("O ponto foi salvo, mas alguma mídia não pôde ser armazenada. O navegador pode estar sem espaço disponível.");
  }
  closeRoutePointDialog();
  renderTrips();
}

async function deleteCurrentPoint() {
  const editor = state.pointEditor;
  if (!editor || !editor.isExisting) return;
  if (!confirm("Excluir este ponto e as mídias vinculadas a ele?")) return;
  const trip = state.trips.find(t => t.id === editor.tripId);
  if (!trip) return;
  try {
    const media = await getMediaForPoint(editor.pointId);
    await deleteMediaIds(media.map(item => item.id));
  } catch {}
  trip.pointsOfInterest = trip.pointsOfInterest.filter(point => point.id !== editor.pointId);
  saveTrips();
  closeRoutePointDialog();
  renderTrips();
}

function exportBackup() {
  const payload = { app: "Minhas Viagens", version: "0.6.6", exportedAt: new Date().toISOString(), note: "Mídias do IndexedDB não estão incluídas neste JSON.", trips: state.trips };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `minhas-viagens-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const trips = Array.isArray(data) ? data : data.trips;
    if (!Array.isArray(trips)) throw new Error("Formato inválido");
    if (state.trips.length && !confirm("Importar este backup substituirá as viagens atuais. Continuar?")) return;
    finishRouteEdit();
    state.trips = trips.map(ensureTripSchema);
    saveTrips();
    renderTrips();
    if (state.trips[0]) focusTrip(state.trips[0]);
  } catch {
    alert("Não foi possível importar este arquivo.");
  } finally {
    els.importInput.value = "";
  }
}

makeAutocomplete("start");
makeAutocomplete("end");
makeEditEndpointAutocomplete("start");
makeEditEndpointAutocomplete("end");

els.tripName.addEventListener("input", updateRouteButtons);
els.tripMode.addEventListener("change", refreshFlightAirports);
els.newTripBtn.addEventListener("click", openTripDialog);
els.addStopBtn?.addEventListener("click", () => addStopField());
els.editAddStopBtn?.addEventListener("click", () => addEditStopField());
els.tripsTabBtn.addEventListener("click", () => switchSidebarTab("trips"));
els.achievementsTabBtn.addEventListener("click", () => switchSidebarTab("achievements"));
els.backToTripsBtn.addEventListener("click", showTripList);
els.closeDialogBtn.addEventListener("click", closeTripDialog);
els.cancelDialogBtn.addEventListener("click", closeTripDialog);
els.tripForm.addEventListener("submit", event => { event.preventDefault(); requestRoutes(); });
els.manualFromDialogBtn.addEventListener("click", beginManualFromForm);
els.closeRouteChooserBtn.addEventListener("click", () => { if (confirm("Cancelar a criação desta viagem?")) cleanupRouteChooser(); });
els.manualRouteBtn.addEventListener("click", beginManualFromChooser);
els.saveSelectedRouteBtn.addEventListener("click", saveSelectedRoute);
els.undoPointBtn.addEventListener("click", undoDraftPoint);
els.finishTripBtn.addEventListener("click", finishManualTrip);
els.cancelTripBtn.addEventListener("click", cancelDrawing);
els.finishEditBtn.addEventListener("click", finishRouteEdit);
els.cancelEditBtn.addEventListener("click", cancelRouteEdit);
els.exportBtn.addEventListener("click", exportBackup);
els.importInput.addEventListener("change", event => importBackup(event.target.files[0]));

els.closeEditPlacesBtn?.addEventListener("click", closeEditPlacesDialog);
els.cancelEditPlacesBtn?.addEventListener("click", closeEditPlacesDialog);
els.editPlacesForm?.addEventListener("submit", saveEditedPlaces);
els.editPlacesDialog?.addEventListener("cancel", event => {
  event.preventDefault();
  closeEditPlacesDialog();
});
els.closePointDialogBtn.addEventListener("click", closeRoutePointDialog);
els.cancelPointDialogBtn.addEventListener("click", closeRoutePointDialog);
els.routePointForm.addEventListener("submit", saveRoutePoint);
els.deletePointBtn.addEventListener("click", deleteCurrentPoint);
els.routePointMedia.addEventListener("change", event => {
  if (!state.pointEditor) return;
  const files = [...event.target.files];
  state.pointEditor.pendingFiles.push(...files.map(file => ({ id: uid(), file })));
  event.target.value = "";
  renderPointMediaPreview();
});

map.on("click", event => { if (state.drawing) addDraftPoint(event.latlng); });
map.on("mousemove", updateEditDrag);
map.on("mouseup", finishEditDrag);
document.addEventListener("mouseup", () => { if (state.editDragging) finishEditDrag(); });
window.addEventListener("resize", () => map.invalidateSize());

newTripColorWheelController = setupColorWheel(els.newTripColorWheel, els.tripColor.value || DEFAULT_ROUTE_COLOR, color => {
  els.tripColor.value = color;
}, color => {
  els.tripColor.value = color;
});

loadTrips();
if (saveTrips()) {
  for (const key of LEGACY_KEYS) { try { localStorage.removeItem(key); } catch {} }
}
renderTrips();
requestAnimationFrame(() => map.invalidateSize());
