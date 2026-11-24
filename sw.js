// MY GARAGE - sw.js (service worker: membuat aplikasi bisa dibuka tanpa internet)

// Setiap kali Anda mengubah file aplikasi, naikkan nomor ini (v7, v8, ...)
var CACHE_NAME = "my-garage-v6";

var FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./db.js",
  "./fuel.js",
  "./backup.js",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

// 1. Saat pertama dipasang: simpan semua file ke memori perangkat
//    ("reload" memastikan file yang disimpan adalah versi terbaru dari internet)
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(FILES.map(function (file) {
        return cache.add(new Request(file, { cache: "reload" }));
      }));
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
