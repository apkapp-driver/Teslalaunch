"use strict";

/* ---------- Config ---------- */
const TESLA_PROXY_URL = ""; // tu Cloudflare Worker /vehicle (ver carpeta tesla-proxy)
const CAR_MODEL = "assets/car.glb"; // cambia a "assets/tesla.glb" para el Model 3 (pesa 21 MB)
const RADAR_WARN_M = 600;   // distancia a la que avisa de un radar

/* ---------- Clock ---------- */
function tickClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    document.getElementById("time").textContent = `${hh}:${mm}`;
    document.getElementById("date").textContent = now.toLocaleDateString(undefined, {
        weekday: "long", day: "numeric", month: "short",
    });
}
tickClock();
setInterval(tickClock, 1000);

/* ---------- 3D car model + selector ---------- */
const carModel = document.getElementById("carModel");
const carSelect = document.getElementById("carSelect");

const carMeta = {};   // file -> { yaw }  (which way each model faces)
const carUrls = {};   // file -> blob URL for cars imported by the user
let carYawDeg = 0;
function setCar(file) {
    carYawDeg = (carMeta[file] && carMeta[file].yaw) || 0;
    carModel.setAttribute("camera-orbit", carYawDeg + "deg 76deg 105%");
    carModel.setAttribute("src", carUrls[file] || "assets/" + file);
    try { localStorage.setItem("midash.car", file); } catch (_) {}
}

async function loadCars() {
    let cars = [];
    try { cars = await fetch("assets/cars.json").then((r) => r.json()); } catch (_) {}
    if (!cars.length) { setCar(CAR_MODEL.replace("assets/", "")); return; }

    let saved = null;
    try { saved = localStorage.getItem("midash.car"); } catch (_) {}
    const initial = cars.find((c) => c.file === saved) || cars[0];

    carSelect.innerHTML = "";
    for (const c of cars) {
        carMeta[c.file] = { yaw: c.yaw || 0 };
        const opt = document.createElement("option");
        opt.value = c.file;
        opt.textContent = c.name;
        if (c.file === initial.file) opt.selected = true;
        carSelect.appendChild(opt);
    }
    carSelect.onchange = () => setCar(carSelect.value);
    setCar(initial.file);
}
const carsReady = loadCars();

/* ---------- Shortcuts (editable favorites, persisted) ---------- */
const DEFAULT_SHORTCUTS = [
    { label: "Nav Hub", icon: "navhub", url: "https://haymadre9-lab.github.io/Autoboard_V2/nav-hub/" },
    { label: "Mapas", icon: "maps", url: "https://www.openstreetmap.org" },
    { label: "Música", icon: "music", url: "https://open.spotify.com" },
    { label: "Radio", icon: "radio", url: "https://www.radio.garden" },
    { label: "Tiempo", icon: "weather", url: "https://www.windy.com" },
    { label: "Noticias", icon: "news", url: "https://news.google.com" },
    { label: "Teléfono", icon: "phone", url: "tel:" },
];

/* Hand-drawn glyphs (48x48, white strokes) on a coloured gradient tile. */
const APP_ICONS = {
    navhub: { c: ["#2F8CFF", "#22D3EE"], g: '<circle cx="24" cy="24" r="15"/><path d="M31 17l-5 11-11 5 5-11z" fill="rgba(255,255,255,.35)"/><circle cx="24" cy="24" r="1.8" fill="#fff"/>' },
    maps: { c: ["#22C55E", "#0EA5A4"], g: '<path d="M24 6c-7 0-12 5.2-12 11.6C12 27 24 42 24 42s12-15 12-24.4C36 11.2 31 6 24 6z" fill="rgba(255,255,255,.22)"/><circle cx="24" cy="18" r="4.5"/>' },
    music: { c: ["#A855F7", "#EC4899"], g: '<path d="M19 33V14l16-4v19"/><circle cx="14.5" cy="33.5" r="4.5" fill="rgba(255,255,255,.3)"/><circle cx="30.5" cy="29.5" r="4.5" fill="rgba(255,255,255,.3)"/>' },
    radio: { c: ["#FB923C", "#EF4444"], g: '<rect x="8" y="17" width="32" height="21" rx="4.5" fill="rgba(255,255,255,.2)"/><circle cx="29" cy="27.5" r="5.5"/><path d="M13 24h8M13 30h8M14 17l17-9"/>' },
    weather: { c: ["#38BDF8", "#6366F1"], g: '<circle cx="18" cy="17" r="5.5" fill="rgba(255,236,150,.9)" stroke="none"/><path d="M18 6v2.5M6 17h2.5M9.4 8.4l1.8 1.8M26.6 8.4l-1.8 1.8"/><path d="M20 38h16a6 6 0 0 0 0-12 8 8 0 0 0-15 2 5 5 0 0 0-1 10z" fill="rgba(255,255,255,.28)"/>' },
    news: { c: ["#64748B", "#334155"], g: '<rect x="9" y="9" width="30" height="30" rx="4.5" fill="rgba(255,255,255,.18)"/><path d="M15 17h18M15 23h18M15 29h10"/>' },
    phone: { c: ["#4ADE80", "#16A34A"], g: '<path d="M14 8l5 1.2 2 7-4 3c2 5 5 8.5 10 10.5l3-4 7 2 1 5c0 3-3 5.5-6 5.5C20 38 10 28 9 15c0-3 2-6.500 5-7z" fill="rgba(255,255,255,.25)"/>' },
};
function appIconHtml(s) {
    const ic = APP_ICONS[s.icon];
    if (ic) {
        return `<span class="app-ico" style="--c1:${ic.c[0]};--c2:${ic.c[1]}"><svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${ic.g}</svg></span>`;
    }
    // Custom shortcut: its emoji on a gradient picked from the name.
    let h = 0;
    for (const ch of s.label || "") h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `<span class="app-ico" style="--c1:hsl(${h} 70% 55%);--c2:hsl(${(h + 40) % 360} 70% 42%)"><span class="app-emoji">${s.emoji || "⭐"}</span></span>`;
}

