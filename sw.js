// Offline cache for the app shell. Network-first so updates are picked up as soon as
// you're online; the cache is only the fallback. Map tiles and routing always need the network.
const CACHE = "midash-v4";
const SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./drive.js",
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
    // Only handle same-origin GETs; let map/CDN/API calls go straight to the network.
    if (e.request.method !== "GET" || url.origin !== location.origin) return;
    e.respondWith(
        fetch(e.request)
            .then((res) => {
                if (res.ok && SHELL.some((p) => url.pathname.endsWith(p.replace("./", "/")) || url.pathname === "/")) {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, copy));
                }
                return res;
            })
            .catch(() => caches.match(e.request)),
    );
});
