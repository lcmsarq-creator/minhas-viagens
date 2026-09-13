const AUTH_USER_ID = window.MinhasViagensAuth?.getUser()?.id;
if (!AUTH_USER_ID) throw new Error("A aplicação requer uma sessão autenticada.");
const STORAGE_KEY = `minhasViagens.trips.${AUTH_USER_ID}.v1`;
const LEGACY_KEYS = ["minhasViagens.v0.6.6", "minhasViagens.v0.6.5", "minhasViagens.v0.6.4", "minhasViagens.v0.6.3", "minhasViagens.v0.6.2", "minhasViagens.v0.6.1", "minhasViagens.v0.6", "minhasViagens.v0.5", "minhasViagens.v0.4", "minhasViagens.v0.3", "minhasViagens.v0.2", "minhasViagens.v0.1"];
const CITY_SEARCH_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const OSRM_ENDPOINTS = [
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/"
];
const AIRPORTS_CSV_URLS = [
  "https://davidmegginson.github.io/ourairports-data/airports.csv",
  "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv"
];
const DEFAULT_ROUTE_COLOR = "#2f6d50";
const ROUTE_INTERACTION = window.MinhasViagensRouteInteraction;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const HIGHWAY_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const HIGHWAY_DB_NAME = "minhasViagensHighways.v1";
const HIGHWAY_GEOMETRY_STORE = "geometries";
const HIGHWAY_PROGRESS_STORE = "progress";
const HIGHWAY_CACHE_VERSION = 2;
const ROAD_MATCH_TOLERANCE_KM = .08;
const ROAD_MATCH_MIN_KM = .5;
const OFFICIAL_ROAD_NAME_REFS = [
  [/\bassis\s+chateaubriand\b/i, "SP-425"]
];

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
  editPointerId: null,
  editBusy: false,
  editSnapshot: null,
  airports: null,
  airportsPromise: null,
  pointEditor: null,
  achievementTimer: null,
  achievementView: "cities",
  achievementStateKey: null,
  activeTripDetailId: null,
  tripLineLayers: new Map(),
  editingPlacesTripId: null,
  editStartPlace: null,
  editEndPlace: null,
  editStopPlaces: [],
  highwayLayer: null,
  highwayRequest: null,
  highwayKey: "",
  highwaySelection: 0,
  highwayBounds: null,
  highwayProgressLayer: null,
  tripRoadLayer: null,
  tripRoadKey: "",
  highwayQueue: [],
  highwayQueueKeys: new Set(),
  highwayQueueRunning: false,
  cityHighlight: null,
  cityHighlightTimer: null
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
ROUTE_INTERACTION.configurePassivePane(map, "fullHighwayOutline", 625);
ROUTE_INTERACTION.configurePassivePane(map, "fullHighwayMain", 626);

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
  iconicAchievementCount: document.getElementById("iconicAchievementCount"),
  cityAchievementsTabBtn: document.getElementById("cityAchievementsTabBtn"),
  roadAchievementsTabBtn: document.getElementById("roadAchievementsTabBtn"),
  iconicAchievementsTabBtn: document.getElementById("iconicAchievementsTabBtn"),
  cityAchievementsView: document.getElementById("cityAchievementsView"),
  roadAchievementsView: document.getElementById("roadAchievementsView"),
  iconicAchievementsView: document.getElementById("iconicAchievementsView"),
  cityAchievementHeader: document.getElementById("cityAchievementHeader"),
  cityAchievementList: document.getElementById("cityAchievementList"),
  roadAchievementList: document.getElementById("roadAchievementList"),
  iconicAchievementList: document.getElementById("iconicAchievementList"),
  iconicOtherList: document.getElementById("iconicOtherList"),
  iconicMineTabBtn: document.getElementById("iconicMineTabBtn"),
  iconicOtherTabBtn: document.getElementById("iconicOtherTabBtn"),
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
  highwayBanner: document.getElementById("highwayBanner"),
  highwayBannerTitle: document.getElementById("highwayBannerTitle"),
  highwayBannerStatus: document.getElementById("highwayBannerStatus"),
  highwayProgress: document.getElementById("highwayProgress"),
  highwayProgressPercent: document.getElementById("highwayProgressPercent"),
  highwayProgressDistance: document.getElementById("highwayProgressDistance"),
  highwayProgressBar: document.getElementById("highwayProgressBar"),
  closeHighwayBtn: document.getElementById("closeHighwayBtn"),
  tripList: document.getElementById("tripList"),
  tripCount: document.getElementById("tripCount"),
  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),
  routePointDialog: document.getElementById("routePointDialog"),
  routePointForm: document.getElementById("routePointForm"),
  routePointDialogTitle: document.getElementById("routePointDialogTitle"),
  routePointDescription: document.getElementById("routePointDescription"),
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

const INTERNATIONAL_ROADS = {
  UY: { name: "URUGUAY", network: "RU" },
  AR: { name: "ARGENTINA", network: "RN" },
  PY: { name: "PARAGUAY", network: "PY" },
  CL: { name: "CHILE", network: "CH" },
  BO: { name: "BOLIVIA", network: "F" },
  PE: { name: "PERU", network: "PE" },
  CO: { name: "COLOMBIA", network: "RN" },
  VE: { name: "VENEZUELA", network: "T" },
  EC: { name: "ECUADOR", network: "E" }
};

const COUNTRY_CODE_BY_NAME = {
  uruguay: "UY", argentina: "AR", paraguay: "PY", chile: "CL", bolivia: "BO",
  peru: "PE", colombia: "CO", venezuela: "VE", ecuador: "EC"
};

function tripRoadCountry(trip) {
  const places = [trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace].filter(Boolean);
  const codes = places.map(place => {
    const direct = String(place.countryCode || "").toUpperCase();
    return INTERNATIONAL_ROADS[direct] ? direct : COUNTRY_CODE_BY_NAME[normalizeSimple(place.country)] || "";
  }).filter(Boolean);
  return codes.length && codes.every(code => code === codes[0]) ? codes[0] : "";
}