const appsEl = document.getElementById("apps");
let editMode = false;
let shortcuts = DEFAULT_SHORTCUTS.slice();
try {
    const saved = JSON.parse(localStorage.getItem("midash.shortcuts2"));
    if (Array.isArray(saved) && saved.length) shortcuts = saved;
} catch (_) {}
function saveShortcuts() {
    try { localStorage.setItem("midash.shortcuts2", JSON.stringify(shortcuts)); } catch (_) {}
}
function renderApps() {
    appsEl.innerHTML = "";
    shortcuts.forEach((s, i) => {
        const tile = document.createElement(editMode ? "div" : "a");
        tile.className = "app-tile";
        if (!editMode) { tile.href = s.url; tile.target = "_blank"; tile.rel = "noopener"; }
        tile.innerHTML = appIconHtml(s) + `<span class="app-label"></span>`;
        tile.querySelector(".app-label").textContent = s.label;
        if (editMode) {
            const x = document.createElement("button");
            x.className = "tile-del"; x.textContent = "×";
            x.onclick = (e) => { e.stopPropagation(); shortcuts.splice(i, 1); saveShortcuts(); renderApps(); };
            tile.appendChild(x);
        }
        appsEl.appendChild(tile);
    });
    const add = document.createElement("button");
    add.className = "app-tile ghost";
    add.innerHTML = `<span class="app-ico plain"><span class="app-emoji">＋</span></span><span class="app-label">Añadir</span>`;
    add.onclick = () => {
        const label = prompt("Nombre del acceso:"); if (!label) return;
        const url = prompt("URL (https://… o tel:):", "https://"); if (!url) return;
        const emoji = prompt("Emoji:", "⭐") || "⭐";
        shortcuts.push({ label, emoji, url }); saveShortcuts(); renderApps();
    };
    appsEl.appendChild(add);
    const edit = document.createElement("button");
    edit.className = "app-tile ghost";
    edit.innerHTML = `<span class="app-ico plain"><span class="app-emoji">${editMode ? "✓" : "✎"}</span></span>` +
        `<span class="app-label">${editMode ? "Hecho" : "Editar"}</span>`;
    edit.onclick = () => { editMode = !editMode; renderApps(); };
    appsEl.appendChild(edit);
}
renderApps();

/* ---------- Day / night theme ---------- */
const STYLES = {
    day: "https://tiles.openfreemap.org/styles/positron", // pale
    night: "https://tiles.openfreemap.org/styles/dark",
};
let themeMode = "auto"; // auto | day | night
try { themeMode = localStorage.getItem("midash.theme") || "auto"; } catch (_) {}
function isNight() {
    if (themeMode === "day") return false;
    if (themeMode === "night") return true;
    const h = new Date().getHours();
    return h < 7 || h >= 20; // auto: noche de 20:00 a 07:00
}

/* ---------- Map views (Compass / Track / Tilt / Cityscape) ----------
   Compass: north-up, flat.   Track: heading-up, flat.
   Tilt: heading-up, pitched. Cityscape: Tilt + extruded 3D buildings. */
const VIEWS = {
    compass: { label: "Compass",   pitch: 0,  rotate: false, buildings: false },
    track:   { label: "Track",     pitch: 0,  rotate: true,  buildings: false },
    tilt:    { label: "Tilt",      pitch: 55, rotate: true,  buildings: false },
    city:    { label: "Cityscape", pitch: 58, rotate: true,  buildings: true  },
};
let viewKey = "city";
try { const v = localStorage.getItem("midash.view"); if (VIEWS[v]) viewKey = v; } catch (_) {}

/* ---------- Map (OpenFreeMap: real streets, no API key) ---------- */
let currentStyleUrl = isNight() ? STYLES.night : STYLES.day;
const map = new maplibregl.Map({
    container: "map",
    style: currentStyleUrl,
    center: [-2.47, 43.21], // País Vasco (donde hay datos de señales)
    zoom: 15,
    pitch: VIEWS[viewKey].pitch,
    maxPitch: 70,
    attributionControl: { compact: true },
});

/* ---------- Own position: marker + camera that follows the car ---------- */
const meEl = document.createElement("div");
meEl.className = "me";
meEl.innerHTML =
    '<svg viewBox="0 0 40 40">' +
    '<path d="M20 5 L30 31 L20 25 L10 31 Z" fill="#2F8CFF" stroke="#fff" stroke-width="2.5" ' +
    'stroke-linejoin="round"/></svg>';
const meMarker = new maplibregl.Marker({ element: meEl, rotationAlignment: "map", pitchAlignment: "map" });
let meOnMap = false;

let myPos = null;       // [lon, lat]
let mySpeed = 0;        // km/h
let myHeading = null;   // degrees clockwise from north
let following = true;   // camera follows the car until the user pans the map
let lastCam = 0;

