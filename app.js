"use strict";

/* =========================================================
   CONFIG
   ========================================================= */
const TESLA_PROXY_URL = "";
const CAR_MODEL = "assets/car.glb";
const RADAR_WARN_M = 600;
const SIGN_WARN_M = 90;

/* =========================================================
   RELOJ
   ========================================================= */
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

/* =========================================================
   VENTANAS FLOTANTES (drag + resize + persistencia)
   ========================================================= */
const WIN_STORAGE_KEY = "teslalaunch.windows";

function saveWindowState() {
    const state = {};
    document.querySelectorAll(".window").forEach((win) => {
        const id = win.dataset.win;
        const rect = win.getBoundingClientRect();
        state[id] = {
            left: win.style.left || rect.left + "px",
            top: win.style.top || rect.top + "px",
            width: win.style.width || rect.width + "px",
            height: win.style.height || rect.height + "px",
            closed: win.classList.contains("closed"),
            minimized: win.classList.contains("minimized"),
        };
    });
    try { localStorage.setItem(WIN_STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

function loadWindowState() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(WIN_STORAGE_KEY)); } catch (_) {}
    if (!state) return;
    document.querySelectorAll(".window").forEach((win) => {
        const id = win.dataset.win;
        const s = state[id];
        if (!s) return;
        if (s.left) win.style.left = s.left;
        if (s.top) win.style.top = s.top;
        if (s.width) win.style.width = s.width;
        if (s.height) win.style.height = s.height;
        if (s.closed) win.classList.add("closed");
        if (s.minimized) win.classList.add("minimized");
    });
}

// Hacer ventana arrastrable
function makeDraggable(win) {
    const header = win.querySelector(".win-header");
    if (!header) return;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    let dragging = false;

    header.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button, select, input")) return; // no arrastrar desde controles
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = win.offsetLeft;
        startTop = win.offsetTop;
        header.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    header.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        win.style.left = (startLeft + dx) + "px";
        win.style.top = (startTop + dy) + "px";
        win.style.right = "auto";
        win.style.bottom = "auto";
    });

    header.addEventListener("pointerup", (e) => {
        if (!dragging) return;
        dragging = false;
        header.releasePointerCapture(e.pointerId);
        saveWindowState();
    });
}