function parseRoadCode(label) {
  const value = String(label || "").toUpperCase().replace(/[–—]/g, "-").trim();
  const international = value.match(/^INT:([A-Z]{2}):([A-Z]{1,3}):(\d{1,4}[A-Z]?)$/);
  if (international && INTERNATIONAL_ROADS[international[1]]) {
    return { countryCode: international[1], network: international[2], number: international[3], international: true };
  }
  const match = value.match(/\b(BR|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*[- ]?\s*(\d{2,3})\b/);
  if (!match) return null;
  return { prefix: match[1], number: match[2], federal: match[1] === "BR" };
}

function internationalFlagMarkup(code) {
  const common = 'x="31" y="40" width="58" height="25"';
  const flags = {
    UY: `<g><rect ${common} fill="#fff"/><path d="M31 45h58M31 55h58M31 65h58" stroke="#1670d2" stroke-width="4"/><circle cx="40" cy="47" r="5" fill="#f4bf18"/></g>`,
    AR: `<g><rect ${common} fill="#fff"/><path d="M31 44h58M31 61h58" stroke="#75aadb" stroke-width="8"/><circle cx="60" cy="52.5" r="3" fill="#f6b40e"/></g>`,
    PY: `<g><rect ${common} fill="#fff"/><path d="M31 44h58" stroke="#d52b1e" stroke-width="8"/><path d="M31 61h58" stroke="#0038a8" stroke-width="8"/></g>`,
    CL: `<g><rect ${common} fill="#fff"/><rect x="31" y="40" width="22" height="13" fill="#0039a6"/><rect x="31" y="53" width="58" height="12" fill="#d52b1e"/><text x="42" y="47" fill="#fff" font-size="7">★</text></g>`,
    BO: `<g><rect ${common} fill="#f9e300"/><path d="M31 44h58" stroke="#d52b1e" stroke-width="8"/><path d="M31 61h58" stroke="#178a3d" stroke-width="8"/></g>`,
    PE: `<g><rect ${common} fill="#fff"/><rect x="31" y="40" width="19" height="25" fill="#d91023"/><rect x="70" y="40" width="19" height="25" fill="#d91023"/></g>`,
    CO: `<g><rect ${common} fill="#fcd116"/><rect x="31" y="53" width="58" height="6" fill="#003893"/><rect x="31" y="59" width="58" height="6" fill="#ce1126"/></g>`,
    VE: `<g><rect ${common} fill="#f4d900"/><rect x="31" y="48" width="58" height="9" fill="#003da5"/><rect x="31" y="57" width="58" height="8" fill="#cf142b"/><text x="60" y="53" fill="#fff" font-size="6">••••</text></g>`,
    EC: `<g><rect ${common} fill="#ffdd00"/><rect x="31" y="53" width="58" height="6" fill="#034ea2"/><rect x="31" y="59" width="58" height="6" fill="#ed1c24"/></g>`
  };
  return flags[code] || "";
}

function roadShieldMarkup(label, size = "achievement") {
  const parsed = parseRoadCode(label);
  if (!parsed) return `<span class="road-shield-fallback">${escapeHtml(label)}</span>`;
  if (parsed.international) {
    const country = INTERNATIONAL_ROADS[parsed.countryCode];
    return `<svg class="road-emblem-svg international ${size}" viewBox="0 0 100 120" role="img" aria-label="${escapeHtml(`${country.name}, ${parsed.network} ${parsed.number}`)}">
      <path d="M4 4H96V91L50 117L4 91Z" fill="#fff" stroke="#171717" stroke-width="4"/>
      <path d="M9 9H91V87L50 110L9 87Z" fill="none" stroke="#171717" stroke-width="2"/>
      <rect x="10" y="11" width="80" height="27" fill="#fff" stroke="#171717" stroke-width="2"/>
      <text x="50" y="25" fill="#171717" font-size="13">${country.name}</text>
      <rect x="10" y="39" width="20" height="27" fill="#fff" stroke="#171717" stroke-width="2"/>
      <text x="20" y="53" fill="#171717" font-size="13">${escapeHtml(parsed.network)}</text>
      ${internationalFlagMarkup(parsed.countryCode)}
      <text x="50" y="87" fill="#171717" font-size="36">${escapeHtml(parsed.number)}</text>
    </svg>`;
  }
  const { prefix, number, federal } = parsed;
  if (federal) {
    return `<svg class="road-emblem-svg ${size}" viewBox="0 0 100 110" role="img" aria-label="${escapeHtml(`${prefix}-${number}`)}">
      <path d="M2 2H98V87L50 108L2 87Z" fill="#078807"/>
      <path d="M6 6H94V83L50 102L6 83Z" fill="none" stroke="#fff" stroke-width="3"/>
      <text x="50" y="34" fill="#fff" font-size="30">${prefix}</text>
      <text x="50" y="72" fill="#fff" font-size="43">${number}</text>
    </svg>`;
  }
  return `<svg class="road-emblem-svg ${size}" viewBox="0 0 100 110" role="img" aria-label="${escapeHtml(`${prefix}-${number}`)}">
    <path d="M50 2L98 24L82 108H18L2 24Z" fill="#fff" stroke="#111" stroke-width="1.5"/>
    <path d="M50 7L92 27L78 102H22L8 27Z" fill="none" stroke="#111" stroke-width="4.5"/>
    <text x="50" y="42" fill="#111" font-size="27">${prefix}</text>
    <text x="50" y="78" fill="#111" font-size="38">${number}</text>
  </svg>`;
}

function roadMapIcon(label) {
  return L.divIcon({
    className: "",
    html: `<div class="road-map-shield-wrap" data-road="${escapeHtml(label)}">${roadShieldMarkup(label, "map")}</div>`,
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
  if (!trip.roadSegments || typeof trip.roadSegments !== "object") trip.roadSegments = {};
  if (!trip.color) trip.color = DEFAULT_ROUTE_COLOR;
  if (!Array.isArray(trip.flightAirports)) trip.flightAirports = [];
  if (!trip.createdAt) trip.createdAt = new Date().toISOString();
  if (!trip.conquests || typeof trip.conquests !== "object") trip.conquests = {};
  if (!Array.isArray(trip.conquests.cities)) trip.conquests.cities = cityConquestsForTrip(trip);
  if (!Array.isArray(trip.conquests.roads)) trip.conquests.roads = [];
  const roadCountry = tripRoadCountry(trip);
  trip.conquests.roads = trip.conquests.roads.map(road => internationalRoadRef(road, roadCountry) || cleanRoadRef(road));

  // Migração v0.6.5: as conquistas de rodovias passam a usar exatamente
  // as placas principais exibidas sobre a rota. Isso remove referências
  // secundárias do OSM que podiam criar BRs indevidas em viagens antigas.
  if (trip.roadLabels.length) {
    const uniqueRoads = [];
    const seen = new Set();
    for (const badge of trip.roadLabels) {
      const rawLabel = typeof badge === "string" ? badge : badge?.label;
      const label = internationalRoadRef(rawLabel, roadCountry) || cleanRoadRef(rawLabel);
      if (badge && typeof badge === "object") badge.label = label;
      if (!label || !isHighwayRef(label)) continue;
      const key = normalizeKey(label);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRoads.push(label);
      }
    }
    for (const road of trip.conquests.roads) {
      const key = normalizeKey(road);
      if (road && !seen.has(key)) { seen.add(key); uniqueRoads.push(road); }
    }
    trip.conquests.roads = uniqueRoads;
  }
  trip.conquests.cities = cityConquestsForTrip(trip);
  return trip;
}

function roadDisplayLabel(label) {
  const parsed = parseRoadCode(label);
  if (!parsed?.international) return label;
  return `${parsed.network} ${parsed.number} · ${INTERNATIONAL_ROADS[parsed.countryCode].name}`;
}

function loadTrips() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  } catch (error) {
    console.error("Falha ao salvar viagens", error);
    alert("O navegador ficou sem espaço para salvar a rota. Exporte um backup antes de continuar.");
    return false;
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
        country: place.country || "",
        countryCode: place.countryCode || "",
        lat: Number.isFinite(Number(place.lat)) ? Number(place.lat) : undefined,
        lng: Number.isFinite(Number(place.lng)) ? Number(place.lng) : undefined
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
  if (/^INT:[A-Z]{2}:[A-Z]{1,3}:\d{1,4}[A-Z]?$/i.test(cleaned)) return true;
  return /^(BR|SP|PR|SC|RS|MG|GO|MT|MS|BA|RJ|ES|PE|CE|PB|RN|SE|AL|TO|MA|PI|PA|AM|RO|RR|AC|AP|DF)-\d{1,4}$/i.test(cleaned)
    || /\b(ruta|route|rodovia|estrada)\s*[\w-]*\d+/i.test(cleaned);
}

function internationalRoadRef(raw, countryCode) {
  const country = INTERNATIONAL_ROADS[countryCode];
  if (!country) return "";
  const value = String(raw || "").trim();
  const match = value.match(/\b(?:ruta(?:\s+nacional)?|route|rodovia|estrada|RN|RUTA\s*NACIONAL)\s*[- ]?\s*(\d{1,4}[A-Z]?)\b/i);
  if (!match) return "";
  const explicitNetwork = value.match(/\bRN\b/i) ? "RN" : country.network;
  return `INT:${countryCode}:${explicitNetwork}:${match[1].toUpperCase()}`;
}

function roadRefsFromStep(step, countryCode = "") {
  const refs = [];
  const add = raw => {
    for (const token of String(raw || "").split(/[;,/]/)) {
      const foreign = internationalRoadRef(token, countryCode);
      if (foreign && !refs.includes(foreign)) {
        refs.push(foreign);
        continue;
      }
      const cleaned = cleanRoadRef(token);
      if (cleaned && isHighwayRef(cleaned) && !refs.includes(cleaned)) refs.push(cleaned);
    }
  };
  add(step?.ref);
  add(step?.nat_ref);
  add(step?.official_ref);
  const name = String(step?.name || "");
  const br = name.match(/\b(?:BR|SP|PR|SC|RS|MG|GO|MT|MS|BA|RJ|ES|PE|CE|PB|RN|SE|AL|TO|MA|PI|PA|AM|RO|RR|AC|AP|DF)\s*-?\s*\d{1,4}\b/gi) || [];
  br.forEach(add);
  const ruta = name.match(/\b(?:Ruta(?:\s+Nacional)?|Route|Rodovia|Estrada|RN)\s*[A-Za-z-]*\s*\d+[A-Za-z-]*/gi) || [];
  ruta.forEach(add);
  const simpleName = normalizeSimple(name);
  for (const [pattern, ref] of OFFICIAL_ROAD_NAME_REFS) if (pattern.test(simpleName)) add(ref);
  return refs;
}

function extractRoadLabelsFromRoute(route, trip = null) {
  const groups = [];
  const countryCode = tripRoadCountry(trip);
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
      const refs = roadRefsFromStep(step, countryCode);
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

function extractRoadSegmentsFromRoute(route, trip = null) {
  const result = {};
  const countryCode = tripRoadCountry(trip);
  for (const leg of route?.legs || []) {
    for (const step of leg.steps || []) {
      const coords = (step?.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);
      if (coords.length < 2) continue;
      for (const label of roadRefsFromStep(step, countryCode)) {
        if (!result[label]) result[label] = [];
        const previous = result[label].at(-1);
        if (previous && haversineKm({ lat: previous.at(-1)[0], lng: previous.at(-1)[1] }, { lat: coords[0][0], lng: coords[0][1] }) < .15) previous.push(...coords.slice(1));
        else result[label].push(coords);
      }
    }
  }
  return result;
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

function extractHighwaysFromRoute(route, trip = null) {
  // A conquista usa a mesma referência PRINCIPAL que gera as placas do mapa.
  // Alguns trechos do OpenStreetMap possuem várias refs secundárias no mesmo
  // caminho; usar todas elas criava rodovias que a viagem não percorreu.
  const roads = new Map();
  for (const badge of extractRoadLabelsFromRoute(route, trip)) {
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
      if (key && !cities.has(key)) {
        const source = [trip.startPlace, ...(trip.stopPlaces || []), trip.endPlace].find(place => {
          const placeLabel = place?.label || [place?.city, place?.region, place?.country].filter(Boolean).join(", ");
          return normalizeKey(placeLabel) === key || (city.city && normalizeKey(place?.city) === normalizeKey(city.city));
        });
        cities.set(key, {
          ...city,
          label,
          lat: Number.isFinite(Number(city.lat)) ? Number(city.lat) : Number(source?.lat),
          lng: Number.isFinite(Number(city.lng)) ? Number(city.lng) : Number(source?.lng),
          tripName: trip.name,
          date: trip.date
        });
      }
    }
    for (const road of trip.conquests.roads || []) {
      const key = normalizeKey(road);
      if (key && !roads.has(key)) roads.set(key, { label: road, countryCode: roadCountryForAchievement(road, trip) });
    }
  }
  return { cities, roads };
}

function roadCountryForAchievement(label, trip) {
  const parsed = parseRoadCode(label);
  if (parsed?.international) return parsed.countryCode;
  return "BR";
}

function focusCityAchievement(city) {
  const lat = Number(city.lat), lng = Number(city.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    alert("Não foi possível localizar esta cidade nos dados salvos da viagem.");
    return;
  }
  closeFullHighway();
  closeTripRoadHighlight();
  if (window.matchMedia("(max-width: 820px)").matches) document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "center" });
  map.flyTo([lat, lng], 12, { duration: .8 });
  if (state.cityHighlight) map.removeLayer(state.cityHighlight);
  clearTimeout(state.cityHighlightTimer);
  state.cityHighlight = L.circleMarker([lat, lng], {
    radius: 12, color: "#a46f18", weight: 4, fillColor: "#fff4cf", fillOpacity: .8
  }).addTo(map).bindTooltip(city.label, { direction: "top" }).openTooltip();
  state.cityHighlightTimer = setTimeout(() => {
    if (state.cityHighlight) map.removeLayer(state.cityHighlight);
    state.cityHighlight = null;
  }, 4500);
}