/** Every location fix (real GPS or the simulation hook) goes through here. */
function onFix(lon, lat, speedMs, heading) {
    myPos = [lon, lat];
    if (typeof speedMs === "number" && !isNaN(speedMs)) mySpeed = speedMs * 3.6;
    if (typeof heading === "number" && !isNaN(heading) && mySpeed > 3) myHeading = heading;
    if (!meOnMap) { meMarker.setLngLat(myPos).addTo(map); meOnMap = true; }
    else meMarker.setLngLat(myPos);
    meMarker.setRotation(myHeading || 0);
    checkRadarProximity();
    checkSignProximity();
    checkNavProgress();
    followCamera();
}
if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
        (p) => onFix(p.coords.longitude, p.coords.latitude, p.coords.speed, p.coords.heading),
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
}
// Dev hook to simulate driving from the console: __fix(lon, lat, kmh, headingDeg)
window.__fix = (lon, lat, kmh, heading) => onFix(lon, lat, (kmh || 0) / 3.6, heading);

/* ---------- Automatic zoom that follows your speed ---------- */
const ZOOM_CURVE = [[0, 17.4], [30, 16.7], [60, 15.9], [90, 15.2], [120, 14.5]]; // [km/h, zoom]
function zoomForSpeed(kmh) {
    const c = ZOOM_CURVE;
    if (kmh <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
        if (kmh <= c[i][0]) {
            const [a, za] = c[i - 1], [b, zb] = c[i];
            return za + ((zb - za) * (kmh - a)) / (b - a);
        }
    }
    return c[c.length - 1][1];
}
/** Zoom in a little as the next maneuver gets close, so you can read the junction. */
function zoomFor(kmh, distToTurn) {
    let z = zoomForSpeed(kmh);
    if (distToTurn != null && distToTurn < 220) z += 0.8;
    const extra = typeof OPT !== "undefined" ? (OPT.zoomLevel || 0) * 0.6 : 0;
    return Math.min(z + extra, 19.5);
}
function nextTurnDist() { return nav.active ? nav.dNext : null; }

function followCamera() {
    if (!following || !myPos) return;
    const t = performance.now();
    if (t - lastCam < 900) return;
    lastCam = t;
    const v = VIEWS[viewKey];
    const bearing = v.rotate ? (myHeading != null ? myHeading : map.getBearing()) : 0;
    // Keep the car in the lower part of the screen in every view: more road ahead, and the
    // guidance card (tall with lane guidance) never covers the car's position.
    const top = Math.round(map.getContainer().clientHeight * 0.32);
    map.easeTo({
        center: myPos,
        zoom: zoomFor(mySpeed, nextTurnDist()),
        pitch: v.pitch,
        bearing,
        padding: { top, bottom: 0, left: 0, right: 0 },
        duration: 1000,
        easing: (x) => x,
        essential: true,
    });
}

// Panning/zooming by hand pauses the follow mode; "Recentrar" resumes it.
const recenterBtn = document.getElementById("recenterBtn");
map.on("movestart", (e) => {
    if (e.originalEvent) { following = false; recenterBtn.hidden = false; }
});
recenterBtn.onclick = () => {
    following = true;
    recenterBtn.hidden = true;
    lastCam = 0;
    followCamera();
};

// Overlays survive style switches: re-add them whenever a style is (re)loaded.
map.on("styledata", addOverlays);
// 'styledata' can fire while tiles are still loading (isStyleLoaded() is false then) and never
// again; 'idle' guarantees a retry once everything is loaded. addOverlays is idempotent.
map.on("idle", addOverlays);
// Fetch datasets right away; addOverlays waits for the style to be ready.
loadRadars();
loadSigns();

function applyTheme() {
    const want = isNight() ? STYLES.night : STYLES.day;
    if (want === currentStyleUrl) return;
    currentStyleUrl = want;
    map.setStyle(want); // 'styledata' re-adds overlays
}
// Re-check periodically so "auto" flips at dawn/dusk.
setInterval(() => { if (themeMode === "auto") applyTheme(); }, 60000);

/* ---------- View selector ---------- */
const viewBar = document.createElement("div");
viewBar.className = "view-bar";
function updateBuildings() {
    if (map.getLayer("buildings-3d")) {
        map.setLayoutProperty("buildings-3d", "visibility", VIEWS[viewKey].buildings ? "visible" : "none");
    }
}
function setView(key) {
    viewKey = key;
    try { localStorage.setItem("midash.view", key); } catch (_) {}
    viewBar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.view === key));
    updateBuildings();
    const v = VIEWS[key];
    if (myPos && following) { lastCam = 0; followCamera(); }
    else map.easeTo({ pitch: v.pitch, bearing: v.rotate ? map.getBearing() : 0, duration: 600 });
}
for (const [key, v] of Object.entries(VIEWS)) {
    const b = document.createElement("button");
    b.textContent = v.label;
    b.dataset.view = key;
    b.classList.toggle("on", key === viewKey);
    b.onclick = () => setView(key);
    viewBar.appendChild(b);
}
document.getElementById("map").appendChild(viewBar);

