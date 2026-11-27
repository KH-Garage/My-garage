// MY GARAGE - service.js (aturan perawatan: kategori, total biaya, jadwal & status)
// File ini hanya berisi perhitungan. Tidak menyentuh layar atau database.
var GarageService = (function () {
  "use strict";

  var KATEGORI = [
    "Oli Mesin", "Oli Transmisi", "Filter Oli", "Filter Udara", "Filter Kabin/AC",
    "Busi", "Kampas & Cakram Rem", "Ban", "Aki", "Air Radiator (Coolant)",
    "Minyak Rem", "Spooring", "Balancing", "Servis Berkala", "Perbaikan Umum", "Lainnya"
  ];

  // Nama lama (Tahap 1-2) dibaca sebagai kategori baru. Data lama TIDAK diubah.
  var NAMA_LAMA = {
    "Ganti Oli": "Oli Mesin",
    "Rem": "Kampas & Cakram Rem",
    "Perbaikan": "Perbaikan Umum"
  };

  // Kategori ini tidak menggantikan jadwal lama (perbaikan bukan "tanda sudah diservis")
  var TANPA_PENGGANTI = { "Perbaikan Umum": true, "Lainnya": true, "Pajak & STNK": true };

  var HARI_SEGERA = 30;
  var KM_SEGERA = 500;

  function kategoriBaku(jenis) {
    return NAMA_LAMA[jenis] || jenis;
  }

  function hitungTotal(part, jasa) {
    var p = (typeof part === "number" && isFinite(part)) ? part : 0;
    var j = (typeof jasa === "number" && isFinite(jasa)) ? jasa : 0;
    return p + j;
  }

  // Tanggal "YYYY-MM-DD" yang benar-benar ada di kalender (termasuk tahun kabisat)
  function tanggalValid(teks) {
    if (typeof teks !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(teks)) { return false; }
    var t = teks.split("-");
    var y = +t[0], m = +t[1], d = +t[2];
    if (y < 1900 || y > 2200) { return false; }
    var x = new Date(Date.UTC(y, m - 1, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
  }

  function hariKe(teks) {
    var t = teks.split("-");
    return Math.round(Date.UTC(+t[0], +t[1] - 1, +t[2]) / 86400000);
  }

  // b - a dalam hari
  function selisihHari(a, b) {
    return hariKe(b) - hariKe(a);
  }

  function adaJadwal(r) {
    return !!r && (tanggalValid(r.jatuhTempoTanggal) ||
      (typeof r.jatuhTempoKm === "number" && isFinite(r.jatuhTempoKm)));
  }

  // Apakah a lebih baru dari b (tanggal, lalu km, lalu nomor catatan)
  function lebihBaru(a, b) {
    if (a.tanggal !== b.tanggal) { return a.tanggal > b.tanggal; }
    if (a.km !== b.km) { return a.km > b.km; }
    return (a.id || 0) > (b.id || 0);
  }

  // Jadwal sebuah catatan sudah "selesai" bila ada servis kategori sama yang lebih baru
  function digantikan(rec, semua) {
    var kat = kategoriBaku(rec.jenis);
    if (TANPA_PENGGANTI[kat]) { return false; }
    for (var i = 0; i < semua.length; i++) {
      var o = semua[i];
      if (o === rec || o.id === rec.id) { continue; }
      if (o.vehicleId !== rec.vehicleId) { continue; }
      if (kategoriBaku(o.jenis) !== kat) { continue; }
      if (lebihBaru(o, rec)) { return true; }
    }
    return false;
  }

  // Status satu catatan. Jatuh tempo bila TANGGAL tercapai ATAU ODOMETER tercapai.
  function statusCatatan(rec, semua, hariIni, odo) {
    var sisaHari = tanggalValid(rec.jatuhTempoTanggal) ? selisihHari(hariIni, rec.jatuhTempoTanggal) : null;
    var sisaKm = (typeof rec.jatuhTempoKm === "number" && isFinite(rec.jatuhTempoKm) && typeof odo === "number")
      ? rec.jatuhTempoKm - odo : null;
    var tercapaiTanggal = sisaHari !== null && sisaHari <= 0;
    var tercapaiKm = sisaKm !== null && sisaKm <= 0;
    var status;
    if (rec.pengingat === false) { status = "nonaktif"; }
    else if (digantikan(rec, semua)) { status = "selesai"; }
    else if (tercapaiTanggal || tercapaiKm) { status = "terlambat"; }
    else if ((sisaHari !== null && sisaHari <= HARI_SEGERA) || (sisaKm !== null && sisaKm <= KM_SEGERA)) { status = "segera"; }
    else { status = "akan"; }
    return {
      rekam: rec, kategori: kategoriBaku(rec.jenis), status: status,
      aktif: status === "akan" || status === "segera" || status === "terlambat",
      sisaHari: sisaHari, sisaKm: sisaKm,
      tercapaiTanggal: tercapaiTanggal, tercapaiKm: tercapaiKm
    };
  }

  var URUT = { terlambat: 0, segera: 1, akan: 2, nonaktif: 3, selesai: 4 };

  // Semua jadwal satu kendaraan, yang paling mendesak di atas
  function jadwal(servisKendaraan, hariIni, odo) {
    var hasil = [];
    for (var i = 0; i < servisKendaraan.length; i++) {
      if (adaJadwal(servisKendaraan[i])) {
        hasil.push(statusCatatan(servisKendaraan[i], servisKendaraan, hariIni, odo));
      }
    }
    hasil.sort(function (a, b) {
      if (URUT[a.status] !== URUT[b.status]) { return URUT[a.status] - URUT[b.status]; }
      var ah = a.sisaHari === null ? 1e9 : a.sisaHari;
      var bh = b.sisaHari === null ? 1e9 : b.sisaHari;
      if (ah !== bh) { return ah - bh; }
      var ak = a.sisaKm === null ? 1e12 : a.sisaKm;
      var bk = b.sisaKm === null ? 1e12 : b.sisaKm;
      return ak - bk;
    });
    return hasil;
  }

  function ringkasan(semua) {
    var total = 0, terakhir = null;
    for (var i = 0; i < semua.length; i++) {
      total += semua[i].biaya || 0;
      if (!terakhir || lebihBaru(semua[i], terakhir)) { terakhir = semua[i]; }
    }
    return { jumlah: semua.length, totalBiaya: total, terakhir: terakhir };
  }

  return {
    KATEGORI: KATEGORI, HARI_SEGERA: HARI_SEGERA, KM_SEGERA: KM_SEGERA,
    kategoriBaku: kategoriBaku, hitungTotal: hitungTotal, tanggalValid: tanggalValid,
    selisihHari: selisihHari, adaJadwal: adaJadwal, lebihBaru: lebihBaru,
    digantikan: digantikan, statusCatatan: statusCatatan, jadwal: jadwal, ringkasan: ringkasan
  };
})();