function overpassRoadDescriptor(item) {
  const parsed = parseRoadCode(item.label);
  if (parsed?.international) {
    const n = parsed.number;
    return {
      countryCode: parsed.countryCode, network: parsed.network, number: n,
      ref: `${parsed.network} ${n}`,
      alternatives: [n, `${parsed.network}-${n}`, `${parsed.network}${n}`, `Ruta ${n}`, `Ruta Nacional ${n}`, `RN ${n}`]
    };
  }
  const ref = cleanRoadRef(item.label);
  const local = parseRoadCode(ref);
  return {
    countryCode: "BR", network: local?.prefix || "BR", number: local?.number || "",
    stateCode: local && !local.federal ? local.prefix : "", ref,
    alternatives: [ref.replace("-", " "), ref.replace("-", "")]
  };
}

function escapeOverpassRegex(value) {
  return String(value).replace(/[\\.^$|?*+()[{]/g, "\\$&");
}

function overpassArea(descriptor) {
  if (descriptor.stateCode) return `area["ISO3166-2"="BR-${descriptor.stateCode}"][admin_level=4]->.searchArea;`;
  return `area["ISO3166-1"="${descriptor.countryCode || "BR"}"][admin_level=2]->.searchArea;`;
}

function overpassRoadQuery(descriptor, kind) {
  const refs = [...new Set([descriptor.ref, ...(descriptor.alternatives || [])].filter(Boolean))];
  const pattern = refs.map(escapeOverpassRegex).join("|");
  const tags = ["ref", "nat_ref", "official_ref"];
  const selectors = tags.map(tag => `["${tag}"~"(^|;[ ]*)(${pattern})([ ]*;|$)",i]`);
  const area = overpassArea(descriptor);
  if (kind === "primary") {
    const network = descriptor.network ? `["network"~"${escapeOverpassRegex(descriptor.network)}",i]` : "";
    return `[out:json][timeout:45];${area}relation(area.searchArea)["type"="route"]["route"="road"]${network}["ref"~"^(${pattern})$",i];out body geom;`;
  }
  if (kind === "relations") {
    return `[out:json][timeout:55];${area}(${selectors.map(tag => `relation(area.searchArea)["type"="route"]["route"="road"]${tag};`).join("")});out body geom;`;
  }
  return `[out:json][timeout:55];${area}(${selectors.map(tag => `way(area.searchArea)["highway"]${tag};`).join("")});out geom;`;
}

async function requestOverpass(query, signal) {
  let lastError;
  const start = Math.floor(Math.random() * OVERPASS_ENDPOINTS.length);
  for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[(start + attempt) % OVERPASS_ENDPOINTS.length];
    try {
      const timeoutController = new AbortController();
      const timeout = setTimeout(() => timeoutController.abort(), 50000);
      const relayAbort = () => timeoutController.abort();
      signal?.addEventListener("abort", relayAbort, { once: true });
      try {
        const response = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: `data=${encodeURIComponent(query)}`, signal: timeoutController.signal
        });
        if (!response.ok) {
          const retryable = [429, 502, 503, 504].includes(response.status);
          throw new Error(`Overpass ${response.status}${retryable ? " (temporário)" : ""}`);
        }
        return await response.json();
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", relayAbort);
      }
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
      lastError = error;
    }
  }
  throw lastError || new Error("Serviços Overpass indisponíveis");
}

