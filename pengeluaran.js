// MY GARAGE - pengeluaran.js (aturan pengeluaran: gabungan sumber, filter, statistik, pemeriksaan isian)
// File ini hanya berisi perhitungan. Tidak menyentuh layar atau database.
// Memakai GarageService (tanggal) - jadi service.js harus dimuat lebih dulu.
//
// PRINSIP: satu sumber untuk satu transaksi.
//   BBM, servis, cuci, dan biaya dokumen TIDAK disalin. Daftar transaksi dibangun ulang dari
//   catatan aslinya setiap kali layar dibuka (kumpulkan). Hanya pengeluaran manual yang punya
//   tempat simpan sendiri. Karena itu tidak mungkin ada transaksi ganda, dan setiap perubahan
//   atau penghapusan catatan sumber langsung terbaca di laporan.
var GaragePengeluaran = (function () {
  "use strict";

  var KATEGORI = [
    "BBM", "Servis & Perawatan", "Cuci Kendaraan", "Suku Cadang", "Pajak Kendaraan",
    "Asuransi", "Parkir", "Tol", "Perbaikan", "Lainnya"
  ];

  var SUMBER = {
    bbm: "BBM", servis: "Servis", cuci: "Cuci", dokumen: "Dokumen", manual: "Manual"
  };

  var MAKS_BIAYA = 10000000000;       // Rp 10 miliar
  var MAKS_SISI_FOTO = 1280;
  var MAKS_BERKAS_ASLI = 25 * 1024 * 1024;
  var MAKS_BERKAS_SIMPAN = 3 * 1024 * 1024;
  var TANGGAL_TERAWAL = "1990-01-01";

  // ---------- Tanggal ----------

  function dua(n) { return (n < 10 ? "0" : "") + n; }

  function tambahHari(tgl, n) {
    var t = tgl.split("-");
    var d = new Date(Date.UTC(+t[0], +t[1] - 1, +t[2] + n));
    return d.getUTCFullYear() + "-" + dua(d.getUTCMonth() + 1) + "-" + dua(d.getUTCDate());
  }

  // "2026-11" + n bulan -> "2026-10" dst.
  function tambahBulan(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + "-" + dua(m + 1);
  }

  function selisihBulan(dariYm, keYm) {
    return (+keYm.slice(0, 4) - +dariYm.slice(0, 4)) * 12 + (+keYm.slice(5, 7) - +dariYm.slice(5, 7));
  }

  function hariTerakhirBulan(ym) {
    return new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  }

  // ---------- Kategori dari catatan lama ----------

  // Servis: perbaikan -> "Perbaikan", pajak (nama lama) -> "Pajak Kendaraan", selebihnya "Servis & Perawatan"
  function kategoriServis(jenis) {
    var k = GarageService.kategoriBaku(jenis);
    if (k === "Perbaikan Umum") { return "Perbaikan"; }
    if (k === "Pajak & STNK") { return "Pajak Kendaraan"; }
    return "Servis & Perawatan";
  }

  function biayaSah(x) {
    return typeof x === "number" && isFinite(x) && x > 0;
  }

  // ---------- Menggabungkan sumber ----------
  // d = { kendaraan, bbm, servis, cuci, dokumen, manual } (semua daftar catatan ASLI)
  // Hasil: daftar transaksi. Catatan tanpa biaya (kosong atau 0) tidak dimasukkan - tidak ada nilai karangan.
  function kumpulkan(d) {
    var ada = {};
    (d.kendaraan || []).forEach(function (v) { ada[v.id] = true; });
    var hasil = [];
    var terlihat = {};

    function tambah(t) {
      if (!ada[t.vehicleId] || !biayaSah(t.biaya)) { return; }
      if (terlihat[t.kunci]) { return; } // pengaman: satu kunci hanya sekali
      terlihat[t.kunci] = true;
      hasil.push(t);
    }

    (d.bbm || []).forEach(function (b) {
      tambah({
        kunci: "bbm:" + b.id, sumber: "bbm", otomatis: true, id: b.id, vehicleId: b.vehicleId,
        tanggal: b.tanggal, waktu: b.waktu || "", kategori: "BBM",
        nama: "Isi BBM" + (b.jenisBbm ? " · " + b.jenisBbm : ""),
        lokasi: b.spbu || b.lokasi || "", biaya: b.total, rekam: b
      });
    });
    (d.servis || []).forEach(function (s) {
      tambah({
        kunci: "servis:" + s.id, sumber: "servis", otomatis: true, id: s.id, vehicleId: s.vehicleId,
        tanggal: s.tanggal, waktu: "", kategori: kategoriServis(s.jenis),
        nama: GarageService.kategoriBaku(s.jenis), lokasi: s.bengkel || "", biaya: s.biaya, rekam: s
      });
    });
    (d.cuci || []).forEach(function (c) {
      tambah({
        kunci: "cuci:" + c.id, sumber: "cuci", otomatis: true, id: c.id, vehicleId: c.vehicleId,
        tanggal: c.tanggal, waktu: c.waktu || "", kategori: "Cuci Kendaraan",
        nama: c.jenis, lokasi: c.lokasi || "", biaya: c.biaya, rekam: c
      });
    });
    // Dokumen: hanya STNK (pajak) dan Asuransi yang punya biaya, dan hanya bila biaya + tanggal bayar diisi
    (d.dokumen || []).forEach(function (x) {
      if (x.jenis !== "STNK" && x.jenis !== "Asuransi") { return; }
      if (!GarageService.tanggalValid(x.tanggalBayar)) { return; }
      tambah({
        kunci: "dokumen:" + x.id, sumber: "dokumen", otomatis: true, id: x.id, vehicleId: x.vehicleId,
        tanggal: x.tanggalBayar, waktu: "",
        kategori: x.jenis === "STNK" ? "Pajak Kendaraan" : "Asuransi",
        nama: x.jenis === "STNK" ? "Pajak / STNK" : "Asuransi" + (x.perusahaan ? " · " + x.perusahaan : ""),
        lokasi: "", biaya: x.biaya, rekam: x
      });
    });
    (d.manual || []).forEach(function (m) {
      tambah({
        kunci: "manual:" + m.id, sumber: "manual", otomatis: false, id: m.id, vehicleId: m.vehicleId,
        tanggal: m.tanggal, waktu: m.waktu || "", kategori: m.kategori,
        nama: m.nama, lokasi: m.lokasi || "", biaya: m.biaya, rekam: m
      });
    });
    return hasil;
  }

  // Terbaru di atas: tanggal, lalu jam, lalu nomor
  function urutkan(daftar) {
    return daftar.slice().sort(function (a, b) {
      if (a.tanggal !== b.tanggal) { return a.tanggal < b.tanggal ? 1 : -1; }
      if (a.waktu !== b.waktu) { return a.waktu < b.waktu ? 1 : -1; }
      if (a.sumber !== b.sumber) { return a.sumber < b.sumber ? 1 : -1; }
      return b.id - a.id;
    });
  }

  // ---------- Periode ----------
  // p = { jenis: "semua" | "bulan-ini" | "bulan-lalu" | "tahun-ini" | "30-hari" | "bulan" | "rentang",
  //       bulan: "YYYY-MM", dari: "YYYY-MM-DD", sampai: "YYYY-MM-DD" }
  // Hasil: { dari, sampai } - null berarti tanpa batas.
  function rentang(p, hariIni) {
    var ym = hariIni.slice(0, 7);
    var jenis = p ? p.jenis : "semua";
    if (jenis === "bulan-ini") { return { dari: ym + "-01", sampai: ym + "-" + dua(hariTerakhirBulan(ym)) }; }
    if (jenis === "bulan-lalu") {
      var l = tambahBulan(ym, -1);
      return { dari: l + "-01", sampai: l + "-" + dua(hariTerakhirBulan(l)) };
    }
    if (jenis === "tahun-ini") { return { dari: hariIni.slice(0, 4) + "-01-01", sampai: hariIni.slice(0, 4) + "-12-31" }; }
    if (jenis === "30-hari") { return { dari: tambahHari(hariIni, -29), sampai: hariIni }; }
    if (jenis === "bulan" && p.bulan && /^\d{4}-\d{2}$/.test(p.bulan)) {
      return { dari: p.bulan + "-01", sampai: p.bulan + "-" + dua(hariTerakhirBulan(p.bulan)) };
    }
    if (jenis === "rentang") {
      return { dari: p.dari || null, sampai: p.sampai || null };
    }
    return { dari: null, sampai: null };
  }

  // f = { vehicleId, kategori, dari, sampai, cari }  (semua boleh kosong)
  function saring(daftar, f) {
    f = f || {};
    var cari = (f.cari || "").trim().toLowerCase();
    return daftar.filter(function (t) {
      if (f.vehicleId !== null && f.vehicleId !== undefined && f.vehicleId !== "" && t.vehicleId !== f.vehicleId) { return false; }
      if (f.kategori && t.kategori !== f.kategori) { return false; }
      if (f.dari && t.tanggal < f.dari) { return false; }
      if (f.sampai && t.tanggal > f.sampai) { return false; }
      if (cari) {
        var teks = (t.nama + " " + t.lokasi).toLowerCase();
        if (teks.indexOf(cari) === -1) { return false; }
      }
      return true;
    });
  }

  // ---------- Hitungan ----------

  function jumlahkan(daftar) {
    var s = 0;
    daftar.forEach(function (t) { s += t.biaya; });
    return s;
  }

  function kelompok(daftar, ambilKunci) {
    var peta = {}, urut = [];
    daftar.forEach(function (t) {
      var k = ambilKunci(t);
      if (!peta[k]) { peta[k] = { kunci: k, total: 0, jumlah: 0 }; urut.push(peta[k]); }
      peta[k].total += t.biaya;
      peta[k].jumlah++;
    });
    return urut;
  }

  function denganPersen(baris, total) {
    baris.forEach(function (b) { b.persen = total > 0 ? Math.round(b.total / total * 1000) / 10 : 0; });
    return baris;
  }

  // Semua kategori yang punya pengeluaran, terbesar dulu
  function perKategori(daftar) {
    var total = jumlahkan(daftar);
    var baris = kelompok(daftar, function (t) { return t.kategori; });
    baris.sort(function (a, b) { return b.total - a.total || KATEGORI.indexOf(a.kunci) - KATEGORI.indexOf(b.kunci); });
    return denganPersen(baris.map(function (b) { b.kategori = b.kunci; return b; }), total);
  }

  function perKendaraan(daftar) {
    var total = jumlahkan(daftar);
    var baris = kelompok(daftar, function (t) { return t.vehicleId; });
    baris.sort(function (a, b) { return b.total - a.total; });
    return denganPersen(baris.map(function (b) { b.vehicleId = Number(b.kunci); return b; }), total);
  }

  // n bulan berakhir di akhirYm, urut lama -> baru. Bulan kosong tetap ada (0).
  function perBulan(daftar, akhirYm, n) {
    var peta = {};
    daftar.forEach(function (t) { var k = t.tanggal.slice(0, 7); peta[k] = (peta[k] || 0) + t.biaya; });
    var hasil = [];
    for (var i = n - 1; i >= 0; i--) {
      var k = tambahBulan(akhirYm, -i);
      hasil.push({ kunci: k, total: peta[k] || 0 });
    }
    return hasil;
  }

  // n hari berakhir di akhirTgl
  function perHari(daftar, akhirTgl, n) {
    var peta = {};
    daftar.forEach(function (t) { peta[t.tanggal] = (peta[t.tanggal] || 0) + t.biaya; });
    var hasil = [];
    for (var i = n - 1; i >= 0; i--) {
      var k = tambahHari(akhirTgl, -i);
      hasil.push({ kunci: k, total: peta[k] || 0 });
    }
    return hasil;
  }

  // Tahun-tahun yang punya data, urut lama -> baru (paling banyak n tahun terakhir)
  function perTahun(daftar, n) {
    var baris = kelompok(daftar, function (t) { return t.tanggal.slice(0, 4); });
    baris.sort(function (a, b) { return a.kunci < b.kunci ? -1 : 1; });
    return baris.slice(Math.max(0, baris.length - n)).map(function (b) { return { kunci: b.kunci, total: b.total }; });
  }

  // Rata-rata per bulan = total / jumlah bulan kalender dalam periode (sampai bulan ini saja).
  // Periode tanpa batas awal dihitung dari bulan transaksi pertama.
  function rataBulanan(daftar, dari, sampai, hariIni) {
    if (daftar.length === 0) { return null; }
    var awal = null;
    daftar.forEach(function (t) { if (awal === null || t.tanggal < awal) { awal = t.tanggal; } });
    var mulai = (dari || awal).slice(0, 7);
    var akhirTgl = sampai && sampai < hariIni ? sampai : hariIni;
    var akhir = akhirTgl.slice(0, 7);
    var bulan = Math.max(1, selisihBulan(mulai, akhir) + 1);
    return { rata: Math.round(jumlahkan(daftar) / bulan), bulan: bulan };
  }

  // Bulan ini dibandingkan bulan lalu (bulan penuh)
  function bandingBulan(daftar, hariIni) {
    var ym = hariIni.slice(0, 7);
    var lalu = tambahBulan(ym, -1);
    var ini = 0, sebelum = 0;
    daftar.forEach(function (t) {
      var k = t.tanggal.slice(0, 7);
      if (k === ym) { ini += t.biaya; } else if (k === lalu) { sebelum += t.biaya; }
    });
    return {
      ini: ini, lalu: sebelum, selisih: ini - sebelum,
      persen: sebelum > 0 ? Math.round((ini - sebelum) / sebelum * 1000) / 10 : null
    };
  }

  // ---------- Pemeriksaan isian pengeluaran manual ----------
  // Hasil: teks kesalahan, atau null bila benar.
  function periksaManual(d, hariIni, jamSekarang, tahunKendaraan) {
    function teks(x) { return (typeof x === "string") ? x.trim() : ""; }
    if (KATEGORI.indexOf(d.kategori) === -1) { return "Pilih kategori."; }
    if (teks(d.nama) === "") { return "Isi nama pengeluaran."; }
    if (teks(d.nama).length > 60) { return "Nama pengeluaran maksimal 60 huruf."; }
    if (teks(d.lokasi).length > 80) { return "Lokasi maksimal 80 huruf."; }
    if (teks(d.catatan).length > 200) { return "Catatan maksimal 200 huruf."; }
    if (!GarageService.tanggalValid(d.tanggal)) { return "Isi tanggal dengan tanggal yang benar."; }
    if (d.tanggal > hariIni) { return "Tanggal tidak boleh di masa depan."; }
    if (d.tanggal < TANGGAL_TERAWAL) { return "Tanggal terlalu lama."; }
    if (typeof tahunKendaraan === "number" && parseInt(d.tanggal.slice(0, 4), 10) < tahunKendaraan - 1) {
      return "Tanggal terlalu lama, sebelum kendaraan ini dibuat (tahun " + tahunKendaraan + ").";
    }
    if (d.waktu) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.waktu)) { return "Jam tidak benar."; }
      if (d.tanggal === hariIni && d.waktu > jamSekarang) { return "Jam tidak boleh di masa depan."; }
    }
    if (typeof d.biaya !== "number" || !isFinite(d.biaya) || d.biaya <= 0) { return "Nominal biaya harus lebih besar dari nol."; }
    if (d.biaya > MAKS_BIAYA) { return "Nominal biaya terlalu besar (maksimal Rp 10.000.000.000)."; }
    return null;
  }

  return {
    KATEGORI: KATEGORI, SUMBER: SUMBER, MAKS_BIAYA: MAKS_BIAYA, MAKS_SISI_FOTO: MAKS_SISI_FOTO,
    MAKS_BERKAS_ASLI: MAKS_BERKAS_ASLI, MAKS_BERKAS_SIMPAN: MAKS_BERKAS_SIMPAN,
    tambahHari: tambahHari, tambahBulan: tambahBulan, selisihBulan: selisihBulan,
    kategoriServis: kategoriServis, kumpulkan: kumpulkan, urutkan: urutkan,
    rentang: rentang, saring: saring, jumlahkan: jumlahkan, perKategori: perKategori,
    perKendaraan: perKendaraan, perBulan: perBulan, perHari: perHari, perTahun: perTahun,
    rataBulanan: rataBulanan, bandingBulan: bandingBulan, periksaManual: periksaManual
  };
})();
