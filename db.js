// MY GARAGE - db.js (database di dalam perangkat Anda: IndexedDB)
// Data tidak pernah dikirim ke internet. Semuanya tersimpan di iPhone Anda.
//
// Empat "laci" data:
//   vehicles    = daftar kendaraan
//   services    = catatan servis (menunjuk ke kendaraan lewat vehicleId)
//   attachments = foto (menunjuk ke kendaraan lewat vehicleId)
//   fuel        = catatan pengisian BBM (menunjuk ke kendaraan lewat vehicleId)
//
// Aturan upgrade: laci lama TIDAK PERNAH dihapus atau diubah isinya.
// Versi baru hanya menambah laci baru, jadi data lama selalu aman.

var GarageDB = (function () {
  var DB_NAME = "my-garage-db";
  var DB_VERSION = 4;
  var dbPromise = null;

  // Membuka database (dan membuat laci yang belum ada)
  function open() {
    if (dbPromise) { return dbPromise; }
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("vehicles")) {
          db.createObjectStore("vehicles", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("services")) {
          db.createObjectStore("services", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("attachments")) {
          var lampiran = db.createObjectStore("attachments", { keyPath: "id", autoIncrement: true });
          lampiran.createIndex("vehicleId", "vehicleId");
        }
        if (!db.objectStoreNames.contains("fuel")) {
          var bbm = db.createObjectStore("fuel", { keyPath: "id", autoIncrement: true });
          bbm.createIndex("vehicleId", "vehicleId");
        }
      };
      req.onsuccess = function () {
        var db = req.result;
        // Jika versi baru aplikasi dibuka di tempat lain, lepaskan sambungan ini
        db.onversionchange = function () { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  // Menjalankan satu pekerjaan pada satu laci
  function run(namaLaci, mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(namaLaci, mode);
        var req = work(tx.objectStore(namaLaci));
        tx.oncomplete = function () { resolve(req.result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  return {
    // ----- Kendaraan -----
    all: function () {
      return run("vehicles", "readonly", function (store) { return store.getAll(); });
    },

    // Menyimpan kendaraan baru (tanpa id) atau perubahan (dengan id).
    // foto: undefined = foto tidak berubah, null = hapus foto, Blob = foto baru.
    // Semuanya dalam satu transaksi: berhasil semua atau tidak ada yang berubah.
    // Hasil: id kendaraan.
    saveVehicle: function (vehicle, foto) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["vehicles", "attachments"], "readwrite");
          var laciKendaraan = tx.objectStore("vehicles");
          var laciFoto = tx.objectStore("attachments");
          var hasilId = null;

          function urusFoto(id) {
            if (foto === undefined) { return; }
            if (vehicle.fotoId) { laciFoto.delete(vehicle.fotoId); }
            if (foto === null) {
              vehicle.fotoId = null;
              laciKendaraan.put(vehicle);
              return;
            }
            var reqFoto = laciFoto.add({
              vehicleId: id,
              jenis: "foto-kendaraan",
              tipe: foto.type || "image/jpeg",
              ukuran: foto.size,
              blob: foto,
              dibuat: Date.now()
            });
            reqFoto.onsuccess = function () {
              vehicle.fotoId = reqFoto.result;
              laciKendaraan.put(vehicle);
            };
          }

          var reqKendaraan = (vehicle.id === undefined)
            ? laciKendaraan.add(vehicle)
            : laciKendaraan.put(vehicle);
          reqKendaraan.onsuccess = function () {
            hasilId = reqKendaraan.result;
            vehicle.id = hasilId;
            urusFoto(hasilId);
          };

          tx.oncomplete = function () { resolve(hasilId); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    // Menghapus kendaraan DAN semua catatan servis, BBM, serta fotonya
    remove: function (id) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["vehicles", "services", "attachments", "fuel"], "readwrite");
          var servis = tx.objectStore("services");
          var laciFoto = tx.objectStore("attachments");
          var laciBBM = tx.objectStore("fuel");
          tx.objectStore("vehicles").delete(id);

          var bacaBBM = laciBBM.index("vehicleId").getAllKeys(id);
          bacaBBM.onsuccess = function () {
            bacaBBM.result.forEach(function (kunci) { laciBBM.delete(kunci); });
          };

          var bacaServis = servis.getAll();
          bacaServis.onsuccess = function () {
            bacaServis.result.forEach(function (s) {
              if (s.vehicleId === id) { servis.delete(s.id); }
            });
          };

          var bacaFoto = laciFoto.index("vehicleId").getAllKeys(id);
          bacaFoto.onsuccess = function () {
            bacaFoto.result.forEach(function (kunci) { laciFoto.delete(kunci); });
          };

          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    // ----- Catatan servis -----
    serviceAll: function () {
      return run("services", "readonly", function (store) { return store.getAll(); });
    },

    // Menambah catatan servis. Jika odometernya lebih tinggi dari odometer kendaraan,
    // odometer kendaraan ikut naik (dalam satu transaksi).
    serviceAdd: function (record) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["services", "vehicles"], "readwrite");
          var laciKendaraan = tx.objectStore("vehicles");
          tx.objectStore("services").add(record);

          var baca = laciKendaraan.get(record.vehicleId);
          baca.onsuccess = function () {
            var v = baca.result;
            if (v && (typeof v.odometer !== "number" || record.km > v.odometer)) {
              v.odometer = record.km;
              v.odometerWaktu = Date.now();
              laciKendaraan.put(v);
            }
          };

          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    serviceRemove: function (id) {
      return run("services", "readwrite", function (store) { return store.delete(id); });
    },

    // ----- Catatan BBM -----
    fuelAll: function () {
      return run("fuel", "readonly", function (store) { return store.getAll(); });
    },

    // Menyimpan pengisian BBM baru (tanpa id) atau perubahan (dengan id).
    // Jika odometernya lebih tinggi dari odometer kendaraan, odometer kendaraan ikut naik.
    // Odometer kendaraan tidak pernah diturunkan otomatis. Semuanya dalam satu transaksi.
    // Hasil: id catatan.
    fuelSave: function (record) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["fuel", "vehicles"], "readwrite");
          var laciKendaraan = tx.objectStore("vehicles");
          var laciBBM = tx.objectStore("fuel");
          var hasilId = null;

          var simpan = (record.id === undefined) ? laciBBM.add(record) : laciBBM.put(record);
          simpan.onsuccess = function () { hasilId = simpan.result; };

          var baca = laciKendaraan.get(record.vehicleId);
          baca.onsuccess = function () {
            var v = baca.result;
            if (v && (typeof v.odometer !== "number" || record.km > v.odometer)) {
              v.odometer = record.km;
              v.odometerWaktu = Date.now();
              laciKendaraan.put(v);
            }
          };

          tx.oncomplete = function () { resolve(hasilId); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    fuelRemove: function (id) {
      return run("fuel", "readwrite", function (store) { return store.delete(id); });
    },

    // ----- Foto -----
    attachmentGet: function (id) {
      return run("attachments", "readonly", function (store) { return store.get(id); });
    },
    attachmentAll: function () {
      return run("attachments", "readonly", function (store) { return store.getAll(); });
    },

    // Mengosongkan semua laci lalu mengisinya dengan data baru (dipakai saat memulihkan cadangan)
    replaceAll: function (vehicles, services, attachments, fuel) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["vehicles", "services", "attachments", "fuel"], "readwrite");
          var laciKendaraan = tx.objectStore("vehicles");
          var laciServis = tx.objectStore("services");
          var laciFoto = tx.objectStore("attachments");
          var laciBBM = tx.objectStore("fuel");
          laciKendaraan.clear();
          laciServis.clear();
          laciFoto.clear();
          laciBBM.clear();
          vehicles.forEach(function (item) { laciKendaraan.put(item); });
          (services || []).forEach(function (item) { laciServis.put(item); });
          (attachments || []).forEach(function (item) { laciFoto.put(item); });
          (fuel || []).forEach(function (item) { laciBBM.put(item); });
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    }
  };
})();