/* ---------- Day/night toggle button (auto -> day -> night) ---------- */
const themeBtn = document.createElement("button");
themeBtn.className = "theme-btn";
function themeIcon() { return themeMode === "day" ? "☀️" : themeMode === "night" ? "🌙" : "🌓"; }
function refreshThemeBtn() { themeBtn.textContent = themeIcon(); themeBtn.title = `Tema: ${themeMode}`; }
themeBtn.onclick = () => {
    themeMode = themeMode === "auto" ? "day" : themeMode === "day" ? "night" : "auto";
    try { localStorage.setItem("midash.theme", themeMode); } catch (_) {}
    refreshThemeBtn();
    applyTheme();
};
refreshThemeBtn();
document.getElementById("map").appendChild(themeBtn);

/* ---------- Fullscreen map toggle ---------- */
const fullBtn = document.createElement("button");
fullBtn.className = "map-full-btn";
fullBtn.textContent = "⛶";
fullBtn.title = "Pantalla completa";
fullBtn.onclick = () => {
    const pane = document.querySelector(".pane-map");
    const full = pane.classList.toggle("fullscreen");
    fullBtn.textContent = full ? "✕" : "⛶";
    setTimeout(() => map.resize(), 60);
};
document.getElementById("map").appendChild(fullBtn);

/* ---------- Radars + signs (data kept so they re-add on style switch) ---------- */
const SIGN_COLORS = { s: "#E53935", c: "#FB8C00", t: "#43A047", p: "#1E88E5" };
const SIGN_SPEECH = { s: "Stop", c: "Ceda el paso", t: "Semáforo", p: "Paso de peatones" };
const SIGN_WARN_M = 90;
let radars = [];
let signs = [];
let radarData = null;
let signData = null;
let lastSignKey = null;

function addOverlays() {
    if (!map.isStyleLoaded()) return; // sources can only be added to a loaded style
    if (routeData && !map.getSource("route")) drawRoute(); // keep route across style switches
    addBaseExtras();
    if (typeof ensureSignImages === "function") ensureSignImages();
    if (signData && !map.getSource("signs")) {
        map.addSource("signs", { type: "geojson", data: signData });
        map.addLayer({
            id: "signs", type: "symbol", source: "signs", minzoom: 15.5,
            layout: {
                "icon-image": ["match", ["get", "kind"], "s", "sign-stop", "c", "sign-yield",
                    "t", "sign-light", "p", "sign-ped", "sign-other"],
                "icon-size": ["interpolate", ["linear"], ["zoom"], 15.5, 0.2, 18, 0.42],
                "icon-allow-overlap": false,
            },
        });
    }
    if (radarData && !map.getSource("radars")) {
        // Only the radars near and ahead are fed in (see drive.js).
        map.addSource("radars", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (typeof onRadarLayerAdded === "function") setTimeout(onRadarLayerAdded, 0);
        map.addLayer({
            id: "radars", type: "circle", source: "radars",
            paint: {
                "circle-radius": 5,
                "circle-color": "#E57373",
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "#0B0E14",
            },
        });
    }
}

/** First label layer of the current style: our layers go below it so street names stay readable. */
function firstSymbolId() {
    // Above every road layer (buildings are never hidden under roads), below the labels.
    const layers = map.getStyle().layers;
    let lastRoad = -1;
    layers.forEach((l, i) => { if (l["source-layer"] === "transportation" && l.type === "line") lastRoad = i; });
    const l = layers.slice(lastRoad + 1).find((x) => x.type === "symbol");
    return l ? l.id : undefined;
}

/**
 * Extra layers on top of the OpenFreeMap style (same OpenMapTiles schema in every style):
 *  - buildings-3d: extruded buildings (visible only in the Cityscape view)
 *  - lane-lines:   dashed centre line on main roads, an approximation of lane markings
 *                  (true per-lane geometry isn't in the tiles).
 */
function addBaseExtras() {
    if (!map.getSource("openmaptiles")) return;
    const night = isNight();
    const before = firstSymbolId();
    if (!map.getLayer("lane-lines")) {
        map.addLayer({
            id: "lane-lines", type: "line", source: "openmaptiles", "source-layer": "transportation",
            minzoom: 15.5,
            filter: ["all",
                ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false],
                ["!=", ["get", "brunnel"], "tunnel"]],
            layout: { "line-cap": "butt" },
            paint: {
                "line-color": night ? "rgba(255,255,255,0.40)" : "rgba(95,105,125,0.55)",
                "line-width": ["interpolate", ["linear"], ["zoom"], 15.5, 0.8, 19, 2.4],
                "line-dasharray": [2.5, 3.5],
            },
        }, before);
    }
    if (!map.getLayer("buildings-3d")) {
        map.addLayer({
            id: "buildings-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building",
            minzoom: 14,
            layout: { visibility: VIEWS[viewKey].buildings ? "visible" : "none" },
            paint: {
                "fill-extrusion-color": night ? "#4B556B" : "#D6DAE1",
                "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
                "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.88],
                "fill-extrusion-vertical-gradient": true,
            },
        }, before);
    }
}

async function loadRadars() {
    try { radars = await fetch("assets/radares.json").then((r) => r.json()); }
    catch (_) { return; }
    radarData = {
        type: "FeatureCollection",
        features: radars.map((r) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [r.lon, r.lat] },
            properties: { max: r.max },
        })),
    };
    addOverlays();
}