// Hacer ventana redimensionable
function makeResizable(win) {
    const handle = win.querySelector(".resize-handle");
    if (!handle) return;
    let startX = 0, startY = 0, startW = 0, startH = 0;
    let resizing = false;

    handle.addEventListener("pointerdown", (e) => {
        resizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = win.offsetWidth;
        startH = win.offsetHeight;
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    });

    handle.addEventListener("pointermove", (e) => {
        if (!resizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        win.style.width = Math.max(160, startW + dx) + "px";
        win.style.height = Math.max(100, startH + dy) + "px";
    });

    handle.addEventListener("pointerup", (e) => {
        if (!resizing) return;
        resizing = false;
        handle.releasePointerCapture(e.pointerId);
        saveWindowState();
    });
}

// Inicializar ventanas
function initWindows() {
    loadWindowState();
    document.querySelectorAll(".window").forEach((win) => {
        makeDraggable(win);
        makeResizable(win);
        // Botones de control
        win.querySelector(".win-close")?.addEventListener("click", () => {
            win.classList.add("closed");
            saveWindowState();
        });
        win.querySelector(".win-min")?.addEventListener("click", () => {
            win.classList.toggle("minimized");
            saveWindowState();
        });
    });
    // Reabrir ventanas cerradas desde un menú (doble clic en el mapa o botón)
    document.getElementById("fullscreenBtn").addEventListener("dblclick", () => {
        document.querySelectorAll(".window.closed").forEach((w) => w.classList.remove("closed"));
        saveWindowState();
    });
}
initWindows();

/* =========================================================
   LANZADOR DE APPS (mejorado)
   ========================================================= */
const DEFAULT_SHORTCUTS = [
    { label: "Spotify", emoji: "🎵", url: "https://open.spotify.com", deepLink: "spotify:" },
    { label: "Radio", emoji: "📻", url: "https://www.radio.garden", deepLink: null },
    { label: "Mapas", emoji: "🗺️", url: "https://www.openstreetmap.org", deepLink: null },
    { label: "Tiempo", emoji: "☀️", url: "https://www.windy.com", deepLink: null },
    { label: "Noticias", emoji: "📰", url: "https://news.google.com", deepLink: null },
    { label: "Teléfono", emoji: "📞", url: "tel:", deepLink: "tel:" },
];

let shortcuts = DEFAULT_SHORTCUTS.slice();
try {
    const saved = JSON.parse(localStorage.getItem("teslalaunch.shortcuts"));
    if (Array.isArray(saved) && saved.length) shortcuts = saved;
} catch (_) {}

let editMode = false;

function saveShortcuts() {
    try { localStorage.setItem("teslalaunch.shortcuts", JSON.stringify(shortcuts)); } catch (_) {}
}

function openApp(shortcut, event) {
    // Si hay deepLink y el usuario mantiene Shift, intenta abrir la app nativa
    if (shortcut.deepLink && event.shiftKey) {
        try { window.location.href = shortcut.deepLink; } catch (_) {}
        return;
    }
    // Si es una URL http, abrir en ventana emergente o pestaña
    if (shortcut.url.startsWith("http")) {
        // Intentar ventana emergente (puede ser bloqueada)
        const popup = window.open(shortcut.url, "_blank", "width=1200,height=800,noopener");
        if (!popup) {
            // Fallback: abrir en la misma pestaña
            window.location.href = shortcut.url;
        }
    } else {
        // tel: u otro esquema
        window.location.href = shortcut.url;
    }
}

function renderApps() {
    const appsEl = document.getElementById("apps");
    appsEl.innerHTML = "";
    shortcuts.forEach((s, i) => {
        const tile = document.createElement("button");
        tile.className = "app-tile";
        tile.innerHTML = `<span class="app-emoji">${s.emoji}</span><span class="app-label">${s.label}</span>`;
        tile.addEventListener("click", (e) => openApp(s, e));
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
        shortcuts.push({ label, emoji, url, deepLink: null }); saveShortcuts(); renderApps();
    };
    appsEl.appendChild(add);
    const edit = document.createElement("button");
    edit.className = "app-tile ghost";
    edit.innerHTML = `<span class="app-emoji">${editMode ? "✓" : "✎"}</span><span class="app-label">${editMode ? "Hecho" : "Editar"}</span>`;
    edit.onclick = () => { editMode = !editMode; renderApps(); };
    appsEl.appendChild(edit);
}
renderApps();

/* =========================================================
   COCHE 3D + SELECTOR
   ========================================================= */
const carModel = document.getElementById("carModel");
const carSelect = document.getElementById("carSelect");

function setCar(file) {
    carModel.setAttribute("src", "assets/" + file);
    try { localStorage.setItem("teslalaunch.car", file); } catch (_) {}
}

async function loadCars() {
    let cars = [];
    try { cars = await fetch("assets/cars.json").then((r) => r.json()); } catch (_) {}
    if (!cars.length) { setCar(CAR_MODEL.replace("assets/", "")); return; }
    let saved = null;
    try { saved = localStorage.getItem("teslalaunch.car"); } catch (_) {}
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

/* =========================================================
   MÚSICA (demo)
   ========================================================= */
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

/* =========================================================
   MAPA (fondo 3D)
   ========================================================= */
const STYLES = {
    day: "https://tiles.openfreemap.org/styles/positron",
    night: "https://tiles.openfreemap.org/styles/dark",
};
let themeMode = "auto";
try { themeMode = localStorage.getItem("teslalaunch.theme") || "auto"; } catch (_) {}

function isNight() {
    if (themeMode === "day") return false;
    if (themeMode === "night") return true;
    const h = new Date().getHours();
    return h < 7 || h >= 20;
}

let currentStyleUrl = isNight() ? STYLES.night : STYLES.day;
const map = new maplibregl.Map({
    container: "map",
    style: currentStyleUrl,
    center: [-2.47, 43.21],
    zoom: 13,
    pitch: 55, // Vista 3D por defecto
    bearing: -20,
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

map.on("styledata", addOverlays);
map.on("load", () => {
    try { geolocate.trigger(); } catch (_) {}
});
loadRadars();
loadSigns();

function applyTheme() {
    const want = isNight() ? STYLES.night : STYLES.day;
    if (want === currentStyleUrl) return;
    currentStyleUrl = want;
    map.setStyle(want);
}
setInterval(() => { if (themeMode === "auto") applyTheme(); }, 60000);

// Botón de tema
const themeBtn = document.getElementById("themeBtn");
function themeIcon() { return themeMode === "day" ? "☀️" : themeMode === "night" ? "🌙" : "🌓"; }
function refreshThemeBtn() { themeBtn.textContent = themeIcon(); themeBtn.title = `Tema: ${themeMode}`; }
themeBtn.onclick = () => {
    themeMode = themeMode === "auto" ? "day" : themeMode === "day" ? "night" : "auto";
    try { localStorage.setItem("teslalaunch.theme", themeMode); } catch (_) {}
    refreshThemeBtn();
    applyTheme();
};
refreshThemeBtn();

// Botón de pantalla completa (oculta/muestra ventanas)
const fullBtn = document.getElementById("fullscreenBtn");
let windowsHidden = false;
fullBtn.onclick = () => {
    windowsHidden = !windowsHidden;
    document.querySelectorAll(".window").forEach((w) => {
        w.style.display = windowsHidden ? "none" : "";
    });
    fullBtn.textContent = windowsHidden ? "✕" : "⛶";
    fullBtn.title = windowsHidden ? "Mostrar ventanas" : "Pantalla completa";
    setTimeout(() => map.resize(), 60);
};

/* =========================================================
   VISTAS DEL MAPA (2D / 3D / Seguir)
   ========================================================= */
// Añadimos un pequeño control flotante
const viewBar = document.createElement("div");
viewBar.className = "view-bar";
viewBar.style.cssText = "position:fixed; left:50%; top:16px; transform:translateX(-50%); z-index:100; display:flex; gap:6px; background:rgba(11,14,20,0.65); backdrop-filter:blur(8px); padding:6px; border-radius:12px;";
["2D", "3D", "Seguir"].forEach((name) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.style.cssText = "background:none; border:none; color:#EEF2F7; font-size:13px; padding:6px 10px; border-radius:8px; cursor:pointer;";
    b.onclick = () => {
        viewBar.querySelectorAll("button").forEach((x) => x.style.background = "none");
        b.style.background = "#8FC9EE"; b.style.color = "#0B0E14"; b.style.fontWeight = "600";
        if (name === "2D") map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
        if (name === "3D") map.easeTo({ pitch: 55, bearing: -20, duration: 600 });
        if (name === "Seguir") { map.easeTo({ pitch: 0, duration: 600 }); if (myPos) map.easeTo({ center: myPos, zoom: 15 }); }
    };
    viewBar.appendChild(b);
});
document.body.appendChild(viewBar);

/* =========================================================
   RADARES Y SEÑALES (igual que antes)
   ========================================================= */
const SIGN_COLORS = { s: "#E53935", c: "#FB8C00", t: "#43A047", p: "#1E88E5" };
const SIGN_SPEECH = { s: "Stop", c: "Ceda el paso", t: "Semáforo", p: "Paso de peatones" };
let radars = [], signs = [], radarData = null, signData = null, lastSignKey = null;

function addOverlays() {
    if (!map.isStyleLoaded()) return;
    if (routeData && !map.getSource("route")) drawRoute();
    if (signData && !map.getSource("signs")) {
        map.addSource("signs", { type: "geojson", data: signData });
        map.addLayer({
            id: "signs", type: "circle", source: "signs", minzoom: 13,
            paint: {
                "circle-radius": 4,
                "circle-color": ["match", ["get", "kind"], "s", SIGN_COLORS.s, "c", SIGN_COLORS.c, "t", SIGN_COLORS.t, "p", SIGN_COLORS.p, "#90A4AE"],
                "circle-stroke-width": 1, "circle-stroke-color": "#0B0E14",
            },
        });
    }
    if (radarData && !map.getSource("radars")) {
        map.addSource("radars", { type: "geojson", data: radarData });
        map.addLayer({
            id: "radars", type: "circle", source: "radars",
            paint: { "circle-radius": 5, "circle-color": "#E57373", "circle-stroke-width": 1.5, "circle-stroke-color": "#0B0E14" },
        });
    }
}

async function loadRadars() {
    try { radars = await fetch("assets/radares.json").then((r) => r.json()); } catch (_) { return; }
    radarData = { type: "FeatureCollection", features: radars.map((r) => ({ type: "Feature", geometry: { type: "Point", coordinates: [r.lon, r.lat] }, properties: { max: r.max } })) };
    addOverlays();
}
async function loadSigns() {
    let doc;
    try { doc = await fetch("assets/senales.json").then((r) => r.json()); } catch (_) { return; }
    const pts = doc.p || [];
    signs = pts.map((p) => ({ lat: p[0], lon: p[1], kind: p[2] }));
    signData = { type: "FeatureCollection", features: signs.map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { kind: s.kind } })) };
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
        if (key !== lastSignKey) { lastSignKey = key; speak(SIGN_SPEECH[best.kind] || "Señal"); }
    } else if (bestD > SIGN_WARN_M * 1.6) { lastSignKey = null; }
}

