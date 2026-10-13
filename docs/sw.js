// Réseau d'abord, copie locale si hors connexion.
const CACHE = "cherchtravail-v3";
const BASE = ["./", "index.html", "style.css", "docx.js", "app.js", "suivi.js", "lettre.js", "dossier.js", "manifest.webmanifest", "icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  const cle = e.request.url.split("?")[0];
  e.respondWith(fetch(e.request).then((r) => {
    const copie = r.clone(); caches.open(CACHE).then((c) => c.put(cle, copie)); return r;
  }).catch(() => caches.match(cle)));
});