async function loadSigns() {
    let doc;
    try { doc = await fetch("assets/senales.json").then((r) => r.json()); }
    catch (_) { return; }
    const pts = doc.p || [];
    signs = pts.map((p) => ({ lat: p[0], lon: p[1], kind: p[2] }));
    signData = {
        type: "FeatureCollection",
        features: signs.map((s) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [s.lon, s.lat] },
            properties: { kind: s.kind },
        })),
    };
    addOverlays();
}

function checkSignProximity() {
    if (!myPos || signs.length === 0) return;
    let best = null, bestD = Infinity;
    for (const s of signs) {
        const d = haversine(myPos[0], myPos[1], s.lon, s.lat);
        if (d < bestD) { bestD = d; best = s; }
    }
    if (best && bestD <= SIGN_WARN_M) {
        const key = `${best.lat},${best.lon}`;
        if (key !== lastSignKey) {
            lastSignKey = key;
            speak(SIGN_SPEECH[best.kind] || "Señal", true);
        }
    } else if (bestD > SIGN_WARN_M * 1.6) {
        lastSignKey = null; // reset once we're clearly past it
    }
}

/* ---------- Navigation: pace-note guidance (Nominatim + OSRM + Web Speech) ---------- */
const ANNOUNCE_FAR_M = 400;       // first spoken heads-up
const ANNOUNCE_NEAR_M = 170;      // short call right before the maneuver
const PASS_M = 35;                // maneuver considered reached
const OFF_ROUTE_M = 300;          // this far from the route...
const OFF_ROUTE_FIXES = 3;        // ...for this many fixes in a row => re-plan
const REROUTE_COOLDOWN_MS = 30000;

let routeData = null;             // GeoJSON feature of the current route (kept across style switches)
let routeLine = null;             // [[lon, lat], ...] for off-route detection
let routeCum = null;              // cumulative metres at each route vertex
const nav = {
    active: false, dest: null, steps: [], idx: 0, avgSpeed: 12,
    offCount: 0, lastReroute: 0, dNext: null,
    along: 0,                     // metres travelled along the route (progress)
};
const $ = (id) => document.getElementById(id);

let lastNavSpeech = 0;
/**
 * Navigation calls interrupt whatever is being said. Low-priority alerts (road signs)
 * never cut a navigation instruction: they're dropped while something is being spoken
 * or right after a navigation call.
 */
function speak(text, low = false) {
    try {
        if (low) {
            if (speechSynthesis.speaking || Date.now() - lastNavSpeech < 5000) return;
        } else {
            lastNavSpeech = Date.now();
            speechSynthesis.cancel();
        }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "es-ES";
        speechSynthesis.speak(u);
    } catch (_) {}
}
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function fmtDist(m) {
    if (m >= 1000) return (m / 1000).toFixed(1).replace(".", ",") + " km";
    return (m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10) + " m";
}
function spokenDist(m) {
    if (m >= 950) return `${String(Math.round(m / 100) / 10).replace(".", ",")} kilómetros`;
    return `${Math.max(50, Math.round(m / 50) * 50)} metros`;
}

async function geocode(q) {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
        encodeURIComponent(q);
    try {
        const res = await fetch(url, { headers: { "Accept-Language": "es" } }).then((r) => r.json());
        if (res && res[0]) return [parseFloat(res[0].lon), parseFloat(res[0].lat)];
    } catch (_) {}
    return null;
}

async function routeTo(dest, opts = {}) {
    if (!myPos) { speak("Esperando tu ubicación"); showInstruction("Esperando tu ubicación…"); return; }
    const url = `https://router.project-osrm.org/route/v1/driving/` +
        `${myPos[0]},${myPos[1]};${dest[0]},${dest[1]}?overview=full&geometries=geojson&steps=true`;
    let data;
    try { data = await fetch(url).then((r) => r.json()); }
    catch (_) { showInstruction("Error de red"); return; }
    const route = data.routes && data.routes[0];
    if (!route) { speak("No he encontrado una ruta"); return; }
    applyRoute(route, dest, opts);
}

/** Start guiding along an OSRM route object (also used by the simulation tests). */
function applyRoute(route, dest, opts = {}) {
    nav.dest = dest;
    nav.steps = route.legs[0].steps;
    nav.idx = nav.steps.length > 1 ? 1 : 0;           // step 0 is "depart": we're already there
    nav.avgSpeed = Math.max(3, route.distance / Math.max(1, route.duration));
    nav.offCount = 0;
    nav.active = true;
    nav.steps.forEach((s) => { s._far = false; s._near = false; });
    nav.steps[0]._far = nav.steps[0]._near = true;

    routeData = { type: "Feature", geometry: route.geometry };
    routeLine = route.geometry.coordinates;
    buildRouteMetrics();
    nav.along = 0;
    // Where along the route each maneuver happens (so progress, not straight-line distance, decides).
    nav.steps.forEach((s) => { s._along = projectOnRoute(s.maneuver.location, 0, true).along; });
    nav.steps[0]._along = 0;
    nav.steps[nav.steps.length - 1]._along = routeCum[routeCum.length - 1];
    drawRoute();
    $("navStop").hidden = false;
    hideInstruction();

    if (!opts.reroute) {
        const km = (route.distance / 1000).toFixed(1).replace(".", ",");
        speak(`Ruta iniciada. ${km} kilómetros, unos ${Math.round(route.duration / 60)} minutos`);
    }
    following = true;
    recenterBtn.hidden = true;
    lastCam = 0;
    checkNavProgress();
    followCamera();
}

