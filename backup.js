// MY GARAGE - backup.js (cadangan terkunci sandi, dibuat dan dibuka di perangkat Anda)
// Sandi tidak pernah disimpan atau dikirim ke mana pun.
// Kunci: PBKDF2 (250.000 putaran) -> AES-GCM 256 bit.
//
// Format cadangan (versi 8):
//   data     = kendaraan, catatan servis, catatan BBM, catatan cuci, dokumen, pengeluaran manual, dan daftar foto (terkunci)
//              (pengeluaran dari BBM/servis/cuci/dokumen tidak disimpan terpisah: ikut catatan sumbernya)
//   lampiran = setiap foto dikunci sendiri-sendiri
// Format versi 1 sampai 7 (tanpa BBM, foto, kolom servis baru, catatan cuci, dokumen, atau pengeluaran manual) tetap bisa dipulihkan.

var GarageBackup = (function () {
  var VERSI_SAAT_INI = 8;
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

  function angkaAtauKosong(x) { return x === undefined || x === null || (typeof x === "number" && isFinite(x)); }

  function validServis(item) {
    return item && typeof item === "object" &&
      typeof item.vehicleId === "number" &&
      typeof item.tanggal === "string" &&
      typeof item.jenis === "string" &&
      typeof item.km === "number" &&
      typeof item.biaya === "number" &&
      // Kolom baru (Tahap 3) - semuanya boleh tidak ada, karena cadangan lama tidak punya
      teksAtauKosong(item.bengkel) && teksAtauKosong(item.produk) && teksAtauKosong(item.catatan) &&
      angkaAtauKosong(item.biayaPart) && angkaAtauKosong(item.biayaJasa) &&
      angkaAtauKosong(item.jatuhTempoKm) &&
      (item.jatuhTempoTanggal === undefined || item.jatuhTempoTanggal === null ||
        (typeof item.jatuhTempoTanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.jatuhTempoTanggal))) &&
      (item.pengingat === undefined || typeof item.pengingat === "boolean") &&
      (item.fotoId === undefined || item.fotoId === null || typeof item.fotoId === "number");
  }

  function validCuci(item) {
    return item && typeof item === "object" &&
      typeof item.id === "number" &&
      typeof item.vehicleId === "number" &&
      typeof item.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.tanggal) &&
      (item.waktu === undefined || item.waktu === null || (typeof item.waktu === "string" && /^\d{2}:\d{2}$/.test(item.waktu))) &&
      (item.km === undefined || item.km === null || (typeof item.km === "number" && isFinite(item.km))) &&
      typeof item.jenis === "string" &&
      (item.lokasi === undefined || typeof item.lokasi === "string") &&
      typeof item.biaya === "number" && isFinite(item.biaya) &&
      (item.durasi === undefined || item.durasi === null || (typeof item.durasi === "number" && isFinite(item.durasi))) &&
      (item.catatan === undefined || typeof item.catatan === "string") &&
      (item.fotoIds === undefined || (Array.isArray(item.fotoIds) && item.fotoIds.every(function (x) { return typeof x === "number"; })));
  }

  function teksOpsional(x) { return x === undefined || x === null || typeof x === "string"; }
  function tanggalOpsional(x) {
    return x === undefined || x === null || x === "" || (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x));
  }

  function validDokumen(item) {
    return item && typeof item === "object" &&
      typeof item.id === "number" &&
      typeof item.vehicleId === "number" &&
      (item.jenis === "STNK" || item.jenis === "Asuransi" || item.jenis === "BPKB" || item.jenis === "SIM" || item.jenis === "Lainnya") &&
      teksOpsional(item.nama) && teksOpsional(item.nomor) && teksOpsional(item.perusahaan) &&
      teksOpsional(item.perlindungan) && teksOpsional(item.catatan) &&
      tanggalOpsional(item.tanggalTerbit) && tanggalOpsional(item.tanggalMulai) && tanggalOpsional(item.tanggalBerakhir) &&
      tanggalOpsional(item.pajakTahunan) && tanggalOpsional(item.stnk5Tahun) && tanggalOpsional(item.berlakuSampai) &&
      (item.pengingat === undefined || typeof item.pengingat === "boolean") &&
      // Biaya dan tanggal bayar (Tahap 6) - boleh tidak ada
      angkaAtauKosong(item.biaya) && tanggalOpsional(item.tanggalBayar) &&
      (item.fotoIds === undefined || (Array.isArray(item.fotoIds) && item.fotoIds.every(function (x) { return typeof x === "number"; })));
  }

  var KATEGORI_BIAYA = ["BBM", "Servis & Perawatan", "Cuci Kendaraan", "Suku Cadang", "Pajak Kendaraan", "Asuransi", "Parkir", "Tol", "Perbaikan", "Lainnya"];

  function validPengeluaran(item) {
    return item && typeof item === "object" &&
      typeof item.id === "number" &&
      typeof item.vehicleId === "number" &&
      typeof item.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.tanggal) &&
      (item.waktu === undefined || item.waktu === null || item.waktu === "" || (typeof item.waktu === "string" && /^\d{2}:\d{2}$/.test(item.waktu))) &&
      KATEGORI_BIAYA.indexOf(item.kategori) !== -1 &&
      typeof item.nama === "string" &&
      typeof item.biaya === "number" && isFinite(item.biaya) && item.biaya > 0 &&
      teksOpsional(item.lokasi) && teksOpsional(item.catatan) &&
      (item.fotoId === undefined || item.fotoId === null || typeof item.fotoId === "number");
  }

  function validBBM(item) {
    return item && typeof item === "object" &&
      typeof item.id === "number" &&
      typeof item.vehicleId === "number" &&
      typeof item.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.tanggal) &&
      (item.waktu === undefined || item.waktu === null || typeof item.waktu === "string") &&
      typeof item.km === "number" &&
      typeof item.liter === "number" && item.liter > 0 &&
      typeof item.hargaPerLiter === "number" &&
      typeof item.total === "number" &&
      typeof item.penuh === "boolean" &&
      typeof item.jenisBbm === "string" &&
      teksAtauKosong(item.spbu) && teksAtauKosong(item.lokasi);
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
      GarageDB.attachmentAll(),
      GarageDB.fuelAll(),
      GarageDB.carwashAll(),
      GarageDB.docAll(),
      GarageDB.expenseAll()
    ]).then(function (hasil) {
      var kendaraan = hasil[0];
      var servis = hasil[1];
      var foto = hasil[2];
      var bbm = hasil[3];
      var cuci = hasil[4];
      var dokumen = hasil[5];
      var pengeluaran = hasil[6];
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
        var isi = enc.encode(JSON.stringify({ kendaraan: kendaraan, servis: servis, bbm: bbm, cuci: cuci, dokumen: dokumen, pengeluaran: pengeluaran, lampiran: info }));

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
  // Hasil: { kendaraan, servis, bbm, cuci, dokumen, pengeluaran, foto } (jumlah masing-masing)
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
      var bbm = isi.bbm === undefined ? [] : isi.bbm;
      var cuci = isi.cuci === undefined ? [] : isi.cuci;
      var dokumen = isi.dokumen === undefined ? [] : isi.dokumen;
      var pengeluaran = isi.pengeluaran === undefined ? [] : isi.pengeluaran;
      var info = isi.lampiran === undefined ? [] : isi.lampiran;
      var entri = paket.lampiran === undefined ? [] : paket.lampiran;

      if (!Array.isArray(servis) || !Array.isArray(bbm) || !Array.isArray(cuci) || !Array.isArray(dokumen) || !Array.isArray(pengeluaran) || !Array.isArray(info) || !Array.isArray(entri) ||
          !isi.kendaraan.every(validKendaraan) || !servis.every(validServis) ||
          !bbm.every(validBBM) || !cuci.every(validCuci) || !dokumen.every(validDokumen) || !pengeluaran.every(validPengeluaran) ||
          !info.every(validInfoFoto) || info.length !== entri.length) {
        throw new Error("format");
      }

      // Setiap catatan BBM harus menunjuk ke kendaraan yang ada di cadangan
      var idKendaraan = {};
      isi.kendaraan.forEach(function (v) { idKendaraan[v.id] = true; });
      if (!bbm.every(function (b) { return idKendaraan[b.vehicleId] === true; }) ||
          !cuci.every(function (c) { return idKendaraan[c.vehicleId] === true; }) ||
          !dokumen.every(function (x) { return idKendaraan[x.vehicleId] === true; }) ||
          !pengeluaran.every(function (x) { return idKendaraan[x.vehicleId] === true; })) {
        throw new Error("format");
      }

      // Nomor pengeluaran manual tidak boleh kembar (mencegah transaksi ganda saat memulihkan)
      var idBiaya = {};
      if (!pengeluaran.every(function (x) { if (idBiaya[x.id]) { return false; } idBiaya[x.id] = true; return true; })) {
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
        // Sama untuk foto struk servis
        servis.forEach(function (s) {
          if (s.fotoId && !adaFoto[s.fotoId]) { s.fotoId = null; }
        });
        // Sama untuk foto cuci: buang penunjuk ke foto yang tidak ada
        cuci.forEach(function (c) {
          c.fotoIds = (c.fotoIds || []).filter(function (x) { return adaFoto[x] === true; });
        });
        // Sama untuk foto dokumen: buang penunjuk ke foto yang tidak ada
        dokumen.forEach(function (x) {
          x.fotoIds = (x.fotoIds || []).filter(function (id) { return adaFoto[id] === true; });
        });
        // Sama untuk foto struk pengeluaran manual
        pengeluaran.forEach(function (x) {
          if (x.fotoId && !adaFoto[x.fotoId]) { x.fotoId = null; }
        });
        return GarageDB.replaceAll(isi.kendaraan, servis, hasilFoto, bbm, cuci, dokumen, pengeluaran);
      }).then(function () {
        return { kendaraan: isi.kendaraan.length, servis: servis.length, bbm: bbm.length, cuci: cuci.length, dokumen: dokumen.length, pengeluaran: pengeluaran.length, foto: hasilFoto.length };
      });
    });
  }

  return { buat: buat, pulihkan: pulihkan };
})();