function linesFromOverpass(data) {
  const lines = [], seen = new Set();
  const addGeometry = geometry => {
    const line = (geometry || []).map(point => [Number(point.lat), Number(point.lon)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (line.length < 2) return;
    const key = `${line[0].map(n => n.toFixed(5))}:${line.at(-1).map(n => n.toFixed(5))}:${line.length}`;
    if (!seen.has(key)) { seen.add(key); lines.push(line); }
  };
  for (const element of data?.elements || []) {
    addGeometry(element.geometry);
    if (element.type === "relation") for (const member of element.members || []) addGeometry(member.geometry);
  }
  return lines;
}

function highwayCacheKey(descriptor) {
  return `${descriptor.countryCode || "XX"}|${descriptor.network || "XX"}|${descriptor.number || normalizeKey(descriptor.ref)}`.toUpperCase();
}

function openHighwayDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB indisponível"));
    const request = indexedDB.open(HIGHWAY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HIGHWAY_GEOMETRY_STORE)) db.createObjectStore(HIGHWAY_GEOMETRY_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(HIGHWAY_PROGRESS_STORE)) db.createObjectStore(HIGHWAY_PROGRESS_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function highwayDbGet(store, key) {
  const db = await openHighwayDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).get(key);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function highwayDbPut(store, value) {
  const db = await openHighwayDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function lineLengthKm(line) {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversineKm({ lat: line[i - 1][0], lng: line[i - 1][1] }, { lat: line[i][0], lng: line[i][1] });
  return total;
}

function geometryMetadata(lines) {
  const flat = lines.flat();
  const lats = flat.map(p => p[0]), lngs = flat.map(p => p[1]);
  return {
    bounds: flat.length ? [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]] : null,
    totalKm: lines.reduce((sum, line) => sum + lineLengthKm(line), 0)
  };
}

async function cachedHighway(descriptor, allowExpired = false) {
  try {
    const entry = await highwayDbGet(HIGHWAY_GEOMETRY_STORE, highwayCacheKey(descriptor));
    if (entry?.version === HIGHWAY_CACHE_VERSION && (allowExpired || Date.now() - entry.updatedAt < HIGHWAY_CACHE_TTL)) return entry;
  } catch (error) { console.warn("Cache de rodovias indisponível", error); }
  return null;
}

async function cacheHighway(descriptor, lines, partial = false) {
  const meta = geometryMetadata(lines);
  const entry = { key: highwayCacheKey(descriptor), version: HIGHWAY_CACHE_VERSION, updatedAt: Date.now(), ttl: HIGHWAY_CACHE_TTL, lines, partial, ...meta };
  await highwayDbPut(HIGHWAY_GEOMETRY_STORE, entry);
  return entry;
}

async function fetchFullHighway(descriptor, signal, onStatus = () => {}) {
  let lines = [];
  onStatus("Buscando relação principal…");
  try { lines.push(...linesFromOverpass(await requestOverpass(overpassRoadQuery(descriptor, "primary"), signal))); } catch (error) { if (signal?.aborted) throw error; }
  onStatus("Buscando relações parciais…");
  try { lines.push(...linesFromOverpass(await requestOverpass(overpassRoadQuery(descriptor, "relations"), signal))); } catch (error) { if (signal?.aborted) throw error; }
  lines = linesFromOverpass({ elements: lines.map(line => ({ geometry: line.map(([lat, lon]) => ({ lat, lon })) })) });
  let partial = false;
  if (!lines.length) {
    onStatus("Buscando trechos por referência…");
    lines = linesFromOverpass(await requestOverpass(overpassRoadQuery(descriptor, "ways"), signal));
    partial = true;
  }
  if (!lines.length) throw new Error("Não foi possível localizar a rodovia completa no OpenStreetMap");
  onStatus("Processando geometria…");
  return cacheHighway(descriptor, lines, partial);
}

function pointSegmentDistanceKm(point, a, b) {
  const latScale = 111.32, lngScale = Math.cos(point[0] * Math.PI / 180) * 111.32;
  const px = point[1] * lngScale, py = point[0] * latScale;
  const ax = a[1] * lngScale, ay = a[0] * latScale, bx = b[1] * lngScale, by = b[0] * latScale;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function matchingRoadSegments(lines, tripLines) {
  const traveled = [];
  let traveledKm = 0;
  const tripEdges = [];
  for (const route of tripLines) for (let i = 1; i < route.length; i++) tripEdges.push([route[i - 1], route[i]]);
  for (const line of lines) {
    let run = [], runKm = 0;
    const flush = () => {
      if (runKm >= ROAD_MATCH_MIN_KM && run.length > 1) { traveled.push(run); traveledKm += runKm; }
      run = []; runKm = 0;
    };
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const close = tripEdges.some(([x, y]) => pointSegmentDistanceKm(a, x, y) <= ROAD_MATCH_TOLERANCE_KM && pointSegmentDistanceKm(b, x, y) <= ROAD_MATCH_TOLERANCE_KM && pointSegmentDistanceKm(mid, x, y) <= ROAD_MATCH_TOLERANCE_KM);
      if (close) { if (!run.length) run.push(a); run.push(b); runKm += lineLengthKm([a, b]); } else flush();
    }
    flush();
  }
  return { segments: traveled, traveledKm };
}

function progressSignature(entry) {
  return `${entry.updatedAt}|${state.trips.map(t => `${t.id}:${t.updatedAt || t.createdAt || t.date || ""}`).sort().join("|")}`;
}

async function highwayProgress(descriptor, entry) {
  const key = highwayCacheKey(descriptor), signature = progressSignature(entry);
  const cached = await highwayDbGet(HIGHWAY_PROGRESS_STORE, key).catch(() => null);
  if (cached?.version === HIGHWAY_CACHE_VERSION && cached.signature === signature) return cached;
  const tripLines = state.trips.filter(t => ["carro", "moto"].includes(t.mode)).map(tripLatLngs).filter(line => line.length > 1);
  const matched = matchingRoadSegments(entry.lines, tripLines);
  const traveledKm = Math.min(entry.totalKm, matched.traveledKm);
  const result = { key, version: HIGHWAY_CACHE_VERSION, signature, totalKm: entry.totalKm, traveledKm, percent: entry.totalKm ? Math.min(100, traveledKm / entry.totalKm * 100) : 0, segments: matched.segments, updatedAt: Date.now() };
  await highwayDbPut(HIGHWAY_PROGRESS_STORE, result).catch(() => {});
  return result;
}

function setTripsSecondary(secondary) {
  state.tripLineLayers.forEach(line => line.setStyle({ opacity: secondary ? .22 : .9 }));
}

function fitHighwayBounds() {
  if (state.highwayBounds?.isValid()) map.fitBounds(state.highwayBounds, { padding: [28, 28], maxZoom: 10 });
}

async function drawFullHighway(entry, item, descriptor) {
  const palette = window.MinhasViagensIconicRoutes?.roadPalette?.(item.label, item.medal) ||
    { base: "#c77b00", progress: "#168447", banner: "#d09a2a" };
  const group = L.featureGroup();
  for (const line of entry.lines) {
    L.polyline(line, { pane: "fullHighwayOutline", color: "#fff", weight: 9, opacity: .9, interactive: false, smoothFactor: 1.5 }).addTo(group);
    L.polyline(line, { pane: "fullHighwayMain", color: palette.base, weight: 5, opacity: .9, interactive: false, smoothFactor: 1.5 }).addTo(group);
  }
  state.highwayLayer = group.addTo(map);
  state.highwayBounds = group.getBounds();
  setTripsSecondary(true);
  fitHighwayBounds();
  els.highwayBannerTitle.textContent = roadDisplayLabel(item.label);
  els.highwayBanner.style.borderColor = palette.banner;
  els.highwayBannerStatus.textContent = entry.partial ? "Geometria parcial encontrada" : "Rodovia carregada";
  const progress = await highwayProgress(descriptor, entry);
  if (state.highwayKey !== highwayCacheKey(descriptor)) return;
  state.highwayProgressLayer = L.featureGroup(progress.segments.map(line => L.polyline(line, { pane: "fullHighwayMain", color: palette.progress, weight: 7, opacity: 1, interactive: false, smoothFactor: 1.2 }))).addTo(map);
  els.highwayProgress.classList.remove("hidden");
  els.highwayProgressPercent.textContent = `${Math.round(progress.percent)}% concluída`;
  els.highwayProgressDistance.textContent = `${progress.traveledKm.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km de ${progress.totalKm.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km percorridos`;
  els.highwayProgressBar.style.width = `${progress.percent}%`;
  els.highwayProgressBar.style.background = palette.progress;
  els.highwayProgressBar.parentElement.setAttribute("aria-valuenow", String(Math.round(progress.percent)));
}

function closeFullHighway(restoreFocus = false) {
  state.highwaySelection += 1;
  state.highwayRequest?.abort(); state.highwayRequest = null; state.highwayKey = ""; state.highwayBounds = null;
  if (state.highwayLayer) map.removeLayer(state.highwayLayer);
  if (state.highwayProgressLayer) map.removeLayer(state.highwayProgressLayer);
  state.highwayLayer = null; state.highwayProgressLayer = null;
  setTripsSecondary(false);
  els.highwayBanner.classList.add("hidden"); els.highwayBanner.classList.remove("is-error"); els.highwayProgress.classList.add("hidden");
  if (restoreFocus) {
    const visiblePoints = state.trips.filter(trip => trip.visible !== false).flatMap(tripLatLngs);
    if (visiblePoints.length) map.fitBounds(L.latLngBounds(visiblePoints).pad(.12), { maxZoom: 14 });
    else map.setView([-14.235, -51.9253], 4);
  }
}

async function showFullHighway(item) {
  const descriptor = overpassRoadDescriptor(item), requestedKey = highwayCacheKey(descriptor);
  if (state.highwayKey === requestedKey && state.highwayLayer) { fitHighwayBounds(); return; }
  if (state.highwayKey === requestedKey && state.highwayRequest) return;
  closeTripRoadHighlight(); closeFullHighway();
  const selection = state.highwaySelection, controller = new AbortController();
  state.highwayRequest = controller; state.highwayKey = requestedKey;
  els.highwayBanner.classList.remove("hidden", "is-error"); els.highwayProgress.classList.add("hidden");
  els.highwayBannerTitle.textContent = roadDisplayLabel(item.label);
  try {
    let entry = await cachedHighway(descriptor);
    if (!entry) entry = await fetchFullHighway(descriptor, controller.signal, status => { if (selection === state.highwaySelection) els.highwayBannerStatus.textContent = status; });
    if (selection !== state.highwaySelection || controller.signal.aborted) return;
    await drawFullHighway(entry, item, descriptor);
  } catch (error) {
    if (error.name === "AbortError" || selection !== state.highwaySelection) return;
    els.highwayBanner.classList.add("is-error");
    els.highwayBannerStatus.textContent = "Não foi possível localizar a rodovia completa no OpenStreetMap";
  } finally { if (state.highwayRequest === controller) state.highwayRequest = null; }
}

function closeTripRoadHighlight() {
  if (state.tripRoadLayer) map.removeLayer(state.tripRoadLayer);
  state.tripRoadLayer = null;
  state.tripRoadKey = "";
  els.tripDetailContent?.querySelectorAll(".detail-road-list .active").forEach(button => button.classList.remove("active"));
  if (!state.highwayLayer) setTripsSecondary(false);
}

async function showTripRoadSegment(trip, label, button) {
  const key = `${trip.id}|${normalizeKey(label)}`;
  if (state.tripRoadKey === key && state.tripRoadLayer) {
    const bounds = state.tripRoadLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(.15), { maxZoom: 15 });
    return;
  }
  closeFullHighway();
  closeTripRoadHighlight();
  let segments = trip.roadSegments?.[label] || [];
  if (!segments.length) {
    const descriptor = overpassRoadDescriptor({ label, countryCode: roadCountryForAchievement(label, trip) });
    const entry = await cachedHighway(descriptor, true);
    if (entry) {
      segments = matchingRoadSegments(entry.lines, [tripLatLngs(trip)]).segments;
      if (segments.length) { trip.roadSegments[label] = segments; saveTrips(); }
    }
  }
  if (!segments.length) {
    alert("O trecho desta rodovia ainda não pôde ser reconstruído para esta viagem antiga.");
    return;
  }
  state.tripRoadLayer = L.featureGroup(segments.map(line => L.polyline(line, { pane: "fullHighwayMain", color: "#ef8d00", weight: 8, opacity: 1, interactive: false }))).addTo(map);
  state.tripRoadKey = key;
  setTripsSecondary(true);
  button?.classList.add("active");
  const bounds = state.tripRoadLayer.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds.pad(.15), { maxZoom: 15 });
}