function drawRoute() {
    if (!routeData) return;
    const feed = window.__routeFC || routeData; // __routeFC: route cut in traffic-coloured chunks
    const src = map.getSource("route");
    if (src) { src.setData(feed); return; }
    map.addSource("route", { type: "geojson", data: feed });
    const before = map.getLayer("radars") ? "radars" : undefined;
    const layout = { "line-join": "round", "line-cap": "round" };
    map.addLayer({ id: "route-casing", type: "line", source: "route", layout,
        paint: { "line-color": isNight() ? "#0B1220" : "#FFFFFF", "line-width": 12, "line-opacity": 0.9 } }, before);
    map.addLayer({ id: "route", type: "line", source: "route", layout,
        paint: { "line-color": ["match", ["to-number", ["get", "lvl"], 0],
            1, "#F5D000", 2, "#FF8A00", 3, "#E53935", "#2F8CFF"], "line-width": 8 } }, before);
}

function clearRoute() {
    routeData = null; routeLine = null;
    nav.active = false; nav.steps = []; nav.idx = 0; nav.dest = null; nav.dNext = null;
    ["route", "route-casing"].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
    if (map.getSource("route")) map.removeSource("route");
    $("navStop").hidden = true;
    $("navCard").hidden = true;
    $("navEta").hidden = true;
    hideInstruction();
    try { speechSynthesis.cancel(); } catch (_) {}
}

function buildRouteMetrics() {
    routeCum = [0];
    for (let i = 0; i < routeLine.length - 1; i++) {
        routeCum.push(routeCum[i] + haversine(routeLine[i][0], routeLine[i][1], routeLine[i + 1][0], routeLine[i + 1][1]));
    }
}

/**
 * Project a point onto the route: { dist: metres off the route, along: metres from the start }.
 * Unless `all` is set, only a window around `fromAlong` is searched so a route that crosses
 * itself can't make the progress jump to the wrong pass.
 */
function projectOnRoute(p, fromAlong, all = false) {
    if (!routeLine || routeLine.length < 2) return { dist: 0, along: 0 };
    const kx = 111320 * Math.cos((p[1] * Math.PI) / 180), ky = 110540;
    const px = p[0] * kx, py = p[1] * ky;
    let best = { dist: Infinity, along: 0 };
    for (let i = 0; i < routeLine.length - 1; i++) {
        if (!all && (routeCum[i + 1] < fromAlong - 100 || routeCum[i] > fromAlong + 2000)) continue;
        const ax = routeLine[i][0] * kx, ay = routeLine[i][1] * ky;
        const bx = routeLine[i + 1][0] * kx, by = routeLine[i + 1][1] * ky;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d < best.dist) best = { dist: d, along: routeCum[i] + t * (routeCum[i + 1] - routeCum[i]) };
    }
    return best.dist === Infinity ? projectOnRoute(p, fromAlong, true) : best;
}

/** Distance in metres from a point to the route polyline (planar approximation). */
function distToRoute(p) {
    if (!routeLine || routeLine.length < 2) return 0;
    const kx = 111320 * Math.cos((p[1] * Math.PI) / 180), ky = 110540;
    const px = p[0] * kx, py = p[1] * ky;
    let best = Infinity;
    for (let i = 0; i < routeLine.length - 1; i++) {
        const ax = routeLine[i][0] * kx, ay = routeLine[i][1] * ky;
        const bx = routeLine[i + 1][0] * kx, by = routeLine[i + 1][1] * ky;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d < best) best = d;
    }
    return best;
}

function maneuverText(step) {
    const m = step.maneuver;
    const dir = {
        left: "a la izquierda", right: "a la derecha",
        "slight left": "ligeramente a la izquierda", "slight right": "ligeramente a la derecha",
        "sharp left": "cerrado a la izquierda", "sharp right": "cerrado a la derecha",
        straight: "recto", uturn: "en sentido contrario",
    }[m.modifier] || "";
    const on = step.name ? ` por ${step.name}` : "";
    switch (m.type) {
        case "depart": return "Comienza la ruta";
        case "arrive": return "Has llegado a tu destino";
        case "roundabout": case "rotary":
            return `En la rotonda, toma la salida${step.name ? ` hacia ${step.name}` : ""}`;
        case "turn": return `Gira ${dir}${on}`;
        case "new name": return `Continúa${on}`;
        case "merge": return `Incorpórate ${dir}`.trim();
        case "on ramp": return `Toma la incorporación ${dir}`.trim();
        case "off ramp": return `Toma la salida ${dir}`.trim();
        case "fork": return `Mantente ${dir}`.trim();
        case "end of road": return `Al final de la vía, gira ${dir}`;
        case "continue": return `Continúa ${dir}${on}`.replace("  ", " ");
        default: return dir ? `Gira ${dir}` : "Continúa";
    }
}

/* ----- Vector glyphs: crisp on any screen, no image assets ----- */
const ANGLES = { straight: 0, "slight right": 35, right: 90, "sharp right": 145, uturn: 180,
    "slight left": -35, left: -90, "sharp left": -145 };

