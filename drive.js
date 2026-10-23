/* MiDash web — driving features layered on top of app.js (shared globals: map, myPos, mySpeed,
   myHeading, radars, routeLine, routeTo, haversine...). Loaded after app.js.
   - search: magnifier + Photon autocomplete + recents/favorites
   - radars: only ahead, round blinking sign, soft beeps, red halo when over the limit
   - speed HUD with the road's limit (Overpass); sign icons on the map; traffic-coloured route
   - car "scene" (road lanes that move with speed) and an options panel */
"use strict";

/* ---------- Options (localStorage) ---------- */
const OPT = Object.assign(
    { sound: true, vol: 0.35, voice: true, tol: 0, warn: 500, ttKey: "", zoomLevel: 0 },
    (() => { try { return JSON.parse(localStorage.getItem("midash.opt")) || {}; } catch (_) { return {}; } })(),
);
function saveOpt() { try { localStorage.setItem("midash.opt", JSON.stringify(OPT)); } catch (_) {} }

const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("midash." + k)) ?? d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem("midash." + k, JSON.stringify(v)); } catch (_) {} },
};

// Voice switch: wrap speak() (app.js calls it by name, so the override is picked up).
const _speak = speak;
speak = function (text, low) { if (OPT.voice) _speak(text, low); };

/* ---------- Soft beeps (WebAudio) ---------- */
let audioCtx = null;
function audio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
}
document.addEventListener("pointerdown", audio, { once: true }); // browsers need a user gesture first
let lastBeep = 0;
function beeps(count, minGap = 2500) {
    if (!OPT.sound) return;
    const now = Date.now();
    if (now - lastBeep < minGap) return;
    lastBeep = now;
    const ac = audio();
    if (!ac) return;
    for (let i = 0; i < count; i++) {
        const t = ac.currentTime + i * 0.27;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 740;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(OPT.vol * 0.5, t + 0.02);
        g.gain.linearRampToValueAtTime(0, t + 0.12);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + 0.14);
    }
}

/* ---------- Road info: speed limit + lanes (Overpass / OpenStreetMap) ---------- */
let road = null; // { maxspeed:number|null, lanes:2|3, highway }
const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
];
let roadLast = { t: 0, pos: null }, roadBusy = false;
function parseMax(v) {
    if (!v) return null;
    const m = String(v).trim();
    const named = { "ES:urban": 50, "ES:rural": 90, "ES:trunk": 100, "ES:motorway": 120, "urban": 50, "rural": 90 };
    if (named[m]) return named[m];
    const n = parseInt(m, 10);
    if (isNaN(n)) return null;
    return /mph/i.test(m) ? Math.round(n * 1.609) : n;
}
async function fetchRoad() {
    if (!myPos || roadBusy) return;
    const now = Date.now();
    if (now - roadLast.t < 8000) return;
    if (roadLast.pos && haversine(myPos[0], myPos[1], roadLast.pos[0], roadLast.pos[1]) < 60 && road) return;
    roadBusy = true; roadLast = { t: now, pos: myPos.slice() };
    const q = `[out:json][timeout:8];way(around:25,${myPos[1]},${myPos[0]})[highway];out tags 6;`;
    for (const ep of OVERPASS) {
        try {
            const r = await fetch(ep + "?data=" + encodeURIComponent(q));
            if (!r.ok) continue;
            const els = (await r.json()).elements || [];
            const pick = els.find((e) => e.tags && e.tags.maxspeed) || els[0];
            if (!pick) { setRoad(null); break; }
            const t = pick.tags, hw = t.highway;
            const nl = parseInt(t.lanes, 10) || 0;
            const big = hw === "motorway" || hw === "trunk" || (t.oneway === "yes" && nl >= 3) || nl >= 4;
            setRoad({ maxspeed: parseMax(t.maxspeed), lanes: big ? 3 : 2, highway: hw });
            break;
        } catch (_) { /* try next endpoint */ }
    }
    roadBusy = false;
}
function setRoad(r) { road = r; renderHud(); renderCarRoad(); }
window.__road = (maxspeed, lanes, hw) => setRoad(maxspeed || lanes ? { maxspeed: maxspeed || null, lanes: lanes || 2, highway: hw } : null);