function queueRoadsForPreload(roads) {
  const snapshot = getAchievementSnapshot();
  for (const road of roads || []) {
    const item = snapshot.roads.get(normalizeKey(road)) || { label: road, countryCode: "BR" };
    const key = highwayCacheKey(overpassRoadDescriptor(item));
    if (!state.highwayQueueKeys.has(key)) { state.highwayQueueKeys.add(key); state.highwayQueue.push(item); }
  }
  scheduleHighwayQueue();
}

function scheduleHighwayQueue() {
  if (state.highwayQueueRunning || !state.highwayQueue.length) return;
  const run = () => processHighwayQueue();
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 100);
}

async function reviewTripsAgainstHighway(item, descriptor, entry) {
  let changed = false;
  for (const trip of state.trips) {
    if (!["carro", "moto"].includes(trip.mode) || tripLatLngs(trip).length < 2) continue;
    const matched = matchingRoadSegments(entry.lines, [tripLatLngs(trip)]);
    if (matched.traveledKm < ROAD_MATCH_MIN_KM) continue;
    let tripChanged = false;
    const existing = (trip.conquests.roads || []).some(road => normalizeKey(road) === normalizeKey(item.label));
    if (!existing) { trip.conquests.roads.push(item.label); tripChanged = true; }
    if (!trip.roadSegments[item.label]?.length) { trip.roadSegments[item.label] = matched.segments; tripChanged = true; }
    if (tripChanged) { trip.updatedAt = new Date().toISOString(); changed = true; }
  }
  if (changed) { saveTrips(); renderTrips(); }
}