/* =========================================================
   NAVEGACIÓN (igual que antes)
   ========================================================= */
let routeData = null, navSteps = [], navIndex = 0, destination = null;

function speak(text) {
    try { const u = new SpeechSynthesisUtterance(text); u.lang = "es-ES"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (_) {}
}
async function geocode(q) {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q);
    try { const res = await fetch(url, { headers: { "Accept-Language": "es" } }).then((r) => r.json()); if (res && res[0]) return [parseFloat(res[0].lon), parseFloat(res[0].lat)]; } catch (_) {}
    return null;
}
async function routeTo(dest) {
    if (!myPos) { speak("Esperando tu ubicación"); return; }
    destination = dest;
    const url = `https://router.project-osrm.org/route/v1/driving/${myPos[0]},${myPos[1]};${dest[0]},${dest[1]}?overview=full&geometries=geojson&steps=true`;
    let data;
    try { data = await fetch(url).then((r) => r.json()); } catch (_) { return; }
    const route = data.routes && data.routes[0];
    if (!route) { speak("No he encontrado una ruta"); return; }
    navSteps = route.legs[0].steps; navIndex = 0;
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
    map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#4FC3F7", "line-width": 7, "line-opacity": 0.9 } }, map.getLayer("radars") ? "radars" : undefined);
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
    const dir = { left: "a la izquierda", right: "a la derecha", "slight left": "ligeramente a la izquierda", "slight right": "ligeramente a la derecha", "sharp left": "cerrado a la izquierda", "sharp right": "cerrado a la derecha", straight: "recto", uturn: "en sentido contrario" }[m.modifier] || "";
    const on = step.name ? ` por ${step.name}` : "";
    switch (m.type) {
        case "depart": return "Comienza la ruta";
        case "arrive": return "Has llegado a tu destino";
        case "roundabout": case "rotary": return `En la rotonda, toma la salida${step.name ? ` hacia ${step.name}` : ""}`;
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
function showInstruction(text) { const el = document.getElementById("navInstruction"); if (el) { el.textContent = text; el.hidden = false; } }
function hideInstruction() { const el = document.getElementById("navInstruction"); if (el) el.hidden = true; }
function checkNavProgress() {
    if (!myPos || navIndex >= navSteps.length) return;
    const step = navSteps[navIndex];
    const loc = step.maneuver.location;
    const d = haversine(myPos[0], myPos[1], loc[0], loc[1]);
    const text = maneuverText(step);
    showInstruction(`${text} · ${Math.round(d)} m`);
    if (d <= 150 && !step._said) { step._said = true; speak(text); navIndex++; if (navIndex >= navSteps.length) setTimeout(() => clearRoute(), 8000); }
}

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

/* =========================================================
   FAVORITOS (Casa / Trabajo)
   ========================================================= */
function getPlace(key) { try { return JSON.parse(localStorage.getItem("teslalaunch.place." + key)); } catch (_) { return null; } }
function setPlace(key, val) { try { localStorage.setItem("teslalaunch.place." + key, JSON.stringify(val)); } catch (_) {} }
document.querySelectorAll(".fav-chip").forEach((chip) => {
    const key = chip.getAttribute("data-place");
    if (getPlace(key)) chip.classList.add("set");
    chip.addEventListener("click", async () => {
        const p = getPlace(key);
        if (p) { routeTo([p.lon, p.lat]); return; }
        const q = document.getElementById("navSearch").value.trim();
        if (!q) { showInstruction(`Escribe una dirección y pulsa ${chip.textContent.trim()} para guardarla`); setTimeout(hideInstruction, 2800); return; }
        const dest = await geocode(q);
        if (!dest) { showInstruction("No encontrado"); setTimeout(hideInstruction, 2000); return; }
        setPlace(key, { lon: dest[0], lat: dest[1] });
        chip.classList.add("set");
        showInstruction(`${chip.textContent.trim()} guardado`);
        setTimeout(hideInstruction, 1500);
    });
    chip.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        localStorage.removeItem("teslalaunch.place." + key);
        chip.classList.remove("set");
        showInstruction(`${chip.textContent.trim()} borrado`);
        setTimeout(hideInstruction, 1200);
    });
});

