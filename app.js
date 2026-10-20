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

function setCar(file) {
    carModel.setAttribute("src", "assets/" + file);
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
        const opt = document.createElement("option");
        opt.value = c.file;
        opt.textContent = c.name;
        if (c.file === initial.file) opt.selected = true;
        carSelect.appendChild(opt);
    }
    carSelect.onchange = () => setCar(carSelect.value);
    setCar(initial.file);
}
loadCars();

/* ---------- Shortcuts (editable favorites, persisted) ---------- */
const DEFAULT_SHORTCUTS = [
    { label: "Mapas", emoji: "🗺️", url: "https://www.openstreetmap.org" },
    { label: "Música", emoji: "🎵", url: "https://open.spotify.com" },
    { label: "Radio", emoji: "📻", url: "https://www.radio.garden" },
    { label: "Tiempo", emoji: "☀️", url: "https://www.windy.com" },
    { label: "Noticias", emoji: "📰", url: "https://news.google.com" },
    { label: "Teléfono", emoji: "📞", url: "tel:" },
];
const appsEl = document.getElementById("apps");
let editMode = false;
let shortcuts = DEFAULT_SHORTCUTS.slice();
try {
    const saved = JSON.parse(localStorage.getItem("midash.shortcuts"));
    if (Array.isArray(saved)) shortcuts = saved;
} catch (_) {}
function saveShortcuts() {
    try { localStorage.setItem("midash.shortcuts", JSON.stringify(shortcuts)); } catch (_) {}
}
function renderApps() {
    appsEl.innerHTML = "";
    shortcuts.forEach((s, i) => {
        const tile = document.createElement(editMode ? "div" : "a");
        tile.className = "app-tile";
        if (!editMode) { tile.href = s.url; tile.target = "_blank"; tile.rel = "noopener"; }
        tile.innerHTML =
            `<span class="app-emoji">${s.emoji}</span><span class="app-label">${s.label}</span>`;
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
    add.innerHTML = `<span class="app-emoji">＋</span><span class="app-label">Añadir</span>`;
    add.onclick = () => {
        const label = prompt("Nombre del acceso:"); if (!label) return;
        const url = prompt("URL (https://… o tel:):", "https://"); if (!url) return;
        const emoji = prompt("Emoji:", "⭐") || "⭐";
        shortcuts.push({ label, emoji, url }); saveShortcuts(); renderApps();
    };
    appsEl.appendChild(add);
    const edit = document.createElement("button");
    edit.className = "app-tile ghost";
    edit.innerHTML = `<span class="app-emoji">${editMode ? "✓" : "✎"}</span>` +
        `<span class="app-label">${editMode ? "Hecho" : "Editar"}</span>`;
    edit.onclick = () => { editMode = !editMode; renderApps(); };
    appsEl.appendChild(edit);
}
renderApps();

/* ---------- Media card (demo) ---------- */
const media = { playing: false };
document.querySelectorAll("[data-media]").forEach((btn) => {
    btn.addEventListener("click", () => {
        if (btn.getAttribute("data-media") === "play") {
            media.playing = !media.playing;
            btn.textContent = media.playing ? "⏸" : "▶";
            document.getElementById("mediaTitle").textContent =
                media.playing ? "Reproduciendo…" : "En pausa";
        }
    });
});

/* ---------- Day / night theme ---------- */
const STYLES = {
    day: "https://tiles.openfreemap.org/styles/liberty",
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

/* ---------- Map (OpenFreeMap: real streets, no API key) ---------- */
let currentStyleUrl = isNight() ? STYLES.night : STYLES.day;
const map = new maplibregl.Map({
    container: "map",
    style: currentStyleUrl,
    center: [-2.47, 43.21], // País Vasco (donde hay datos de señales)
    zoom: 12,
    attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
});
map.addControl(geolocate, "top-right");

let myPos = null;
geolocate.on("geolocate", (e) => {
    myPos = [e.coords.longitude, e.coords.latitude];
    checkRadarProximity();
    checkSignProximity();
    checkNavProgress();
});

// Overlays survive style switches: re-add them whenever a style is (re)loaded.
map.on("styledata", addOverlays);
map.on("load", () => {
    try { geolocate.trigger(); } catch (_) {}
});
// Fetch datasets right away; addOverlays waits for the style to be ready.
loadRadars();
loadSigns();

function applyTheme() {
    const want = isNight() ? STYLES.night : STYLES.day;
    if (want === currentStyleUrl) return;
    currentStyleUrl = want;
    map.setStyle(want); // 'style.load' re-adds overlays
}
// Re-check periodically so "auto" flips at dawn/dusk.
setInterval(() => { if (themeMode === "auto") applyTheme(); }, 60000);

/* ---------- Map view modes (2D / follow / 3D) ---------- */
const views = { "2D": { pitch: 0, bearing: 0 }, "Seguir": { pitch: 0 }, "3D": { pitch: 55 } };
const viewBar = document.createElement("div");
viewBar.className = "view-bar";
for (const name of Object.keys(views)) {
    const b = document.createElement("button");
    b.textContent = name;
    b.onclick = () => {
        viewBar.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        map.easeTo({ ...views[name], duration: 600 });
    };
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
    if (signData && !map.getSource("signs")) {
        map.addSource("signs", { type: "geojson", data: signData });
        map.addLayer({
            id: "signs", type: "circle", source: "signs", minzoom: 13,
            paint: {
                "circle-radius": 4,
                "circle-color": [
                    "match", ["get", "kind"],
                    "s", SIGN_COLORS.s, "c", SIGN_COLORS.c,
                    "t", SIGN_COLORS.t, "p", SIGN_COLORS.p,
                    "#90A4AE",
                ],
                "circle-stroke-width": 1,
                "circle-stroke-color": "#0B0E14",
            },
        });
    }
    if (radarData && !map.getSource("radars")) {
        map.addSource("radars", { type: "geojson", data: radarData });
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
            speak(SIGN_SPEECH[best.kind] || "Señal");
        }
    } else if (bestD > SIGN_WARN_M * 1.6) {
        lastSignKey = null; // reset once we're clearly past it
    }
}

/* ---------- Voice navigation (Nominatim + OSRM + Web Speech) ---------- */
let routeData = null;   // GeoJSON LineString of the current route
let navSteps = [];      // OSRM steps with maneuvers
let navIndex = 0;       // next step to announce
let destination = null; // [lon, lat]

function speak(text) {
    try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "es-ES";
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
    } catch (_) {}
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

async function routeTo(dest) {
    if (!myPos) { speak("Esperando tu ubicación"); return; }
    destination = dest;
    const url = `https://router.project-osrm.org/route/v1/driving/` +
        `${myPos[0]},${myPos[1]};${dest[0]},${dest[1]}?overview=full&geometries=geojson&steps=true`;
    let data;
    try { data = await fetch(url).then((r) => r.json()); } catch (_) { return; }
    const route = data.routes && data.routes[0];
    if (!route) { speak("No he encontrado una ruta"); return; }

    navSteps = route.legs[0].steps;
    navIndex = 0;
    routeData = { type: "Feature", geometry: route.geometry };
    drawRoute();

    document.getElementById("navStop").hidden = false;
    const km = (route.distance / 1000).toFixed(1);
    const min = Math.round(route.duration / 60);
    speak(`Ruta iniciada. ${km} kilómetros, unos ${min} minutos`);
    showInstruction(`${km} km · ${min} min`);
    map.easeTo({ center: myPos, zoom: 15, pitch: 55, duration: 800 });
}

function drawRoute() {
    if (!routeData) return;
    const src = map.getSource("route");
    if (src) { src.setData(routeData); return; }
    map.addSource("route", { type: "geojson", data: routeData });
    map.addLayer({
        id: "route", type: "line", source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#4FC3F7", "line-width": 7, "line-opacity": 0.9 },
    }, map.getLayer("radars") ? "radars" : undefined);
}

function clearRoute() {
    routeData = null; navSteps = []; navIndex = 0; destination = null;
    if (map.getLayer("route")) map.removeLayer("route");
    if (map.getSource("route")) map.removeSource("route");
    document.getElementById("navStop").hidden = true;
    hideInstruction();
    try { speechSynthesis.cancel(); } catch (_) {}
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

function showInstruction(text) {
    const el = document.getElementById("navInstruction");
    el.textContent = text; el.hidden = false;
}
function hideInstruction() { document.getElementById("navInstruction").hidden = true; }

function checkNavProgress() {
    if (!myPos || navIndex >= navSteps.length) return;
    const step = navSteps[navIndex];
    const loc = step.maneuver.location; // [lon, lat]
    const d = haversine(myPos[0], myPos[1], loc[0], loc[1]);
    const text = maneuverText(step);
    // Update the on-screen instruction continuously.
    showInstruction(`${text} · ${Math.round(d)} m`);
    // Announce once when getting close.
    if (d <= 150 && !step._said) {
        step._said = true;
        speak(text);
        navIndex++;
        if (navIndex >= navSteps.length) setTimeout(() => clearRoute(), 8000);
    }
}

// Wire the search form.
document.getElementById("navForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("navSearch").value.trim();
    if (!q) return;
    showInstruction("Buscando…");
    const dest = await geocode(q);
    if (!dest) { showInstruction("No encontrado"); setTimeout(hideInstruction, 2000); return; }
    routeTo(dest);
});
document.getElementById("navStop").addEventListener("click", clearRoute);

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
        banner.innerHTML =
            `<span class="alert-dist">📷 ${Math.round(bestD)} m</span>` +
            `<span class="alert-max">${best.max}</span>`;
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
