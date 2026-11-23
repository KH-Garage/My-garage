// MY GARAGE - backup.js (cadangan terkunci sandi, dibuat dan dibuka di perangkat Anda)
// Sandi tidak pernah disimpan atau dikirim ke mana pun.
// Kunci: PBKDF2 (250.000 putaran) -> AES-GCM 256 bit.
//
// Format cadangan (versi 3):
//   data     = kendaraan, catatan servis, dan daftar foto (terkunci)
//   lampiran = setiap foto dikunci sendiri-sendiri
// Format versi 1 dan 2 (tanpa foto) tetap bisa dipulihkan.

var GarageBackup = (function () {
  var VERSI_SAAT_INI = 3;
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function keBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var teks = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      teks += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(teks);
  }

  function dariBase64(base64) {
    var teks = atob(base64);
    var bytes = new Uint8Array(teks.length);
    for (var i = 0; i < teks.length; i++) { bytes[i] = teks.charCodeAt(i); }
    return bytes;
  }

  // Mengubah sandi menjadi kunci enkripsi
  function buatKunci(sandi, garam) {
    return crypto.subtle.importKey("raw", enc.encode(sandi), "PBKDF2", false, ["deriveKey"])
      .then(function (dasar) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: garam, iterations: 250000, hash: "SHA-256" },
          dasar,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      });
  }

  // ---------- Pemeriksaan isi cadangan ----------

  function teksAtauKosong(x) { return x === undefined || typeof x === "string"; }

  function validKendaraan(item) {
    return item && typeof item === "object" &&
      typeof item.nama === "string" &&
      typeof item.plat === "string" &&
      typeof item.jenis === "string" &&
      typeof item.tahun === "number" &&
      teksAtauKosong(item.merek) && teksAtauKosong(item.model) &&
      teksAtauKosong(item.vin) && teksAtauKosong(item.noMesin) &&
      teksAtauKosong(item.bahanBakar) &&
      (item.odometer === undefined || typeof item.odometer === "number") &&
      (item.fotoId === undefined || item.fotoId === null || typeof item.fotoId === "number");
  }

  function validServis(item) {
    return item && typeof item === "object" &&
      typeof item.vehicleId === "number" &&
      typeof item.tanggal === "string" &&
      typeof item.jenis === "string" &&
      typeof item.km === "number" &&
      typeof item.biaya === "number";
  }

  function validInfoFoto(item) {
    return item && typeof item === "object" &&
      typeof item.id === "number" &&
      (item.vehicleId === null || typeof item.vehicleId === "number") &&
      typeof item.jenis === "string" &&
      typeof item.tipe === "string" && item.tipe.indexOf("image/") === 0 &&
      typeof item.dibuat === "number";
  }

  // ---------- Membuat cadangan ----------

  function buat(sandi) {
    return Promise.all([
      GarageDB.all(),
      GarageDB.serviceAll(),
      GarageDB.attachmentAll()
    ]).then(function (hasil) {
      var kendaraan = hasil[0];
      var servis = hasil[1];
      var foto = hasil[2];
      var garam = crypto.getRandomValues(new Uint8Array(16));

      return buatKunci(sandi, garam).then(function (kunci) {
        var info = foto.map(function (f) {
          return {
            id: f.id,
            vehicleId: (typeof f.vehicleId === "number") ? f.vehicleId : null,
            jenis: f.jenis,
            tipe: f.tipe,
            ukuran: f.ukuran,
            dibuat: f.dibuat
          };
        });
        var iv = crypto.getRandomValues(new Uint8Array(12));
        var isi = enc.encode(JSON.stringify({ kendaraan: kendaraan, servis: servis, lampiran: info }));

        return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, kunci, isi).then(function (terkunci) {
          var paket = {
            aplikasi: "MY GARAGE",
            versi: VERSI_SAAT_INI,
            dibuat: new Date().toISOString(),
            garam: keBase64(garam),
            iv: keBase64(iv),
            data: keBase64(terkunci),
            lampiran: []
          };

          // Setiap foto dikunci sendiri, satu per satu, agar memori iPhone tidak penuh
          var urut = Promise.resolve();
          foto.forEach(function (f) {
            urut = urut.then(function () {
              return f.blob.arrayBuffer();
            }).then(function (isiFoto) {
              var ivFoto = crypto.getRandomValues(new Uint8Array(12));
              return crypto.subtle.encrypt(
                { name: "AES-GCM", iv: ivFoto, additionalData: enc.encode("lampiran:" + f.id) },
                kunci,
                isiFoto
              ).then(function (fotoTerkunci) {
                paket.lampiran.push({ id: f.id, iv: keBase64(ivFoto), data: keBase64(fotoTerkunci) });
              });
            });
          });

          return urut.then(function () { return JSON.stringify(paket); });
        });
      });
    });
  }

  // ---------- Memulihkan cadangan ----------
  // Hasil: { kendaraan, servis, foto } (jumlah masing-masing)
  // Galat: "format" (bukan cadangan MY GARAGE), "versi" (dibuat versi aplikasi yang lebih baru),
  //        "sandi" (sandi salah), "rusak" (foto dalam cadangan rusak).
  // Data saat ini baru diganti SETELAH semuanya berhasil dibuka dan diperiksa.
  function pulihkan(teks, sandi) {
    var paket;
    try { paket = JSON.parse(teks); } catch (e) { return Promise.reject(new Error("format")); }
    if (!paket || paket.aplikasi !== "MY GARAGE" || !paket.garam || !paket.iv || !paket.data) {
      return Promise.reject(new Error("format"));
    }
    if (typeof paket.versi === "number" && paket.versi > VERSI_SAAT_INI) {
      return Promise.reject(new Error("versi"));
    }

    var garam, iv, data;
    try {
      garam = dariBase64(paket.garam);
      iv = dariBase64(paket.iv);
      data = dariBase64(paket.data);
    } catch (e) { return Promise.reject(new Error("format")); }

    var kunciSaya;
    return buatKunci(sandi, garam).then(function (kunci) {
      kunciSaya = kunci;
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, kunci, data);
    }).catch(function () {
      throw new Error("sandi");
    }).then(function (terbuka) {
      var isi;
      try { isi = JSON.parse(dec.decode(terbuka)); } catch (e) { throw new Error("format"); }
      if (!isi || !Array.isArray(isi.kendaraan)) { throw new Error("format"); }

      var servis = isi.servis === undefined ? [] : isi.servis;
      var info = isi.lampiran === undefined ? [] : isi.lampiran;
      var entri = paket.lampiran === undefined ? [] : paket.lampiran;

      if (!Array.isArray(servis) || !Array.isArray(info) || !Array.isArray(entri) ||
          !isi.kendaraan.every(validKendaraan) || !servis.every(validServis) ||
          !info.every(validInfoFoto) || info.length !== entri.length) {
        throw new Error("format");
      }

      var hasilFoto = [];
      var urut = Promise.resolve();
      info.forEach(function (meta) {
        urut = urut.then(function () {
          var e = null;
          for (var i = 0; i < entri.length; i++) {
            if (entri[i] && entri[i].id === meta.id) { e = entri[i]; break; }
          }
          if (!e) { throw new Error("format"); }
          var ivFoto, dataFoto;
          try { ivFoto = dariBase64(e.iv); dataFoto = dariBase64(e.data); }
          catch (x) { throw new Error("format"); }

          return crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivFoto, additionalData: enc.encode("lampiran:" + meta.id) },
            kunciSaya,
            dataFoto
          ).catch(function () {
            throw new Error("rusak");
          }).then(function (isiFoto) {
            hasilFoto.push({
              id: meta.id,
              vehicleId: meta.vehicleId,
              jenis: meta.jenis,
              tipe: meta.tipe,
              ukuran: isiFoto.byteLength,
              dibuat: meta.dibuat,
              blob: new Blob([isiFoto], { type: meta.tipe })
            });
          });
        });
      });

      return urut.then(function () {
        // Kendaraan yang menunjuk ke foto yang tidak ada: kosongkan penunjuknya
        var adaFoto = {};
        hasilFoto.forEach(function (f) { adaFoto[f.id] = true; });
        isi.kendaraan.forEach(function (v) {
          if (v.fotoId && !adaFoto[v.fotoId]) { v.fotoId = null; }
        });
        return GarageDB.replaceAll(isi.kendaraan, servis, hasilFoto);
      }).then(function () {
        return { kendaraan: isi.kendaraan.length, servis: servis.length, foto: hasilFoto.length };
      });
    });
  }

  return { buat: buat, pulihkan: pulihkan };
})();