function arrowSVG(type, modifier) {
    const stroke = 'stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
    if (type === "arrive") {
        return '<svg viewBox="0 0 48 48"><path d="M24 44C14 31 10 25 10 18a14 14 0 0 1 28 0c0 7-4 13-14 26z" fill="#fff"/>' +
            '<circle cx="24" cy="18" r="5" fill="#2A3142"/></svg>';
    }
    if (modifier === "uturn") {
        return `<svg viewBox="0 0 48 48"><path d="M32 44V22a8 8 0 0 0-16 0v12" ${stroke}/>` +
            '<path d="M8 32h16l-8 12z" fill="#fff"/></svg>';
    }
    const a = (ANGLES[modifier] ?? 0) * Math.PI / 180;
    const px = 24, py = 28, L = 14;
    const ex = px + L * Math.sin(a), ey = py - L * Math.cos(a);
    const ux = Math.sin(a), uy = -Math.cos(a), nx = Math.cos(a), ny = Math.sin(a);
    const f = (n) => n.toFixed(1);
    const ring = (type === "roundabout" || type === "rotary")
        ? `<circle cx="${px}" cy="${py}" r="8" stroke="#fff" stroke-width="4" fill="none" opacity=".9"/>` : "";
    return `<svg viewBox="0 0 48 48">${ring}<path d="M24 46V${py}L${f(ex)} ${f(ey)}" ${stroke}/>` +
        `<path d="M${f(ex + ux * 10)} ${f(ey + uy * 10)}L${f(ex + nx * 10)} ${f(ey + ny * 10)}` +
        `L${f(ex - nx * 10)} ${f(ey - ny * 10)}z" fill="#fff"/></svg>`;
}

function miniArrow(ind) {
    if (ind === "none") {
        return '<svg viewBox="0 0 24 24"><path d="M12 21V5" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';
    }
    const a = (ANGLES[ind] ?? 0) * Math.PI / 180;
    const px = 12, py = 15, L = 6, f = (n) => n.toFixed(1);
    const ex = px + L * Math.sin(a), ey = py - L * Math.cos(a);
    const ux = Math.sin(a), uy = -Math.cos(a), nx = Math.cos(a), ny = Math.sin(a);
    return `<svg viewBox="0 0 24 24"><path d="M12 23V${py}L${f(ex)} ${f(ey)}" stroke="#fff" stroke-width="3" ` +
        'stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        `<path d="M${f(ex + ux * 5)} ${f(ey + uy * 5)}L${f(ex + nx * 5)} ${f(ey + ny * 5)}` +
        `L${f(ex - nx * 5)} ${f(ey - ny * 5)}z" fill="#fff"/></svg>`;
}

function showInstruction(text) {
    const el = $("navInstruction");
    el.textContent = text; el.hidden = false;
}
function hideInstruction() { $("navInstruction").hidden = true; }

/** Lane guidance from OSRM (`intersections[0].lanes`), shown when the junction is near. */
function renderLanes(step, d) {
    const inter = step.intersections && step.intersections[0];
    const lanes = inter && inter.lanes;
    const el = $("navLanes");
    if (!lanes || !lanes.length || d > 700) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = lanes.map((l) =>
        `<div class="lane${l.valid ? " valid" : ""}">${(l.indications || ["none"]).map(miniArrow).join("")}</div>`,
    ).join("");
}

function renderNav(step, d) {
    $("navCard").hidden = false;
    $("navArrow").innerHTML = arrowSVG(step.maneuver.type, step.maneuver.modifier);
    $("navDist").textContent = fmtDist(d);
    $("navText").textContent = step.maneuver.type === "arrive" ? "Tu destino" : maneuverText(step);

    const nxt = nav.steps[nav.idx + 1];
    const thenEl = $("navThen");
    if (nxt && nxt.maneuver.type !== "arrive" && step.distance < 400) {
        thenEl.hidden = false;
        thenEl.textContent = `Después · ${fmtDist(step.distance)} · ${maneuverText(nxt)}`;
    } else thenEl.hidden = true;

    renderLanes(step, d);

    // Trip bar: time and distance left, arrival time.
    let remD = routeCum[routeCum.length - 1] - nav.along, remT = d / nav.avgSpeed;
    for (let j = nav.idx; j < nav.steps.length; j++) remT += nav.steps[j].duration;
    const arr = new Date(Date.now() + remT * 1000);
    $("etaMin").textContent = `${Math.max(1, Math.round(remT / 60))} min`;
    $("etaKm").textContent = fmtDist(remD);
    $("etaArr").textContent = `llegada ${String(arr.getHours()).padStart(2, "0")}:${String(arr.getMinutes()).padStart(2, "0")}`;
    $("navEta").hidden = false;
}

function finishTrip() {
    speak("Has llegado a tu destino");
    showInstruction("Has llegado a tu destino");
    $("navCard").hidden = true;
    setTimeout(clearRoute, 6000);
    nav.active = false;
}