/* =========================================================
   RADAR PROXIMIDAD
   ========================================================= */
function haversine(lon1, lat1, lon2, lat2) {
    const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
function checkRadarProximity() {
    const banner = document.getElementById("alert");
    if (!myPos || radars.length === 0) { banner.hidden = true; return; }
    let best = null, bestD = Infinity;
    for (const r of radars) { const d = haversine(myPos[0], myPos[1], r.lon, r.lat); if (d < bestD) { bestD = d; best = r; } }
    if (best && bestD <= RADAR_WARN_M) { banner.hidden = false; banner.innerHTML = `<span class="alert-dist">📷 ${Math.round(bestD)} m</span><span class="alert-max">${best.max}</span>`; }
    else { banner.hidden = true; }
}

/* =========================================================
   TESLA (proxy)
   ========================================================= */
async function refreshTesla() {
    if (!TESLA_PROXY_URL) return;
    try {
        const d = await fetch(TESLA_PROXY_URL, { cache: "no-store" }).then((r) => r.json());
        if (d.battery != null) {
            document.getElementById("teslaPct").innerHTML = `${d.battery}<small>%</small>`;
            document.getElementById("teslaBar").style.width = `${Math.max(0, Math.min(100, d.battery))}%`;
        }
        document.getElementById("teslaRange").textContent = d.range_km != null ? `· ${d.range_km} km` : "";
        document.getElementById("teslaBolt").hidden = !d.charging;
        document.getElementById("teslaBar").style.background = d.charging ? "#7CE38B" : "";
    } catch (_) {}
}
refreshTesla();
setInterval(refreshTesla, 30000);

/* =========================================================
   PWA
   ========================================================= */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
    });
}