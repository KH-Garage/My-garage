// MY GARAGE - carwash.js (aturan cuci kendaraan: jenis, statistik)
// File ini hanya berisi perhitungan. Tidak menyentuh layar atau database.
// Memakai GarageService (tanggal) - jadi service.js harus dimuat lebih dulu.
var GarageCarwash = (function () {
  "use strict";

  var JENIS = [
    "Cuci Eksterior", "Pembersihan Interior", "Cuci Lengkap", "Cuci Premium",
    "Detailing", "Waxing", "Coating", "Lainnya"
  ];

  var MAKS_FOTO = 3;
  var MAKS_DURASI = 1440; // menit (24 jam)

  function lebihBaru(a, b) {
    if (a.tanggal !== b.tanggal) { return a.tanggal > b.tanggal; }
    var wa = a.waktu || "", wb = b.waktu || "";
    if (wa !== wb) { return wa > wb; }
    return (a.id || 0) > (b.id || 0);
  }

  function urutkan(daftar) {
    return daftar.slice().sort(function (a, b) {
      if (lebihBaru(a, b)) { return -1; }
      if (lebihBaru(b, a)) { return 1; }
      return 0;
    });
  }

  // Jam "HH:MM" yang benar
  function waktuValid(t) {
    return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  }

  // Tanggal/jam yang dicatat tidak boleh lewat dari sekarang
  function diMasaDepan(tanggal, waktu, hariIni, jamSekarang) {
    if (tanggal > hariIni) { return true; }
    return tanggal === hariIni && !!waktu && waktu > jamSekarang;
  }

  // Statistik untuk SATU kendaraan. hariIni = "YYYY-MM-DD"
  function statistik(catatan, hariIni) {
    var n = catatan.length;
    var hasil = {
      jumlah: n, terakhir: null, hariSejak: null, rataHari: null, jarakSebelumnya: null,
      bulanIni: 0, tahunIni: 0, total: 0, rataBiaya: null
    };
    if (n === 0) { return hasil; }
    var bulan = hariIni.slice(0, 7);
    var tahun = hariIni.slice(0, 4);
    var tertua = catatan[0], terbaru = catatan[0];
    catatan.forEach(function (c) {
      var b = c.biaya || 0;
      hasil.total += b;
      if (c.tanggal.slice(0, 7) === bulan) { hasil.bulanIni += b; }
      if (c.tanggal.slice(0, 4) === tahun) { hasil.tahunIni += b; }
      if (lebihBaru(c, terbaru)) { terbaru = c; }
      if (lebihBaru(tertua, c)) { tertua = c; }
    });
    hasil.terakhir = terbaru;
    hasil.hariSejak = Math.max(0, GarageService.selisihHari(terbaru.tanggal, hariIni));
    if (n >= 2) {
      var rentang = GarageService.selisihHari(tertua.tanggal, terbaru.tanggal);
      hasil.rataHari = Math.round(rentang / (n - 1) * 10) / 10;
    }
    // Jarak hari kalender antara cuci terbaru dan cuci tepat sebelumnya (0 bila tanggalnya sama)
    if (n >= 2) {
      var urut = urutkan(catatan);
      hasil.jarakSebelumnya = Math.max(0, GarageService.selisihHari(urut[1].tanggal, urut[0].tanggal));
    }
    hasil.rataBiaya = Math.round(hasil.total / n);
    return hasil;
  }

  return {
    JENIS: JENIS, MAKS_FOTO: MAKS_FOTO, MAKS_DURASI: MAKS_DURASI,
    lebihBaru: lebihBaru, urutkan: urutkan, waktuValid: waktuValid,
    diMasaDepan: diMasaDepan, statistik: statistik
  };
})();
