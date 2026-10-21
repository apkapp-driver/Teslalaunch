// Minimal offline cache for the app shell. Map tiles still need the network.
const CACHE = "midash-v2";
const SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.webmanifest",
    "./icon.svg",
];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);
    // Red primero (así las versiones nuevas llegan siempre); la caché solo si no hay conexión.
    if (url.origin === location.origin && !url.pathname.endsWith(".glb")) {
        e.respondWith(
            fetch(e.request).then((res) => {
                const copia = res.clone();
                caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
                return res;
            }).catch(() => caches.match(e.request))
        );
    }
});