async function processHighwayQueue() {
  if (state.highwayQueueRunning) return;
  state.highwayQueueRunning = true;
  while (state.highwayQueue.length) {
    const item = state.highwayQueue.shift();
    const descriptor = overpassRoadDescriptor(item), key = highwayCacheKey(descriptor);
    try {
      let entry = await cachedHighway(descriptor);
      if (!entry) entry = await fetchFullHighway(descriptor, null);
      await reviewTripsAgainstHighway(item, descriptor, entry);
    } catch (error) { console.warn(`Pré-carregamento de ${item.label} adiado`, error); }
    finally { state.highwayQueueKeys.delete(key); }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  state.highwayQueueRunning = false;
}

function setTripConquests(trip, route = null) {
  trip.conquests = {
    cities: cityConquestsForTrip(trip),
    roads: trip.mode === "aviao" ? [] : (route ? extractHighwaysFromRoute(route, trip) : (trip.conquests?.roads || []))
  };
  if (route) trip.roadSegments = extractRoadSegmentsFromRoute(route, trip);
  trip.updatedAt = new Date().toISOString();
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
      const cityGroup = type === "city" ? window.MinhasViagensAchievements?.groupForCity(item) : null;
      const citySuffix = cityGroup && !cityGroup.unknown ? ` — ${cityGroup.code || cityGroup.uf}` : "";
      const visibleLabel = type === "city" ? `${item.city || item.label}${citySuffix}` : roadDisplayLabel(item.label);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `achievement-card${type === "road" ? " road-achievement-card" : ""}`;
      if (type === "road") card.dataset.road = item.label;
      card.setAttribute("aria-label", type === "city" ? `Focar ${item.label} no mapa` : `Mostrar a rodovia ${roadDisplayLabel(item.label)} inteira`);
      card.innerHTML = `
        <span class="achievement-icon">${type === "city" ? "●" : roadShieldMarkup(item.label, "achievement")}</span>
        <div>
          <strong>${escapeHtml(visibleLabel)}</strong>
          <small>${type === "road" ? "Rodovia conquistada" : `${escapeHtml(item.tripName || "Viagem")}${item.date ? ` · ${formatDate(item.date)}` : ""}`}</small>
        </div>`;
      card.addEventListener("click", () => {
        if (type === "city") {
          focusCityAchievement(item);
          return;
        }
        const medal = card.dataset.roadMedal ||
          (card.classList.contains("road-medal-gold") ? "gold" : card.classList.contains("road-medal-silver") ? "silver" : "");
        showFullHighway({ ...item, medal });
      });
      container.appendChild(card);
      if (type === "city") window.MinhasViagensCityFlags?.decorate(card.querySelector(".achievement-icon"), item);
    });
  };

  const cityGroups = window.MinhasViagensAchievements?.groupCities(cityItems) || [{ key: "ALL", uf: "BR", name: "Cidades", cities: cityItems }];
  const selectedGroup = cityGroups.find(group => group.key === state.achievementStateKey);
  if (state.achievementStateKey && !selectedGroup) state.achievementStateKey = null;

  els.cityAchievementHeader.innerHTML = "";
  if (selectedGroup) {
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "achievement-back-btn";
    backButton.textContent = "← Voltar aos estados e países";
    backButton.addEventListener("click", () => {
      state.achievementStateKey = null;
      renderAchievements();
    });
    els.cityAchievementHeader.appendChild(backButton);
    const title = document.createElement("div");
    title.className = "achievement-browser-title";
    title.innerHTML = `<h2>${escapeHtml(selectedGroup.name)}</h2><span>${selectedGroup.cities.length} ${selectedGroup.cities.length === 1 ? "cidade" : "cidades"}</span>`;
    els.cityAchievementHeader.appendChild(title);
    els.cityAchievementList.classList.remove("state-achievement-grid");
    renderList(els.cityAchievementList, selectedGroup.cities, "city");
  } else {
    els.cityAchievementHeader.innerHTML = '<div class="achievement-browser-title"><h2>Estados e países conquistados</h2></div>';
    els.cityAchievementList.innerHTML = "";
    els.cityAchievementList.classList.add("state-achievement-grid");
    if (!cityGroups.length) {
      els.cityAchievementList.classList.remove("state-achievement-grid");
      els.cityAchievementList.innerHTML = '<p class="empty">Nenhuma cidade conquistada ainda.</p>';
    } else {
      cityGroups.forEach(group => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "state-achievement-card";
        card.setAttribute("aria-label", `Abrir cidades conquistadas em ${group.name}`);
        const flagMarkup = group.flagUrl
          ? `<img src="${escapeHtml(group.flagUrl)}" alt="Bandeira de ${escapeHtml(group.name)}" loading="lazy"><span class="state-achievement-icon-fallback hidden">${escapeHtml(group.code || group.uf)}</span>`
          : `<span class="state-achievement-icon-fallback">${escapeHtml(group.code || group.uf)}</span>`;
        card.innerHTML = `
          <span class="state-achievement-icon">${flagMarkup}</span>
          <strong>${escapeHtml(group.name)}</strong>
          <small>${group.cities.length} ${group.cities.length === 1 ? "cidade" : "cidades"}</small>`;
        const flag = card.querySelector(".state-achievement-icon img");
        flag?.addEventListener("error", () => {
          flag.classList.add("hidden");
          card.querySelector(".state-achievement-icon-fallback")?.classList.remove("hidden");
        });
        card.addEventListener("click", () => {
          state.achievementStateKey = group.key;
          renderAchievements();
        });
        els.cityAchievementList.appendChild(card);
      });
    }
  }
  renderList(els.roadAchievementList, roadItems, "road");

  const citiesActive = state.achievementView === "cities";
  const roadsActive = state.achievementView === "roads";
  const iconicActive = state.achievementView === "iconic";
  els.cityAchievementsTabBtn.classList.toggle("active", citiesActive);
  els.roadAchievementsTabBtn.classList.toggle("active", roadsActive);
  els.iconicAchievementsTabBtn?.classList.toggle("active", iconicActive);
  els.cityAchievementsTabBtn.setAttribute("aria-selected", String(citiesActive));
  els.roadAchievementsTabBtn.setAttribute("aria-selected", String(roadsActive));
  els.iconicAchievementsTabBtn?.setAttribute("aria-selected", String(iconicActive));
  els.cityAchievementsView.classList.toggle("hidden", !citiesActive);
  els.roadAchievementsView.classList.toggle("hidden", !roadsActive);
  els.iconicAchievementsView?.classList.toggle("hidden", !iconicActive);
  window.MinhasViagensIconicRoutes?.renderAchievements?.();
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
  window.MinhasViagensSync?.recordDeletion(trip.id);
  state.trips = state.trips.filter(t => t.id !== trip.id);
  if (state.tripRoadKey.startsWith(`${trip.id}|`)) closeTripRoadHighlight();
  saveTrips();
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
        ? `<div class="detail-road-list">${roads.map(road => `<button type="button" data-road="${escapeHtml(road)}" title="Destacar ${escapeHtml(roadDisplayLabel(road))} nesta viagem" aria-label="Destacar ${escapeHtml(roadDisplayLabel(road))} nesta viagem">${roadShieldMarkup(road, "achievement")}</button>`).join("")}</div>`
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
  els.tripDetailContent.querySelectorAll(".detail-road-list [data-road]").forEach(button => button.addEventListener("click", () => showTripRoadSegment(trip, button.dataset.road, button)));
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
      const routeIsInteractive = !hasFocusedTrip || isFocused;
      const hitLine = L.polyline(latlngs, ROUTE_INTERACTION.hitLineOptions("trip-route-hit", 24, routeIsInteractive));
      const line = L.polyline(latlngs, {
        color: routeColor,
        weight: hasFocusedTrip ? (isFocused ? 7 : 3) : 5,
        opacity: hasFocusedTrip ? (isFocused ? .98 : .22) : .9,
        dashArray: trip.mode === "aviao" ? "12 10" : null,
        interactive: routeIsInteractive
      });
      line._routeHitLine = hitLine;
      line.bindPopup(`
        <div class="popup-title">${escapeHtml(trip.name || "Viagem")}</div>
        <div class="popup-meta">${formatDate(trip.date)} · ${modeLabel(trip.mode)}</div>
        <div class="popup-detail"><b>Partida:</b> ${escapeHtml(startAddress)}</div>
        <div class="popup-detail"><b>Chegada:</b> ${escapeHtml(endAddress)}</div>
        ${Number.isFinite(trip.distance) ? `<div class="popup-detail"><b>Distância:</b> ${formatDistance(trip.distance)}</div>` : ""}
        <div class="popup-detail"><b>Dica:</b> clique na rota para adicionar um ponto com foto ou vídeo.</div>`);
      const handleRouteClick = event => {
        if ((!hasFocusedTrip || isFocused) && !state.drawing && !state.editingTripId && els.routeChooser.classList.contains("hidden")) {
          openRoutePointDialog(trip, event.latlng);
        }
      };
      line.on("click", handleRouteClick);
      hitLine.on("click", handleRouteClick);
      tripLayers.addLayer(hitLine);
      tripLayers.addLayer(line);
      state.tripLineLayers.set(trip.id, line);
      if (isFocused && hasFocusedTrip) {
        hitLine.bringToFront();
        line.bringToFront();
      }

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
  window.MinhasViagensIconicRoutes?.scheduleMapRender?.();
}

