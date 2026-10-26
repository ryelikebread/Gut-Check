// Offline cache. Bump VERSION whenever any file in public/ changes.
const VERSION = "gut-check-v5";
const FILES = ["./", "index.html", "style.css", "app.js", "lib/core.js", "lib/devil.js", "manifest.webmanifest",
  "skins/pip.js", "skins/tribunal.js", "skins/mentor.js", "skins/prosecutor.js", "skins/owl.js", "skins/classic.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return; // API calls always go to the network
  if (/\/icons\//.test(url.pathname)) { e.respondWith(caches.match(req).then(hit => hit || fetch(req))); return; }
  // Pages and scripts: network first so updates show up, cache when offline.
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
});
