// MY GARAGE - db.js (database di dalam perangkat Anda: IndexedDB)
// Data tidak pernah dikirim ke internet. Semuanya tersimpan di iPhone Anda.
//
// Tujuh "laci" data:
//   vehicles    = daftar kendaraan
//   services    = catatan servis (menunjuk ke kendaraan lewat vehicleId)
//   attachments = foto (menunjuk ke kendaraan lewat vehicleId)
//   fuel        = catatan pengisian BBM (menunjuk ke kendaraan lewat vehicleId)
//   carwash     = catatan cuci kendaraan (menunjuk ke kendaraan lewat vehicleId)
//   documents   = dokumen kendaraan: STNK, asuransi, BPKB, SIM, dll (lewat vehicleId)
//   expenses    = HANYA pengeluaran manual (lewat vehicleId). Pengeluaran dari BBM, servis, cuci,
//                 dan dokumen TIDAK disalin ke sini: laporan membacanya langsung dari catatan aslinya.
//
// Aturan upgrade: laci lama TIDAK PERNAH dihapus atau diubah isinya.
// Versi baru hanya menambah laci baru, jadi data lama selalu aman.

var GarageDB = (function () {
  var DB_NAME = "my-garage-db";
  var DB_VERSION = 7;
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
        if (!db.objectStoreNames.contains("carwash")) {
          var cuci = db.createObjectStore("carwash", { keyPath: "id", autoIncrement: true });
          cuci.createIndex("vehicleId", "vehicleId");
        }
        if (!db.objectStoreNames.contains("documents")) {
          var dok = db.createObjectStore("documents", { keyPath: "id", autoIncrement: true });
          dok.createIndex("vehicleId", "vehicleId");
        }
        if (!db.objectStoreNames.contains("expenses")) {
          var biaya = db.createObjectStore("expenses", { keyPath: "id", autoIncrement: true });
          biaya.createIndex("vehicleId", "vehicleId");
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
          var tx = db.transaction(["vehicles", "services", "attachments", "fuel", "carwash", "documents", "expenses"], "readwrite");
          var servis = tx.objectStore("services");
          var laciBiaya = tx.objectStore("expenses");
          var laciCuci = tx.objectStore("carwash");
          var laciDok = tx.objectStore("documents");
          var laciFoto = tx.objectStore("attachments");
          var laciBBM = tx.objectStore("fuel");
          tx.objectStore("vehicles").delete(id);

          var bacaBBM = laciBBM.index("vehicleId").getAllKeys(id);
          bacaBBM.onsuccess = function () {
            bacaBBM.result.forEach(function (kunci) { laciBBM.delete(kunci); });
          };

          var bacaCuci = laciCuci.index("vehicleId").getAllKeys(id);
          bacaCuci.onsuccess = function () {
            bacaCuci.result.forEach(function (kunci) { laciCuci.delete(kunci); });
          };

          var bacaDok = laciDok.index("vehicleId").getAllKeys(id);
          bacaDok.onsuccess = function () {
            bacaDok.result.forEach(function (kunci) { laciDok.delete(kunci); });
          };

          var bacaBiaya = laciBiaya.index("vehicleId").getAllKeys(id);
          bacaBiaya.onsuccess = function () {
            bacaBiaya.result.forEach(function (kunci) { laciBiaya.delete(kunci); });
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

    // Menyimpan catatan servis baru (tanpa id) atau perubahan (dengan id).
    // foto: undefined = foto struk tidak berubah, null = hapus foto, Blob = foto baru.
    // Foto lama otomatis dihapus saat diganti. Odometer kendaraan ikut naik bila perlu.
    // Semuanya dalam satu transaksi: berhasil semua atau tidak ada yang berubah.
    serviceSave: function (record, foto) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["services", "vehicles", "attachments"], "readwrite");
          var laciServis = tx.objectStore("services");
          var laciKendaraan = tx.objectStore("vehicles");
          var laciFoto = tx.objectStore("attachments");
          var hasilId = null;

          function urusFoto() {
            if (foto === undefined) { return; }
            if (record.fotoId) { laciFoto.delete(record.fotoId); }
            if (foto === null) {
              record.fotoId = null;
              laciServis.put(record);
              return;
            }
            var reqFoto = laciFoto.add({
              vehicleId: record.vehicleId,
              jenis: "foto-servis",
              tipe: foto.type || "image/jpeg",
              ukuran: foto.size,
              blob: foto,
              dibuat: Date.now()
            });
            reqFoto.onsuccess = function () {
              record.fotoId = reqFoto.result;
              laciServis.put(record);
            };
          }

          var req = (record.id === undefined) ? laciServis.add(record) : laciServis.put(record);
          req.onsuccess = function () {
            hasilId = req.result;
            record.id = hasilId;
            urusFoto();
          };

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

    // Menghapus catatan servis beserta foto strukknya
    serviceRemove: function (id) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["services", "attachments"], "readwrite");
          var laciServis = tx.objectStore("services");
          var baca = laciServis.get(id);
          baca.onsuccess = function () {
            var s = baca.result;
            if (s && s.fotoId) { tx.objectStore("attachments").delete(s.fotoId); }
            laciServis.delete(id);
          };
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    // ----- Catatan cuci -----
    carwashAll: function () {
      return run("carwash", "readonly", function (store) { return store.getAll(); });
    },

    // Menyimpan catatan cuci baru (tanpa id) atau perubahan (dengan id).
    // fotoBaru  = daftar foto baru (Blob) yang ditambahkan
    // hapusFoto = daftar nomor foto lama yang dibuang
    // Foto yang dibuang dihapus dari penyimpanan. Odometer kendaraan ikut naik bila perlu.
    // Semuanya dalam satu transaksi: berhasil semua atau tidak ada yang berubah.
    carwashSave: function (record, fotoBaru, hapusFoto) {
      fotoBaru = fotoBaru || [];
      hapusFoto = hapusFoto || [];
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["carwash", "vehicles", "attachments"], "readwrite");
          var laciCuci = tx.objectStore("carwash");
          var laciKendaraan = tx.objectStore("vehicles");
          var laciFoto = tx.objectStore("attachments");
          var hasilId = null;

          var daftarId = (record.fotoIds || []).filter(function (x) { return hapusFoto.indexOf(x) === -1; });
          hapusFoto.forEach(function (x) { laciFoto.delete(x); });

          function simpanCatatan() {
            record.fotoIds = daftarId;
            var req = (record.id === undefined) ? laciCuci.add(record) : laciCuci.put(record);
            req.onsuccess = function () { hasilId = req.result; record.id = hasilId; };
          }

          function tambahFoto(i) {
            if (i >= fotoBaru.length) { simpanCatatan(); return; }
            var blob = fotoBaru[i];
            var r = laciFoto.add({
              vehicleId: record.vehicleId,
              jenis: "foto-cuci",
              tipe: blob.type || "image/jpeg",
              ukuran: blob.size,
              blob: blob,
              dibuat: Date.now()
            });
            r.onsuccess = function () { daftarId.push(r.result); tambahFoto(i + 1); };
          }
          tambahFoto(0);

          if (typeof record.km === "number") {
            var baca = laciKendaraan.get(record.vehicleId);
            baca.onsuccess = function () {
              var v = baca.result;
              if (v && (typeof v.odometer !== "number" || record.km > v.odometer)) {
                v.odometer = record.km;
                v.odometerWaktu = Date.now();
                laciKendaraan.put(v);
              }
            };
          }

          tx.oncomplete = function () { resolve(hasilId); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    // Menghapus catatan cuci beserta semua fotonya
    carwashRemove: function (id) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["carwash", "attachments"], "readwrite");
          var laciCuci = tx.objectStore("carwash");
          var baca = laciCuci.get(id);
          baca.onsuccess = function () {
            var c = baca.result;
            if (c && c.fotoIds) {
              c.fotoIds.forEach(function (x) { tx.objectStore("attachments").delete(x); });
            }
            laciCuci.delete(id);
          };
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    // ----- Dokumen kendaraan -----
    docAll: function () {
      return run("documents", "readonly", function (store) { return store.getAll(); });
    },

    // Menyimpan dokumen baru (tanpa id) atau perubahan (dengan id).
    // fotoBaru  = daftar foto baru (Blob) yang ditambahkan
    // hapusFoto = daftar nomor foto lama yang dibuang (ikut dihapus dari penyimpanan)
    // Semuanya dalam satu transaksi: berhasil semua atau tidak ada yang berubah.
    docSave: function (record, fotoBaru, hapusFoto) {
      fotoBaru = fotoBaru || [];
      hapusFoto = hapusFoto || [];
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["documents", "attachments"], "readwrite");
          var laciDok = tx.objectStore("documents");
          var laciFoto = tx.objectStore("attachments");
          var hasilId = null;

          var daftarId = (record.fotoIds || []).filter(function (x) { return hapusFoto.indexOf(x) === -1; });
          hapusFoto.forEach(function (x) { laciFoto.delete(x); });

          function simpanDokumen() {
            record.fotoIds = daftarId;
            var req = (record.id === undefined) ? laciDok.add(record) : laciDok.put(record);
            req.onsuccess = function () { hasilId = req.result; record.id = hasilId; };
          }

          function tambahFoto(i) {
            if (i >= fotoBaru.length) { simpanDokumen(); return; }
            var blob = fotoBaru[i];
            var r = laciFoto.add({
              vehicleId: record.vehicleId,
              jenis: "foto-dokumen",
              tipe: blob.type || "image/jpeg",
              ukuran: blob.size,
              blob: blob,
              dibuat: Date.now()
            });
            r.onsuccess = function () { daftarId.push(r.result); tambahFoto(i + 1); };
          }
          tambahFoto(0);

          tx.oncomplete = function () { resolve(hasilId); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    // Menghapus dokumen beserta semua fotonya
    docRemove: function (id) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["documents", "attachments"], "readwrite");
          var laciDok = tx.objectStore("documents");
          var baca = laciDok.get(id);
          baca.onsuccess = function () {
            var c = baca.result;
            if (c && c.fotoIds) {
              c.fotoIds.forEach(function (x) { tx.objectStore("attachments").delete(x); });
            }
            laciDok.delete(id);
          };
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    // ----- Pengeluaran manual -----
    expenseAll: function () {
      return run("expenses", "readonly", function (store) { return store.getAll(); });
    },

    // Menyimpan pengeluaran manual baru (tanpa id) atau perubahan (dengan id).
    // foto: undefined = foto struk tidak berubah, null = hapus foto, Blob = foto baru.
    // Foto lama otomatis dihapus saat diganti. Satu transaksi: berhasil semua atau tidak ada yang berubah.
    expenseSave: function (record, foto) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["expenses", "attachments"], "readwrite");
          var laciBiaya = tx.objectStore("expenses");
          var laciFoto = tx.objectStore("attachments");
          var hasilId = null;

          function urusFoto() {
            if (foto === undefined) { return; }
            if (record.fotoId) { laciFoto.delete(record.fotoId); }
            if (foto === null) {
              record.fotoId = null;
              laciBiaya.put(record);
              return;
            }
            var reqFoto = laciFoto.add({
              vehicleId: record.vehicleId,
              jenis: "foto-struk",
              tipe: foto.type || "image/jpeg",
              ukuran: foto.size,
              blob: foto,
              dibuat: Date.now()
            });
            reqFoto.onsuccess = function () {
              record.fotoId = reqFoto.result;
              laciBiaya.put(record);
            };
          }

          var req = (record.id === undefined) ? laciBiaya.add(record) : laciBiaya.put(record);
          req.onsuccess = function () {
            hasilId = req.result;
            record.id = hasilId;
            urusFoto();
          };

          tx.oncomplete = function () { resolve(hasilId); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    },

    // Menghapus pengeluaran manual beserta foto strukknya
    expenseRemove: function (id) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["expenses", "attachments"], "readwrite");
          var laciBiaya = tx.objectStore("expenses");
          var baca = laciBiaya.get(id);
          baca.onsuccess = function () {
            var e = baca.result;
            if (e && e.fotoId) { tx.objectStore("attachments").delete(e.fotoId); }
            laciBiaya.delete(id);
          };
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
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
    replaceAll: function (vehicles, services, attachments, fuel, carwash, documents, expenses) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(["vehicles", "services", "attachments", "fuel", "carwash", "documents", "expenses"], "readwrite");
          var laciKendaraan = tx.objectStore("vehicles");
          var laciBiaya = tx.objectStore("expenses");
          var laciCuci = tx.objectStore("carwash");
          var laciDok = tx.objectStore("documents");
          var laciServis = tx.objectStore("services");
          var laciFoto = tx.objectStore("attachments");
          var laciBBM = tx.objectStore("fuel");
          laciKendaraan.clear();
          laciServis.clear();
          laciFoto.clear();
          laciBBM.clear();
          laciCuci.clear();
          laciDok.clear();
          laciBiaya.clear();
          vehicles.forEach(function (item) { laciKendaraan.put(item); });
          (services || []).forEach(function (item) { laciServis.put(item); });
          (attachments || []).forEach(function (item) { laciFoto.put(item); });
          (fuel || []).forEach(function (item) { laciBBM.put(item); });
          (carwash || []).forEach(function (item) { laciCuci.put(item); });
          (documents || []).forEach(function (item) { laciDok.put(item); });
          (expenses || []).forEach(function (item) { laciBiaya.put(item); });
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    }
  };
})();
