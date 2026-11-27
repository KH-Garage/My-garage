// MY GARAGE - dokumen.js (aturan dokumen kendaraan: jenis, status, pengingat, pemeriksaan isian)
// File ini hanya berisi perhitungan. Tidak menyentuh layar atau database.
// Memakai GarageService (tanggal) - jadi service.js harus dimuat lebih dulu.
var GarageDokumen = (function () {
  "use strict";

  var JENIS = ["STNK", "Asuransi", "BPKB", "SIM", "Lainnya"];

  var PERLINDUNGAN = [
    "All Risk (Komprehensif)",
    "TLO (Kerugian Total)",
    "Tanggung Jawab Hukum Pihak Ketiga",
    "Kecelakaan Diri",
    "Lainnya"
  ];

  var HARI_SEGERA = 30;       // "Segera Kedaluwarsa" bila sisa waktu 30 hari atau kurang
  var MAKS_FOTO = 3;
  var MAKS_SISI_FOTO = 1600;  // dokumen perlu tetap terbaca, jadi sedikit lebih besar dari foto lain
  var MAKS_BERKAS_ASLI = 25 * 1024 * 1024;  // foto asli dari kamera/galeri
  var MAKS_BERKAS_SIMPAN = 3 * 1024 * 1024; // hasil setelah diperkecil

  // Jenis yang digantikan bila ada dokumen sejenis yang masa berlakunya lebih panjang
  var BISA_DIGANTIKAN = { "STNK": true, "Asuransi": true };

  var BATAS_TAHUN_DEPAN = 7305; // 20 tahun, dalam hari
  var TANGGAL_TERAWAL = "1990-01-01";
  var MAKS_BIAYA = 10000000000;

  // Semua tanggal jatuh tempo yang dimiliki sebuah dokumen
  function daftarJatuhTempo(r) {
    var hasil = [];
    function tambah(label, tgl) {
      if (GarageService.tanggalValid(tgl)) { hasil.push({ label: label, tanggal: tgl }); }
    }
    if (r.jenis === "STNK") {
      tambah("Pajak tahunan", r.pajakTahunan);
      tambah("STNK 5 tahunan", r.stnk5Tahun);
    } else if (r.jenis === "Asuransi") {
      tambah("Polis berakhir", r.tanggalBerakhir);
    } else if (r.jenis === "SIM" || r.jenis === "Lainnya") {
      tambah("Berlaku sampai", r.berlakuSampai);
    }
    return hasil;
  }

  // Dokumen berlaku sampai akhir tanggal jatuh tempo (hari-H masih berlaku)
  function statusDariSisa(sisaHari) {
    if (sisaHari < 0) { return "kedaluwarsa"; }
    if (sisaHari <= HARI_SEGERA) { return "segera"; }
    return "aktif";
  }

  // Tahap pengingat: 30 hari, 14 hari, 7 hari, hari ini, atau terlambat. null = belum perlu.
  function tingkatPengingat(sisaHari) {
    if (sisaHari < 0) { return "terlambat"; }
    if (sisaHari === 0) { return "hari-ini"; }
    if (sisaHari <= 7) { return "7"; }
    if (sisaHari <= 14) { return "14"; }
    if (sisaHari <= 30) { return "30"; }
    return null;
  }

  // Tanggal jatuh tempo paling akhir milik dokumen ("" bila tidak ada)
  function kunciAkhir(r) {
    var m = "";
    daftarJatuhTempo(r).forEach(function (x) { if (x.tanggal > m) { m = x.tanggal; } });
    return m;
  }

  // Sudah ada dokumen sejenis (kendaraan sama) yang berlaku lebih lama = ini sudah diperbarui
  function digantikan(r, semua) {
    if (!BISA_DIGANTIKAN[r.jenis]) { return false; }
    var k = kunciAkhir(r);
    if (k === "") { return false; }
    for (var i = 0; i < semua.length; i++) {
      var o = semua[i];
      if (o === r || o.id === r.id) { continue; }
      if (o.vehicleId !== r.vehicleId || o.jenis !== r.jenis) { continue; }
      if (kunciAkhir(o) > k) { return true; }
    }
    return false;
  }

  var BOBOT = { kedaluwarsa: 0, segera: 1, aktif: 2, diganti: 3 };

  // Analisis satu dokumen
  function analisis(r, semua, hariIni) {
    var item = daftarJatuhTempo(r).map(function (x) {
      var sisa = GarageService.selisihHari(hariIni, x.tanggal);
      return { label: x.label, tanggal: x.tanggal, sisaHari: sisa, status: statusDariSisa(sisa), tingkat: tingkatPengingat(sisa) };
    });
    var diganti = digantikan(r, semua);
    var status = "aktif";
    item.forEach(function (x) { if (BOBOT[x.status] < BOBOT[status]) { status = x.status; } });
    if (diganti) { status = "diganti"; }
    return { rekam: r, item: item, status: status, diganti: diganti };
  }

  // Semua dokumen satu kendaraan, yang paling mendesak di atas
  function daftar(dokumenKendaraan, hariIni) {
    var hasil = dokumenKendaraan.map(function (r) { return analisis(r, dokumenKendaraan, hariIni); });
    hasil.sort(function (a, b) {
      if (BOBOT[a.status] !== BOBOT[b.status]) { return BOBOT[a.status] - BOBOT[b.status]; }
      var sa = a.item.length ? Math.min.apply(null, a.item.map(function (x) { return x.sisaHari; })) : 1e9;
      var sb = b.item.length ? Math.min.apply(null, b.item.map(function (x) { return x.sisaHari; })) : 1e9;
      if (sa !== sb) { return sa - sb; }
      return JENIS.indexOf(a.rekam.jenis) - JENIS.indexOf(b.rekam.jenis);
    });
    return hasil;
  }

  // Pengingat dari daftar analisis. Yang sudah diperbarui atau pengingatnya dimatikan tidak dihitung.
  function pengingat(hasilAnalisis) {
    var p = [];
    hasilAnalisis.forEach(function (a) {
      if (a.diganti || a.rekam.pengingat === false) { return; }
      a.item.forEach(function (x) {
        if (x.tingkat !== null) {
          p.push({ rekam: a.rekam, label: x.label, tanggal: x.tanggal, sisaHari: x.sisaHari, tingkat: x.tingkat });
        }
      });
    });
    p.sort(function (a, b) { return a.sisaHari - b.sisaHari; });
    return p;
  }

  function ringkasan(hasilAnalisis) {
    var r = { total: hasilAnalisis.length, aktif: 0, segera: 0, kedaluwarsa: 0, diganti: 0 };
    hasilAnalisis.forEach(function (a) { r[a.status]++; });
    return r;
  }

  // Memeriksa isian formulir. Hasil: teks kesalahan, atau null bila semuanya benar.
  function periksa(d, hariIni, tahunKendaraan) {
    function teks(x) { return (typeof x === "string") ? x.trim() : ""; }
    function ada(x) { return teks(x) !== ""; }
    function tgl(x, nama) {
      if (!ada(x)) { return null; }
      if (!GarageService.tanggalValid(x)) { return nama + " tidak benar."; }
      return null;
    }
    var batasAkhir = hariIni;
    if (JENIS.indexOf(d.jenis) === -1) { return "Pilih jenis dokumen."; }
    if (teks(d.nama).length > 60) { return "Nama dokumen maksimal 60 huruf."; }
    if (d.jenis === "Lainnya" && !ada(d.nama)) { return "Isi nama dokumen."; }
    if (teks(d.nomor).length > 40) { return "Nomor maksimal 40 karakter."; }
    if (teks(d.catatan).length > 120) { return "Catatan maksimal 120 huruf."; }
    if (teks(d.perusahaan).length > 60) { return "Nama perusahaan maksimal 60 huruf."; }

    var kolom = [
      [d.tanggalTerbit, "Tanggal terbit"], [d.tanggalMulai, "Tanggal mulai"], [d.tanggalBerakhir, "Tanggal berakhir"],
      [d.pajakTahunan, "Jatuh tempo pajak tahunan"], [d.stnk5Tahun, "Jatuh tempo STNK 5 tahunan"], [d.berlakuSampai, "Tanggal berlaku sampai"]
    ];
    for (var i = 0; i < kolom.length; i++) {
      var e = tgl(kolom[i][0], kolom[i][1]);
      if (e) { return e; }
    }

    if (ada(d.tanggalTerbit) && d.tanggalTerbit > batasAkhir) { return "Tanggal terbit tidak boleh di masa depan."; }
    if (ada(d.tanggalTerbit) && (d.jenis === "STNK" || d.jenis === "BPKB") &&
        parseInt(d.tanggalTerbit.slice(0, 4), 10) < tahunKendaraan - 1) {
      return "Tanggal terbit terlalu lama, sebelum kendaraan ini dibuat (tahun " + tahunKendaraan + ").";
    }
    if (ada(d.tanggalTerbit) && d.tanggalTerbit < TANGGAL_TERAWAL) { return "Tanggal terbit terlalu lama."; }

    // Tanggal jatuh tempo: wajar, dan tidak sebelum tanggal terbit
    var jatuh = [[d.pajakTahunan, "pajak tahunan"], [d.stnk5Tahun, "STNK 5 tahunan"], [d.berlakuSampai, "berlaku sampai"], [d.tanggalBerakhir, "berakhir"]];
    for (var j = 0; j < jatuh.length; j++) {
      var t = jatuh[j][0];
      if (!ada(t)) { continue; }
      if (t < TANGGAL_TERAWAL || GarageService.selisihHari(hariIni, t) > BATAS_TAHUN_DEPAN) {
        return "Tanggal " + jatuh[j][1] + " tidak masuk akal (maksimal 20 tahun dari sekarang).";
      }
      if (d.jenis !== "Asuransi" && ada(d.tanggalTerbit) && t < d.tanggalTerbit) {
        return "Tanggal " + jatuh[j][1] + " tidak boleh sebelum tanggal terbit.";
      }
    }

    // Biaya (Tahap 6): hanya STNK dan Asuransi. Biaya dan tanggal bayar harus diisi berpasangan.
    if (d.jenis === "STNK" || d.jenis === "Asuransi") {
      var adaBiaya = d.biaya !== null && d.biaya !== undefined && d.biaya !== "";
      if (adaBiaya) {
        if (typeof d.biaya !== "number" || !isFinite(d.biaya) || d.biaya <= 0) { return "Biaya harus lebih besar dari nol."; }
        if (d.biaya > MAKS_BIAYA) { return "Biaya terlalu besar (maksimal Rp 10.000.000.000)."; }
        if (!ada(d.tanggalBayar)) { return "Isi tanggal pembayaran, atau kosongkan biaya."; }
      } else if (ada(d.tanggalBayar)) {
        return "Isi biaya yang dibayar, atau kosongkan tanggal pembayaran.";
      }
      if (ada(d.tanggalBayar)) {
        if (!GarageService.tanggalValid(d.tanggalBayar)) { return "Tanggal pembayaran tidak benar."; }
        if (d.tanggalBayar > hariIni) { return "Tanggal pembayaran tidak boleh di masa depan."; }
        if (d.tanggalBayar < TANGGAL_TERAWAL) { return "Tanggal pembayaran terlalu lama."; }
      }
    }

    if (d.jenis === "STNK" && !ada(d.pajakTahunan) && !ada(d.stnk5Tahun)) {
      return "Isi minimal satu jatuh tempo: pajak tahunan atau STNK 5 tahunan.";
    }
    if (d.jenis === "Asuransi") {
      if (!ada(d.perusahaan)) { return "Isi nama perusahaan asuransi."; }
      if (PERLINDUNGAN.indexOf(d.perlindungan) === -1) { return "Pilih jenis perlindungan."; }
      if (!ada(d.tanggalMulai)) { return "Isi tanggal mulai polis."; }
      if (!ada(d.tanggalBerakhir)) { return "Isi tanggal berakhir polis."; }
      if (d.tanggalBerakhir <= d.tanggalMulai) { return "Tanggal berakhir harus setelah tanggal mulai."; }
      if (GarageService.selisihHari(d.tanggalMulai, d.tanggalBerakhir) > 3660) { return "Masa polis terlalu panjang (maksimal 10 tahun)."; }
      if (d.tanggalMulai < TANGGAL_TERAWAL || parseInt(d.tanggalMulai.slice(0, 4), 10) < tahunKendaraan - 1) {
        return "Tanggal mulai polis terlalu lama, sebelum kendaraan ini dibuat (tahun " + tahunKendaraan + ").";
      }
    }
    return null;
  }

  return {
    JENIS: JENIS, PERLINDUNGAN: PERLINDUNGAN, HARI_SEGERA: HARI_SEGERA, MAKS_FOTO: MAKS_FOTO,
    MAKS_SISI_FOTO: MAKS_SISI_FOTO, MAKS_BERKAS_ASLI: MAKS_BERKAS_ASLI, MAKS_BERKAS_SIMPAN: MAKS_BERKAS_SIMPAN,
    daftarJatuhTempo: daftarJatuhTempo, statusDariSisa: statusDariSisa, tingkatPengingat: tingkatPengingat,
    digantikan: digantikan, analisis: analisis, daftar: daftar, pengingat: pengingat,
    ringkasan: ringkasan, periksa: periksa
  };
})();
