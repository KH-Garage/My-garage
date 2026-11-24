// MY GARAGE - fuel.js (perhitungan BBM)
// Hanya berisi rumus. Tidak menyentuh layar maupun database, jadi mudah diuji.
//
// Aturan km/L (metode "penuh ke penuh"):
//   - Hanya pengisian PENUH yang menjadi titik hitung.
//   - Untuk dua pengisian penuh berurutan: jarak = selisih odometer,
//     BBM = liter semua pengisian SETELAH penuh pertama sampai penuh kedua
//     (pengisian sebagian di antaranya ikut dijumlahkan).
//   - km/L = jarak / BBM. Pengisian sebagian tidak pernah dihitung sendiri.
//   - Pengisian penuh pertama hanya menjadi titik awal.
//   - Interval dengan jarak nol atau negatif tidak dihitung.

var GarageFuel = (function () {

  // Kunci waktu untuk mengurutkan: "2026-10-05 08:30"
  function kunci(r) {
    return String(r.tanggal) + " " + String(r.waktu || "00:00");
  }

  // Urutan kronologis. Jika waktunya sama: odometer lebih kecil dulu, lalu id.
  function urutkan(daftar) {
    return daftar.slice().sort(function (a, b) {
      var ka = kunci(a);
      var kb = kunci(b);
      if (ka < kb) { return -1; }
      if (ka > kb) { return 1; }
      if (a.km !== b.km) { return a.km - b.km; }
      return (a.id || 0) - (b.id || 0);
    });
  }

  // Total biaya satu pengisian, dibulatkan ke rupiah
  function hitungTotal(liter, hargaPerLiter) {
    return Math.round(liter * hargaPerLiter);
  }

  // Menghitung efisiensi untuk SATU kendaraan. Masukan: semua catatan BBM kendaraan itu.
  // Hasil:
  //   info[id] = { status, ... } untuk setiap catatan
  //     "awal"       pengisian penuh pertama (titik awal, belum ada angka)
  //     "interval"   pengisian penuh yang menutup satu interval sah:
  //                  jarak, liter, biaya, kmPerLiter, biayaPerKm, jumlahIsi, wajar
  //     "tidakValid" pengisian penuh yang odometernya tidak lebih tinggi dari penuh sebelumnya
  //     "sebagian"   pengisian sebagian. masuk = id penuh yang menutupnya, atau null dengan
  //                  alasan: "menunggu" (belum ada penuh berikutnya),
  //                          "sebelumAwal" (sebelum penuh pertama),
  //                          "tidakValid" (intervalnya tidak sah)
  //   ringkasan = angka gabungan semua interval sah
  function hitung(daftar) {
    var urut = urutkan(daftar);
    var info = {};
    var jangkar = null;
    var menunggu = [];
    var menungguLiter = 0;
    var menungguBiaya = 0;

    var jarakSah = 0;
    var literSah = 0;
    var biayaSah = 0;
    var jumlahInterval = 0;
    var terakhir = null;

    var totalLiter = 0;
    var totalBiaya = 0;
    var jumlahPenuh = 0;
    var jumlahSebagian = 0;

    urut.forEach(function (r) {
      totalLiter += r.liter;
      totalBiaya += r.total;

      if (r.penuh) {
        jumlahPenuh++;
        if (!jangkar) {
          info[r.id] = { status: "awal" };
        } else {
          var jarak = r.km - jangkar.km;
          var liter = menungguLiter + r.liter;
          var biaya = menungguBiaya + r.total;

          if (jarak > 0 && liter > 0) {
            var kmPerLiter = jarak / liter;
            info[r.id] = {
              status: "interval",
              dari: jangkar.id,
              jarak: jarak,
              liter: liter,
              biaya: biaya,
              kmPerLiter: kmPerLiter,
              biayaPerKm: biaya / jarak,
              jumlahIsi: menunggu.length + 1,
              wajar: kmPerLiter >= 2 && kmPerLiter <= 80
            };
            menunggu.forEach(function (id) { info[id] = { status: "sebagian", masuk: r.id }; });
            jarakSah += jarak;
            literSah += liter;
            biayaSah += biaya;
            jumlahInterval++;
            terakhir = kmPerLiter;
          } else {
            info[r.id] = { status: "tidakValid", dari: jangkar.id };
            menunggu.forEach(function (id) {
              info[id] = { status: "sebagian", masuk: null, alasan: "tidakValid" };
            });
          }
        }
        jangkar = r;
        menunggu = [];
        menungguLiter = 0;
        menungguBiaya = 0;
      } else {
        jumlahSebagian++;
        if (!jangkar) {
          info[r.id] = { status: "sebagian", masuk: null, alasan: "sebelumAwal" };
        } else {
          menunggu.push(r.id);
          menungguLiter += r.liter;
          menungguBiaya += r.total;
          info[r.id] = { status: "sebagian", masuk: null, alasan: "menunggu" };
        }
      }
    });

    return {
      info: info,
      ringkasan: {
        jumlah: urut.length,
        jumlahPenuh: jumlahPenuh,
        jumlahSebagian: jumlahSebagian,
        totalLiter: totalLiter,
        totalBiaya: totalBiaya,
        jumlahInterval: jumlahInterval,
        jarakSah: jarakSah,
        // rata-rata berbobot: total jarak dibagi total BBM (bukan rata-rata dari angka km/L)
        kmPerLiter: literSah > 0 ? jarakSah / literSah : null,
        biayaPerKm: jarakSah > 0 ? biayaSah / jarakSah : null,
        kmPerLiterTerakhir: terakhir
      }
    };
  }

  // Daftar jenis BBM yang pernah dipakai, yang paling baru di depan
  function daftarJenis(daftar) {
    var urut = urutkan(daftar).reverse();
    var hasil = [];
    urut.forEach(function (r) {
      var j = r.jenisBbm || "Lainnya";
      if (hasil.indexOf(j) === -1) { hasil.push(j); }
    });
    return hasil;
  }

  // Riwayat harga untuk SATU jenis BBM (harga jenis berbeda tidak boleh dicampur)
  function riwayatHarga(daftar, jenis) {
    var titik = urutkan(daftar).filter(function (r) {
      return (r.jenisBbm || "Lainnya") === jenis;
    }).map(function (r) {
      return { tanggal: r.tanggal, waktu: r.waktu || "00:00", harga: r.hargaPerLiter, liter: r.liter, total: r.total };
    });
    if (titik.length === 0) { return { titik: [], ringkasan: null }; }

    var terendah = titik[0].harga;
    var tertinggi = titik[0].harga;
    var sumLiter = 0;
    var sumBiaya = 0;
    titik.forEach(function (t) {
      if (t.harga < terendah) { terendah = t.harga; }
      if (t.harga > tertinggi) { tertinggi = t.harga; }
      sumLiter += t.liter;
      sumBiaya += t.total;
    });

    var terakhir = titik[titik.length - 1].harga;
    var sebelumnya = titik.length > 1 ? titik[titik.length - 2].harga : null;

    return {
      titik: titik,
      ringkasan: {
        terakhir: terakhir,
        sebelumnya: sebelumnya,
        selisih: sebelumnya === null ? null : terakhir - sebelumnya,
        terendah: terendah,
        tertinggi: tertinggi,
        // harga rata-rata yang benar-benar dibayar (berbobot liter)
        rataRata: sumLiter > 0 ? sumBiaya / sumLiter : null
      }
    };
  }

  // Memeriksa urutan odometer terhadap catatan lain milik kendaraan yang sama.
  //   baru = { tanggal, waktu (boleh null), km }
  //   lain = daftar { tanggal, waktu (boleh null), km, sumber: "bbm" | "servis" }
  // Dua catatan dibandingkan dengan tanggal + jam jika keduanya punya jam,
  // jika tidak, hanya dengan tanggal. Pada tanggal yang sama dan urutan tidak pasti: dilewati.
  // Hasil: null jika aman, atau { arah: "rendah" | "tinggi", km, tanggal, waktu, sumber }
  //   "rendah" = odometer baru lebih rendah dari catatan yang lebih lama
  //   "tinggi" = odometer baru lebih tinggi dari catatan yang lebih baru
  function cekUrutanKm(baru, lain) {
    for (var i = 0; i < lain.length; i++) {
      var o = lain[i];
      var urutan; // -1: o lebih lama, 1: o lebih baru, 0: tidak bisa ditentukan
      if (o.tanggal < baru.tanggal) { urutan = -1; }
      else if (o.tanggal > baru.tanggal) { urutan = 1; }
      else if (o.waktu && baru.waktu) {
        urutan = o.waktu < baru.waktu ? -1 : (o.waktu > baru.waktu ? 1 : 0);
      } else { urutan = 0; }

      if (urutan === -1 && o.km > baru.km) {
        return { arah: "rendah", km: o.km, tanggal: o.tanggal, waktu: o.waktu || null, sumber: o.sumber };
      }
      if (urutan === 1 && o.km < baru.km) {
        return { arah: "tinggi", km: o.km, tanggal: o.tanggal, waktu: o.waktu || null, sumber: o.sumber };
      }
    }
    return null;
  }

  return {
    urutkan: urutkan,
    hitungTotal: hitungTotal,
    hitung: hitung,
    daftarJenis: daftarJenis,
    riwayatHarga: riwayatHarga,
    cekUrutanKm: cekUrutanKm
  };
})();
