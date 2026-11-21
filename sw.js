// MY GARAGE - sw.js (service worker: membuat aplikasi bisa dibuka tanpa internet)

// Jika Anda mengubah file aplikasi di kemudian hari, naikkan nomor ini (v2, v3, ...)
var CACHE_NAME = "my-garage-v1";

var FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

// 1. Saat pertama dipasang: simpan semua file ke memori perangkat
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(FILES);
    })
  );
  self.skipWaiting();
});

// 2. Saat aktif: hapus simpanan versi lama
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// 3. Saat aplikasi meminta file: pakai simpanan dulu, internet hanya cadangan
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") { return; }
  event.respondWith(
    caches.match(event.request).then(function (found) {
      return found || fetch(event.request).catch(function () {
        return caches.match("./index.html");
      });
    })
  );
});
