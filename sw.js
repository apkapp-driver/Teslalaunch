// Minimal offline cache for the app shell. Map tiles still need the network.
const CACHE = "midash-v1";
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
    // Only serve same-origin shell files from cache; let map/CDN go to network.
    if (url.origin === location.origin) {
        e.respondWith(
            caches.match(e.request).then((hit) => hit || fetch(e.request))
        );
    }
});
