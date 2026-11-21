// MY GARAGE - db.js (database di dalam perangkat Anda: IndexedDB)
// Data tidak pernah dikirim ke internet. Semuanya tersimpan di iPhone Anda.

var GarageDB = (function () {
  var DB_NAME = "my-garage-db";
  var DB_VERSION = 1;
  var dbPromise = null;

  // Membuka database (dan membuat "laci" kendaraan jika belum ada)
  function open() {
    if (dbPromise) { return dbPromise; }
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("vehicles")) {
          db.createObjectStore("vehicles", { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  // Menjalankan satu pekerjaan pada laci "vehicles"
  function run(mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("vehicles", mode);
        var req = work(tx.objectStore("vehicles"));
        tx.oncomplete = function () { resolve(req.result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  return {
    all: function () {
      return run("readonly", function (store) { return store.getAll(); });
    },
    add: function (vehicle) {
      return run("readwrite", function (store) { return store.add(vehicle); });
    },
    remove: function (id) {
      return run("readwrite", function (store) { return store.delete(id); });
    },
    // Mengosongkan laci lalu mengisinya dengan daftar baru (dipakai saat memulihkan cadangan)
    replaceAll: function (items) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction("vehicles", "readwrite");
          var store = tx.objectStore("vehicles");
          store.clear();
          items.forEach(function (item) { store.put(item); });
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    }
  };
})();
