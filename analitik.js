// MY GARAGE - analitik.js (statistik dan analisis kendaraan)
// File ini hanya berisi perhitungan. Tidak menyentuh layar atau database, dan tidak menyimpan apa pun.
// Semua angka dihitung ulang dari catatan ASLI (BBM, servis, cuci, dokumen, pengeluaran manual).
// Urutan muat: service.js, carwash.js, fuel.js, dokumen.js, pengeluaran.js, lalu file ini.
//
// Aturan penting:
//   - Data yang belum bisa dihitung hasilnya null (layar menulis "Belum ada data"), BUKAN 0.
//   - Setiap kendaraan dihitung sendiri-sendiri; angka gabungan hanya menjumlahkan hasil per kendaraan.
//   - Pengeluaran memakai GaragePengeluaran.kumpulkan, jadi tidak ada transaksi ganda.
var GarageAnalitik = (function () {
  "use strict";

  var MIN_JARAK_BIAYA_KM = 100; // jarak minimal agar biaya per km masuk akal

  function angka(x) { return typeof x === "number" && isFinite(x); }

  function dalam(tanggal, r) {
    if (r.dari && tanggal < r.dari) { return false; }
    if (r.sampai && tanggal > r.sampai) { return false; }
    return true;
  }

  function jumlahBulan(dari, sampai, hariIni, awalData) {
    var mulai = (dari || awalData || hariIni).slice(0, 7);
    var akhirTgl = sampai && sampai < hariIni ? sampai : hariIni;
    return Math.max(1, GaragePengeluaran.selisihBulan(mulai, akhirTgl.slice(0, 7)) + 1);
  }

  function bulat1(x) { return Math.round(x * 10) / 10; }

  // ---------- Odometer ----------
  // Bacaan odometer dari catatan BBM, servis, dan cuci (yang mengisi km).
  // Urutan: tanggal, lalu km. Bacaan yang LEBIH RENDAH dari bacaan sebelumnya diabaikan (tidak valid).
  function bacaanOdometer(vehicleId, d) {
    var semua = [];
    (d.bbm || []).forEach(function (b) {
      if (b.vehicleId === vehicleId && angka(b.km)) { semua.push({ tanggal: b.tanggal, km: b.km, sumber: "bbm", id: b.id }); }
    });
    (d.servis || []).forEach(function (s) {
      if (s.vehicleId === vehicleId && angka(s.km)) { semua.push({ tanggal: s.tanggal, km: s.km, sumber: "servis", id: s.id }); }
    });
    (d.cuci || []).forEach(function (c) {
      if (c.vehicleId === vehicleId && angka(c.km)) { semua.push({ tanggal: c.tanggal, km: c.km, sumber: "cuci", id: c.id }); }
    });
    semua.sort(function (a, b) {
      if (a.tanggal !== b.tanggal) { return a.tanggal < b.tanggal ? -1 : 1; }
      return a.km - b.km;
    });
    var sah = [], diabaikan = 0, maks = -1;
    semua.forEach(function (x) {
      if (x.km < maks) { diabaikan++; return; }
      maks = x.km;
      sah.push(x);
    });
    return { sah: sah, diabaikan: diabaikan, jumlah: semua.length };
  }

  // Jarak tempuh dalam periode = odometer terakhir sampai akhir periode - odometer awal.
  // Odometer awal = bacaan terakhir SEBELUM periode; bila tidak ada, bacaan pertama di dalam periode.
  function jarakDalamPeriode(bac, r) {
    var sah = bac.sah;
    var sampaiAkhir = sah.filter(function (x) { return !r.sampai || x.tanggal <= r.sampai; });
    var hasil = { jarak: null, kmAwal: null, kmAkhir: null, tglAwal: null, tglAkhir: null, bacaan: sah.length, diabaikan: bac.diabaikan };
    if (sampaiAkhir.length === 0) { return hasil; }
    var akhir = sampaiAkhir[sampaiAkhir.length - 1];
    var awal = null;
    if (r.dari) {
      for (var i = sampaiAkhir.length - 1; i >= 0; i--) {
        if (sampaiAkhir[i].tanggal < r.dari) { awal = sampaiAkhir[i]; break; }
      }
    }
    if (!awal) {
      for (var j = 0; j < sampaiAkhir.length; j++) {
        if (!r.dari || sampaiAkhir[j].tanggal >= r.dari) { awal = sampaiAkhir[j]; break; }
      }
    }
    if (!awal || awal === akhir || akhir.km - awal.km <= 0) { return hasil; }
    hasil.jarak = akhir.km - awal.km;
    hasil.kmAwal = awal.km; hasil.kmAkhir = akhir.km;
    hasil.tglAwal = awal.tanggal; hasil.tglAkhir = akhir.tanggal;
    return hasil;
  }

  // ---------- BBM ----------
  function analisisBBM(vehicleId, d, r) {
    var semuaKendaraan = (d.bbm || []).filter(function (b) { return b.vehicleId === vehicleId; });
    // km/L dihitung dari SEMUA catatan kendaraan (interval bergantung pada catatan sebelumnya),
    // lalu hanya interval yang ditutup (pengisian penuh berikutnya) di dalam periode yang dipakai.
    var h = GarageFuel.hitung(semuaKendaraan);
    var dalamPeriode = semuaKendaraan.filter(function (b) { return dalam(b.tanggal, r); });
    var interval = [];
    GarageFuel.urutkan(semuaKendaraan).forEach(function (b) {
      var i = h.info[b.id];
      if (i && i.status === "interval" && dalam(b.tanggal, r)) {
        interval.push({ id: b.id, tanggal: b.tanggal, jarak: i.jarak, liter: i.liter, biaya: i.biaya, kmPerLiter: i.kmPerLiter, wajar: i.wajar });
      }
    });
    var sah = interval.filter(function (x) { return x.wajar; });
    var jarak = 0, liter = 0, biaya = 0;
    sah.forEach(function (x) { jarak += x.jarak; liter += x.liter; biaya += x.biaya; });
    var totalLiter = 0, totalBiaya = 0, penuh = 0;
    dalamPeriode.forEach(function (b) { totalLiter += b.liter; totalBiaya += b.total; if (b.penuh) { penuh++; } });

    var peta = {};
    dalamPeriode.forEach(function (b) {
      var k = b.tanggal.slice(0, 7);
      if (!peta[k]) { peta[k] = { kunci: k, liter: 0, biaya: 0, isi: 0, jarak: 0, literSah: 0 }; }
      peta[k].liter += b.liter; peta[k].biaya += b.total; peta[k].isi++;
    });
    sah.forEach(function (x) {
      var k = x.tanggal.slice(0, 7);
      if (!peta[k]) { peta[k] = { kunci: k, liter: 0, biaya: 0, isi: 0, jarak: 0, literSah: 0 }; }
      peta[k].jarak += x.jarak; peta[k].literSah += x.liter;
    });

    var jenis = GarageFuel.daftarJenis(dalamPeriode);
    var harga = jenis.map(function (j) {
      var rh = GarageFuel.riwayatHarga(dalamPeriode, j);
      return { jenis: j, titik: rh.titik, ringkasan: rh.ringkasan };
    });

    return {
      jumlah: dalamPeriode.length, penuh: penuh, totalLiter: totalLiter, totalBiaya: totalBiaya,
      interval: interval, intervalSah: sah.length, tidakWajar: interval.length - sah.length,
      jarakSah: jarak, literSah: liter, biayaSah: biaya,
      kmPerLiter: (sah.length > 0 && liter > 0) ? jarak / liter : null,
      perBulan: peta, harga: harga
    };
  }

  // ---------- Servis ----------
  function analisisServis(vehicleId, d, r, hariIni, odo) {
    var semua = (d.servis || []).filter(function (s) { return s.vehicleId === vehicleId; });
    var catatan = semua.filter(function (s) { return dalam(s.tanggal, r); });
    var total = 0, adaBiaya = 0;
    var kat = {}, urut = [];
    var kunjungan = {};
    catatan.forEach(function (s) {
      var b = angka(s.biaya) ? s.biaya : 0;
      total += b;
      if (b > 0) { adaBiaya++; }
      var k = GarageService.kategoriBaku(s.jenis);
      if (!kat[k]) { kat[k] = { kategori: k, jumlah: 0, total: 0, terakhir: "" }; urut.push(kat[k]); }
      kat[k].jumlah++; kat[k].total += b;
      if (s.tanggal > kat[k].terakhir) { kat[k].terakhir = s.tanggal; }
      if (!kunjungan[s.tanggal]) { kunjungan[s.tanggal] = { tanggal: s.tanggal, km: null }; }
      if (angka(s.km) && (kunjungan[s.tanggal].km === null || s.km > kunjungan[s.tanggal].km)) { kunjungan[s.tanggal].km = s.km; }
    });
    urut.sort(function (a, b) { return b.total - a.total || b.jumlah - a.jumlah; });
    var visit = Object.keys(kunjungan).sort().map(function (t) { return kunjungan[t]; });

    var rataHari = null, rataKm = null;
    if (visit.length >= 2) {
      rataHari = bulat1(GarageService.selisihHari(visit[0].tanggal, visit[visit.length - 1].tanggal) / (visit.length - 1));
      var dgKm = visit.filter(function (v) { return v.km !== null; });
      if (dgKm.length >= 2) {
        var rentangKm = dgKm[dgKm.length - 1].km - dgKm[0].km;
        if (rentangKm > 0) { rataKm = Math.round(rentangKm / (dgKm.length - 1)); }
      }
    }
    var awal = visit.length ? visit[0].tanggal : null;
    var bulan = jumlahBulan(r.dari, r.sampai, hariIni, awal);
    var jadwal = GarageService.jadwal(semua, hariIni, odo).filter(function (j) { return j.aktif; });

    return {
      jumlah: catatan.length, kunjungan: visit.length,
      total: catatan.length ? total : null, adaBiaya: adaBiaya,
      perKategori: urut, terbesar: (urut.length && urut[0].total > 0) ? urut[0] : null,
      rataHari: rataHari, rataKm: rataKm,
      perBulan: visit.length ? bulat1(visit.length / bulan) : null,
      jadwal: jadwal
    };
  }

  // ---------- Cuci ----------
  function analisisCuci(vehicleId, d, r, hariIni, transaksiCuci) {
    var catatan = (d.cuci || []).filter(function (c) { return c.vehicleId === vehicleId && dalam(c.tanggal, r); });
    var st = GarageCarwash.statistik(catatan, hariIni);
    var berbiaya = catatan.filter(function (c) { return angka(c.biaya) && c.biaya > 0; });
    var total = 0;
    berbiaya.forEach(function (c) { total += c.biaya; });
    var awal = null;
    catatan.forEach(function (c) { if (awal === null || c.tanggal < awal) { awal = c.tanggal; } });
    var bulan = jumlahBulan(r.dari, r.sampai, hariIni, awal);
    var peta = {};
    transaksiCuci.forEach(function (t) { var k = t.tanggal.slice(0, 7); peta[k] = (peta[k] || 0) + t.biaya; });
    return {
      jumlah: catatan.length, berbiaya: berbiaya.length, tanpaBiaya: catatan.length - berbiaya.length,
      total: berbiaya.length ? total : null,
      rataBiaya: berbiaya.length ? Math.round(total / berbiaya.length) : null,
      rataHari: st.rataHari, perBulan: catatan.length ? bulat1(catatan.length / bulan) : null,
      perBulanBiaya: peta
    };
  }

  // ---------- Satu kendaraan ----------
  function odometerSekarang(v, d) {
    var tinggi = (typeof v.odometer === "number") ? v.odometer : 0;
    [["bbm", "km"], ["servis", "km"], ["cuci", "km"]].forEach(function (p) {
      (d[p[0]] || []).forEach(function (x) {
        if (x.vehicleId === v.id && angka(x[p[1]]) && x[p[1]] > tinggi) { tinggi = x[p[1]]; }
      });
    });
    return tinggi;
  }

  function analisisKendaraan(v, d, r, hariIni, transaksi) {
    var milik = transaksi.filter(function (t) { return t.vehicleId === v.id; });
    var dlm = milik.filter(function (t) { return dalam(t.tanggal, r); });
    var total = GaragePengeluaran.jumlahkan(dlm);
    var odo = jarakDalamPeriode(bacaanOdometer(v.id, d), r);

    // Biaya per km: pengeluaran pada rentang tanggal pembacaan odometer (dalam periode) / jarak
    var bpk = { nilai: null, biaya: null, jarak: odo.jarak };
    if (odo.jarak !== null && odo.jarak >= MIN_JARAK_BIAYA_KM) {
      var dari = (r.dari && r.dari > odo.tglAwal) ? r.dari : odo.tglAwal;
      var sampai = (r.sampai && r.sampai < odo.tglAkhir) ? r.sampai : odo.tglAkhir;
      var biaya = GaragePengeluaran.jumlahkan(milik.filter(function (t) { return t.tanggal >= dari && t.tanggal <= sampai; }));
      if (biaya > 0) { bpk.nilai = biaya / odo.jarak; bpk.biaya = biaya; }
    }
    var servis = analisisServis(v.id, d, r, hariIni, odometerSekarang(v, d));
    var transCuci = dlm.filter(function (t) { return t.sumber === "cuci"; });
    return {
      vehicleId: v.id, kendaraan: v, jenis: v.jenis || "",
      pengeluaran: { total: dlm.length ? total : null, jumlah: dlm.length, transaksi: dlm, perKategori: GaragePengeluaran.perKategori(dlm) },
      odometer: odo, biayaPerKm: bpk,
      bbm: analisisBBM(v.id, d, r),
      servis: servis,
      cuci: analisisCuci(v.id, d, r, hariIni, transCuci)
    };
  }

  // ---------- Dokumen (status saat ini, mengikuti kendaraan - bukan periode) ----------
  function statusDokumen(ids, d, hariIni) {
    var hasil = { aktif: 0, segera: 0, kedaluwarsa: 0, diganti: 0, total: 0, mendesak: [] };
    ids.forEach(function (id) {
      var milik = (d.dokumen || []).filter(function (x) { return x.vehicleId === id; });
      GarageDokumen.daftar(milik, hariIni).forEach(function (a) {
        hasil.total++;
        hasil[a.status]++;
        if (a.status === "kedaluwarsa" || a.status === "segera") {
          var terdekat = a.item.length ? a.item.slice().sort(function (x, y) { return x.sisaHari - y.sisaHari; })[0] : null;
          hasil.mendesak.push({ vehicleId: id, rekam: a.rekam, status: a.status, item: terdekat });
        }
      });
    });
    hasil.mendesak.sort(function (a, b) {
      var sa = a.item ? a.item.sisaHari : 1e9, sb = b.item ? b.item.sisaHari : 1e9;
      return sa - sb;
    });
    return hasil;
  }

  // Harga BBM per jenis dari semua kendaraan terpilih (jenis BBM yang sama sebanding antarkendaraan).
  // Jenis yang berbeda tidak pernah dicampur. Urut: yang terakhir dipakai di depan.
  function gabungHarga(per) {
    var peta = {}, urut = [];
    per.forEach(function (p) {
      p.bbm.harga.forEach(function (h) {
        if (!peta[h.jenis]) { peta[h.jenis] = { jenis: h.jenis, titik: [] }; urut.push(peta[h.jenis]); }
        peta[h.jenis].titik = peta[h.jenis].titik.concat(h.titik);
      });
    });
    urut.forEach(function (j) {
      j.titik.sort(function (a, b) {
        var ka = a.tanggal + " " + a.waktu, kb = b.tanggal + " " + b.waktu;
        return ka < kb ? -1 : (ka > kb ? 1 : 0);
      });
      var t = j.titik, n = t.length, lt = 0, lb = 0, min = t[0].harga, max = t[0].harga;
      t.forEach(function (x) { lt += x.liter; lb += x.total; if (x.harga < min) { min = x.harga; } if (x.harga > max) { max = x.harga; } });
      j.ringkasan = {
        jumlah: n, terakhir: t[n - 1].harga, tanggalTerakhir: t[n - 1].tanggal,
        sebelumnya: n > 1 ? t[n - 2].harga : null,
        selisih: n > 1 ? t[n - 1].harga - t[n - 2].harga : null,
        terendah: min, tertinggi: max, rataRata: lt > 0 ? lb / lt : null
      };
    });
    urut.sort(function (a, b) {
      var x = a.ringkasan.tanggalTerakhir, y = b.ringkasan.tanggalTerakhir;
      return x < y ? 1 : (x > y ? -1 : 0);
    });
    return urut;
  }

  // ---------- Gabungan ----------
  // d = { kendaraan, bbm, servis, cuci, dokumen, manual }, f = { vehicleId (angka atau null), periode }
  function hitung(d, f, hariIni) {
    var r = GaragePengeluaran.rentang(f.periode || { jenis: "semua" }, hariIni);
    var salah = !!(r.dari && r.sampai && r.dari > r.sampai);
    var transaksi = GaragePengeluaran.kumpulkan(d);
    var terpilih = d.kendaraan.filter(function (v) { return f.vehicleId === null || f.vehicleId === undefined || v.id === f.vehicleId; });
    var rr = salah ? { dari: "9999-01-01", sampai: "0000-01-01" } : r; // rentang terbalik: tidak ada data

    var per = terpilih.map(function (v) { return analisisKendaraan(v, d, rr, hariIni, transaksi); });

    // Perbandingan selalu memuat SEMUA kendaraan (periode yang sama)
    var semuaPer = (f.vehicleId === null || f.vehicleId === undefined) ? per
      : d.kendaraan.map(function (v) { return analisisKendaraan(v, d, rr, hariIni, transaksi); });

    var dlm = [];
    per.forEach(function (p) { dlm = dlm.concat(p.pengeluaran.transaksi); });
    var total = dlm.length ? GaragePengeluaran.jumlahkan(dlm) : null;

    var jarak = null, bpkBiaya = 0, bpkJarak = 0, jarakBpk = false;
    var kmJarak = 0, kmLiter = 0, adaKm = false, totalLiter = 0, adaLiter = false, totalBiayaBBM = 0;
    var jServis = 0, kServis = 0, totalServis = 0, adaServis = false, jCuci = 0, totalCuci = 0, adaCuci = false;
    per.forEach(function (p) {
      if (p.odometer.jarak !== null) { jarak = (jarak || 0) + p.odometer.jarak; }
      if (p.biayaPerKm.nilai !== null) { bpkBiaya += p.biayaPerKm.biaya; bpkJarak += p.biayaPerKm.jarak; jarakBpk = true; }
      if (p.bbm.kmPerLiter !== null) { kmJarak += p.bbm.jarakSah; kmLiter += p.bbm.literSah; adaKm = true; }
      if (p.bbm.jumlah > 0) { totalLiter += p.bbm.totalLiter; adaLiter = true; totalBiayaBBM += p.bbm.totalBiaya; }
      jServis += p.servis.jumlah; kServis += p.servis.kunjungan;
      if (p.servis.total !== null) { totalServis += p.servis.total; adaServis = true; }
      jCuci += p.cuci.jumlah;
      if (p.cuci.total !== null) { totalCuci += p.cuci.total; adaCuci = true; }
    });

    var awal = null;
    dlm.forEach(function (t) { if (awal === null || t.tanggal < awal) { awal = t.tanggal; } });
    var rata = (!salah && dlm.length) ? GaragePengeluaran.rataBulanan(dlm, r.dari, r.sampai, hariIni) : null;

    // Seri bulanan (12 bulan berakhir di akhir periode), mengikuti filter kendaraan
    var akhirTgl = (!salah && r.sampai && r.sampai < hariIni) ? r.sampai : hariIni;
    var akhirYm = akhirTgl.slice(0, 7);
    var seriBulan;
    // untuk menandai batang di luar periode, seri dihitung dari transaksi kendaraan terpilih TANPA batas periode
    var semuaMilik = [];
    terpilih.forEach(function (v) {
      semuaMilik = semuaMilik.concat(transaksi.filter(function (t) { return t.vehicleId === v.id; }));
    });
    seriBulan = GaragePengeluaran.perBulan(semuaMilik, akhirYm, 12).map(function (p) {
      var a = p.kunci + "-01", b = p.kunci + "-31";
      p.dalam = !salah && !((r.dari && b < r.dari) || (r.sampai && a > r.sampai));
      return p;
    });

    return {
      rentang: r, salah: salah, hariIni: hariIni, kendaraan: per, semuaKendaraan: semuaPer,
      ringkasan: {
        totalJarak: jarak,
        totalPengeluaran: total,
        biayaPerKm: jarakBpk ? bpkBiaya / bpkJarak : null,
        biayaPerKmJarak: bpkJarak,
        kmPerLiter: adaKm ? kmJarak / kmLiter : null,
        kmPerLiterJarak: kmJarak,
        totalLiter: adaLiter ? totalLiter : null,
        totalBiayaBBM: adaLiter ? totalBiayaBBM : null,
        rataBulanan: rata ? rata.rata : null, rataBulananBulan: rata ? rata.bulan : null,
        jumlahServis: jServis, kunjunganServis: kServis, totalServis: adaServis ? totalServis : null,
        jumlahCuci: jCuci, totalCuci: adaCuci ? totalCuci : null
      },
      transaksi: dlm,
      perKategori: GaragePengeluaran.perKategori(dlm),
      perKendaraan: GaragePengeluaran.perKendaraan(dlm),
      seriBulan: seriBulan,
      harga: gabungHarga(per),
      dokumen: statusDokumen(terpilih.map(function (v) { return v.id; }), d, hariIni)
    };
  }

  return {
    MIN_JARAK_BIAYA_KM: MIN_JARAK_BIAYA_KM,
    dalam: dalam, bacaanOdometer: bacaanOdometer, jarakDalamPeriode: jarakDalamPeriode,
    analisisBBM: analisisBBM, analisisServis: analisisServis, analisisCuci: analisisCuci,
    statusDokumen: statusDokumen, gabungHarga: gabungHarga, odometerSekarang: odometerSekarang, hitung: hitung
  };
})();
