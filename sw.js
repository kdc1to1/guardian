// sw.js — নেটওয়ার্ক-ফার্স্ট: সবসময় সর্বশেষ ভার্সন আনে, অফলাইনে থাকলে ক্যাশ থেকে দেখায়
const CACHE_NAME = "kdc-shell-v2";

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = req.url;
  if (req.method !== "GET") return;
  if (url.includes("firestore.googleapis.com") || url.includes("identitytoolkit") || url.includes("securetoken")) return;
  if (!url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