function focusTrip(trip) {
  const latlngs = tripLatLngs(trip);
  if (!latlngs.length) return;
  map.fitBounds(L.latLngBounds(latlngs).pad(.15), { maxZoom: 14 });
}

function resetPlaceSelection(kind) {
  state[`${kind}Place`] = null;
  els[`${kind}Selected`].textContent = "Nenhum local selecionado.";
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
          list.innerHTML = '<div class="suggestion-empty">Nenhum resultado encontrado.</div>';
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
        if (!list.children.length) list.innerHTML = '<div class="suggestion-empty">Nenhum resultado encontrado.</div>';
        list.classList.remove("hidden");
      } catch (error) {
        if (error.name !== "AbortError") {
          list.innerHTML = '<div class="suggestion-empty">Não foi possível consultar os locais agora.</div>';
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
      <small class="selected-place stop-selected">${existingPlace ? `✓ ${escapeHtml(existingPlace.label || existingPlace.city || "Parada")}` : "Nenhum local selecionado."}</small>
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
    selected.textContent = "Nenhum local selecionado.";
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
          list.innerHTML = '<div class="suggestion-empty">Nenhum resultado encontrado.</div>';
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
        if (!list.children.length) list.innerHTML = '<div class="suggestion-empty">Nenhum resultado encontrado.</div>';
        list.classList.remove("hidden");
      } catch (error) {
        if (error.name !== "AbortError") {
          list.innerHTML = '<div class="suggestion-empty">Não foi possível consultar os locais agora.</div>';
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
    selected.textContent = "Nenhum local selecionado.";
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
          list.innerHTML = '<div class="suggestion-empty">Nenhum resultado encontrado.</div>';
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
        if (!list.children.length) list.innerHTML = '<div class="suggestion-empty">Nenhum resultado encontrado.</div>';
        list.classList.remove("hidden");
      } catch (error) {
        if (error.name !== "AbortError") {
          list.innerHTML = '<div class="suggestion-empty">Não foi possível consultar os locais agora.</div>';
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
      <small class="selected-place stop-selected">${existingPlace ? `✓ ${escapeHtml(existingPlace.label || existingPlace.city || "Parada")}` : "Nenhum local selecionado."}</small>
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
    selected.textContent = "Nenhum local selecionado.";
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
          list.innerHTML = '<div class="suggestion-empty">Nenhum resultado encontrado.</div>';
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
        if (!list.children.length) list.innerHTML = '<div class="suggestion-empty">Nenhum resultado encontrado.</div>';
        list.classList.remove("hidden");
      } catch (error) {
        if (error.name !== "AbortError") {
          list.innerHTML = '<div class="suggestion-empty">Não foi possível consultar os locais agora.</div>';
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
  els.editStartSelected.textContent = state.editStartPlace ? `✓ ${startLabel}` : "Nenhum local selecionado.";
  els.editEndSelected.textContent = state.editEndPlace ? `✓ ${endLabel}` : "Nenhum local selecionado.";
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
    setEditPlacesMessage("Nesta versão, o recálculo automático após editar locais está disponível para viagens de carro e moto.");
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
    setEditPlacesMessage("Escolha uma cidade ou local válido para a partida.");
    els.editStartAddress.focus();
    return;
  }
  const incompleteStop = state.editStopPlaces.find(item => !item.place);
  if (incompleteStop) {
    setEditPlacesMessage("Selecione uma cidade ou local válido para cada parada, ou remova a parada vazia.");
    els.editStopsContainer.querySelector(`[data-stop-id="${incompleteStop.id}"] .stop-address`)?.focus();
    return;
  }
  if (!state.editEndPlace) {
    setEditPlacesMessage("Escolha uma cidade ou local válido para a chegada.");
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
    console.error("Falha ao recalcular viagem após editar locais", error);
    const reason = error?.message ? ` Motivo: ${error.message}` : "";
    setEditPlacesMessage(`Não foi possível recalcular a rota. Nenhuma alteração foi salva.${reason}`);
  } finally {
    els.saveEditPlacesBtn.textContent = "Salvar e recalcular rota";
    updateEditPlacesButton();
  }
}

function openTripDialog() {
  if (state.drawing || state.editingTripId || !els.routeChooser.classList.contains("hidden")) return;
  closeFullHighway();
  closeTripRoadHighlight();
  window.MinhasViagensIconicRoutes?.clearPreview?.();
  els.tripForm.reset();
  els.tripDate.value = "";
  els.tripColor.value = DEFAULT_ROUTE_COLOR;
  newTripColorWheelController?.setColor(DEFAULT_ROUTE_COLOR);
  els.manualFromDialogBtn.classList.remove("hidden");
  els.suggestRoutesBtn.textContent = "Sugerir rotas";
  state.startPlace = null;
  state.endPlace = null;
  resetStopsForm();
  els.startSelected.textContent = "Nenhum local selecionado.";
  els.endSelected.textContent = "Nenhum local selecionado.";
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
    setFormMessage("Escolha uma cidade ou local na lista de sugestões para a partida.");
    els.startAddress.focus();
    return false;
  }
  const incompleteStop = state.stopPlaces.find(item => !item.place);
  if (incompleteStop) {
    setFormMessage("Selecione uma cidade ou local válido para cada parada, ou remova a parada vazia.");
    els.stopsContainer?.querySelector(`[data-stop-id="${incompleteStop.id}"] .stop-address`)?.focus();
    return false;
  }
  if (!state.endPlace) {
    setFormMessage("Escolha uma cidade ou local na lista de sugestões para a chegada.");
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
  closeFullHighway();
  closeTripRoadHighlight();
  window.MinhasViagensIconicRoutes?.clearPreview?.();
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
    const hitLine = L.polyline(latlngs, ROUTE_INTERACTION.hitLineOptions("route-option-hit", 24)).addTo(previewGroup);
    const line = L.polyline(latlngs, {
      color: selected ? (state.pendingTrip?.color || DEFAULT_ROUTE_COLOR) : "#7a827d",
      weight: selected ? 7 : 4,
      opacity: selected ? .95 : .55
    }).addTo(previewGroup);
    line._routeHitLine = hitLine;
    hitLine.on("click", () => selectRoute(index));
    line.on("click", () => selectRoute(index));
    state.previewLayers[index] = line;
  });

  const selectedLayer = state.previewLayers[state.selectedRouteIndex];
  selectedLayer?._routeHitLine?.bringToFront?.();
  selectedLayer?.bringToFront?.();

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
  trip.roadLabels = extractRoadLabelsFromRoute(route, trip);
  trip.roadSegments = extractRoadSegmentsFromRoute(route, trip);
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
  queueRoadsForPreload(trip.conquests?.roads || []);
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
  queueRoadsForPreload(trip.conquests?.roads || []);
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
    trip.roadLabels = extractRoadLabelsFromRoute(route, trip);
    trip.conquests.roads = extractHighwaysFromRoute(route, trip);
    trip.roadSegments = extractRoadSegmentsFromRoute(route, trip);
    trip.updatedAt = new Date().toISOString();
    saveTrips();
    renderTrips();
    queueRoadsForPreload(trip.conquests.roads);
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
  closeFullHighway();
  closeTripRoadHighlight();
  window.MinhasViagensIconicRoutes?.clearPreview?.();
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
  state.editVisibleLine = L.polyline(latlngs, { color, weight: 6, opacity: .95, interactive: false }).addTo(editGroup);
  state.editHitLine = L.polyline(latlngs, ROUTE_INTERACTION.hitLineOptions("edit-route-hit", 28)).addTo(editGroup);
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

function pointerLatLng(event) {
  const rect = map.getContainer().getBoundingClientRect();
  return map.containerPointToLatLng(L.point(event.clientX - rect.left, event.clientY - rect.top));
}

function routeDistanceFromPointer(trip, latlng) {
  const target = map.latLngToLayerPoint(latlng);
  const routePoints = tripLatLngs(trip).map(point => map.latLngToLayerPoint(point));
  return ROUTE_INTERACTION.nearestPolylineDistance(target, routePoints);
}

function startEditPointer(event) {
  if (state.editPointerId != null || state.editBusy || !state.editingTripId) return;
  if (event.button != null && event.button !== 0) return;
  if (event.target?.closest?.(".leaflet-control, .leaflet-marker-icon, .leaflet-popup")) return;
  const trip = state.trips.find(item => item.id === state.editingTripId);
  if (!trip) return;
  const latlng = pointerLatLng(event);
  if (routeDistanceFromPointer(trip, latlng) > ROUTE_INTERACTION.EDIT_HIT_TOLERANCE_PX) return;
  state.editPointerId = event.pointerId;
  startEditDrag(trip, { latlng, originalEvent: event });
  if (!state.editDragging) {
    state.editPointerId = null;
    return;
  }
  try { map.getContainer().setPointerCapture(event.pointerId); } catch {}
}

function updateEditPointer(event) {
  if (!state.editDragging || state.editPointerId !== event.pointerId) return;
  event.preventDefault();
  updateEditDrag({ latlng: pointerLatLng(event), originalEvent: event });
}

function finishEditPointer(event) {
  if (!state.editDragging || state.editPointerId !== event.pointerId) return;
  event.preventDefault();
  updateEditDrag({ latlng: pointerLatLng(event), originalEvent: event });
  state.editPointerId = null;
  try { map.getContainer().releasePointerCapture(event.pointerId); } catch {}
  finishEditDrag();
}

function cancelEditPointer(event) {
  if (state.editPointerId !== event.pointerId) return;
  state.editPointerId = null;
  state.editDragging = false;
  state.editDragStart = null;
  state.editDragLast = null;
  map.dragging.enable();
  if (state.editGuideLine) editGroup.removeLayer(state.editGuideLine);
  state.editGuideLine = null;
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
    queueRoadsForPreload(trip.conquests?.roads || []);
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
  state.editPointerId = null;
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

function openRoutePointDialog(trip, latlng = null, existingPoint = null) {
  if (state.drawing || state.editingTripId) return;
  const snapped = existingPoint ? L.latLng(existingPoint.lat, existingPoint.lng) : nearestLatLngOnRoute(trip, latlng);
  const pointId = existingPoint?.id || uid();
  state.pointEditor = {
    tripId: trip.id,
    pointId,
    isExisting: Boolean(existingPoint),
    lat: snapped.lat,
    lng: snapped.lng
  };
  els.routePointDialogTitle.textContent = existingPoint ? "Editar ponto" : "Adicionar ponto";
  els.routePointDescription.value = existingPoint?.description || "";
  els.deletePointBtn.classList.toggle("hidden", !existingPoint);
  els.pointFormMessage.classList.add("hidden");
  els.pointFormMessage.textContent = "";
  els.routePointDialog.showModal();
}

function closeRoutePointDialog() {
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

  closeRoutePointDialog();
  renderTrips();
}

async function deleteCurrentPoint() {
  const editor = state.pointEditor;
  if (!editor || !editor.isExisting) return;
  if (!confirm("Excluir este ponto?")) return;
  const trip = state.trips.find(t => t.id === editor.tripId);
  if (!trip) return;
  trip.pointsOfInterest = trip.pointsOfInterest.filter(point => point.id !== editor.pointId);
  saveTrips();
  closeRoutePointDialog();
  renderTrips();
}

function exportBackup() {
  const payload = { app: "Minhas Viagens", version: "0.9.1", exportedAt: new Date().toISOString(), trips: state.trips };
  const blob = new Blob([JSON.stringify(payload, (key, value) => key === "roadSegments" ? undefined : value, 2)], { type: "application/json" });
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
els.cityAchievementsTabBtn.addEventListener("click", () => {
  state.achievementView = "cities";
  state.achievementStateKey = null;
  renderAchievements();
});
els.roadAchievementsTabBtn.addEventListener("click", () => {
  state.achievementView = "roads";
  renderAchievements();
});
els.iconicAchievementsTabBtn?.addEventListener("click", () => {
  state.achievementView = "iconic";
  renderAchievements();
});
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
els.closeHighwayBtn.addEventListener("click", () => closeFullHighway(true));
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
map.on("click", event => { if (state.drawing) addDraftPoint(event.latlng); });
map.on("mousemove", updateEditDrag);
map.on("mouseup", finishEditDrag);
document.addEventListener("mouseup", () => { if (state.editDragging) finishEditDrag(); });
map.getContainer().addEventListener("pointerdown", startEditPointer, true);
map.getContainer().addEventListener("pointermove", updateEditPointer, true);
map.getContainer().addEventListener("pointerup", finishEditPointer, true);
map.getContainer().addEventListener("pointercancel", cancelEditPointer, true);
window.addEventListener("resize", () => map.invalidateSize());

newTripColorWheelController = setupColorWheel(els.newTripColorWheel, els.tripColor.value || DEFAULT_ROUTE_COLOR, color => {
  els.tripColor.value = color;
}, color => {
  els.tripColor.value = color;
});

loadTrips();
saveTrips();
renderTrips();
window.MinhasViagensApp = {
  getTrips: () => state.trips,
  replaceTrips: trips => {
    state.trips = trips.map(ensureTripSchema);
    saveTrips();
    renderTrips();
  },
  saveLocal: () => saveTrips(),
  render: () => renderTrips(),
  storageKey: STORAGE_KEY
};
queueRoadsForPreload([...getAchievementSnapshot().roads.values()].map(item => item.label));
requestAnimationFrame(() => map.invalidateSize());