function checkNavProgress() {
    if (!nav.active || !myPos) return;
    const now = Date.now();

    // 1) Where are we along the route, and how far off it? Re-plan only after several
    //    consecutive fixes off the route, with a cooldown.
    const proj = projectOnRoute(myPos, nav.along);
    const off = proj.dist > OFF_ROUTE_M ? Math.min(proj.dist, distToRoute(myPos)) : proj.dist;
    if (off > OFF_ROUTE_M) nav.offCount++; else nav.offCount = 0;
    if (nav.offCount >= OFF_ROUTE_FIXES && now - nav.lastReroute > REROUTE_COOLDOWN_MS) {
        nav.lastReroute = now; nav.offCount = 0;
        speak("Recalculando ruta");
        routeTo(nav.dest, { reroute: true });
        return;
    }
    if (off <= OFF_ROUTE_M) nav.along = Math.max(nav.along, proj.along);   // progress never goes backwards

    // 2) A maneuver is behind us once our progress reaches it (even if GPS never got within a few metres).
    while (nav.idx < nav.steps.length - 1 && nav.steps[nav.idx]._along <= nav.along + 10) nav.idx++;
    const step = nav.steps[nav.idx];
    const d = Math.max(0, step._along - nav.along);   // distance to the maneuver ALONG the route
    nav.dNext = d;
    if (step.maneuver.type === "arrive" && d < PASS_M) { finishTrip(); return; }

    // 3) Pace-note announcements: a heads-up at ~400 m, a short call at ~170 m.
    //    The final "arrive" step only gets one heads-up; finishTrip() says the arrival.
    const isArrive = step.maneuver.type === "arrive";
    const text = maneuverText(step);
    if (d <= ANNOUNCE_FAR_M && d > ANNOUNCE_NEAR_M && !step._far) {
        step._far = true;
        const nxt = nav.steps[nav.idx + 1];
        const then = nxt && nxt.maneuver.type !== "arrive" && step.distance < 250
            ? `. Después, ${lc(maneuverText(nxt))}` : "";
        speak(isArrive ? `En ${spokenDist(d)} llegarás a tu destino`
                       : `En ${spokenDist(d)}, ${lc(text)}${then}`);
    }
    if (d <= ANNOUNCE_NEAR_M && !step._near) {
        step._near = step._far = true;
        if (!isArrive) speak(text);
    }
    renderNav(step, d);
}

// Wire the search form and the stop buttons.
$("navForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("navSearch").value.trim();
    if (!q) return;
    showInstruction("Buscando…");
    const dest = await geocode(q);
    if (!dest) { showInstruction("No encontrado"); setTimeout(hideInstruction, 2000); return; }
    routeTo(dest);
});
$("navStop").addEventListener("click", clearRoute);
$("etaStop").addEventListener("click", clearRoute);

/* ---------- Favorite destinations (Casa / Trabajo) ---------- */
function getPlace(key) {
    try { return JSON.parse(localStorage.getItem("midash.place." + key)); } catch (_) { return null; }
}
function setPlace(key, val) {
    try { localStorage.setItem("midash.place." + key, JSON.stringify(val)); } catch (_) {}
}
document.querySelectorAll(".fav-chip").forEach((chip) => {
    const key = chip.getAttribute("data-place");
    if (getPlace(key)) chip.classList.add("set");
    // Tap: navigate if set; otherwise save the destination typed in the search box.
    chip.addEventListener("click", async () => {
        const p = getPlace(key);
        if (p) { routeTo([p.lon, p.lat]); return; }
        const q = document.getElementById("navSearch").value.trim();
        if (!q) {
            showInstruction(`Escribe una dirección y pulsa ${chip.textContent.trim()} para guardarla`);
            setTimeout(hideInstruction, 2800); return;
        }
        const dest = await geocode(q);
        if (!dest) { showInstruction("No encontrado"); setTimeout(hideInstruction, 2000); return; }
        setPlace(key, { lon: dest[0], lat: dest[1] });
        chip.classList.add("set");
        showInstruction(`${chip.textContent.trim()} guardado`);
        setTimeout(hideInstruction, 1500);
    });
    // Long-press / right-click: forget it.
    chip.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        localStorage.removeItem("midash.place." + key);
        chip.classList.remove("set");
        showInstruction(`${chip.textContent.trim()} borrado`);
        setTimeout(hideInstruction, 1200);
    });
});

/* ---------- Radar proximity alert ---------- */
function haversine(lon1, lat1, lon2, lat2) {
    const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
function checkRadarProximity() {
    const banner = document.getElementById("alert");
    if (!myPos || radars.length === 0) { banner.hidden = true; return; }
    let best = null, bestD = Infinity;
    for (const r of radars) {
        const d = haversine(myPos[0], myPos[1], r.lon, r.lat);
        if (d < bestD) { bestD = d; best = r; }
    }
    if (best && bestD <= RADAR_WARN_M) {
        banner.hidden = false;
        // Some radars carry a `max` that isn't a speed limit: only show plausible ones.
        const plausible = best.max >= 20 && best.max <= 130;
        banner.innerHTML =
            `<span class="alert-dist">📷 ${Math.round(bestD)} m</span>` +
            (plausible ? `<span class="alert-max">${best.max}</span>` : "");
    } else {
        banner.hidden = true;
    }
}

/* ---------- Tesla (via proxy) ---------- */
async function refreshTesla() {
    if (!TESLA_PROXY_URL) return;
    try {
        const d = await fetch(TESLA_PROXY_URL, { cache: "no-store" }).then((r) => r.json());
        if (d.battery != null) {
            document.getElementById("teslaPct").innerHTML = `${d.battery}<small>%</small>`;
            document.getElementById("teslaBar").style.width =
                `${Math.max(0, Math.min(100, d.battery))}%`;
        }
        document.getElementById("teslaRange").textContent = d.range_km != null ? `· ${d.range_km} km` : "";
        document.getElementById("teslaBolt").hidden = !d.charging;
        document.getElementById("teslaBar").style.background = d.charging ? "#7CE38B" : "";
    } catch (_) {}
}
refreshTesla();
setInterval(refreshTesla, 30000);

/* ---------- PWA service worker ---------- */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
    });
}