/* ---------- Speed HUD (bottom left) ---------- */
function signHtml(limit, camera) {
    const inner = camera ? "📷" : (limit ? limit : "––");
    return `<span class="${camera ? "cam" : (limit && String(limit).length > 2 ? "s3" : "")}">${inner}</span>`;
}
function renderHud() {
    document.getElementById("shV").textContent = Math.round(mySpeed);
    const lim = road && road.maxspeed;
    document.getElementById("shSign").innerHTML = signHtml(lim, false);
    document.getElementById("speedHud").classList.toggle("over", !!lim && mySpeed > lim + OPT.tol);
}

/* ---------- Radars: only ahead, round sign, beeps, halo ---------- */
function bearingTo(lon1, lat1, lon2, lat2) {
    const r = (d) => (d * Math.PI) / 180;
    const y = Math.sin(r(lon2 - lon1)) * Math.cos(r(lat2));
    const x = Math.cos(r(lat1)) * Math.sin(r(lat2)) - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(r(lon2 - lon1));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
let nearbyKey = "", radarNearbyData = { type: "FeatureCollection", features: [] };
let radarSeen = null, lastRepeat = 0;
function pushNearby(list) {
    const key = list.map((r) => r.lat + "," + r.lon).join("|");
    if (key === nearbyKey) return;
    nearbyKey = key;
    radarNearbyData = {
        type: "FeatureCollection",
        features: list.map((r) => ({ type: "Feature", geometry: { type: "Point", coordinates: [r.lon, r.lat] }, properties: { max: r.max } })),
    };
    const s = map.getSource("radars");
    if (s) s.setData(radarNearbyData);
}
function onRadarLayerAdded() { const s = map.getSource("radars"); if (s) s.setData(radarNearbyData); }

checkRadarProximity = function () {
    const banner = document.getElementById("alert");
    const halo = document.getElementById("halo");
    if (!myPos || radars.length === 0) { banner.hidden = true; halo.hidden = true; pushNearby([]); return; }
    const moving = mySpeed > 3 && myHeading != null;
    const near = [];
    for (const r of radars) {
        if (Math.abs(r.lat - myPos[1]) > 0.02 || Math.abs(r.lon - myPos[0]) > 0.03) continue;
        const d = haversine(myPos[0], myPos[1], r.lon, r.lat);
        if (d > 1500) continue;
        if (moving) { if (angDiff(bearingTo(myPos[0], myPos[1], r.lon, r.lat), myHeading) > 55) continue; }
        else if (d > 300) continue;
        near.push({ lat: r.lat, lon: r.lon, max: r.max, d });
    }
    near.sort((a, b) => a.d - b.d);
    pushNearby(near);
    const best = near[0];
    if (!best || best.d > OPT.warn) { banner.hidden = true; halo.hidden = true; radarSeen = null; return; }
    const limit = best.max >= 20 && best.max <= 130 ? best.max : null; // `max` isn't always a speed limit
    const over = limit != null && mySpeed > limit + OPT.tol;
    banner.hidden = false;
    banner.innerHTML = `<div class="rsign blink">${signHtml(limit, limit == null)}</div>` +
        `<div class="rb-text"><b>${Math.round(best.d)} m</b><small>Radar</small></div>`;
    halo.hidden = !over;
    const key = best.lat + "," + best.lon, now = Date.now();
    if (key !== radarSeen) { radarSeen = key; beeps(3); }
    else if (over && now - lastRepeat > 7000) { lastRepeat = now; beeps(2, 0); }
};

/* ---------- Trip stats ---------- */
const trip = Object.assign({ dist: 0, sec: 0, max: 0 }, store.get("trip", {}));
let tripLast = null;

/* ---------- Car scene: road lanes + speed + steering ---------- */
let prevHeading = null, prevT = 0, turnRate = 0;
// The 3D scene is driven by how the MAP moves (centre travel and rotation), not by raw GPS.
let visSpeed = 0, visTurn = 0, mvPrev = null, mvLast = 0;
map.on("move", () => {
    const now = performance.now(), c = map.getCenter(), b = map.getBearing();
    if (mvPrev && now - mvPrev.t > 30) {
        const dt = (now - mvPrev.t) / 1000;
        const v = (haversine(mvPrev.lon, mvPrev.lat, c.lng, c.lat) / dt) * 3.6;
        const dB = ((b - mvPrev.b + 540) % 360) - 180;
        visSpeed = visSpeed * 0.7 + Math.min(v, 250) * 0.3;
        visTurn = visTurn * 0.7 + (dB / dt) * 0.3;
        mvPrev = { t: now, lon: c.lng, lat: c.lat, b }; mvLast = now;
        updateCar();
    } else if (!mvPrev) mvPrev = { t: now, lon: c.lng, lat: c.lat, b };
});
setInterval(() => { if (performance.now() - mvLast > 700) { visSpeed *= 0.5; visTurn *= 0.5; if (visSpeed < 1) visSpeed = 0; updateCar(); } }, 400);
function renderCarRoad() {
    const n = road ? road.lanes : 2;
    let svg = '<polygon points="85,0 115,0 180,100 20,100" fill="rgba(10,14,22,.75)"/>';
    for (let k = 1; k < n; k++) {
        const xt = 85 + (30 * k) / n, xb = 20 + (160 * k) / n;
        svg += `<line class="dash" x1="${xt}" y1="0" x2="${xb}" y2="100" stroke="#fff" stroke-opacity=".7" ` +
            `stroke-width="1.2" stroke-dasharray="6 7" vector-effect="non-scaling-stroke"/>`;
    }
    svg += '<line x1="85" y1="0" x2="20" y2="100" stroke="#fff" stroke-opacity=".5" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
    svg += '<line x1="115" y1="0" x2="180" y2="100" stroke="#fff" stroke-opacity=".5" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
    document.getElementById("carRoad").innerHTML = svg;
}
function updateCar() {
    const moving = visSpeed > 3;
    const turnRate = visTurn;
    const road_ = document.getElementById("carRoad");
    road_.style.setProperty("--dash-dur", Math.max(0.12, 3 / Math.max(1, visSpeed / 10)) + "s");
    road_.classList.toggle("moving", moving);
    road_.style.transform = `skewX(${(-turnRate * 0.5).toFixed(1)}deg)`;
    const m = document.getElementById("carModel");
    // Seen from behind (like the Android scene); the car yaws a little into the turn.
    if (moving) {
        m.setAttribute("camera-orbit", `${Math.max(-16, Math.min(16, -turnRate * 0.45)).toFixed(1)}deg 76deg 105%`);
    }
}

/* ---------- Per-fix tick ---------- */
const _onFix = onFix;
onFix = function (lon, lat, speedMs, heading) {
    const prev = myPos ? myPos.slice() : null;
    _onFix(lon, lat, speedMs, heading);
    const now = performance.now();
    if (myHeading != null && prevHeading != null && prevT) {
        const dt = (now - prevT) / 1000;
        if (dt > 0.2 && dt < 5) {
            const d = ((myHeading - prevHeading + 540) % 360) - 180;
            turnRate = turnRate * 0.6 + (d / dt) * 0.4;
        }
    }
    if (myHeading != null) { prevHeading = myHeading; prevT = now; }
    if (prev && mySpeed > 2) {
        const step = haversine(prev[0], prev[1], lon, lat);
        if (step < 200) { trip.dist += step; trip.sec += tripLast ? (now - tripLast) / 1000 : 0; }
        trip.max = Math.max(trip.max, mySpeed);
    }
    tripLast = now;
    if (Math.round(now / 1000) % 10 === 0) store.set("trip", trip);
    renderHud(); updateCar(); fetchRoad();
};
setInterval(() => { if (mySpeed < 3) turnRate *= 0.5; }, 1000);
renderHud(); renderCarRoad();

/* ---------- Sign icons drawn with canvas (STOP, yield, traffic light, pedestrian) ---------- */
function ensureSignImages() {
    if (map.hasImage("sign-stop")) return;
    const mk = (draw) => {
        const c = document.createElement("canvas"); c.width = c.height = 96;
        const g = c.getContext("2d"); draw(g);
        return g.getImageData(0, 0, 96, 96);
    };
    const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
    map.addImage("sign-stop", mk((g) => {
        g.beginPath();
        for (let k = 0; k < 8; k++) {
            const a = ((22.5 + 45 * k) * Math.PI) / 180;
            g.lineTo(48 + 44 * Math.cos(a), 48 + 44 * Math.sin(a));
        }
        g.closePath(); g.fillStyle = "#D32F2F"; g.fill(); g.lineWidth = 5; g.strokeStyle = "#fff"; g.stroke();
        g.fillStyle = "#fff"; g.font = "bold 27px sans-serif"; g.textAlign = "center"; g.fillText("STOP", 48, 58);
    }));
    map.addImage("sign-yield", mk((g) => {
        g.beginPath(); g.moveTo(12, 20); g.lineTo(84, 20); g.lineTo(48, 84); g.closePath();
        g.fillStyle = "#fff"; g.fill(); g.lineWidth = 11; g.lineJoin = "round"; g.strokeStyle = "#D32F2F"; g.stroke();
    }));
    map.addImage("sign-light", mk((g) => {
        rr(g, 28, 6, 40, 84, 12); g.fillStyle = "#263238"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#fff"; g.stroke();
        [["#E53935", 26], ["#FFB300", 48], ["#43A047", 70]].forEach(([col, y]) => {
            g.beginPath(); g.arc(48, y, 11, 0, 7); g.fillStyle = col; g.fill();
        });
    }));
    map.addImage("sign-ped", mk((g) => {
        rr(g, 8, 8, 80, 80, 16); g.fillStyle = "#1565C0"; g.fill(); g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
        g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineWidth = 8; g.lineCap = "round";
        g.beginPath(); g.arc(50, 28, 8, 0, 7); g.fill();
        [[50, 38, 46, 60], [48, 44, 62, 54], [48, 44, 36, 56], [46, 60, 58, 78], [46, 60, 34, 78]].forEach(([a, b, c, d]) => {
            g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
        });
    }));
    map.addImage("sign-other", mk((g) => {
        g.beginPath(); g.arc(48, 48, 24, 0, 7); g.fillStyle = "#78909C"; g.fill(); g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
    }));
}

/* ---------- Traffic-coloured route (TomTom flow API, optional key) ---------- */
function chunkRoute(line, chunkM) {
    const out = []; let cur = [], acc = 0;
    for (let i = 0; i < line.length; i++) {
        cur.push(line[i]);
        if (i > 0) acc += haversine(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
        if (acc >= chunkM && i < line.length - 1) { out.push(cur); cur = [line[i]]; acc = 0; }
    }
    if (cur.length > 1) out.push(cur);
    return out;
}
let trafficRun = 0;
function paintRoute(chunks, levels) {
    window.__routeFC = {
        type: "FeatureCollection",
        features: chunks.map((c, i) => ({ type: "Feature", properties: { lvl: levels[i] || 0 }, geometry: { type: "LineString", coordinates: c } })),
    };
    const s = map.getSource("route");
    if (s) s.setData(window.__routeFC);
}
async function trafficUpdate() {
    const run = ++trafficRun;
    if (!routeLine) return;
    const chunks = chunkRoute(routeLine, 300), levels = new Array(chunks.length).fill(0);
    paintRoute(chunks, levels);
    window.__chunks = chunks;
    if (!OPT.ttKey) return;
    for (let i = 0; i < Math.min(chunks.length, 60); i++) {
        if (run !== trafficRun) return;
        const mid = chunks[i][Math.floor(chunks[i].length / 2)];
        try {
            const r = await fetch("https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json" +
                `?point=${mid[1]},${mid[0]}&unit=KMPH&key=${encodeURIComponent(OPT.ttKey)}`);
            if (!r.ok) continue;
            const f = (await r.json()).flowSegmentData;
            const ratio = f.freeFlowSpeed > 0 ? f.currentSpeed / f.freeFlowSpeed : 1;
            levels[i] = ratio < 0.35 ? 3 : ratio < 0.6 ? 2 : ratio < 0.85 ? 1 : 0;
            paintRoute(chunks, levels);
        } catch (_) {}
    }
}
const _applyRoute = applyRoute;
applyRoute = function (route, dest, opts) {
    window.__routeFC = null;
    _applyRoute(route, dest, opts);
    trafficUpdate();
};
// Debug: paint fake levels on the current route.
window.__traffic = () => { if (window.__chunks) paintRoute(window.__chunks, window.__chunks.map((_, i) => (i + 1) % 4)); };

/* ---------- Search: magnifier + autocomplete + recents/favorites ---------- */
const $s = (id) => document.getElementById(id);
const panel = $s("searchPanel"), input = $s("navSearch"), list = $s("searchList");
let recents = store.get("recents", []), favs = store.get("favs", []);
const same = (a, b) => Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
const isFav = (p) => favs.some((f) => same(f, p));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function addRecent(p) {
    recents = [p, ...recents.filter((r) => !same(r, p))].slice(0, 8);
    store.set("recents", recents);
}
function toggleFav(p) {
    favs = isFav(p) ? favs.filter((f) => !same(f, p)) : [p, ...favs];
    store.set("favs", favs);
}
function pickPlace(p) {
    addRecent(p); panel.hidden = true; input.blur();
    routeTo([p.lon, p.lat]);
}
function row(p, extra = "") {
    const el = document.createElement("div");
    el.className = "sr";
    el.innerHTML = `<div class="sr-t"><b></b><small></small></div>` +
        `<button class="sr-b" data-a="home" title="Guardar como Casa">🏠</button>` +
        `<button class="sr-b" data-a="work" title="Guardar como Trabajo">💼</button>` +
        `<button class="sr-b star${isFav(p) ? " on" : ""}" data-a="fav">${isFav(p) ? "★" : "☆"}</button>`;
    el.querySelector("b").textContent = p.name;
    el.querySelector("small").textContent = p.subtitle || "";
    el.addEventListener("click", (e) => {
        const a = e.target.closest("[data-a]");
        if (!a) return pickPlace(p);
        e.stopPropagation();
        if (a.dataset.a === "fav") { toggleFav(p); renderList(); return; }
        localStorage.setItem("midash.place." + a.dataset.a, JSON.stringify({ lon: p.lon, lat: p.lat }));
        document.querySelector(`.fav-chip[data-place="${a.dataset.a}"]`)?.classList.add("set");
    });
    return el;
}
function section(title, items) {
    if (!items.length) return;
    const h = document.createElement("div"); h.className = "sr-h"; h.textContent = title; list.appendChild(h);
    items.forEach((p) => list.appendChild(row(p)));
}
let remote = [], remoteFor = "";
function renderList() {
    list.innerHTML = "";
    const q = norm(input.value.trim());
    if (!q) { section("Favoritos", favs); section("Recientes", recents.filter((r) => !isFav(r))); return; }
    const local = [...favs, ...recents.filter((r) => !isFav(r))]
        .filter((p) => norm(p.name + " " + (p.subtitle || "")).includes(q));
    if (local.length) { section("Guardados", local); return; }
    if (remoteFor === q) section("Resultados", remote);
    else if (q.length >= 3) { const h = document.createElement("div"); h.className = "sr-h"; h.textContent = "Buscando…"; list.appendChild(h); }
}
let deb = null;
input.addEventListener("input", () => {
    renderList();
    clearTimeout(deb);
    const q = input.value.trim();
    if (q.length < 3) return;
    deb = setTimeout(async () => {
        try {
            let url = "https://photon.komoot.io/api/?limit=6&q=" + encodeURIComponent(q);
            if (myPos) url += `&lat=${myPos[1]}&lon=${myPos[0]}`;
            const js = await fetch(url).then((r) => r.json());
            if (input.value.trim() !== q) return;
            remote = (js.features || []).map((f) => {
                const p = f.properties || {};
                const street = [p.street, p.housenumber].filter(Boolean).join(" ");
                const name = p.name || street || p.city || "Sin nombre";
                const sub = [p.name && street ? street : null, p.city || p.district, p.state, p.country].filter(Boolean).join(", ");
                return { name, subtitle: sub, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
            });
            remoteFor = norm(q);
            renderList();
        } catch (_) {}
    }, 350);
});
$s("searchBtn").addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { renderList(); input.focus(); }
});
$s("navForm").addEventListener("submit", () => { panel.hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { panel.hidden = true; $s("optPanel").hidden = true; } });

/* ---------- Options panel (+ trip stats) ---------- */
const optPanel = $s("optPanel");
function renderOpt() {
    const km = (trip.dist / 1000).toFixed(1), h = Math.floor(trip.sec / 3600), m = Math.floor((trip.sec % 3600) / 60);
    const avg = trip.sec > 5 ? ((trip.dist / trip.sec) * 3.6).toFixed(0) : 0;
    optPanel.innerHTML = `
      <div class="op-h"><b>Opciones</b><button id="opX">✕</button></div>
      <label><input type="checkbox" id="oSound" ${OPT.sound ? "checked" : ""}> Pitidos de radar</label>
      <label>Volumen <input type="range" id="oVol" min="0.05" max="1" step="0.05" value="${OPT.vol}"></label>
      <label><input type="checkbox" id="oVoice" ${OPT.voice ? "checked" : ""}> Voz (navegación y señales)</label>
      <label>Aviso de radar: <b id="oWarnV">${OPT.warn}</b> m <input type="range" id="oWarn" min="200" max="1000" step="50" value="${OPT.warn}"></label>
      <label>Tolerancia: +<b id="oTolV">${OPT.tol}</b> km/h <input type="range" id="oTol" min="0" max="20" step="1" value="${OPT.tol}"></label>
      <label>Zoom del mapa
        <span class="op-zoom">${["Normal","Cerca","Más cerca","Muy cerca"].map((t,i)=>"<button data-z=\""+i+"\" class=\""+(OPT.zoomLevel===i?"on":"")+"\">"+t+"</button>").join("")}</span></label>
      <label>Clave TomTom (tráfico en la ruta)<input type="text" id="oKey" value="${OPT.ttKey}" placeholder="opcional, gratuita en developer.tomtom.com"></label>
      <div class="op-trip"><b>Viaje</b>: ${km} km · ${h}:${String(m).padStart(2, "0")} h · media ${avg} km/h · máx ${Math.round(trip.max)} km/h
        <button id="oReset">Reiniciar</button></div>
      <div class="op-row"><button id="oRec">Borrar recientes</button><button id="oFav">Borrar favoritos</button></div>
      <small>Datos © OpenStreetMap, OpenFreeMap, OSRM, Photon, Overpass.</small>`;
    const $o = (id) => optPanel.querySelector("#" + id);
    $o("opX").onclick = () => (optPanel.hidden = true);
    $o("oSound").onchange = (e) => { OPT.sound = e.target.checked; saveOpt(); };
    $o("oVol").oninput = (e) => { OPT.vol = +e.target.value; saveOpt(); };
    $o("oVol").onchange = () => beeps(1, 0);
    $o("oVoice").onchange = (e) => { OPT.voice = e.target.checked; saveOpt(); };
    $o("oWarn").oninput = (e) => { OPT.warn = +e.target.value; $o("oWarnV").textContent = OPT.warn; saveOpt(); };
    $o("oTol").oninput = (e) => { OPT.tol = +e.target.value; $o("oTolV").textContent = OPT.tol; saveOpt(); };
    optPanel.querySelectorAll(".op-zoom button").forEach((b) => b.onclick = () => {
        OPT.zoomLevel = +b.dataset.z; saveOpt();
        optPanel.querySelectorAll(".op-zoom button").forEach((x) => x.classList.toggle("on", x === b));
        following = true; lastCam = 0; followCamera();
    });
    $o("oKey").onchange = (e) => { OPT.ttKey = e.target.value.trim(); saveOpt(); trafficUpdate(); };
    $o("oReset").onclick = () => { trip.dist = trip.sec = trip.max = 0; store.set("trip", trip); renderOpt(); };
    $o("oRec").onclick = () => { recents = []; store.set("recents", recents); };
    $o("oFav").onclick = () => { favs = []; store.set("favs", favs); };
}
$s("optBtn").addEventListener("click", () => { optPanel.hidden = !optPanel.hidden; if (!optPanel.hidden) renderOpt(); });

/* ---------- Layout v2: car drawer + apps drawer + map type inside options ---------- */
const leftPane = document.querySelector(".pane-left"), appsPane = $s("apps"), mapPane = document.querySelector(".pane-map");
$s("appsBtn").addEventListener("click", () => {
    appsPane.classList.toggle("open");
    if (appsPane.parentElement !== document.body) document.body.appendChild(appsPane); // sits above the fullscreen map
});
document.addEventListener("pointerdown", (e) => {
    if (appsPane.classList.contains("open") && !appsPane.contains(e.target) && e.target !== $s("appsBtn")) appsPane.classList.remove("open");
});
const _renderOpt = renderOpt;
renderOpt = function () {
    _renderOpt();
    const w = document.createElement("div");
    w.innerHTML = "<b>Tipo de mapa</b>";
    w.appendChild(viewBar);
    optPanel.insertBefore(w, optPanel.children[1]);
    viewBar.style.display = "flex";
};
// Keep the view selector out of the map until Options opens it.
document.body.appendChild(viewBar); viewBar.style.display = "none";
const _opt = optPanel;
new MutationObserver(() => { viewBar.style.display = optPanel.contains(viewBar) && !optPanel.hidden ? "flex" : "none"; })
    .observe(optPanel, { attributes: true, childList: true, subtree: false });

/* ---------- Music: small bar at the top-left of the car card; click to open the player ---------- */
const mediaCard = document.querySelector(".card.media"), carCard = document.querySelector(".card.car");
carCard.appendChild(mediaCard);
mediaCard.classList.add("mini");
mediaCard.addEventListener("click", (e) => { if (!e.target.closest("button")) mediaCard.classList.toggle("open"); });
document.addEventListener("pointerdown", (e) => { if (!mediaCard.contains(e.target)) mediaCard.classList.remove("open"); });
