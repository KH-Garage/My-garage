// MY GARAGE - app.js (mengatur perilaku aplikasi)

(function () {
  function $(id) { return document.getElementById(id); }

  var tahunIni = new Date().getFullYear();
  var dataKendaraan = [];
  var dataServis = [];
  var dataBBM = [];
  var dataCuci = [];
  var dataDok = [];
  var dataBiaya = [];           // pengeluaran manual (Tahap 6)
  var kendaraanTerpilih = null; // id kendaraan yang sedang dilihat di layar Servis, BBM, dan Cuci
  var urlFoto = {};             // id kendaraan -> alamat sementara foto di layar

  var IKON_MOBIL = '<svg viewBox="0 0 64 36" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 26v-7l6-8h20l9 8h13v7"/><circle cx="18" cy="27" r="4.5"/><circle cx="48" cy="27" r="4.5"/></svg>';

  // Tanggal hari ini dalam bahasa Indonesia
  $("today").textContent = "Hari ini: " + new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  // ---------- Alat bantu ----------

  // Membuat satu elemen HTML dengan aman (teks tidak dibaca sebagai kode)
  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) { e.className = kelas; }
    if (teks !== undefined) { e.textContent = teks; }
    return e;
  }

  // Menampilkan pesan kecil. jenis: "good", "bad", "warn" atau kosong
  function pesan(el, teks, jenis) {
    el.textContent = teks;
    el.className = "note" + (jenis ? " " + jenis : "");
    el.hidden = false;
  }

  function angka(n) { return Number(n).toLocaleString("id-ID"); }
  function rupiah(n) { return "Rp " + angka(n); }

  // "2026-11-21" -> "21 Nov 2026"
  function tanggalIndo(teks) {
    var p = String(teks).split("-");
    if (p.length !== 3) { return teks; }
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

  // Tanggal hari ini dalam bentuk 2026-11-21 (waktu setempat)
  function tanggalHariIni() {
    var d = new Date();
    var bulan = ("0" + (d.getMonth() + 1)).slice(-2);
    var hari = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + bulan + "-" + hari;
  }

  function bukaSheet(sheet, fokus) {
    sheet.hidden = false;
    document.body.classList.add("lock");
    if (fokus) { fokus.focus(); }
  }

  function tutupSheet(sheet) {
    sheet.hidden = true;
    document.body.classList.remove("lock");
  }

  // Kotak konfirmasi di dalam aplikasi (menggantikan confirm() bawaan browser).
  // confirm() bawaan tidak muncul di sebagian tampilan (misalnya preview), sehingga tombol Hapus
  // tidak bereaksi. Kotak ini selalu muncul, di iPhone, iPad, maupun di preview.
  var tanyaAksi = null;
  var tanyaLockAwal = false;

  function tanya(teks, labelYa, aksi, judul) {
    var kotak = $("sheet-tanya");
    tanyaAksi = aksi;
    tanyaLockAwal = document.body.classList.contains("lock");
    $("tanya-judul").textContent = judul || "Konfirmasi";
    $("tanya-teks").textContent = teks;
    $("tanya-ya").textContent = labelYa || "Ya";
    kotak.hidden = false;
    document.body.classList.add("lock");
    $("tanya-batal").focus();
  }

  function tutupTanya() {
    $("sheet-tanya").hidden = true;
    if (!tanyaLockAwal) { document.body.classList.remove("lock"); }
    tanyaAksi = null;
  }

  $("tanya-ya").addEventListener("click", function () {
    var aksi = tanyaAksi;
    tutupTanya();
    if (aksi) { aksi(); }
  });
  $("tanya-batal").addEventListener("click", tutupTanya);
  $("sheet-tanya").addEventListener("click", function (e) {
    if (e.target === $("sheet-tanya")) { tutupTanya(); }
  });

  // Nama kendaraan untuk ditampilkan. Kendaraan lama hanya punya "nama".
  function namaKendaraan(v) {
    var gabung = ((v.merek || "") + " " + (v.model || "")).trim();
    return gabung || v.nama || "Kendaraan";
  }

  // Memisah nama lama menjadi merek (kata pertama) dan model (sisanya)
  function bagiNama(nama) {
    var t = String(nama || "").trim();
    var i = t.indexOf(" ");
    if (i === -1) { return { merek: t, model: "" }; }
    return { merek: t.slice(0, i), model: t.slice(i + 1).trim() };
  }

  // Odometer tertinggi yang pernah dicatat (servis, BBM, atau cuci) untuk satu kendaraan
  function kmTertinggi(vehicleId) {
    var tertinggi = 0;
    dataServis.forEach(function (s) {
      if (s.vehicleId === vehicleId && s.km > tertinggi) { tertinggi = s.km; }
    });
    dataBBM.forEach(function (b) {
      if (b.vehicleId === vehicleId && b.km > tertinggi) { tertinggi = b.km; }
    });
    dataCuci.forEach(function (c) {
      if (c.vehicleId === vehicleId && typeof c.km === "number" && c.km > tertinggi) { tertinggi = c.km; }
    });
    return tertinggi;
  }

  function odometerKendaraan(v) {
    return (typeof v.odometer === "number") ? v.odometer : null;
  }

  // Mengisi menu pilihan kendaraan
  function isiPilihan(select, terpilih) {
    select.innerHTML = "";
    dataKendaraan.forEach(function (v) {
      var o = document.createElement("option");
      o.value = String(v.id);
      o.textContent = namaKendaraan(v) + " · " + v.plat;
      select.appendChild(o);
    });
    if (terpilih !== null && terpilih !== undefined) { select.value = String(terpilih); }
  }

  // Memperkecil foto (sisi terpanjang maksimal 1280 piksel) agar hemat tempat
  function perkecilFoto(berkas, sisiMaks, mutu) {
    return new Promise(function (resolve, reject) {
      var alamat = URL.createObjectURL(berkas);
      var gambar = new Image();
      gambar.onload = function () {
        var skala = Math.min(1, sisiMaks / Math.max(gambar.naturalWidth, gambar.naturalHeight));
        var lebar = Math.max(1, Math.round(gambar.naturalWidth * skala));
        var tinggi = Math.max(1, Math.round(gambar.naturalHeight * skala));
        var kanvas = document.createElement("canvas");
        kanvas.width = lebar;
        kanvas.height = tinggi;
        var ctx = kanvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, lebar, tinggi);
        ctx.drawImage(gambar, 0, 0, lebar, tinggi);
        URL.revokeObjectURL(alamat);
        kanvas.toBlob(function (blob) {
          if (blob) { resolve(blob); } else { reject(new Error("foto")); }
        }, "image/jpeg", mutu);
      };
      gambar.onerror = function () {
        URL.revokeObjectURL(alamat);
        reject(new Error("foto"));
      };
      gambar.src = alamat;
    });
  }

  // ---------- Pindah layar (menu bawah) ----------

  var tabs = document.querySelectorAll(".tab[data-view]");
  var layar = document.querySelectorAll(".view");

  function pindahLayar(nama) {
    Array.prototype.forEach.call(layar, function (v) {
      v.hidden = (v.id !== "view-" + nama);
    });
    Array.prototype.forEach.call(tabs, function (t) {
      // Pengeluaran dibuka dari Garasi, jadi menu Garasi tetap menyala
      t.classList.toggle("active", t.getAttribute("data-view") === ((nama === "pengeluaran" || nama === "analitik") ? "garasi" : nama));
    });
    window.scrollTo(0, 0);
  }

  Array.prototype.forEach.call(tabs, function (t) {
    t.addEventListener("click", function () {
      pindahLayar(t.getAttribute("data-view"));
    });
  });

  // ---------- Memuat data ----------

  // Menyiapkan alamat sementara untuk foto setiap kendaraan
  function muatFoto() {
    Object.keys(urlFoto).forEach(function (k) { URL.revokeObjectURL(urlFoto[k]); });
    urlFoto = {};
    return Promise.all(dataKendaraan.map(function (v) {
      if (!v.fotoId) { return null; }
      return GarageDB.attachmentGet(v.fotoId).then(function (lampiran) {
        if (lampiran && lampiran.blob) { urlFoto[v.id] = URL.createObjectURL(lampiran.blob); }
      }).catch(function () {});
    }));
  }

  function muatUlang() {
    return Promise.all([GarageDB.all(), GarageDB.serviceAll(), GarageDB.fuelAll(), GarageDB.carwashAll(), GarageDB.docAll(), GarageDB.expenseAll()]).then(function (hasil) {
      dataKendaraan = hasil[0];
      dataServis = hasil[1];
      dataBBM = hasil[2];
      dataCuci = hasil[3];
      dataDok = hasil[4];
      dataBiaya = hasil[5];
      // Kendaraan terbaru di atas
      dataKendaraan.sort(function (a, b) { return (b.dibuat || 0) - (a.dibuat || 0); });
      return muatFoto();
    }).then(function () {
      jenisHargaManual = false; // setelah data berubah, ikuti pengisian terbaru lagi
      tampilkanKendaraan();
      tampilkanServis();
      tampilkanBBM();
      tampilkanCuci();
      tampilkanDokumen();
      tampilkanBannerDokumen();
      tampilkanPengeluaran();
      tampilkanAnalitik();
    }).catch(function () {
      var daftar = $("vehicle-list");
      daftar.innerHTML = "";
      daftar.appendChild(buat("p", "today", "Database tidak bisa dibuka di perangkat ini."));
    });
  }

  // ---------- Layar Garasi ----------

  function tampilkanKendaraan() {
    var daftar = $("vehicle-list");
    daftar.innerHTML = "";
    $("empty").hidden = dataKendaraan.length > 0;

    dataKendaraan.forEach(function (v) {
      var kartu = buat("article", "card vehicle");

      var foto = buat("div", "v-photo");
      if (urlFoto[v.id]) {
        var gambar = document.createElement("img");
        gambar.src = urlFoto[v.id];
        gambar.alt = "Foto " + namaKendaraan(v);
        foto.appendChild(gambar);
      } else {
        foto.classList.add("kosong");
        foto.innerHTML = IKON_MOBIL;
      }
      kartu.appendChild(foto);

      var isi = buat("div", "v-body");
      var jenisBahan = v.jenis + (v.bahanBakar ? " · " + v.bahanBakar : "");
      isi.appendChild(buat("p", "v-type", jenisBahan));
      isi.appendChild(buat("h2", "v-name", namaKendaraan(v)));

      var info = buat("div", "v-meta");
      info.appendChild(buat("span", "plate", v.plat));
      info.appendChild(buat("span", "v-year", "Tahun " + v.tahun));
      isi.appendChild(info);

      var odo = odometerKendaraan(v);
      if (odo !== null) {
        isi.appendChild(buat("p", "v-odo", "Odometer " + angka(odo) + " km"));
      } else {
        isi.appendChild(buat("p", "v-odo belum", "Odometer belum diisi. Ketuk Ubah."));
      }
      if (v.vin) { isi.appendChild(buat("p", "v-detail", "Rangka / VIN: " + v.vin)); }
      if (v.noMesin) { isi.appendChild(buat("p", "v-detail", "No. mesin: " + v.noMesin)); }

      var aksi = buat("div", "v-actions");

      var ubah = buat("button", "link-btn", "Ubah");
      ubah.type = "button";
      ubah.addEventListener("click", function () { bukaFormKendaraan(v); });
      aksi.appendChild(ubah);

      var hapus = buat("button", "link-btn", "Hapus");
      hapus.type = "button";
      hapus.addEventListener("click", function () {
        tanya("Hapus " + namaKendaraan(v) + " dari garasi? Catatan servis, BBM, cuci, dokumen, pengeluaran manual, dan fotonya ikut terhapus.", "Hapus", function () {
          GarageDB.remove(v.id).then(muatUlang);
        }, "Hapus kendaraan");
      });
      aksi.appendChild(hapus);

      isi.appendChild(aksi);
      kartu.appendChild(isi);
      daftar.appendChild(kartu);
    });
  }

  // ---------- Formulir tambah / ubah kendaraan ----------

  var sheetKendaraan = $("sheet");
  var formKendaraan = $("vehicle-form");
  var errorKendaraan = $("form-error");
  var fotoMsg = $("foto-msg");

  var sedangUbah = null;       // kendaraan yang sedang diubah (null = menambah baru)
  var fotoAksi;                // undefined = foto tidak berubah, null = hapus, Blob = foto baru
  var urlPratinjauBaru = null; // alamat sementara foto yang baru dipilih

  function bersihkanPratinjau() {
    if (urlPratinjauBaru) {
      URL.revokeObjectURL(urlPratinjauBaru);
      urlPratinjauBaru = null;
    }
  }

  function tampilPratinjau(alamat) {
    var kotak = $("f-foto-preview");
    kotak.innerHTML = "";
    if (alamat) {
      var gambar = document.createElement("img");
      gambar.src = alamat;
      gambar.alt = "Pratinjau foto";
      kotak.appendChild(gambar);
    } else {
      kotak.innerHTML = IKON_MOBIL;
    }
    $("btn-foto-hapus").hidden = !alamat;
    $("btn-foto").textContent = alamat ? "Ganti Foto" : "Pilih Foto";
  }

  function bukaFormKendaraan(v) {
    sedangUbah = v || null;
    fotoAksi = undefined;
    bersihkanPratinjau();
    formKendaraan.reset();
    errorKendaraan.hidden = true;
    fotoMsg.hidden = true;
    $("sheet-title").textContent = v ? "Ubah Kendaraan" : "Tambah Kendaraan";

    if (v) {
      var nama = (v.merek || v.model) ? { merek: v.merek || "", model: v.model || "" } : bagiNama(v.nama);
      $("f-jenis").value = v.jenis;
      $("f-merek").value = nama.merek;
      $("f-model").value = nama.model;
      $("f-tahun").value = v.tahun;
      $("f-plat").value = v.plat;
      var odo = odometerKendaraan(v);
      if (odo === null) { odo = kmTertinggi(v.id) || ""; } // kendaraan lama: isi dari servis tertinggi
      $("f-odometer").value = odo;
      $("f-bahan").value = v.bahanBakar || "Bensin";
      $("f-vin").value = v.vin || "";
      $("f-mesin").value = v.noMesin || "";
    }

    tampilPratinjau(v && urlFoto[v.id] ? urlFoto[v.id] : null);
    bukaSheet(sheetKendaraan, null);
  }

  function tutupFormKendaraan() {
    tutupSheet(sheetKendaraan);
    bersihkanPratinjau();
  }

  $("btn-foto").addEventListener("click", function () { $("f-foto").click(); });

  $("f-foto").addEventListener("change", function () {
    var input = this;
    var berkas = input.files[0];
    if (!berkas) { return; }
    pesan(fotoMsg, "Memproses foto...");
    perkecilFoto(berkas, 1280, 0.82).then(function (blob) {
      bersihkanPratinjau();
      fotoAksi = blob;
      urlPratinjauBaru = URL.createObjectURL(blob);
      tampilPratinjau(urlPratinjauBaru);
      fotoMsg.hidden = true;
    }).catch(function () {
      pesan(fotoMsg, "Foto tidak bisa dibaca. Coba foto lain.", "bad");
    }).then(function () {
      input.value = "";
    });
  });

  $("btn-foto-hapus").addEventListener("click", function () {
    bersihkanPratinjau();
    // Jika kendaraan sudah punya foto tersimpan, foto itu dihapus saat Simpan
    fotoAksi = (sedangUbah && sedangUbah.fotoId) ? null : undefined;
    tampilPratinjau(null);
    fotoMsg.hidden = true;
  });

  function simpanKendaraan() {
    var jenis = $("f-jenis").value;
    var merek = $("f-merek").value.trim();
    var model = $("f-model").value.trim();
    var tahun = parseInt($("f-tahun").value, 10);
    var plat = $("f-plat").value.trim().toUpperCase();
    var odometer = parseInt($("f-odometer").value, 10);
    var bahan = $("f-bahan").value;
    var vin = $("f-vin").value.replace(/\s+/g, "").toUpperCase();
    var mesin = $("f-mesin").value.replace(/\s+/g, "").toUpperCase();

    if (!merek || !model || !plat) {
      pesan(errorKendaraan, "Merek, model, dan plat nomor wajib diisi.", "bad");
      return;
    }
    if (isNaN(tahun) || tahun < 1950 || tahun > tahunIni + 1) {
      pesan(errorKendaraan, "Isi tahun antara 1950 dan " + (tahunIni + 1) + ".", "bad");
      return;
    }
    if (isNaN(odometer) || odometer < 0 || odometer > 2000000) {
      pesan(errorKendaraan, "Isi odometer dengan angka antara 0 dan 2.000.000 km.", "bad");
      return;
    }
    if (vin && !/^[A-Z0-9-]{5,20}$/.test(vin)) {
      pesan(errorKendaraan, "Nomor rangka berisi 5 sampai 20 huruf atau angka.", "bad");
      return;
    }
    if (mesin && !/^[A-Z0-9-]{4,20}$/.test(mesin)) {
      pesan(errorKendaraan, "Nomor mesin berisi 4 sampai 20 huruf atau angka.", "bad");
      return;
    }

    // Validasi odometer terhadap catatan servis dan nilai sebelumnya
    if (sedangUbah) {
      var tertinggi = kmTertinggi(sedangUbah.id);
      if (odometer < tertinggi) {
        pesan(errorKendaraan, "Odometer tidak boleh lebih rendah dari catatan servis atau BBM tertinggi (" +
          angka(tertinggi) + " km).", "bad");
        return;
      }
      var lama = odometerKendaraan(sedangUbah);
      if (lama !== null && odometer < lama) {
        tanya("Odometer lebih rendah dari sebelumnya (" + angka(lama) + " km). Ini koreksi yang benar?", "Ya, simpan", lanjutSimpan, "Odometer lebih rendah");
        return;
      }
    }
    lanjutSimpan();

    function lanjutSimpan() {
    var rekam = sedangUbah ? Object.assign({}, sedangUbah) : { dibuat: Date.now() };
    rekam.jenis = jenis;
    rekam.merek = merek;
    rekam.model = model;
    rekam.nama = merek + " " + model; // tetap diisi agar cadangan lama dan baru saling cocok
    rekam.tahun = tahun;
    rekam.plat = plat;
    rekam.bahanBakar = bahan;
    rekam.vin = vin;
    rekam.noMesin = mesin;
    if (!sedangUbah || sedangUbah.odometer !== odometer) { rekam.odometerWaktu = Date.now(); }
    rekam.odometer = odometer;

    GarageDB.saveVehicle(rekam, fotoAksi).then(function (id) {
      if (kendaraanTerpilih === null) { kendaraanTerpilih = id; }
      tutupFormKendaraan();
      return muatUlang();
    }).catch(function () {
      pesan(errorKendaraan, "Gagal menyimpan. Coba lagi.", "bad");
    });
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll(".js-add"), function (tombol) {
    tombol.addEventListener("click", function () { bukaFormKendaraan(null); });
  });
  $("btn-cancel").addEventListener("click", tutupFormKendaraan);
  sheetKendaraan.addEventListener("click", function (e) {
    if (e.target === sheetKendaraan) { tutupFormKendaraan(); }
  });
  formKendaraan.addEventListener("submit", function (e) {
    e.preventDefault();
    simpanKendaraan();
  });
  // Pesan galat hilang begitu Anda mulai memperbaiki isian
  formKendaraan.addEventListener("input", function () { errorKendaraan.hidden = true; });

  // ---------- Layar Servis ----------

  var pilih = $("s-pilih");
  var urlStruk = null; // alamat sementara foto struk yang sedang dilihat

  // Odometer kendaraan saat ini = yang tertinggi dari data kendaraan, servis, dan BBM
  function odometerSekarang(v) {
    var odo = odometerKendaraan(v);
    var km = kmTertinggi(v.id);
    return (odo !== null && odo > km) ? odo : km;
  }

  var LABEL_STATUS = {
    akan: "Akan Datang", segera: "Segera", terlambat: "Terlambat",
    selesai: "Selesai", nonaktif: "Dimatikan"
  };

  function badgeStatus(status) {
    return buat("span", "badge st-" + status, LABEL_STATUS[status]);
  }

  // Teks sisa waktu / jarak, misalnya "12 hari lagi · 300 km lagi"
  function teksSisa(j) {
    var bagian = [];
    var r = j.rekam;
    if (j.sisaHari !== null) {
      var t = tanggalIndo(r.jatuhTempoTanggal);
      if (j.sisaHari > 0) { bagian.push(j.sisaHari + " hari lagi (" + t + ")"); }
      else if (j.sisaHari === 0) { bagian.push("Hari ini (" + t + ")"); }
      else { bagian.push("Lewat " + (-j.sisaHari) + " hari (" + t + ")"); }
    }
    if (j.sisaKm !== null) {
      if (j.sisaKm > 0) { bagian.push(angka(j.sisaKm) + " km lagi (" + angka(r.jatuhTempoKm) + " km)"); }
      else if (j.sisaKm === 0) { bagian.push("Odometer tercapai (" + angka(r.jatuhTempoKm) + " km)"); }
      else { bagian.push("Lewat " + angka(-j.sisaKm) + " km (" + angka(r.jatuhTempoKm) + " km)"); }
    }
    return bagian.join(" · ");
  }

  function tutupStruk() {
    tutupSheet($("sheet-foto"));
    if (urlStruk) { URL.revokeObjectURL(urlStruk); urlStruk = null; }
    $("viewer-img").removeAttribute("src");
  }

  function lihatStruk(s) {
    GarageDB.attachmentGet(s.fotoId).then(function (lampiran) {
      if (!lampiran || !lampiran.blob) { return; }
      if (urlStruk) { URL.revokeObjectURL(urlStruk); }
      urlStruk = URL.createObjectURL(lampiran.blob);
      $("viewer-img").src = urlStruk;
      bukaSheet($("sheet-foto"), null);
    });
  }

  $("btn-viewer-close").addEventListener("click", tutupStruk);
  $("sheet-foto").addEventListener("click", function (e) {
    if (e.target === $("sheet-foto")) { tutupStruk(); }
  });

  // Mematikan pengingat satu catatan (data lainnya tidak berubah)
  function matikanPengingat(s) {
    var salinan = {};
    Object.keys(s).forEach(function (k) { salinan[k] = s[k]; });
    salinan.pengingat = false;
    GarageDB.serviceSave(salinan, undefined).then(muatUlang);
  }

  function tampilkanServis() {
    var ada = dataKendaraan.length > 0;
    var daftar = $("service-list");
    var kosong = $("service-empty");
    var ringkasan = $("service-summary");
    var kartuJadwal = $("service-sched");

    $("service-picker").hidden = !ada;
    $("btn-add-service").hidden = !ada;
    daftar.innerHTML = "";
    kartuJadwal.hidden = true;

    if (!ada) {
      ringkasan.hidden = true;
      $("service-empty-title").textContent = "Belum ada kendaraan";
      $("service-empty-text").textContent = "Tambahkan kendaraan di tab Garasi, lalu catat servisnya di sini.";
      kosong.hidden = false;
      return;
    }

    // Pastikan kendaraan yang dipilih masih ada
    var masihAda = dataKendaraan.some(function (v) { return v.id === kendaraanTerpilih; });
    if (!masihAda) { kendaraanTerpilih = dataKendaraan[0].id; }
    isiPilihan(pilih, kendaraanTerpilih);

    var kendaraan = dataKendaraan.filter(function (v) { return v.id === kendaraanTerpilih; })[0];
    var catatan = dataServis.filter(function (s) { return s.vehicleId === kendaraanTerpilih; });
    // Terbaru di atas
    catatan.sort(function (a, b) {
      return String(b.tanggal).localeCompare(String(a.tanggal)) || (b.km - a.km) || (b.id - a.id);
    });

    kosong.hidden = catatan.length > 0;
    ringkasan.hidden = catatan.length === 0;

    if (catatan.length === 0) {
      $("service-empty-title").textContent = "Belum ada catatan servis";
      $("service-empty-text").textContent = "Ketuk + Catat untuk mencatat servis pertama kendaraan ini.";
      return;
    }

    var odo = odometerSekarang(kendaraan);
    var ring = GarageService.ringkasan(catatan);
    $("sum-biaya").textContent = rupiah(ring.totalBiaya);
    $("sum-km").textContent = angka(odo) + " km";
    $("sum-n").textContent = String(ring.jumlah);
    $("sum-last").textContent = tanggalIndo(ring.terakhir.tanggal);

    var jadwal = GarageService.jadwal(catatan, tanggalHariIni(), odo);
    var statusDari = {};
    jadwal.forEach(function (j) { statusDari[j.rekam.id] = j; });

    // Kartu jadwal: hanya yang masih aktif
    var aktif = jadwal.filter(function (j) { return j.aktif; });
    if (aktif.length > 0) {
      var isi = $("sched-list");
      isi.innerHTML = "";
      aktif.forEach(function (j) {
        var baris = buat("div", "sched st-" + j.status);
        var atas = buat("div", "r-top");
        atas.appendChild(buat("h3", "sched-name", j.kategori));
        atas.appendChild(badgeStatus(j.status));
        baris.appendChild(atas);
        baris.appendChild(buat("p", "r-meta", teksSisa(j)));
        baris.appendChild(buat("p", "r-note", "Dari servis " + tanggalIndo(j.rekam.tanggal) + " · " + angka(j.rekam.km) + " km"));
        var mati = buat("button", "link-btn", "Matikan pengingat");
        mati.type = "button";
        mati.addEventListener("click", function () { matikanPengingat(j.rekam); });
        baris.appendChild(mati);
        isi.appendChild(baris);
      });
      kartuJadwal.hidden = false;
    }

    catatan.forEach(function (s) {
      var kartu = buat("article", "card record");

      var atas = buat("div", "r-top");
      atas.appendChild(buat("h2", "r-title", GarageService.kategoriBaku(s.jenis)));
      atas.appendChild(buat("span", "r-cost", rupiah(s.biaya)));
      kartu.appendChild(atas);

      kartu.appendChild(buat("p", "r-meta", tanggalIndo(s.tanggal) + " · " + angka(s.km) + " km"));
      var tempat = [];
      if (s.bengkel) { tempat.push(s.bengkel); }
      if (s.produk) { tempat.push(s.produk); }
      if (tempat.length) { kartu.appendChild(buat("p", "r-meta", tempat.join(" · "))); }
      if (typeof s.biayaPart === "number" || typeof s.biayaJasa === "number") {
        kartu.appendChild(buat("p", "r-meta",
          "Suku cadang " + rupiah(s.biayaPart || 0) + " · Jasa " + rupiah(s.biayaJasa || 0)));
      }
      if (s.catatan) { kartu.appendChild(buat("p", "r-note", s.catatan)); }

      var j = statusDari[s.id];
      if (j) {
        var jd = buat("div", "r-calc");
        var tag = buat("div", "r-tags");
        tag.appendChild(buat("span", "", "Servis berikutnya"));
        tag.appendChild(badgeStatus(j.status));
        jd.appendChild(tag);
        jd.appendChild(buat("p", "r-meta", teksSisa(j)));
        kartu.appendChild(jd);
      }

      var aksi = buat("div", "r-actions");
      if (s.fotoId) {
        var lihat = buat("button", "link-btn", "Lihat Struk");
        lihat.type = "button";
        lihat.addEventListener("click", function () { lihatStruk(s); });
        aksi.appendChild(lihat);
      }
      var ubah = buat("button", "link-btn", "Ubah");
      ubah.type = "button";
      ubah.addEventListener("click", function () { bukaFormServis(s); });
      aksi.appendChild(ubah);
      var hapus = buat("button", "link-btn", "Hapus");
      hapus.type = "button";
      hapus.addEventListener("click", function () {
        tanya("Hapus catatan servis ini? Foto strukknya juga ikut terhapus.", "Hapus", function () {
          GarageDB.serviceRemove(s.id).then(muatUlang);
        }, "Hapus servis");
      });
      aksi.appendChild(hapus);
      kartu.appendChild(aksi);

      daftar.appendChild(kartu);
    });
  }

  pilih.addEventListener("change", function () {
    kendaraanTerpilih = parseInt(pilih.value, 10);
    jenisHargaManual = false;
    tampilkanServis();
    tampilkanBBM();
    tampilkanCuci();
    tampilkanDokumen();
  });

  // ---------- Formulir catat servis ----------

  var sheetServis = $("sheet-servis");
  var formServis = $("service-form");
  var errorServis = $("service-error");
  var sfotoMsg = $("sfoto-msg");
  var sedangUbahServis = null;  // catatan yang sedang diubah (null = menambah baru)
  var sfotoAksi;                // undefined = tidak berubah, null = hapus, Blob = foto baru
  var urlPratinjauServis = null;
  var sedangMenyimpanServis = false;

  GarageService.KATEGORI.forEach(function (k) {
    var o = document.createElement("option");
    o.value = k;
    o.textContent = k;
    $("s-jenis").appendChild(o);
  });

  function bersihkanPratinjauServis() {
    if (urlPratinjauServis) { URL.revokeObjectURL(urlPratinjauServis); urlPratinjauServis = null; }
  }

  function tampilPratinjauServis(alamat) {
    var kotak = $("s-foto-preview");
    kotak.innerHTML = "";
    if (alamat) {
      var gambar = document.createElement("img");
      gambar.src = alamat;
      gambar.alt = "Pratinjau foto struk";
      kotak.appendChild(gambar);
    } else {
      kotak.textContent = "Belum ada";
    }
    $("btn-sfoto-hapus").hidden = !alamat;
    $("btn-sfoto").textContent = alamat ? "Ganti Foto" : "Pilih Foto";
  }

  // Isian rupiah kosong = 0. Isian salah = NaN.
  function bacaRupiah(teks) {
    if (String(teks).trim() === "") { return 0; }
    return bacaBulat(teks);
  }

  function perbaruiTotalServis() {
    var p = bacaRupiah($("s-part").value);
    var j = bacaRupiah($("s-jasa").value);
    $("s-total").textContent = (isNaN(p) || isNaN(j)) ? "Periksa angka biaya" : rupiah(GarageService.hitungTotal(p, j));
  }

  function bukaFormServis(rec) {
    if (dataKendaraan.length === 0) { return; }
    sedangUbahServis = rec || null;
    sfotoAksi = undefined;
    bersihkanPratinjauServis();
    formServis.reset();
    errorServis.hidden = true;
    sfotoMsg.hidden = true;
    $("s-lama").hidden = true;
    $("sheet-servis-title").textContent = rec ? "Ubah Catatan Servis" : "Catat Servis";
    isiPilihan($("s-kendaraan"), rec ? rec.vehicleId : kendaraanTerpilih);
    $("s-kendaraan").disabled = !!rec; // catatan tidak boleh pindah kendaraan

    var jenisSelect = $("s-jenis");
    // Hapus pilihan tambahan dari pembukaan sebelumnya
    Array.prototype.slice.call(jenisSelect.querySelectorAll("option[data-extra]")).forEach(function (o) { o.remove(); });

    if (rec) {
      var kat = GarageService.kategoriBaku(rec.jenis);
      if (GarageService.KATEGORI.indexOf(kat) === -1) {
        var extra = document.createElement("option");
        extra.value = kat;
        extra.textContent = kat;
        extra.setAttribute("data-extra", "1");
        jenisSelect.appendChild(extra);
      }
      jenisSelect.value = kat;
      $("s-tanggal").value = rec.tanggal;
      $("s-km").value = rec.km;
      $("s-bengkel").value = rec.bengkel || "";
      $("s-produk").value = rec.produk || "";
      if (typeof rec.biayaPart === "number" || typeof rec.biayaJasa === "number") {
        $("s-part").value = rec.biayaPart || "";
        $("s-jasa").value = rec.biayaJasa || "";
      } else {
        $("s-part").value = rec.biaya || "";   // catatan lama: hanya ada total
        $("s-lama").hidden = false;
      }
      $("s-catatan").value = rec.catatan || "";
      $("s-due-tgl").value = rec.jatuhTempoTanggal || "";
      $("s-due-km").value = (typeof rec.jatuhTempoKm === "number") ? rec.jatuhTempoKm : "";
      $("s-ingat").value = rec.pengingat === false ? "nonaktif" : "aktif";
      tampilPratinjauServis(null);
      if (rec.fotoId) {
        GarageDB.attachmentGet(rec.fotoId).then(function (l) {
          if (l && l.blob && sedangUbahServis === rec && sfotoAksi === undefined) {
            bersihkanPratinjauServis();
            urlPratinjauServis = URL.createObjectURL(l.blob);
            tampilPratinjauServis(urlPratinjauServis);
          }
        });
      }
    } else {
      $("s-tanggal").value = tanggalHariIni();
      tampilPratinjauServis(null);
    }
    perbaruiTotalServis();
    bukaSheet(sheetServis, null);
  }

  function tutupFormServis() {
    tutupSheet(sheetServis);
    bersihkanPratinjauServis();
  }

  $("btn-sfoto").addEventListener("click", function () { $("s-foto").click(); });

  $("s-foto").addEventListener("change", function () {
    var input = this;
    var berkas = input.files[0];
    if (!berkas) { return; }
    pesan(sfotoMsg, "Memproses foto...");
    perkecilFoto(berkas, 1280, 0.85).then(function (blob) {
      bersihkanPratinjauServis();
      sfotoAksi = blob;
      urlPratinjauServis = URL.createObjectURL(blob);
      tampilPratinjauServis(urlPratinjauServis);
      sfotoMsg.hidden = true;
    }).catch(function () {
      pesan(sfotoMsg, "Foto tidak bisa dibaca. Coba foto lain.", "bad");
    }).then(function () {
      input.value = "";
    });
  });

  $("btn-sfoto-hapus").addEventListener("click", function () {
    bersihkanPratinjauServis();
    // Jika catatan sudah punya foto tersimpan, foto itu dihapus saat Simpan
    sfotoAksi = (sedangUbahServis && sedangUbahServis.fotoId) ? null : undefined;
    tampilPratinjauServis(null);
    sfotoMsg.hidden = true;
  });

  function simpanServis() {
    if (sedangMenyimpanServis) { return; }
    var vehicleId = parseInt($("s-kendaraan").value, 10);
    var tanggal = $("s-tanggal").value;
    var km = parseInt($("s-km").value, 10);
    var part = bacaRupiah($("s-part").value);
    var jasa = bacaRupiah($("s-jasa").value);
    var dueTgl = $("s-due-tgl").value;
    var dueKmTeks = $("s-due-km").value.trim();
    var dueKm = dueKmTeks === "" ? null : parseInt(dueKmTeks, 10);
    var idUbah = sedangUbahServis ? sedangUbahServis.id : null;

    var kendaraan = dataKendaraan.filter(function (v) { return v.id === vehicleId; })[0];
    if (!kendaraan) { pesan(errorServis, "Pilih kendaraan dulu.", "bad"); return; }
    if (!tanggal || !GarageService.tanggalValid(tanggal)) {
      pesan(errorServis, "Isi tanggal servis dengan tanggal yang benar.", "bad"); return;
    }
    if (tanggal > tanggalHariIni()) {
      pesan(errorServis, "Tanggal servis tidak boleh di masa depan.", "bad"); return;
    }
    if (parseInt(tanggal.slice(0, 4), 10) < kendaraan.tahun - 1) {
      pesan(errorServis, "Tanggal servis terlalu lama, sebelum kendaraan ini dibuat (tahun " + kendaraan.tahun + ").", "bad"); return;
    }
    if (isNaN(km) || km < 0 || km > 2000000) {
      pesan(errorServis, "Isi odometer dengan angka antara 0 dan 2.000.000 km.", "bad"); return;
    }
    if (isNaN(part) || isNaN(jasa) || part > 1000000000 || jasa > 1000000000) {
      pesan(errorServis, "Isi biaya dengan angka rupiah (0 sampai 1.000.000.000). Kosong dianggap 0.", "bad"); return;
    }

    // Odometer harus naik mengikuti tanggal terhadap catatan servis DAN pengisian BBM
    var konflik = GarageFuel.cekUrutanKm({ tanggal: tanggal, waktu: null, km: km }, catatanLain(vehicleId, null, idUbah));
    if (konflik) { pesan(errorServis, pesanKonflik(konflik), "bad"); return; }

    if (dueTgl) {
      if (!GarageService.tanggalValid(dueTgl)) { pesan(errorServis, "Tanggal jatuh tempo tidak benar.", "bad"); return; }
      if (dueTgl <= tanggal) { pesan(errorServis, "Tanggal jatuh tempo harus setelah tanggal servis.", "bad"); return; }
      if (GarageService.selisihHari(tanggal, dueTgl) > 3660) {
        pesan(errorServis, "Tanggal jatuh tempo terlalu jauh (maksimal 10 tahun).", "bad"); return;
      }
    }
    if (dueKm !== null) {
      if (isNaN(dueKm) || dueKm > 2000000) { pesan(errorServis, "Isi odometer jatuh tempo dengan angka yang benar.", "bad"); return; }
      if (dueKm <= km) { pesan(errorServis, "Odometer jatuh tempo harus lebih besar dari odometer servis.", "bad"); return; }
    }

    var rekam = {};
    if (sedangUbahServis) {
      Object.keys(sedangUbahServis).forEach(function (k) { rekam[k] = sedangUbahServis[k]; });
    } else {
      rekam.dibuat = Date.now();
    }
    rekam.vehicleId = vehicleId;
    rekam.tanggal = tanggal;
    rekam.km = km;
    rekam.jenis = $("s-jenis").value;
    rekam.bengkel = $("s-bengkel").value.trim();
    rekam.produk = $("s-produk").value.trim();
    rekam.biayaPart = part;
    rekam.biayaJasa = jasa;
    rekam.biaya = GarageService.hitungTotal(part, jasa);
    rekam.catatan = $("s-catatan").value.trim();
    rekam.jatuhTempoTanggal = dueTgl || null;
    rekam.jatuhTempoKm = dueKm;
    rekam.pengingat = $("s-ingat").value !== "nonaktif";
    if (rekam.fotoId === undefined) { rekam.fotoId = null; }

    sedangMenyimpanServis = true;
    var tombol = formServis.querySelector("button[type=submit]");
    tombol.disabled = true;
    GarageDB.serviceSave(rekam, sfotoAksi).then(function () {
      kendaraanTerpilih = vehicleId;
      tutupFormServis();
      return muatUlang();
    }).catch(function () {
      pesan(errorServis, "Gagal menyimpan. Coba lagi.", "bad");
    }).then(function () {
      sedangMenyimpanServis = false;
      tombol.disabled = false;
    });
  }

  $("btn-add-service").addEventListener("click", function () { bukaFormServis(null); });
  $("btn-cancel-service").addEventListener("click", tutupFormServis);
  sheetServis.addEventListener("click", function (e) {
    if (e.target === sheetServis) { tutupFormServis(); }
  });
  formServis.addEventListener("submit", function (e) {
    e.preventDefault();
    simpanServis();
  });
  formServis.addEventListener("input", function () { errorServis.hidden = true; });
  $("s-part").addEventListener("input", perbaruiTotalServis);
  $("s-jasa").addEventListener("input", perbaruiTotalServis);

  // ---------- Layar BBM ----------

  var pilihBBM = $("b-pilih");
  var jenisHarga = null; // jenis BBM yang sedang dilihat di Riwayat Harga
  var jenisHargaManual = false; // true jika Anda sendiri memilih jenis BBM di Riwayat Harga

  function desimal(n, d) {
    return Number(n).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function literTeks(n) {
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  }

  // Mengubah isian desimal ("35,5" atau "35.5") menjadi angka. Isian salah menghasilkan NaN.
  function bacaDesimal(teks) {
    var s = String(teks).replace(/\s+/g, "");
    if (s.indexOf(",") !== -1) { s = s.replace(/\./g, "").replace(",", "."); }
    if (!/^\d+(\.\d+)?$/.test(s)) { return NaN; }
    return parseFloat(s);
  }

  // Bilangan bulat. Titik atau koma dianggap pemisah ribuan ("12.500" = 12500).
  function bacaBulat(teks) {
    var s = String(teks).replace(/[\s.,]/g, "");
    if (!/^\d+$/.test(s)) { return NaN; }
    return parseInt(s, 10);
  }

  function jamSekarang() {
    var d = new Date();
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  // Catatan BBM, servis, dan cuci milik satu kendaraan, untuk memeriksa urutan odometer
  function catatanLain(vehicleId, kecualiBBMId, kecualiServisId, kecualiCuciId) {
    var hasil = [];
    dataBBM.forEach(function (b) {
      if (b.vehicleId === vehicleId && b.id !== kecualiBBMId) {
        hasil.push({ tanggal: b.tanggal, waktu: b.waktu || null, km: b.km, sumber: "bbm" });
      }
    });
    dataServis.forEach(function (s) {
      if (s.vehicleId === vehicleId && s.id !== kecualiServisId) {
        hasil.push({ tanggal: s.tanggal, waktu: null, km: s.km, sumber: "servis" });
      }
    });
    dataCuci.forEach(function (c) {
      if (c.vehicleId === vehicleId && c.id !== kecualiCuciId && typeof c.km === "number") {
        hasil.push({ tanggal: c.tanggal, waktu: c.waktu || null, km: c.km, sumber: "cuci" });
      }
    });
    return hasil;
  }

  function pesanKonflik(k) {
    var sumber = k.sumber === "bbm" ? "pengisian BBM" : (k.sumber === "cuci" ? "catatan cuci" : "catatan servis");
    var kapan = tanggalIndo(k.tanggal) + (k.waktu ? " pukul " + k.waktu : "");
    if (k.arah === "rendah") {
      return "Odometer lebih rendah dari " + sumber + " sebelumnya: " + angka(k.km) + " km pada " + kapan + ".";
    }
    return "Odometer lebih tinggi dari " + sumber + " yang lebih baru: " + angka(k.km) + " km pada " + kapan + ".";
  }

  // Teks hasil hitung untuk satu kartu pengisian
  function teksHitung(inf) {
    if (inf.status === "awal") {
      return { kelas: "", utama: "", detail: "Titik awal. Perhitungan km/L dimulai dari pengisian penuh berikutnya." };
    }
    if (inf.status === "interval") {
      var detail = angka(inf.jarak) + " km dengan " + literTeks(inf.liter) + " L";
      if (inf.jumlahIsi > 1) { detail += " (termasuk " + (inf.jumlahIsi - 1) + " pengisian sebagian)"; }
      if (!inf.wajar) { detail += ". Angka ini tampak tidak wajar. Mungkin ada pengisian yang belum dicatat atau odometer salah ketik."; }
      return {
        kelas: inf.wajar ? "ok" : "warn",
        utama: desimal(inf.kmPerLiter, 1) + " km/L · " + rupiah(Math.round(inf.biayaPerKm)) + "/km",
        detail: detail
      };
    }
    if (inf.status === "tidakValid") {
      return { kelas: "warn", utama: "", detail: "Tidak dihitung. Odometer tidak lebih tinggi dari pengisian penuh sebelumnya." };
    }
    if (inf.masuk) {
      return { kelas: "", utama: "", detail: "Sebagian. Sudah ikut dihitung dalam interval penuh ke penuh." };
    }
    if (inf.alasan === "sebelumAwal") {
      return { kelas: "", utama: "", detail: "Sebagian. Terjadi sebelum pengisian penuh pertama, jadi tidak dipakai untuk km/L." };
    }
    if (inf.alasan === "tidakValid") {
      return { kelas: "", utama: "", detail: "Sebagian. Tidak dihitung karena interval penuh ke penuh tidak sah." };
    }
    return { kelas: "", utama: "", detail: "Sebagian. Akan dihitung setelah pengisian penuh berikutnya." };
  }

  function tampilkanBBM() {
    var ada = dataKendaraan.length > 0;
    var daftar = $("bbm-list");
    var kosong = $("bbm-empty");
    var ringkasan = $("bbm-summary");
    var kartuHarga = $("bbm-harga");

    $("bbm-picker").hidden = !ada;
    $("btn-add-bbm").hidden = !ada;
    daftar.innerHTML = "";

    if (!ada) {
      ringkasan.hidden = true;
      kartuHarga.hidden = true;
      $("bbm-empty-title").textContent = "Belum ada kendaraan";
      $("bbm-empty-text").textContent = "Tambahkan kendaraan di tab Garasi, lalu catat pengisian BBM di sini.";
      kosong.hidden = false;
      return;
    }

    var masihAda = dataKendaraan.some(function (v) { return v.id === kendaraanTerpilih; });
    if (!masihAda) { kendaraanTerpilih = dataKendaraan[0].id; }
    isiPilihan(pilihBBM, kendaraanTerpilih);

    var catatan = dataBBM.filter(function (b) { return b.vehicleId === kendaraanTerpilih; });
    kosong.hidden = catatan.length > 0;
    ringkasan.hidden = catatan.length === 0;
    kartuHarga.hidden = catatan.length === 0;

    if (catatan.length === 0) {
      $("bbm-empty-title").textContent = "Belum ada catatan BBM";
      $("bbm-empty-text").textContent = "Ketuk + Catat untuk mencatat pengisian BBM pertama kendaraan ini.";
      return;
    }

    var hasil = GarageFuel.hitung(catatan);
    var r = hasil.ringkasan;

    $("bs-kmpl").textContent = r.kmPerLiter === null ? "Belum ada" : desimal(r.kmPerLiter, 1) + " km/L";
    $("bs-perkm").textContent = r.biayaPerKm === null ? "Belum ada" : rupiah(Math.round(r.biayaPerKm)) + "/km";
    $("bs-biaya").textContent = rupiah(r.totalBiaya);
    $("bs-liter").textContent = literTeks(r.totalLiter) + " L";

    var catatanHitung;
    if (r.jumlahInterval > 0) {
      catatanHitung = "Dihitung dari " + r.jumlahInterval + " interval penuh ke penuh (" + angka(r.jarakSah) +
        " km). Pengisian sebagian ikut masuk interval, tidak dihitung sendiri.";
    } else if (r.jumlahPenuh === 0) {
      catatanHitung = "Belum ada pengisian penuh. km/L baru bisa dihitung setelah dua pengisian penuh berurutan.";
    } else if (r.jumlahPenuh === 1) {
      catatanHitung = "Pengisian penuh pertama menjadi titik awal. Catat pengisian penuh berikutnya untuk melihat km/L.";
    } else {
      catatanHitung = "Belum ada interval penuh ke penuh yang sah. Periksa odometer pengisian penuh.";
    }
    $("bbm-note").textContent = catatanHitung;

    tampilkanHarga(catatan);

    GarageFuel.urutkan(catatan).reverse().forEach(function (b) {
      var inf = hasil.info[b.id] || {};
      var kartu = buat("article", "card record");

      var atas = buat("div", "r-top");
      atas.appendChild(buat("h2", "r-title", tanggalIndo(b.tanggal) + (b.waktu ? " · " + b.waktu : "")));
      atas.appendChild(buat("span", "r-cost", rupiah(b.total)));
      kartu.appendChild(atas);

      kartu.appendChild(buat("p", "r-meta", literTeks(b.liter) + " L × " + rupiah(b.hargaPerLiter) +
        " · " + angka(b.km) + " km"));

      var tag = buat("div", "r-tags");
      tag.appendChild(buat("span", "badge" + (b.penuh ? " penuh" : ""), b.penuh ? "Penuh" : "Sebagian"));
      tag.appendChild(buat("span", "badge", b.jenisBbm));
      kartu.appendChild(tag);

      var tempat = [b.spbu, b.lokasi].filter(Boolean).join(" · ");
      if (tempat) { kartu.appendChild(buat("p", "r-note", tempat)); }

      var h = teksHitung(inf);
      var calc = buat("p", "r-calc" + (h.kelas ? " " + h.kelas : ""));
      if (h.utama) {
        calc.appendChild(buat("strong", "", h.utama));
        calc.appendChild(document.createElement("br"));
      }
      calc.appendChild(document.createTextNode(h.detail));
      kartu.appendChild(calc);

      var aksi = buat("div", "r-actions");
      var ubah = buat("button", "link-btn", "Ubah");
      ubah.type = "button";
      ubah.addEventListener("click", function () { bukaFormBBM(b); });
      aksi.appendChild(ubah);
      var hapus = buat("button", "link-btn", "Hapus");
      hapus.type = "button";
      hapus.addEventListener("click", function () {
        tanya("Hapus catatan BBM ini?", "Hapus", function () {
          GarageDB.fuelRemove(b.id).then(muatUlang);
        }, "Hapus catatan BBM");
      });
      aksi.appendChild(hapus);
      kartu.appendChild(aksi);

      daftar.appendChild(kartu);
    });
  }

  // ---------- Riwayat harga BBM ----------

  function tampilkanHarga(catatan) {
    var daftarJenis = GarageFuel.daftarJenis(catatan);
    // Tanpa pilihan Anda, riwayat harga mengikuti jenis BBM pada pengisian terbaru
    if (!jenisHargaManual || daftarJenis.indexOf(jenisHarga) === -1) { jenisHarga = daftarJenis[0]; }

    var pilihJenis = $("h-jenis");
    pilihJenis.innerHTML = "";
    daftarJenis.forEach(function (j) {
      var o = document.createElement("option");
      o.value = j;
      o.textContent = j;
      pilihJenis.appendChild(o);
    });
    pilihJenis.value = jenisHarga;
    $("h-jenis-box").hidden = daftarJenis.length < 2;

    var rh = GarageFuel.riwayatHarga(catatan, jenisHarga);
    var s = rh.ringkasan;
    var stat = $("h-stats");
    stat.innerHTML = "";
    [["Terakhir", s.terakhir], ["Terendah", s.terendah], ["Tertinggi", s.tertinggi]].forEach(function (p) {
      var kotak = document.createElement("div");
      kotak.appendChild(buat("p", "k", p[0]));
      kotak.appendChild(buat("p", "v", rupiah(p[1])));
      stat.appendChild(kotak);
    });

    var teks;
    if (s.selisih === null) {
      teks = "Baru satu catatan harga untuk " + jenisHarga + ".";
    } else if (s.selisih === 0) {
      teks = "Harga sama dengan pengisian sebelumnya.";
    } else {
      teks = (s.selisih > 0 ? "Naik " : "Turun ") + rupiah(Math.abs(s.selisih)) + " dari pengisian sebelumnya.";
    }
    teks += " Rata-rata yang Anda bayar " + rupiah(Math.round(s.rataRata)) + " per liter.";
    $("h-note").textContent = teks;
    $("h-note").className = "note";

    gambarGrafikHarga(rh.titik);
  }

  // Grafik garis harga per liter. Sumbu tanggal dan sumbu harga masing-masing memakai satu skala.
  function gambarGrafikHarga(titik) {
    var kotak = $("h-chart");
    kotak.innerHTML = "";
    if (titik.length < 2) { return; }

    var NS = "http://www.w3.org/2000/svg";
    var kiri = 46, kanan = 292, atas = 14, bawah = 88;

    function el(nama, atribut, teks) {
      var e = document.createElementNS(NS, nama);
      Object.keys(atribut).forEach(function (k) { e.setAttribute(k, atribut[k]); });
      if (teks !== undefined) { e.textContent = teks; }
      return e;
    }

    var waktu = titik.map(function (t) { return new Date(t.tanggal + "T" + t.waktu + ":00").getTime(); });
    var t0 = waktu[0];
    var t1 = waktu[waktu.length - 1];
    var hMin = titik[0].harga;
    var hMax = titik[0].harga;
    titik.forEach(function (t) {
      if (t.harga < hMin) { hMin = t.harga; }
      if (t.harga > hMax) { hMax = t.harga; }
    });
    var rentang = hMax - hMin;

    function px(i) { return t1 === t0 ? (kiri + kanan) / 2 : kiri + (waktu[i] - t0) / (t1 - t0) * (kanan - kiri); }
    function py(h) { return rentang === 0 ? (atas + bawah) / 2 : bawah - (h - hMin) / rentang * (bawah - atas); }

    var svg = el("svg", { viewBox: "0 0 300 110", role: "img", "aria-label": "Grafik harga BBM per liter" });

    // Garis bantu dan angka harga di sisi kiri
    var garis = rentang === 0 ? [hMax] : [hMax, hMin];
    garis.forEach(function (h) {
      svg.appendChild(el("line", { "class": "grid", x1: kiri, x2: kanan, y1: py(h), y2: py(h) }));
      svg.appendChild(el("text", { "class": "t", x: kiri - 6, y: py(h) + 3, "text-anchor": "end" }, angka(h)));
    });

    svg.appendChild(el("polyline", {
      "class": "line",
      points: titik.map(function (t, i) { return px(i).toFixed(1) + "," + py(t.harga).toFixed(1); }).join(" ")
    }));
    titik.forEach(function (t, i) {
      var akhir = i === titik.length - 1;
      svg.appendChild(el("circle", { "class": "dot" + (akhir ? " last" : ""), cx: px(i).toFixed(1), cy: py(t.harga).toFixed(1), r: akhir ? 4.5 : 3 }));
    });

    svg.appendChild(el("text", { "class": "t", x: kiri, y: 106, "text-anchor": "start" }, tanggalIndo(titik[0].tanggal)));
    svg.appendChild(el("text", { "class": "t", x: kanan, y: 106, "text-anchor": "end" }, tanggalIndo(titik[titik.length - 1].tanggal)));

    kotak.appendChild(svg);
  }

  pilihBBM.addEventListener("change", function () {
    kendaraanTerpilih = parseInt(pilihBBM.value, 10);
    jenisHargaManual = false;
    tampilkanServis();
    tampilkanBBM();
    tampilkanCuci();
    tampilkanDokumen();
  });

  $("h-jenis").addEventListener("change", function () {
    jenisHarga = $("h-jenis").value;
    jenisHargaManual = true;
    tampilkanBBM();
  });

  // ---------- Formulir catat / ubah BBM ----------

  var sheetBBM = $("sheet-bbm");
  var formBBM = $("bbm-form");
  var errorBBM = $("bbm-error");
  var sedangUbahBBM = null; // catatan yang sedang diubah (null = menambah baru)

  function bbmTerakhir(vehicleId) {
    var d = dataBBM.filter(function (b) { return b.vehicleId === vehicleId; });
    if (d.length === 0) { return null; }
    var u = GarageFuel.urutkan(d);
    return u[u.length - 1];
  }

  // Mengisi SPBU, jenis BBM, dan harga dari pengisian terakhir kendaraan itu (hemat mengetik)
  function isiBawaanBBM(vehicleId) {
    var t = bbmTerakhir(vehicleId);
    if (!t) { return; }
    $("g-jenis").value = t.jenisBbm;
    $("g-spbu").value = t.spbu || "";
    $("g-lokasi").value = t.lokasi || "";
    $("g-harga").value = String(t.hargaPerLiter);
    perbaruiTotalBBM();
  }

  function perbaruiTotalBBM() {
    var liter = bacaDesimal($("g-liter").value);
    var harga = bacaBulat($("g-harga").value);
    if (isNaN(liter) || isNaN(harga)) {
      $("g-total").textContent = "Rp 0";
    } else {
      $("g-total").textContent = rupiah(GarageFuel.hitungTotal(Math.round(liter * 100) / 100, harga));
    }
  }

  function bukaFormBBM(b) {
    if (dataKendaraan.length === 0) { return; }
    sedangUbahBBM = b || null;
    formBBM.reset();
    errorBBM.hidden = true;
    $("bbm-title").textContent = b ? "Ubah Pengisian BBM" : "Catat Pengisian BBM";
    isiPilihan($("g-kendaraan"), b ? b.vehicleId : kendaraanTerpilih);

    if (b) {
      $("g-tanggal").value = b.tanggal;
      $("g-waktu").value = b.waktu || "00:00";
      $("g-km").value = b.km;
      $("g-spbu").value = b.spbu || "";
      $("g-lokasi").value = b.lokasi || "";
      $("g-jenis").value = b.jenisBbm;
      $("g-liter").value = String(b.liter).replace(".", ",");
      $("g-harga").value = String(b.hargaPerLiter);
      $("g-penuh").value = b.penuh ? "penuh" : "sebagian";
      perbaruiTotalBBM();
      bukaSheet(sheetBBM, null);
    } else {
      $("g-tanggal").value = tanggalHariIni();
      $("g-waktu").value = jamSekarang();
      isiBawaanBBM(kendaraanTerpilih);
      perbaruiTotalBBM();
      bukaSheet(sheetBBM, $("g-km"));
    }
  }

  function simpanBBM() {
    var vehicleId = parseInt($("g-kendaraan").value, 10);
    var tanggal = $("g-tanggal").value;
    var waktu = $("g-waktu").value;
    var km = parseInt($("g-km").value, 10);
    var liter = bacaDesimal($("g-liter").value);
    var harga = bacaBulat($("g-harga").value);

    if (isNaN(vehicleId)) {
      pesan(errorBBM, "Pilih kendaraan dulu.", "bad");
      return;
    }
    if (!tanggal) {
      pesan(errorBBM, "Isi tanggal pengisian.", "bad");
      return;
    }
    if (tanggal > tanggalHariIni()) {
      pesan(errorBBM, "Tanggal pengisian tidak boleh di masa depan.", "bad");
      return;
    }
    if (!waktu) {
      pesan(errorBBM, "Isi jam pengisian.", "bad");
      return;
    }
    if (isNaN(km) || km < 0 || km > 2000000) {
      pesan(errorBBM, "Isi odometer dengan angka antara 0 dan 2.000.000 km.", "bad");
      return;
    }
    if (isNaN(liter) || liter < 0.1 || liter > 500) {
      pesan(errorBBM, "Isi jumlah liter antara 0,1 dan 500. Gunakan koma untuk desimal, contoh 35,5.", "bad");
      return;
    }
    if (isNaN(harga) || harga < 100 || harga > 1000000) {
      pesan(errorBBM, "Isi harga per liter dalam rupiah, contoh 12500.", "bad");
      return;
    }
    liter = Math.round(liter * 100) / 100;

    var konflik = GarageFuel.cekUrutanKm(
      { tanggal: tanggal, waktu: waktu, km: km },
      catatanLain(vehicleId, sedangUbahBBM ? sedangUbahBBM.id : null)
    );
    if (konflik) {
      pesan(errorBBM, pesanKonflik(konflik), "bad");
      return;
    }

    var rekam = sedangUbahBBM ? Object.assign({}, sedangUbahBBM) : { dibuat: Date.now() };
    rekam.vehicleId = vehicleId;
    rekam.tanggal = tanggal;
    rekam.waktu = waktu;
    rekam.km = km;
    rekam.spbu = $("g-spbu").value.trim();
    rekam.lokasi = $("g-lokasi").value.trim();
    rekam.jenisBbm = $("g-jenis").value;
    rekam.liter = liter;
    rekam.hargaPerLiter = harga;
    rekam.total = GarageFuel.hitungTotal(liter, harga);
    rekam.penuh = $("g-penuh").value === "penuh";

    GarageDB.fuelSave(rekam).then(function () {
      kendaraanTerpilih = vehicleId;
      tutupSheet(sheetBBM);
      return muatUlang();
    }).catch(function () {
      pesan(errorBBM, "Gagal menyimpan. Coba lagi.", "bad");
    });
  }

  $("btn-add-bbm").addEventListener("click", function () { bukaFormBBM(null); });
  $("btn-cancel-bbm").addEventListener("click", function () { tutupSheet(sheetBBM); });
  sheetBBM.addEventListener("click", function (e) {
    if (e.target === sheetBBM) { tutupSheet(sheetBBM); }
  });
  formBBM.addEventListener("submit", function (e) {
    e.preventDefault();
    simpanBBM();
  });
  formBBM.addEventListener("input", function () { errorBBM.hidden = true; });
  $("g-liter").addEventListener("input", perbaruiTotalBBM);
  $("g-harga").addEventListener("input", perbaruiTotalBBM);
  $("g-kendaraan").addEventListener("change", function () {
    if (!sedangUbahBBM) { isiBawaanBBM(parseInt($("g-kendaraan").value, 10)); }
  });

  // ---------- Layar Cuci ----------

  var pilihCuci = $("c-pilih");
  var urlFotoCuciLihat = [];   // alamat sementara foto yang sedang dilihat

  function teksDesimal(n) {
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 1 });
  }

  function tutupFotoCuci() {
    tutupSheet($("sheet-foto-cuci"));
    urlFotoCuciLihat.forEach(function (u) { URL.revokeObjectURL(u); });
    urlFotoCuciLihat = [];
    $("viewer-cuci").innerHTML = "";
  }

  function lihatFotoCuci(c) {
    var ids = c.fotoIds || [];
    Promise.all(ids.map(function (id) { return GarageDB.attachmentGet(id); })).then(function (daftar) {
      var kotak = $("viewer-cuci");
      kotak.innerHTML = "";
      urlFotoCuciLihat.forEach(function (u) { URL.revokeObjectURL(u); });
      urlFotoCuciLihat = [];
      daftar.forEach(function (l) {
        if (!l || !l.blob) { return; }
        var u = URL.createObjectURL(l.blob);
        urlFotoCuciLihat.push(u);
        var g = document.createElement("img");
        g.src = u;
        g.alt = "Foto cuci";
        kotak.appendChild(g);
      });
      if (urlFotoCuciLihat.length) { bukaSheet($("sheet-foto-cuci"), null); }
    });
  }

  $("btn-viewer-cuci-close").addEventListener("click", tutupFotoCuci);
  $("sheet-foto-cuci").addEventListener("click", function (e) {
    if (e.target === $("sheet-foto-cuci")) { tutupFotoCuci(); }
  });

  function tampilkanCuci() {
    var ada = dataKendaraan.length > 0;
    var daftar = $("cuci-list");
    var kosong = $("cuci-empty");
    var ringkasan = $("cuci-summary");

    $("cuci-picker").hidden = !ada;
    $("btn-add-cuci").hidden = !ada;
    daftar.innerHTML = "";

    if (!ada) {
      ringkasan.hidden = true;
      $("cuci-empty-title").textContent = "Belum ada kendaraan";
      $("cuci-empty-text").textContent = "Tambahkan kendaraan di tab Garasi, lalu catat cucinya di sini.";
      kosong.hidden = false;
      return;
    }

    var masihAda = dataKendaraan.some(function (v) { return v.id === kendaraanTerpilih; });
    if (!masihAda) { kendaraanTerpilih = dataKendaraan[0].id; }
    isiPilihan(pilihCuci, kendaraanTerpilih);

    var catatan = GarageCarwash.urutkan(dataCuci.filter(function (c) { return c.vehicleId === kendaraanTerpilih; }));

    kosong.hidden = catatan.length > 0;
    ringkasan.hidden = catatan.length === 0;
    if (catatan.length === 0) {
      $("cuci-empty-title").textContent = "Belum ada catatan cuci";
      $("cuci-empty-text").textContent = "Ketuk + Catat untuk mencatat cuci pertama kendaraan ini.";
      return;
    }

    var st = GarageCarwash.statistik(catatan, tanggalHariIni());
    var elTerakhir = $("cs-last");
    elTerakhir.textContent = tanggalIndo(st.terakhir.tanggal);
    if (st.jarakSebelumnya !== null) {
      elTerakhir.appendChild(document.createTextNode(" "));
      elTerakhir.appendChild(buat("span", "inline-sub", "· " + st.jarakSebelumnya + " hari dari cuci sebelumnya"));
    }
    $("cs-since").textContent = st.hariSejak === 0 ? "Hari ini" : st.hariSejak + " hari lalu";
    $("cs-avg").textContent = st.rataHari === null ? "Butuh 2 catatan" : "Tiap " + teksDesimal(st.rataHari) + " hari";
    $("cs-n").textContent = String(st.jumlah);
    $("cs-month").textContent = rupiah(st.bulanIni);
    $("cs-year").textContent = rupiah(st.tahunIni);
    $("cs-total").textContent = rupiah(st.total);
    $("cs-avgcost").textContent = rupiah(st.rataBiaya);

    catatan.forEach(function (c) {
      var kartu = buat("article", "card record");
      var atas = buat("div", "r-top");
      atas.appendChild(buat("h2", "r-title", c.jenis));
      atas.appendChild(buat("span", "r-cost", rupiah(c.biaya)));
      kartu.appendChild(atas);

      var kapan = tanggalIndo(c.tanggal) + (c.waktu ? " · " + c.waktu : "");
      if (typeof c.km === "number") { kapan += " · " + angka(c.km) + " km"; }
      kartu.appendChild(buat("p", "r-meta", kapan));
      var info = [];
      if (c.lokasi) { info.push(c.lokasi); }
      if (typeof c.durasi === "number") { info.push(c.durasi + " menit"); }
      if (info.length) { kartu.appendChild(buat("p", "r-meta", info.join(" · "))); }
      if (c.catatan) { kartu.appendChild(buat("p", "r-note", c.catatan)); }

      var aksi = buat("div", "r-actions");
      var nFoto = (c.fotoIds || []).length;
      if (nFoto > 0) {
        var lihat = buat("button", "link-btn", "Lihat Foto (" + nFoto + ")");
        lihat.type = "button";
        lihat.addEventListener("click", function () { lihatFotoCuci(c); });
        aksi.appendChild(lihat);
      }
      var ubah = buat("button", "link-btn", "Ubah");
      ubah.type = "button";
      ubah.addEventListener("click", function () { bukaFormCuci(c); });
      aksi.appendChild(ubah);
      var hapus = buat("button", "link-btn", "Hapus");
      hapus.type = "button";
      hapus.addEventListener("click", function () {
        tanya("Hapus catatan cuci ini? Foto-fotonya juga ikut terhapus.", "Hapus", function () {
          GarageDB.carwashRemove(c.id).then(muatUlang);
        }, "Hapus catatan cuci");
      });
      aksi.appendChild(hapus);
      kartu.appendChild(aksi);
      daftar.appendChild(kartu);
    });
  }

  pilihCuci.addEventListener("change", function () {
    kendaraanTerpilih = parseInt(pilihCuci.value, 10);
    jenisHargaManual = false;
    tampilkanServis();
    tampilkanBBM();
    tampilkanCuci();
    tampilkanDokumen();
  });

  // ---------- Formulir catat cuci ----------

  var sheetCuci = $("sheet-cuci");
  var formCuci = $("cuci-form");
  var errorCuci = $("cuci-error");
  var cfotoMsg = $("cfoto-msg");
  var sedangUbahCuci = null;      // catatan yang sedang diubah (null = baru)
  var cuciIdLama = [];            // nomor foto tersimpan yang masih dipakai
  var cuciHapus = [];             // nomor foto tersimpan yang akan dibuang saat Simpan
  var cuciFotoBaru = [];          // foto baru: { blob, url }
  var cuciUrlLama = {};           // nomor foto tersimpan -> alamat sementara
  var sedangMenyimpanCuci = false;
  var tokenFormCuci = 0;

  GarageCarwash.JENIS.forEach(function (j) {
    var o = document.createElement("option");
    o.value = j;
    o.textContent = j;
    $("c-jenis").appendChild(o);
  });

  function bersihkanFotoCuci() {
    cuciFotoBaru.forEach(function (f) { URL.revokeObjectURL(f.url); });
    Object.keys(cuciUrlLama).forEach(function (k) { URL.revokeObjectURL(cuciUrlLama[k]); });
    cuciFotoBaru = [];
    cuciUrlLama = {};
    cuciIdLama = [];
    cuciHapus = [];
  }

  function gambarFotoCuci() {
    var kotak = $("c-fotos");
    kotak.innerHTML = "";
    function item(url, saatHapus) {
      var el = buat("div", "foto-item");
      var th = buat("div", "thumb");
      if (url) {
        var g = document.createElement("img");
        g.src = url;
        g.alt = "Foto cuci";
        th.appendChild(g);
      }
      el.appendChild(th);
      var h = buat("button", "link-btn", "Hapus");
      h.type = "button";
      h.addEventListener("click", saatHapus);
      el.appendChild(h);
      kotak.appendChild(el);
    }
    cuciIdLama.forEach(function (id) {
      item(cuciUrlLama[id] || null, function () {
        cuciIdLama = cuciIdLama.filter(function (x) { return x !== id; });
        cuciHapus.push(id);
        if (cuciUrlLama[id]) { URL.revokeObjectURL(cuciUrlLama[id]); delete cuciUrlLama[id]; }
        gambarFotoCuci();
      });
    });
    cuciFotoBaru.forEach(function (f) {
      item(f.url, function () {
        URL.revokeObjectURL(f.url);
        cuciFotoBaru = cuciFotoBaru.filter(function (x) { return x !== f; });
        gambarFotoCuci();
      });
    });
    var total = cuciIdLama.length + cuciFotoBaru.length;
    $("btn-cfoto").hidden = total >= GarageCarwash.MAKS_FOTO;
  }

  function bukaFormCuci(rec) {
    if (dataKendaraan.length === 0) { return; }
    tokenFormCuci++;
    var token = tokenFormCuci;
    sedangUbahCuci = rec || null;
    bersihkanFotoCuci();
    formCuci.reset();
    errorCuci.hidden = true;
    cfotoMsg.hidden = true;
    $("sheet-cuci-title").textContent = rec ? "Ubah Catatan Cuci" : "Catat Cuci";
    isiPilihan($("c-kendaraan"), rec ? rec.vehicleId : kendaraanTerpilih);
    $("c-kendaraan").disabled = !!rec; // catatan tidak boleh pindah kendaraan

    if (rec) {
      $("c-tanggal").value = rec.tanggal;
      $("c-waktu").value = rec.waktu || "";
      $("c-km").value = (typeof rec.km === "number") ? rec.km : "";
      $("c-jenis").value = rec.jenis;
      $("c-lokasi").value = rec.lokasi || "";
      $("c-biaya").value = rec.biaya || "";
      $("c-durasi").value = (typeof rec.durasi === "number") ? rec.durasi : "";
      $("c-catatan").value = rec.catatan || "";
      cuciIdLama = (rec.fotoIds || []).slice();
      cuciIdLama.forEach(function (id) {
        GarageDB.attachmentGet(id).then(function (l) {
          if (l && l.blob && token === tokenFormCuci && cuciIdLama.indexOf(id) !== -1) {
            cuciUrlLama[id] = URL.createObjectURL(l.blob);
            gambarFotoCuci();
          }
        });
      });
    } else {
      $("c-tanggal").value = tanggalHariIni();
      $("c-waktu").value = jamSekarang();
    }
    gambarFotoCuci();
    bukaSheet(sheetCuci, null);
  }

  function tutupFormCuci() {
    tokenFormCuci++;
    tutupSheet(sheetCuci);
    bersihkanFotoCuci();
  }

  $("btn-cfoto").addEventListener("click", function () { $("c-foto").click(); });

  $("c-foto").addEventListener("change", function () {
    var input = this;
    var berkas = Array.prototype.slice.call(input.files);
    input.value = "";
    if (berkas.length === 0) { return; }
    var token = tokenFormCuci;
    var sisa = GarageCarwash.MAKS_FOTO - (cuciIdLama.length + cuciFotoBaru.length);
    var dipakai = berkas.slice(0, Math.max(0, sisa));
    if (berkas.length > dipakai.length) {
      pesan(cfotoMsg, "Maksimal " + GarageCarwash.MAKS_FOTO + " foto. Foto selebihnya tidak dipakai.", "bad");
    } else {
      pesan(cfotoMsg, "Memproses foto...");
    }
    var urut = Promise.resolve();
    dipakai.forEach(function (b) {
      urut = urut.then(function () {
        return perkecilFoto(b, 1280, 0.85).then(function (blob) {
          if (token !== tokenFormCuci) { return; }
          if (cuciIdLama.length + cuciFotoBaru.length >= GarageCarwash.MAKS_FOTO) { return; }
          cuciFotoBaru.push({ blob: blob, url: URL.createObjectURL(blob) });
          gambarFotoCuci();
        });
      });
    });
    urut.then(function () {
      if (berkas.length === dipakai.length) { cfotoMsg.hidden = true; }
    }).catch(function () {
      pesan(cfotoMsg, "Ada foto yang tidak bisa dibaca. Coba foto lain.", "bad");
    });
  });

  function simpanCuci() {
    if (sedangMenyimpanCuci) { return; }
    var vehicleId = parseInt($("c-kendaraan").value, 10);
    var tanggal = $("c-tanggal").value;
    var waktu = $("c-waktu").value;
    var kmTeks = $("c-km").value.trim();
    var km = kmTeks === "" ? null : parseInt(kmTeks, 10);
    var biaya = String($("c-biaya").value).trim() === "" ? 0 : bacaBulat($("c-biaya").value);
    var durTeks = $("c-durasi").value.trim();
    var durasi = durTeks === "" ? null : parseInt(durTeks, 10);
    var idUbah = sedangUbahCuci ? sedangUbahCuci.id : null;

    var kendaraan = dataKendaraan.filter(function (v) { return v.id === vehicleId; })[0];
    if (!kendaraan) { pesan(errorCuci, "Pilih kendaraan dulu.", "bad"); return; }
    if (!tanggal || !GarageService.tanggalValid(tanggal)) {
      pesan(errorCuci, "Isi tanggal cuci dengan tanggal yang benar.", "bad"); return;
    }
    if (waktu && !GarageCarwash.waktuValid(waktu)) {
      pesan(errorCuci, "Jam tidak benar.", "bad"); return;
    }
    if (GarageCarwash.diMasaDepan(tanggal, waktu, tanggalHariIni(), jamSekarang())) {
      pesan(errorCuci, "Tanggal atau jam cuci tidak boleh di masa depan.", "bad"); return;
    }
    if (parseInt(tanggal.slice(0, 4), 10) < kendaraan.tahun - 1) {
      pesan(errorCuci, "Tanggal cuci terlalu lama, sebelum kendaraan ini dibuat (tahun " + kendaraan.tahun + ").", "bad"); return;
    }
    if (km !== null && (isNaN(km) || km < 0 || km > 2000000)) {
      pesan(errorCuci, "Isi odometer dengan angka antara 0 dan 2.000.000 km, atau kosongkan.", "bad"); return;
    }
    if (isNaN(biaya) || biaya > 1000000000) {
      pesan(errorCuci, "Isi biaya dengan angka rupiah (0 sampai 1.000.000.000). Kosong dianggap 0.", "bad"); return;
    }
    if (durasi !== null && (isNaN(durasi) || durasi < 1 || durasi > GarageCarwash.MAKS_DURASI)) {
      pesan(errorCuci, "Lama pengerjaan harus antara 1 dan 1.440 menit, atau kosongkan.", "bad"); return;
    }

    if (km !== null) {
      var konflik = GarageFuel.cekUrutanKm({ tanggal: tanggal, waktu: waktu || null, km: km },
        catatanLain(vehicleId, null, null, idUbah));
      if (konflik) { pesan(errorCuci, pesanKonflik(konflik), "bad"); return; }
    }

    var rekam = {};
    if (sedangUbahCuci) {
      Object.keys(sedangUbahCuci).forEach(function (k) { rekam[k] = sedangUbahCuci[k]; });
    } else {
      rekam.dibuat = Date.now();
      rekam.fotoIds = [];
    }
    rekam.vehicleId = vehicleId;
    rekam.tanggal = tanggal;
    rekam.waktu = waktu || null;
    rekam.km = km;
    rekam.jenis = $("c-jenis").value;
    rekam.lokasi = $("c-lokasi").value.trim();
    rekam.biaya = biaya;
    rekam.durasi = durasi;
    rekam.catatan = $("c-catatan").value.trim();

    sedangMenyimpanCuci = true;
    var tombol = formCuci.querySelector("button[type=submit]");
    tombol.disabled = true;
    GarageDB.carwashSave(rekam, cuciFotoBaru.map(function (f) { return f.blob; }), cuciHapus.slice()).then(function () {
      kendaraanTerpilih = vehicleId;
      tutupFormCuci();
      return muatUlang();
    }).catch(function () {
      pesan(errorCuci, "Gagal menyimpan. Coba lagi.", "bad");
    }).then(function () {
      sedangMenyimpanCuci = false;
      tombol.disabled = false;
    });
  }

  $("btn-add-cuci").addEventListener("click", function () { bukaFormCuci(null); });
  $("btn-cancel-cuci").addEventListener("click", tutupFormCuci);
  sheetCuci.addEventListener("click", function (e) {
    if (e.target === sheetCuci) { tutupFormCuci(); }
  });
  formCuci.addEventListener("submit", function (e) {
    e.preventDefault();
    simpanCuci();
  });
  formCuci.addEventListener("input", function () { errorCuci.hidden = true; });

  // ---------- Layar Dokumen ----------

  var pilihDok = $("d-pilih");
  var detailDok = null; // dokumen yang sedang dibuka di lembar detail
  var urlFotoDokLihat = [];

  var LABEL_STATUS_DOK = {
    aktif: "Aktif", segera: "Segera Kedaluwarsa", kedaluwarsa: "Kedaluwarsa", diganti: "Diperbarui"
  };
  var LABEL_TINGKAT = {
    "30": "30 hari", "14": "14 hari", "7": "7 hari", "hari-ini": "Hari ini", "terlambat": "Terlambat"
  };
  var LABEL_NOMOR = {
    STNK: "Nomor STNK (boleh kosong)", Asuransi: "Nomor polis (boleh kosong)", BPKB: "Nomor BPKB (boleh kosong)",
    SIM: "Nomor SIM (boleh kosong)", Lainnya: "Nomor dokumen (boleh kosong)"
  };
  var LABEL_NAMA = { SIM: "Golongan SIM (boleh kosong), contoh: SIM A", Lainnya: "Nama dokumen" };

  function judulDokumen(r) {
    if (r.jenis === "Asuransi") { return "Asuransi" + (r.perusahaan ? " · " + r.perusahaan : ""); }
    if (r.jenis === "SIM") { return "SIM" + (r.nama ? " · " + r.nama : ""); }
    if (r.jenis === "Lainnya") { return r.nama || "Dokumen"; }
    return r.jenis;
  }

  // "12 hari lagi", "Hari ini", "Terlambat 3 hari"
  function teksSisaHari(sisa) {
    if (sisa > 0) { return sisa + " hari lagi"; }
    if (sisa === 0) { return "Hari ini"; }
    return "Terlambat " + (-sisa) + " hari";
  }

  function badgeSisa(x) {
    return buat("span", "badge st-" + x.status, teksSisaHari(x.sisaHari));
  }

  function dokumenKendaraan(vehicleId) {
    return dataDok.filter(function (d) { return d.vehicleId === vehicleId; });
  }

  // Satu baris pengingat (dipakai di Garasi dan di tab Dokumen)
  function barisPengingat(p, denganKendaraan) {
    var baris = buat("div", "dok-line");
    var atas = buat("div", "r-top");
    atas.appendChild(buat("h3", "sched-name", judulDokumen(p.rekam) + " · " + p.label));
    atas.appendChild(buat("span", "badge lv-" + p.tingkat, LABEL_TINGKAT[p.tingkat]));
    baris.appendChild(atas);
    var info = tanggalIndo(p.tanggal) + " · " + teksSisaHari(p.sisaHari);
    baris.appendChild(buat("p", "r-meta", info));
    if (denganKendaraan) {
      var v = dataKendaraan.filter(function (k) { return k.id === p.rekam.vehicleId; })[0];
      if (v) { baris.appendChild(buat("p", "r-note", namaKendaraan(v) + " · " + v.plat)); }
      var buka = buat("button", "link-btn link-go", "Buka dokumen");
      buka.type = "button";
      buka.addEventListener("click", function () {
        kendaraanTerpilih = p.rekam.vehicleId;
        tampilkanServis(); tampilkanBBM(); tampilkanCuci(); tampilkanDokumen();
        document.querySelector('.tab[data-view="dokumen"]').click();
      });
      baris.appendChild(buka);
    }
    return baris;
  }

  // Pengingat semua kendaraan, ditampilkan di tab Garasi setiap aplikasi dibuka
  function tampilkanBannerDokumen() {
    var banner = $("doc-banner");
    var isi = $("doc-banner-list");
    var semua = [];
    dataKendaraan.forEach(function (v) {
      var a = GarageDokumen.daftar(dokumenKendaraan(v.id), tanggalHariIni());
      GarageDokumen.pengingat(a).forEach(function (p) { semua.push(p); });
    });
    semua.sort(function (a, b) { return a.sisaHari - b.sisaHari; });
    isi.innerHTML = "";
    banner.hidden = semua.length === 0;
    if (semua.length === 0) { return; }
    semua.slice(0, 5).forEach(function (p) { isi.appendChild(barisPengingat(p, true)); });
    if (semua.length > 5) {
      isi.appendChild(buat("p", "note", "Dan " + (semua.length - 5) + " pengingat lain. Buka tab Dokumen untuk melihat semuanya."));
    }
  }

  function tutupFotoDokLihat() {
    urlFotoDokLihat.forEach(function (u) { URL.revokeObjectURL(u); });
    urlFotoDokLihat = [];
    $("dok-detail-fotos").innerHTML = "";
  }

  function tutupDetailDok() {
    tutupSheet($("sheet-dok-detail"));
    tutupFotoDokLihat();
    detailDok = null;
  }

  function barisDetail(dl, nama, nilai) {
    if (nilai === undefined || nilai === null || nilai === "") { return; }
    var kotak = document.createElement("div");
    kotak.appendChild(buat("dt", "", nama));
    kotak.appendChild(buat("dd", "", nilai));
    dl.appendChild(kotak);
  }

  function bukaDetailDok(r) {
    detailDok = r;
    var a = GarageDokumen.analisis(r, dokumenKendaraan(r.vehicleId), tanggalHariIni());
    $("dok-detail-title").textContent = judulDokumen(r);
    var badan = $("dok-detail-body");
    badan.innerHTML = "";
    var tag = buat("div", "r-tags");
    tag.appendChild(buat("span", "badge st-" + a.status, LABEL_STATUS_DOK[a.status]));
    badan.appendChild(tag);
    var dl = document.createElement("dl");
    var v = dataKendaraan.filter(function (k) { return k.id === r.vehicleId; })[0];
    barisDetail(dl, "Kendaraan", v ? namaKendaraan(v) + " · " + v.plat : "");
    barisDetail(dl, "Jenis dokumen", r.jenis);
    if (r.jenis === "Lainnya") { barisDetail(dl, "Nama dokumen", r.nama); }
    if (r.jenis === "SIM") { barisDetail(dl, "Golongan", r.nama); }
    barisDetail(dl, r.jenis === "Asuransi" ? "Nomor polis" : "Nomor", r.nomor);
    barisDetail(dl, "Perusahaan asuransi", r.perusahaan);
    barisDetail(dl, "Jenis perlindungan", r.perlindungan);
    barisDetail(dl, "Tanggal terbit", r.tanggalTerbit ? tanggalIndo(r.tanggalTerbit) : "");
    barisDetail(dl, "Tanggal mulai", r.tanggalMulai ? tanggalIndo(r.tanggalMulai) : "");
    a.item.forEach(function (x) {
      barisDetail(dl, x.label, tanggalIndo(x.tanggal) + " · " + teksSisaHari(x.sisaHari));
    });
    barisDetail(dl, "Catatan", r.catatan);
    if (typeof r.biaya === "number" && r.biaya > 0 && r.tanggalBayar) {
      barisDetail(dl, "Biaya dibayar", rupiah(r.biaya) + " · " + tanggalIndo(r.tanggalBayar));
    }
    barisDetail(dl, "Pengingat", a.item.length ? (r.pengingat === false ? "Dimatikan" : "Aktif (saat aplikasi dibuka)") : "");
    badan.appendChild(dl);

    tutupFotoDokLihat();
    var ids = r.fotoIds || [];
    Promise.all(ids.map(function (id) { return GarageDB.attachmentGet(id); })).then(function (daftar) {
      if (detailDok !== r) { return; }
      var kotak = $("dok-detail-fotos");
      kotak.innerHTML = "";
      daftar.forEach(function (l) {
        if (!l || !l.blob) { return; }
        var u = URL.createObjectURL(l.blob);
        urlFotoDokLihat.push(u);
        var g = document.createElement("img");
        g.src = u;
        g.alt = "Foto dokumen";
        kotak.appendChild(g);
      });
    });
    bukaSheet($("sheet-dok-detail"), null);
  }

  function tampilkanDokumen() {
    var ada = dataKendaraan.length > 0;
    var daftar = $("dok-list");
    var kosong = $("dok-empty");
    var ringkasan = $("dok-summary");
    var kartuIngat = $("dok-ingat");

    $("dok-picker").hidden = !ada;
    $("btn-add-dok").hidden = !ada;
    daftar.innerHTML = "";
    kartuIngat.hidden = true;

    if (!ada) {
      ringkasan.hidden = true;
      $("dok-empty-title").textContent = "Belum ada kendaraan";
      $("dok-empty-text").textContent = "Tambahkan kendaraan di tab Garasi, lalu simpan dokumennya di sini.";
      kosong.hidden = false;
      return;
    }

    var masihAda = dataKendaraan.some(function (v) { return v.id === kendaraanTerpilih; });
    if (!masihAda) { kendaraanTerpilih = dataKendaraan[0].id; }
    isiPilihan(pilihDok, kendaraanTerpilih);

    var hasil = GarageDokumen.daftar(dokumenKendaraan(kendaraanTerpilih), tanggalHariIni());
    kosong.hidden = hasil.length > 0;
    ringkasan.hidden = hasil.length === 0;
    if (hasil.length === 0) {
      $("dok-empty-title").textContent = "Belum ada dokumen";
      $("dok-empty-text").textContent = "Ketuk + Tambah untuk menyimpan STNK, asuransi, BPKB, SIM, atau dokumen lain kendaraan ini.";
      return;
    }

    var rg = GarageDokumen.ringkasan(hasil);
    $("ds-aktif").textContent = String(rg.aktif);
    $("ds-segera").textContent = String(rg.segera);
    $("ds-lewat").textContent = String(rg.kedaluwarsa);
    $("ds-n").textContent = String(rg.total);

    var ingat = GarageDokumen.pengingat(hasil);
    if (ingat.length > 0) {
      var isi = $("dok-ingat-list");
      isi.innerHTML = "";
      ingat.forEach(function (p) { isi.appendChild(barisPengingat(p, false)); });
      kartuIngat.hidden = false;
    }

    hasil.forEach(function (a) {
      var r = a.rekam;
      var kartu = buat("article", "card record");
      var atas = buat("div", "r-top");
      atas.appendChild(buat("h2", "r-title", judulDokumen(r)));
      atas.appendChild(buat("span", "badge st-" + a.status, LABEL_STATUS_DOK[a.status]));
      kartu.appendChild(atas);

      var info = [];
      if (r.nomor) { info.push("No. " + r.nomor); }
      if (r.jenis === "Asuransi" && r.perlindungan) { info.push(r.perlindungan); }
      if (info.length) { kartu.appendChild(buat("p", "r-meta", info.join(" · "))); }
      if (r.tanggalTerbit) { kartu.appendChild(buat("p", "r-meta", "Terbit " + tanggalIndo(r.tanggalTerbit))); }
      if (r.jenis === "Asuransi" && r.tanggalMulai) { kartu.appendChild(buat("p", "r-meta", "Mulai " + tanggalIndo(r.tanggalMulai))); }

      a.item.forEach(function (x) {
        var baris = buat("div", "dok-due");
        baris.appendChild(buat("p", "r-meta", x.label + ": " + tanggalIndo(x.tanggal)));
        baris.appendChild(badgeSisa(x));
        kartu.appendChild(baris);
      });
      if (a.item.length === 0) { kartu.appendChild(buat("p", "r-meta", "Tanpa tanggal kedaluwarsa")); }

      var nFoto = (r.fotoIds || []).length;
      if (nFoto > 0) { kartu.appendChild(buat("p", "r-meta", nFoto + " foto")); }
      if (r.catatan) { kartu.appendChild(buat("p", "r-note", r.catatan)); }

      var aksi = buat("div", "r-actions");
      var det = buat("button", "link-btn", "Detail");
      det.type = "button";
      det.addEventListener("click", function () { bukaDetailDok(r); });
      aksi.appendChild(det);
      var ubah = buat("button", "link-btn", "Ubah");
      ubah.type = "button";
      ubah.addEventListener("click", function () { bukaFormDok(r); });
      aksi.appendChild(ubah);
      var hapus = buat("button", "link-btn", "Hapus");
      hapus.type = "button";
      hapus.addEventListener("click", function () { hapusDok(r); });
      aksi.appendChild(hapus);
      kartu.appendChild(aksi);
      daftar.appendChild(kartu);
    });
  }

  function hapusDok(r) {
    tanya("Hapus dokumen ini? Foto-fotonya juga ikut terhapus.", "Hapus", function () {
      GarageDB.docRemove(r.id).then(function () {
        if (detailDok && detailDok.id === r.id) { tutupDetailDok(); }
        return muatUlang();
      });
    }, "Hapus dokumen");
  }

  pilihDok.addEventListener("change", function () {
    kendaraanTerpilih = parseInt(pilihDok.value, 10);
    jenisHargaManual = false;
    tampilkanServis();
    tampilkanBBM();
    tampilkanCuci();
    tampilkanDokumen();
  });

  $("btn-dok-tutup").addEventListener("click", tutupDetailDok);
  $("sheet-dok-detail").addEventListener("click", function (e) {
    if (e.target === $("sheet-dok-detail")) { tutupDetailDok(); }
  });
  $("btn-dok-ubah").addEventListener("click", function () {
    var r = detailDok;
    tutupDetailDok();
    if (r) { bukaFormDok(r); }
  });
  $("btn-dok-hapus").addEventListener("click", function () { if (detailDok) { hapusDok(detailDok); } });

  // Hari berganti saat aplikasi dibuka kembali dari latar belakang: hitung ulang status dan pengingat
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      tampilkanDokumen();
      tampilkanBannerDokumen();
      tampilkanPengeluaran();
      tampilkanAnalitik();
    }
  });

  // ---------- Formulir dokumen ----------

  var sheetDok = $("sheet-dok");
  var formDok = $("dok-form");
  var errorDok = $("dok-error");
  var dfotoMsg = $("dfoto-msg");
  var sedangUbahDok = null;
  var dokIdLama = [];
  var dokHapus = [];
  var dokFotoBaru = [];
  var dokUrlLama = {};
  var sedangMenyimpanDok = false;
  var tokenFormDok = 0;

  GarageDokumen.JENIS.forEach(function (j) {
    var o = document.createElement("option");
    o.value = j;
    o.textContent = j === "Lainnya" ? "Dokumen lainnya" : j;
    $("d-jenis").appendChild(o);
  });
  GarageDokumen.PERLINDUNGAN.forEach(function (j) {
    var o = document.createElement("option");
    o.value = j;
    o.textContent = j;
    $("d-perlindungan").appendChild(o);
  });

  // Hanya isian yang cocok dengan jenis dokumen yang ditampilkan
  function terapkanJenisDok() {
    var jenis = $("d-jenis").value;
    Array.prototype.forEach.call(formDok.querySelectorAll(".fld"), function (f) {
      f.hidden = f.getAttribute("data-for").split(" ").indexOf(jenis) === -1;
    });
    $("lbl-d-nomor").textContent = LABEL_NOMOR[jenis] || "Nomor";
    $("lbl-d-nama").textContent = LABEL_NAMA[jenis] || "Nama";
  }

  function bersihkanFotoDok() {
    dokFotoBaru.forEach(function (f) { URL.revokeObjectURL(f.url); });
    Object.keys(dokUrlLama).forEach(function (k) { URL.revokeObjectURL(dokUrlLama[k]); });
    dokFotoBaru = [];
    dokUrlLama = {};
    dokIdLama = [];
    dokHapus = [];
  }

  function gambarFotoDok() {
    var kotak = $("d-fotos");
    kotak.innerHTML = "";
    function item(url, saatHapus) {
      var el = buat("div", "foto-item");
      var th = buat("div", "thumb");
      if (url) {
        var g = document.createElement("img");
        g.src = url;
        g.alt = "Foto dokumen";
        th.appendChild(g);
      }
      el.appendChild(th);
      var h = buat("button", "link-btn", "Hapus");
      h.type = "button";
      h.addEventListener("click", saatHapus);
      el.appendChild(h);
      kotak.appendChild(el);
    }
    dokIdLama.forEach(function (id) {
      item(dokUrlLama[id] || null, function () {
        dokIdLama = dokIdLama.filter(function (x) { return x !== id; });
        dokHapus.push(id);
        if (dokUrlLama[id]) { URL.revokeObjectURL(dokUrlLama[id]); delete dokUrlLama[id]; }
        gambarFotoDok();
      });
    });
    dokFotoBaru.forEach(function (f) {
      item(f.url, function () {
        URL.revokeObjectURL(f.url);
        dokFotoBaru = dokFotoBaru.filter(function (x) { return x !== f; });
        gambarFotoDok();
      });
    });
    $("btn-dfoto").hidden = (dokIdLama.length + dokFotoBaru.length) >= GarageDokumen.MAKS_FOTO;
  }

  function bukaFormDok(rec) {
    if (dataKendaraan.length === 0) { return; }
    tokenFormDok++;
    var token = tokenFormDok;
    sedangUbahDok = rec || null;
    bersihkanFotoDok();
    formDok.reset();
    errorDok.hidden = true;
    dfotoMsg.hidden = true;
    $("sheet-dok-title").textContent = rec ? "Ubah Dokumen" : "Tambah Dokumen";
    isiPilihan($("d-kendaraan"), rec ? rec.vehicleId : kendaraanTerpilih);
    $("d-kendaraan").disabled = !!rec;
    $("d-jenis").disabled = !!rec;
    if (rec) {
      $("d-jenis").value = rec.jenis;
      $("d-nama").value = rec.nama || "";
      $("d-nomor").value = rec.nomor || "";
      $("d-perusahaan").value = rec.perusahaan || "";
      if (rec.perlindungan) { $("d-perlindungan").value = rec.perlindungan; }
      $("d-terbit").value = rec.tanggalTerbit || "";
      $("d-mulai").value = rec.tanggalMulai || "";
      $("d-berakhir").value = rec.tanggalBerakhir || "";
      $("d-pajak").value = rec.pajakTahunan || "";
      $("d-stnk5").value = rec.stnk5Tahun || "";
      $("d-berlaku").value = rec.berlakuSampai || "";
      $("d-catatan").value = rec.catatan || "";
      $("d-biaya").value = typeof rec.biaya === "number" ? String(rec.biaya) : "";
      $("d-bayar").value = rec.tanggalBayar || "";
      $("d-ingat").value = rec.pengingat === false ? "nonaktif" : "aktif";
      dokIdLama = (rec.fotoIds || []).slice();
      dokIdLama.forEach(function (id) {
        GarageDB.attachmentGet(id).then(function (l) {
          if (l && l.blob && token === tokenFormDok && dokIdLama.indexOf(id) !== -1) {
            dokUrlLama[id] = URL.createObjectURL(l.blob);
            gambarFotoDok();
          }
        });
      });
    }
    terapkanJenisDok();
    gambarFotoDok();
    bukaSheet(sheetDok, null);
  }

  function tutupFormDok() {
    tokenFormDok++;
    tutupSheet(sheetDok);
    bersihkanFotoDok();
  }

  $("d-jenis").addEventListener("change", function () { terapkanJenisDok(); errorDok.hidden = true; });
  $("btn-dfoto").addEventListener("click", function () { $("d-foto").click(); });

  function namaFotoValid(b) {
    return (b.type && b.type.indexOf("image/") === 0) || (!b.type && /\.(jpe?g|png|heic|heif|webp)$/i.test(b.name || ""));
  }

  // Memeriksa jenis dan ukuran, lalu memperkecil. Hasil: Blob, atau error dengan pesan.
  function siapkanFotoDok(b) {
    if (!namaFotoValid(b)) {
      return Promise.reject(new Error("Hanya foto yang bisa dipilih (bukan PDF atau file lain)."));
    }
    if (b.size > GarageDokumen.MAKS_BERKAS_ASLI) {
      return Promise.reject(new Error("Foto terlalu besar (maksimal 25 MB)."));
    }
    return perkecilFoto(b, GarageDokumen.MAKS_SISI_FOTO, 0.85).then(function (blob) {
      if (blob.size <= GarageDokumen.MAKS_BERKAS_SIMPAN) { return blob; }
      return perkecilFoto(b, 1280, 0.7).then(function (kecil) {
        if (kecil.size > GarageDokumen.MAKS_BERKAS_SIMPAN) { throw new Error("Foto terlalu besar setelah diperkecil. Coba foto lain."); }
        return kecil;
      });
    }, function () {
      throw new Error("Foto tidak bisa dibaca. Coba foto lain.");
    });
  }

  $("d-foto").addEventListener("change", function () {
    var input = this;
    var berkas = Array.prototype.slice.call(input.files);
    input.value = "";
    if (berkas.length === 0) { return; }
    var token = tokenFormDok;
    var sisa = GarageDokumen.MAKS_FOTO - (dokIdLama.length + dokFotoBaru.length);
    var dipakai = berkas.slice(0, Math.max(0, sisa));
    var pesanAkhir = berkas.length > dipakai.length ? "Maksimal " + GarageDokumen.MAKS_FOTO + " foto. Foto selebihnya tidak dipakai." : null;
    pesan(dfotoMsg, "Memproses foto...");
    var urut = Promise.resolve();
    dipakai.forEach(function (b) {
      urut = urut.then(function () {
        return siapkanFotoDok(b).then(function (blob) {
          if (token !== tokenFormDok) { return; }
          if (dokIdLama.length + dokFotoBaru.length >= GarageDokumen.MAKS_FOTO) { return; }
          dokFotoBaru.push({ blob: blob, url: URL.createObjectURL(blob) });
          gambarFotoDok();
        }, function (e) {
          pesanAkhir = e.message;
        });
      });
    });
    urut.then(function () {
      if (pesanAkhir) { pesan(dfotoMsg, pesanAkhir, "bad"); } else { dfotoMsg.hidden = true; }
    });
  });

  function nilaiDok(id, jenis, untuk) {
    if (untuk.split(" ").indexOf(jenis) === -1) { return ""; }
    return String($(id).value).trim();
  }

  function simpanDok() {
    if (sedangMenyimpanDok) { return; }
    var vehicleId = parseInt($("d-kendaraan").value, 10);
    var jenis = $("d-jenis").value;
    var kendaraan = dataKendaraan.filter(function (v) { return v.id === vehicleId; })[0];
    if (!kendaraan) { pesan(errorDok, "Pilih kendaraan dulu.", "bad"); return; }

    var d = {
      jenis: jenis,
      nama: nilaiDok("d-nama", jenis, "SIM Lainnya"),
      nomor: nilaiDok("d-nomor", jenis, "STNK Asuransi BPKB SIM Lainnya"),
      perusahaan: nilaiDok("d-perusahaan", jenis, "Asuransi"),
      perlindungan: jenis === "Asuransi" ? $("d-perlindungan").value : "",
      tanggalTerbit: nilaiDok("d-terbit", jenis, "STNK BPKB SIM Lainnya"),
      tanggalMulai: nilaiDok("d-mulai", jenis, "Asuransi"),
      tanggalBerakhir: nilaiDok("d-berakhir", jenis, "Asuransi"),
      pajakTahunan: nilaiDok("d-pajak", jenis, "STNK"),
      stnk5Tahun: nilaiDok("d-stnk5", jenis, "STNK"),
      berlakuSampai: nilaiDok("d-berlaku", jenis, "SIM Lainnya"),
      catatan: nilaiDok("d-catatan", jenis, "STNK Asuransi BPKB SIM Lainnya"),
      biaya: null,
      tanggalBayar: nilaiDok("d-bayar", jenis, "STNK Asuransi")
    };
    var teksBiaya = nilaiDok("d-biaya", jenis, "STNK Asuransi");
    if (teksBiaya !== "") { d.biaya = bacaBulat(teksBiaya); }
    var salah = GarageDokumen.periksa(d, tanggalHariIni(), kendaraan.tahun);
    if (salah) { pesan(errorDok, salah, "bad"); return; }

    var rekam = {};
    if (sedangUbahDok) {
      Object.keys(sedangUbahDok).forEach(function (k) { rekam[k] = sedangUbahDok[k]; });
    } else {
      rekam.dibuat = Date.now();
      rekam.fotoIds = [];
    }
    rekam.vehicleId = vehicleId;
    rekam.jenis = jenis;
    rekam.nama = d.nama;
    rekam.nomor = d.nomor;
    rekam.perusahaan = d.perusahaan;
    rekam.perlindungan = d.perlindungan;
    rekam.tanggalTerbit = d.tanggalTerbit || null;
    rekam.tanggalMulai = d.tanggalMulai || null;
    rekam.tanggalBerakhir = d.tanggalBerakhir || null;
    rekam.pajakTahunan = d.pajakTahunan || null;
    rekam.stnk5Tahun = d.stnk5Tahun || null;
    rekam.berlakuSampai = d.berlakuSampai || null;
    rekam.catatan = d.catatan;
    rekam.biaya = d.biaya;               // null = tidak ada biaya (tidak dihitung di Pengeluaran)
    rekam.tanggalBayar = d.tanggalBayar || null;
    rekam.pengingat = nilaiDok("d-ingat", jenis, "STNK Asuransi SIM Lainnya") !== "nonaktif";

    sedangMenyimpanDok = true;
    var tombol = formDok.querySelector("button[type=submit]");
    tombol.disabled = true;
    GarageDB.docSave(rekam, dokFotoBaru.map(function (f) { return f.blob; }), dokHapus.slice()).then(function () {
      kendaraanTerpilih = vehicleId;
      tutupFormDok();
      return muatUlang();
    }).catch(function () {
      pesan(errorDok, "Gagal menyimpan. Coba lagi.", "bad");
    }).then(function () {
      sedangMenyimpanDok = false;
      tombol.disabled = false;
    });
  }

  $("btn-add-dok").addEventListener("click", function () { bukaFormDok(null); });
  $("btn-cancel-dok").addEventListener("click", tutupFormDok);
  sheetDok.addEventListener("click", function (e) {
    if (e.target === sheetDok) { tutupFormDok(); }
  });
  formDok.addEventListener("submit", function (e) {
    e.preventDefault();
    simpanDok();
  });
  formDok.addEventListener("input", function () { errorDok.hidden = true; });

  // ---------- Layar Pengeluaran (Tahap 6) ----------
  // Semua angka dibangun dari catatan ASLI (BBM, servis, cuci, dokumen, dan pengeluaran manual).
  // Tidak ada salinan transaksi, jadi tidak ada penghitungan ganda.

  var NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var IKON_KAT = {
    "BBM": '<path d="M4 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3 20h11M6.5 8h4M13 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8l-2.5-2.5"/>',
    "Servis & Perawatan": '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.1-.5-.5-2.1z"/>',
    "Cuci Kendaraan": '<path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z"/>',
    "Suku Cadang": '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    "Pajak Kendaraan": '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
    "Asuransi": '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    "Parkir": '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
    "Tol": '<path d="M4 20V6M4 10h16v4H4M8 10v4M12 10v4M16 10v4"/>',
    "Perbaikan": '<path d="M14 5l5 5-2 2-5-5zM12 7L4 15l-1 4 4-1 8-8"/>',
    "Lainnya": '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>'
  };

  var xKendaraan = "semua";
  var xPeriode = { jenis: "semua", bulan: "", dari: "", sampai: "" };
  var xKategori = "";
  var xCari = "";
  var xMode = "bulan";
  var xBatas = 30;
  var xTerpilih = null;       // nomor batang grafik yang sedang dipilih
  var detailBiaya = null;     // transaksi yang sedang dibuka di lembar detail
  var urlFotoBiayaLihat = [];

  function ikonKategori(k) {
    var el = buat("span", "rank-ikon");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      (IKON_KAT[k] || IKON_KAT["Lainnya"]) + '</svg>';
    return el;
  }

  function rupiahSingkat(n) {
    function f(x) { return x.toLocaleString("id-ID", { maximumFractionDigits: 1 }); }
    if (n >= 1e9) { return f(n / 1e9) + " M"; }
    if (n >= 1e6) { return f(n / 1e6) + " jt"; }
    if (n >= 1e3) { return f(n / 1e3) + " rb"; }
    return String(n);
  }

  function semuaTransaksi() {
    return GaragePengeluaran.kumpulkan({
      kendaraan: dataKendaraan, bbm: dataBBM, servis: dataServis,
      cuci: dataCuci, dokumen: dataDok, manual: dataBiaya
    });
  }

  function namaKendaraanById(id) {
    var v = dataKendaraan.filter(function (k) { return k.id === id; })[0];
    return v ? namaKendaraan(v) : "Kendaraan";
  }

  function periodeAktif(hariIni) {
    var r = GaragePengeluaran.rentang(xPeriode, hariIni);
    var salah = (r.dari && r.sampai && r.dari > r.sampai);
    return { dari: r.dari, sampai: r.sampai, salah: salah };
  }

  function teksPeriode(r) {
    if (r.salah) { return "Tanggal awal tidak boleh setelah tanggal akhir."; }
    if (!r.dari && !r.sampai) { return "Periode: semua waktu."; }
    if (r.dari && r.sampai) { return "Periode: " + tanggalIndo(r.dari) + " sampai " + tanggalIndo(r.sampai) + "."; }
    if (r.dari) { return "Periode: mulai " + tanggalIndo(r.dari) + "."; }
    return "Periode: sampai " + tanggalIndo(r.sampai) + ".";
  }

  function ringkasShortcut(semua, hariIni) {
    var tombol = $("btn-ke-pengeluaran");
    tombol.hidden = dataKendaraan.length === 0;
    if (semua.length === 0) { $("sc-info").textContent = "Belum ada pengeluaran tercatat"; return; }
    var r = GaragePengeluaran.rentang({ jenis: "bulan-ini" }, hariIni);
    var total = GaragePengeluaran.jumlahkan(GaragePengeluaran.saring(semua, { dari: r.dari, sampai: r.sampai }));
    $("sc-info").textContent = "Bulan ini " + rupiah(total) + " · semua kendaraan";
  }

  function gambarGrafikBatang(titik, dipilih) {
    gambarBatang($("x-grafik"), titik, dipilih, function (i) { xTerpilih = i; tampilkanPengeluaran(); });
  }

  // Grafik batang umum. fmt (boleh kosong) = { penuh: angka -> teks, singkat: angka -> teks }
  function gambarBatang(kotak, titik, dipilih, saatPilih, fmt) {
    var fPenuh = (fmt && fmt.penuh) || rupiah;
    var fSingkat = (fmt && fmt.singkat) || function (n) { return "Rp " + rupiahSingkat(n); };
    kotak.innerHTML = "";
    var NS = "http://www.w3.org/2000/svg";
    var W = 360, H = 170, kiri = 6, kanan = 6, dasar = 142, tinggiMaks = 108;
    var maks = 0;
    titik.forEach(function (p) { if (p.total > maks) { maks = p.total; } });
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Grafik batang pengeluaran: " + titik.map(function (p) { return p.label + " " + fPenuh(p.total); }).join(", "));

    function el(nama, atribut) {
      var e = document.createElementNS(NS, nama);
      Object.keys(atribut).forEach(function (k) { e.setAttribute(k, atribut[k]); });
      return e;
    }
    svg.appendChild(el("line", { x1: kiri, x2: W - kanan, y1: dasar, y2: dasar, "class": "grid" }));
    svg.appendChild(el("line", { x1: kiri, x2: W - kanan, y1: dasar - tinggiMaks, y2: dasar - tinggiMaks, "class": "grid" }));
    var tMaks = el("text", { x: kiri, y: dasar - tinggiMaks - 6, "class": "t" });
    tMaks.textContent = maks > 0 ? fSingkat(maks) : "";
    svg.appendChild(tMaks);

    var slot = (W - kiri - kanan) / titik.length;
    var lebar = Math.min(34, slot * 0.62);
    var langkahLabel = titik.length > 12 ? 2 : 1;
    titik.forEach(function (p, i) {
      var x = kiri + slot * i + (slot - lebar) / 2;
      var tinggi = maks > 0 ? Math.round(p.total / maks * tinggiMaks) : 0;
      if (p.total > 0 && tinggi < 2) { tinggi = 2; }
      var kelas = "bar" + (p.total === 0 ? " nol" : "") + (p.dalam ? "" : " luar") + (i === dipilih ? " sel" : "");
      svg.appendChild(el("rect", { x: x, y: dasar - Math.max(tinggi, 1), width: lebar, height: Math.max(tinggi, 1), rx: 3, "class": kelas }));
      if (i % langkahLabel === 0) {
        var t = el("text", { x: x + lebar / 2, y: dasar + 15, "text-anchor": "middle", "class": "t" });
        t.textContent = p.label;
        svg.appendChild(t);
      }
      var hit = el("rect", { x: kiri + slot * i, y: 0, width: slot, height: H, "class": "hit", "data-i": i });
      hit.addEventListener("click", function () { saatPilih(i); });
      svg.appendChild(hit);
    });
    kotak.appendChild(svg);
  }

  function titikGrafik(vk, hariIni, r) {
    var P = GaragePengeluaran;
    var akhirTgl = (r.sampai && r.sampai < hariIni) ? r.sampai : hariIni;
    function dalamTgl(a, b) { // rentang a..b beririsan dengan periode?
      if (r.dari && b < r.dari) { return false; }
      if (r.sampai && a > r.sampai) { return false; }
      return true;
    }
    var titik, ket;
    if (xMode === "hari") {
      titik = P.perHari(vk, akhirTgl, 14).map(function (p) {
        p.label = String(parseInt(p.kunci.slice(8), 10));
        p.nama = tanggalIndo(p.kunci);
        p.dalam = dalamTgl(p.kunci, p.kunci);
        return p;
      });
      ket = "14 hari berakhir " + tanggalIndo(akhirTgl) + ".";
    } else if (xMode === "tahun") {
      titik = P.perTahun(vk, 6).map(function (p) {
        p.label = p.kunci;
        p.nama = "Tahun " + p.kunci;
        p.dalam = dalamTgl(p.kunci + "-01-01", p.kunci + "-12-31");
        return p;
      });
      ket = "Tahun-tahun yang punya pengeluaran (maksimal 6 tahun terakhir).";
    } else {
      titik = P.perBulan(vk, akhirTgl.slice(0, 7), 12).map(function (p) {
        var bln = parseInt(p.kunci.slice(5), 10) - 1;
        p.label = NAMA_BULAN[bln];
        p.nama = NAMA_BULAN[bln] + " " + p.kunci.slice(0, 4);
        p.dalam = dalamTgl(p.kunci + "-01", p.kunci + "-31");
        return p;
      });
      ket = "12 bulan berakhir " + titik[titik.length - 1].nama + ".";
    }
    return { titik: titik, ket: ket };
  }

  function barisRank(ikonKat, nama, nilai, persen, sub) {
    var baris = buat("div", "rank-row");
    var atas = buat("div", "rank-top");
    if (ikonKat) { atas.appendChild(ikonKategori(ikonKat)); }
    atas.appendChild(buat("span", "rank-nama", nama));
    atas.appendChild(buat("span", "rank-nilai", rupiah(nilai)));
    baris.appendChild(atas);
    var bar = buat("div", "rank-bar");
    var isi = document.createElement("span");
    isi.style.width = Math.max(2, Math.min(100, persen)) + "%";
    bar.appendChild(isi);
    baris.appendChild(bar);
    baris.appendChild(buat("p", "rank-sub", sub));
    return baris;
  }

  function tampilkanPengeluaran() {
    var P = GaragePengeluaran;
    var hariIni = tanggalHariIni();
    var semua = semuaTransaksi();
    ringkasShortcut(semua, hariIni);

    // Pilihan kendaraan (Semua kendaraan + satu per satu)
    var sel = $("x-kendaraan");
    sel.innerHTML = "";
    var oSemua = document.createElement("option");
    oSemua.value = "semua";
    oSemua.textContent = "Semua kendaraan";
    sel.appendChild(oSemua);
    dataKendaraan.forEach(function (v) {
      var o = document.createElement("option");
      o.value = String(v.id);
      o.textContent = namaKendaraan(v) + " · " + v.plat;
      sel.appendChild(o);
    });
    if (xKendaraan !== "semua" && !dataKendaraan.some(function (v) { return String(v.id) === String(xKendaraan); })) { xKendaraan = "semua"; }
    sel.value = String(xKendaraan);

    var ada = dataKendaraan.length > 0;
    $("btn-add-biaya").hidden = !ada;
    $("x-bulan-box").hidden = xPeriode.jenis !== "bulan";
    $("x-rentang-box").hidden = xPeriode.jenis !== "rentang";

    var r = periodeAktif(hariIni);
    $("x-periode-info").textContent = teksPeriode(r);

    var kosong = $("x-kosong");
    var isi = $("x-isi");
    if (!ada || semua.length === 0) {
      isi.hidden = true;
      kosong.hidden = false;
      $("x-kosong-judul").textContent = ada ? "Belum ada pengeluaran" : "Belum ada kendaraan";
      $("x-kosong-teks").textContent = ada
        ? "Biaya dari catatan BBM, servis, dan cuci otomatis muncul di sini. Pengeluaran lain, seperti parkir atau tol, ketuk + Catat."
        : "Tambahkan kendaraan di tab Garasi dulu.";
      return;
    }
    kosong.hidden = true;
    isi.hidden = false;

    var idK = xKendaraan === "semua" ? null : parseInt(xKendaraan, 10);
    var vk = P.saring(semua, { vehicleId: idK });
    var pr = r.salah ? [] : P.saring(vk, { dari: r.dari, sampai: r.sampai });

    // Ringkasan
    var bl = P.rentang({ jenis: "bulan-ini" }, hariIni), th = P.rentang({ jenis: "tahun-ini" }, hariIni);
    $("xs-bulan").textContent = rupiah(P.jumlahkan(P.saring(vk, { dari: bl.dari, sampai: bl.sampai })));
    $("xs-tahun").textContent = rupiah(P.jumlahkan(P.saring(vk, { dari: th.dari, sampai: th.sampai })));
    $("xs-semua").textContent = rupiah(P.jumlahkan(vk));
    var totalPeriode = P.jumlahkan(pr);
    $("xs-periode").textContent = rupiah(totalPeriode);
    var rata = P.rataBulanan(pr, r.dari, r.sampai, hariIni);
    $("xs-rata").textContent = rata ? rupiah(rata.rata) : "Rp 0";
    $("xs-n").textContent = String(pr.length);
    var kat = P.perKategori(pr);
    $("xs-terbesar").textContent = kat.length ? kat[0].kategori + " (" + String(kat[0].persen).replace(".", ",") + "%)" : "-";

    // Grafik
    Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === xMode);
    });
    var g = titikGrafik(vk, hariIni, r);
    if (xTerpilih === null || xTerpilih >= g.titik.length) { xTerpilih = g.titik.length - 1; }
    gambarGrafikBatang(g.titik, xTerpilih);
    var p = g.titik[xTerpilih];
    $("x-grafik-info").textContent = p.nama + " · " + rupiah(p.total) + (p.dalam ? "" : " (di luar periode)");
    $("x-grafik-ket").textContent = g.ket + " Mengikuti filter kendaraan. Batang abu-abu ada di luar periode terpilih.";

    // Perbandingan bulan (ikut filter kendaraan)
    var bd = P.bandingBulan(vk, hariIni);
    var hari = P.jumlahkan(P.saring(vk, { dari: hariIni, sampai: hariIni }));
    var kb = $("x-banding");
    kb.innerHTML = "";
    var grid = buat("div", "banding");
    function sel2(k, v, kelas, lebar) {
      var d = buat("div", lebar ? "wide" : "");
      d.appendChild(buat("p", "k", k));
      d.appendChild(buat("p", "v" + (kelas ? " " + kelas : ""), v));
      grid.appendChild(d);
    }
    sel2("Bulan ini", rupiah(bd.ini));
    sel2("Bulan lalu", rupiah(bd.lalu));
    sel2("Hari ini", rupiah(hari));
    var teksSel, kelasSel = "";
    if (bd.ini === 0 && bd.lalu === 0) { teksSel = "Belum ada data"; }
    else if (bd.selisih === 0) { teksSel = "Sama dengan bulan lalu"; }
    else {
      var naik = bd.selisih > 0;
      teksSel = (naik ? "Naik " : "Turun ") + rupiah(Math.abs(bd.selisih)) +
        (bd.persen !== null ? " (" + String(Math.abs(bd.persen)).replace(".", ",") + "%)" : "");
      kelasSel = naik ? "sel-naik" : "sel-turun";
    }
    sel2("Selisih", teksSel, kelasSel);
    kb.appendChild(grid);
    kb.appendChild(buat("p", "note hint", "Bulan ini belum selesai, jadi dibandingkan dengan bulan lalu yang penuh."));

    // Per kategori
    var kk = $("x-kategori");
    kk.innerHTML = "";
    if (kat.length === 0) { kk.appendChild(buat("p", "note", "Belum ada pengeluaran pada periode ini.")); }
    kat.forEach(function (b) {
      kk.appendChild(barisRank(b.kategori, b.kategori, b.total, b.persen, b.jumlah + " transaksi · " + String(b.persen).replace(".", ",") + "%"));
    });

    // Per kendaraan
    var pk = P.perKendaraan(pr);
    var kv = $("x-per-kendaraan");
    kv.innerHTML = "";
    if (pk.length === 0) { kv.appendChild(buat("p", "note", "Belum ada pengeluaran pada periode ini.")); }
    pk.forEach(function (b) {
      kv.appendChild(barisRank(null, namaKendaraanById(b.vehicleId), b.total, b.persen, b.jumlah + " transaksi · " + String(b.persen).replace(".", ",") + "%"));
    });

    // Riwayat
    var daftar = P.urutkan(P.saring(pr, { kategori: xKategori, cari: xCari }));
    $("x-riwayat-ringkas").textContent = daftar.length + " transaksi · Total " + rupiah(P.jumlahkan(daftar));
    var rw = $("x-riwayat");
    rw.innerHTML = "";
    if (daftar.length === 0) { rw.appendChild(buat("p", "note", "Tidak ada transaksi yang cocok dengan filter.")); }
    daftar.slice(0, xBatas).forEach(function (t) {
      var baris = buat("button", "x-row");
      baris.type = "button";
      baris.setAttribute("data-kunci", t.kunci);
      baris.appendChild(ikonKategori(t.kategori));
      var badan = buat("span", "x-body");
      badan.appendChild(buat("span", "x-nama", t.nama));
      var meta = tanggalIndo(t.tanggal) + (t.waktu ? " · " + t.waktu : "") + " · " + namaKendaraanById(t.vehicleId);
      if (t.lokasi) { meta += " · " + t.lokasi; }
      badan.appendChild(buat("span", "x-meta", meta));
      var tag = buat("span", "x-tags");
      tag.appendChild(buat("span", "badge " + (t.otomatis ? "src-oto" : "src-man"),
        t.otomatis ? "Otomatis · " + P.SUMBER[t.sumber] : "Manual"));
      tag.appendChild(buat("span", "badge", t.kategori));
      badan.appendChild(tag);
      baris.appendChild(badan);
      baris.appendChild(buat("span", "x-biaya", rupiah(t.biaya)));
      baris.addEventListener("click", function () { bukaDetailBiaya(t); });
      rw.appendChild(baris);
    });
    $("x-lagi").hidden = daftar.length <= xBatas;
  }

  // ----- Detail -----

  function tutupFotoBiayaLihat() {
    urlFotoBiayaLihat.forEach(function (u) { URL.revokeObjectURL(u); });
    urlFotoBiayaLihat = [];
    $("biaya-detail-fotos").innerHTML = "";
  }

  function tutupDetailBiaya() {
    tutupSheet($("sheet-biaya-detail"));
    tutupFotoBiayaLihat();
    detailBiaya = null;
  }

  var NAMA_MENU = { bbm: "BBM", servis: "Servis", cuci: "Cuci", dokumen: "Dokumen" };

  function bukaDetailBiaya(t) {
    detailBiaya = t;
    $("biaya-detail-title").textContent = t.nama;
    var badan = $("biaya-detail-body");
    badan.innerHTML = "";
    var tag = buat("div", "r-tags");
    tag.appendChild(buat("span", "badge " + (t.otomatis ? "src-oto" : "src-man"),
      t.otomatis ? "Otomatis · " + GaragePengeluaran.SUMBER[t.sumber] : "Manual"));
    badan.appendChild(tag);
    var dl = document.createElement("dl");
    var v = dataKendaraan.filter(function (k) { return k.id === t.vehicleId; })[0];
    barisDetail(dl, "Nominal", rupiah(t.biaya));
    barisDetail(dl, "Kategori", t.kategori);
    barisDetail(dl, "Tanggal", tanggalIndo(t.tanggal) + (t.waktu ? " · " + t.waktu : ""));
    barisDetail(dl, "Kendaraan", v ? namaKendaraan(v) + " · " + v.plat : "");
    barisDetail(dl, "Lokasi", t.lokasi);
    barisDetail(dl, "Catatan", t.rekam.catatan);
    barisDetail(dl, "Sumber data", t.otomatis ? "Menu " + NAMA_MENU[t.sumber] : "Dicatat langsung di Pengeluaran");
    badan.appendChild(dl);

    var ket = $("biaya-detail-ket");
    ket.hidden = !t.otomatis;
    if (t.otomatis) {
      ket.textContent = "Data ini berasal dari menu " + NAMA_MENU[t.sumber] + ". Untuk mengubah atau menghapusnya, buka catatan aslinya di menu tersebut.";
    }
    $("btn-biaya-ubah").hidden = t.otomatis;
    $("btn-biaya-hapus").hidden = t.otomatis;
    $("btn-biaya-sumber").hidden = !t.otomatis;
    if (t.otomatis) { $("btn-biaya-sumber").textContent = "Buka menu " + NAMA_MENU[t.sumber]; }

    tutupFotoBiayaLihat();
    if (!t.otomatis && t.rekam.fotoId) {
      GarageDB.attachmentGet(t.rekam.fotoId).then(function (l) {
        if (detailBiaya !== t || !l || !l.blob) { return; }
        var u = URL.createObjectURL(l.blob);
        urlFotoBiayaLihat.push(u);
        var g = document.createElement("img");
        g.src = u;
        g.alt = "Foto struk";
        $("biaya-detail-fotos").appendChild(g);
      });
    }
    bukaSheet($("sheet-biaya-detail"), null);
  }

  function hapusBiaya(t) {
    if (t.otomatis) { return; }
    tanya("Hapus pengeluaran ini? Foto strukknya juga ikut terhapus.", "Hapus", function () {
      GarageDB.expenseRemove(t.id).then(function () {
        if (detailBiaya && detailBiaya.kunci === t.kunci) { tutupDetailBiaya(); }
        return muatUlang();
      });
    }, "Hapus pengeluaran");
  }

  $("btn-biaya-tutup").addEventListener("click", tutupDetailBiaya);
  $("sheet-biaya-detail").addEventListener("click", function (e) {
    if (e.target === $("sheet-biaya-detail")) { tutupDetailBiaya(); }
  });
  $("btn-biaya-ubah").addEventListener("click", function () {
    var t = detailBiaya;
    tutupDetailBiaya();
    if (t && !t.otomatis) { bukaFormBiaya(t.rekam); }
  });
  $("btn-biaya-hapus").addEventListener("click", function () { if (detailBiaya) { hapusBiaya(detailBiaya); } });
  $("btn-biaya-sumber").addEventListener("click", function () {
    var t = detailBiaya;
    tutupDetailBiaya();
    if (!t) { return; }
    kendaraanTerpilih = t.vehicleId;
    jenisHargaManual = false;
    tampilkanServis();
    tampilkanBBM();
    tampilkanCuci();
    tampilkanDokumen();
    pindahLayar(t.sumber === "dokumen" ? "dokumen" : t.sumber);
  });

  // ----- Filter dan tombol -----

  $("btn-ke-pengeluaran").addEventListener("click", function () {
    tampilkanPengeluaran();
    pindahLayar("pengeluaran");
  });
  $("btn-kembali-garasi").addEventListener("click", function () { pindahLayar("garasi"); });

  $("x-kendaraan").addEventListener("change", function () { xKendaraan = this.value; xTerpilih = null; xBatas = 30; tampilkanPengeluaran(); });
  $("x-periode").addEventListener("change", function () {
    xPeriode.jenis = this.value;
    var hariIni = tanggalHariIni();
    if (xPeriode.jenis === "bulan" && !xPeriode.bulan) { xPeriode.bulan = hariIni.slice(0, 7); $("x-bulan").value = xPeriode.bulan; }
    if (xPeriode.jenis === "rentang" && !xPeriode.dari && !xPeriode.sampai) {
      xPeriode.dari = hariIni.slice(0, 8) + "01";
      xPeriode.sampai = hariIni;
      $("x-dari").value = xPeriode.dari;
      $("x-sampai").value = xPeriode.sampai;
    }
    xTerpilih = null; xBatas = 30;
    tampilkanPengeluaran();
  });
  $("x-bulan").addEventListener("change", function () { xPeriode.bulan = this.value; xTerpilih = null; xBatas = 30; tampilkanPengeluaran(); });
  $("x-dari").addEventListener("change", function () { xPeriode.dari = this.value; xTerpilih = null; xBatas = 30; tampilkanPengeluaran(); });
  $("x-sampai").addEventListener("change", function () { xPeriode.sampai = this.value; xTerpilih = null; xBatas = 30; tampilkanPengeluaran(); });
  $("x-cari").addEventListener("input", function () { xCari = this.value; xBatas = 30; tampilkanPengeluaran(); });
  $("x-kategori-saring").addEventListener("change", function () { xKategori = this.value; xBatas = 30; tampilkanPengeluaran(); });
  $("x-lagi").addEventListener("click", function () { xBatas += 30; tampilkanPengeluaran(); });
  Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function (b) {
    b.addEventListener("click", function () { xMode = b.getAttribute("data-mode"); xTerpilih = null; tampilkanPengeluaran(); });
  });

  (function isiKategoriBiaya() {
    var semuaKat = document.createElement("option");
    semuaKat.value = "";
    semuaKat.textContent = "Semua kategori";
    $("x-kategori-saring").appendChild(semuaKat);
    GaragePengeluaran.KATEGORI.forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      $("x-kategori-saring").appendChild(o);
      var o2 = document.createElement("option");
      o2.value = k;
      o2.textContent = k;
      $("e-kategori").appendChild(o2);
    });
  })();

  // ----- Formulir pengeluaran manual -----

  var sheetBiaya = $("sheet-biaya");
  var formBiaya = $("biaya-form");
  var errorBiaya = $("biaya-error");
  var efotoMsg = $("efoto-msg");
  var sedangUbahBiaya = null;
  var efotoAksi;                  // undefined = tidak berubah, null = hapus, Blob = foto baru
  var urlPratinjauBiaya = null;
  var sedangMenyimpanBiaya = false;

  function bersihkanPratinjauBiaya() {
    if (urlPratinjauBiaya) { URL.revokeObjectURL(urlPratinjauBiaya); urlPratinjauBiaya = null; }
  }

  function tampilPratinjauBiaya(alamat) {
    var kotak = $("e-foto-preview");
    kotak.innerHTML = "";
    if (alamat) {
      var gambar = document.createElement("img");
      gambar.src = alamat;
      gambar.alt = "Pratinjau foto struk";
      kotak.appendChild(gambar);
    } else {
      kotak.textContent = "Belum ada";
    }
    $("btn-efoto-hapus").hidden = !alamat;
    $("btn-efoto").textContent = alamat ? "Ganti Foto" : "Pilih Foto";
  }

  function bukaFormBiaya(rec) {
    if (dataKendaraan.length === 0) { return; }
    sedangUbahBiaya = rec || null;
    bersihkanPratinjauBiaya();
    formBiaya.reset();
    errorBiaya.hidden = true;
    efotoMsg.hidden = true;
    efotoAksi = undefined;
    $("sheet-biaya-title").textContent = rec ? "Ubah Pengeluaran" : "Catat Pengeluaran";
    var awal = rec ? rec.vehicleId : (xKendaraan !== "semua" ? parseInt(xKendaraan, 10) : kendaraanTerpilih);
    isiPilihan($("e-kendaraan"), awal === null || awal === undefined ? dataKendaraan[0].id : awal);
    $("e-kendaraan").disabled = !!rec;
    $("e-tanggal").max = tanggalHariIni();
    $("e-tanggal").value = rec ? rec.tanggal : tanggalHariIni();
    $("e-waktu").value = rec && rec.waktu ? rec.waktu : "";
    $("e-kategori").value = rec ? rec.kategori : "Parkir";
    $("e-nama").value = rec ? rec.nama : "";
    $("e-biaya").value = rec ? String(rec.biaya) : "";
    $("e-lokasi").value = rec && rec.lokasi ? rec.lokasi : "";
    $("e-catatan").value = rec && rec.catatan ? rec.catatan : "";
    tampilPratinjauBiaya(null);
    if (rec && rec.fotoId) {
      GarageDB.attachmentGet(rec.fotoId).then(function (l) {
        if (l && l.blob && sedangUbahBiaya === rec && efotoAksi === undefined) {
          urlPratinjauBiaya = URL.createObjectURL(l.blob);
          tampilPratinjauBiaya(urlPratinjauBiaya);
        }
      });
    }
    bukaSheet(sheetBiaya, null);
  }

  function tutupFormBiaya() {
    tutupSheet(sheetBiaya);
    bersihkanPratinjauBiaya();
  }

  // Memeriksa jenis dan ukuran foto lalu memperkecilnya (sisi terpanjang 1280 piksel)
  function siapkanFotoStruk(b) {
    if (!namaFotoValid(b)) {
      return Promise.reject(new Error("Hanya foto yang bisa dipilih (bukan PDF atau file lain)."));
    }
    if (b.size > GaragePengeluaran.MAKS_BERKAS_ASLI) {
      return Promise.reject(new Error("Foto terlalu besar (maksimal 25 MB)."));
    }
    return perkecilFoto(b, GaragePengeluaran.MAKS_SISI_FOTO, 0.85).then(function (blob) {
      if (blob.size <= GaragePengeluaran.MAKS_BERKAS_SIMPAN) { return blob; }
      return perkecilFoto(b, 1000, 0.7).then(function (kecil) {
        if (kecil.size > GaragePengeluaran.MAKS_BERKAS_SIMPAN) { throw new Error("Foto terlalu besar setelah diperkecil. Coba foto lain."); }
        return kecil;
      });
    }, function () {
      throw new Error("Foto tidak bisa dibaca. Coba foto lain.");
    });
  }

  $("btn-efoto").addEventListener("click", function () { $("e-foto").click(); });
  $("e-foto").addEventListener("change", function () {
    var input = this;
    var berkas = input.files[0];
    input.value = "";
    if (!berkas) { return; }
    pesan(efotoMsg, "Memproses foto...");
    siapkanFotoStruk(berkas).then(function (blob) {
      bersihkanPratinjauBiaya();
      efotoAksi = blob;
      urlPratinjauBiaya = URL.createObjectURL(blob);
      tampilPratinjauBiaya(urlPratinjauBiaya);
      efotoMsg.hidden = true;
    }).catch(function (e) {
      pesan(efotoMsg, e.message, "bad");
    });
  });
  $("btn-efoto-hapus").addEventListener("click", function () {
    bersihkanPratinjauBiaya();
    efotoAksi = (sedangUbahBiaya && sedangUbahBiaya.fotoId) ? null : undefined;
    tampilPratinjauBiaya(null);
    efotoMsg.hidden = true;
  });

  function simpanBiaya() {
    if (sedangMenyimpanBiaya) { return; }
    var vehicleId = parseInt($("e-kendaraan").value, 10);
    var kendaraan = dataKendaraan.filter(function (v) { return v.id === vehicleId; })[0];
    if (!kendaraan) { pesan(errorBiaya, "Pilih kendaraan dulu.", "bad"); return; }
    var d = {
      tanggal: $("e-tanggal").value,
      waktu: $("e-waktu").value,
      kategori: $("e-kategori").value,
      nama: $("e-nama").value.trim(),
      biaya: bacaBulat($("e-biaya").value),
      lokasi: $("e-lokasi").value.trim(),
      catatan: $("e-catatan").value.trim()
    };
    var salah = GaragePengeluaran.periksaManual(d, tanggalHariIni(), jamSekarang(), kendaraan.tahun);
    if (salah) { pesan(errorBiaya, salah, "bad"); return; }

    var rekam = {};
    if (sedangUbahBiaya) {
      Object.keys(sedangUbahBiaya).forEach(function (k) { rekam[k] = sedangUbahBiaya[k]; });
    } else {
      rekam.dibuat = Date.now();
      rekam.fotoId = null;
    }
    rekam.vehicleId = vehicleId;
    rekam.tanggal = d.tanggal;
    rekam.waktu = d.waktu || null;
    rekam.kategori = d.kategori;
    rekam.nama = d.nama;
    rekam.biaya = d.biaya;
    rekam.lokasi = d.lokasi;
    rekam.catatan = d.catatan;

    sedangMenyimpanBiaya = true;
    var tombol = formBiaya.querySelector("button[type=submit]");
    tombol.disabled = true;
    GarageDB.expenseSave(rekam, efotoAksi).then(function () {
      tutupFormBiaya();
      return muatUlang();
    }).catch(function () {
      pesan(errorBiaya, "Gagal menyimpan. Coba lagi.", "bad");
    }).then(function () {
      sedangMenyimpanBiaya = false;
      tombol.disabled = false;
    });
  }

  $("btn-add-biaya").addEventListener("click", function () { bukaFormBiaya(null); });
  $("btn-cancel-biaya").addEventListener("click", tutupFormBiaya);
  sheetBiaya.addEventListener("click", function (e) {
    if (e.target === sheetBiaya) { tutupFormBiaya(); }
  });
  formBiaya.addEventListener("submit", function (e) {
    e.preventDefault();
    simpanBiaya();
  });
  formBiaya.addEventListener("input", function () { errorBiaya.hidden = true; });

  // ---------- Layar Analitik (Tahap 7) ----------
  // Tidak menyimpan apa pun. Semua angka dihitung ulang dari catatan asli setiap kali layar dibuka,
  // jadi perubahan atau penghapusan catatan sumber langsung terlihat di sini.

  var aKendaraan = "semua";
  var aPeriode = { jenis: "semua", bulan: "", dari: "", sampai: "" };
  var aPanel = "ringkasan";
  var aJenis = "";
  var aSel = {};                 // pilihan batang/titik per grafik
  var aHasil = null;
  var WARNA_GARIS = ["#E5384B", "#F2B84B", "#5BC0BE", "#9AA5F7", "#E8E9EC"];
  var BELUM = "Belum ada data";

  function setTile(id, teks, sub) {
    var el = $(id);
    el.innerHTML = "";
    el.classList.toggle("na", teks === null);
    el.appendChild(document.createTextNode(teks === null ? BELUM : teks));
    if (sub) { el.appendChild(buat("span", "sub", sub)); }
  }

  function kosongkan(el) { el.innerHTML = ""; return el; }

  function barisNilai(kotak, ikon, nama, nilaiTeks, persen, sub, na) {
    var baris = buat("div", "rank-row" + (na ? " na" : ""));
    var atas = buat("div", "rank-top");
    if (ikon) { atas.appendChild(ikonKategori(ikon)); }
    atas.appendChild(buat("span", "rank-nama", nama));
    atas.appendChild(buat("span", "rank-nilai" + (na ? " na" : ""), na ? BELUM : nilaiTeks));
    baris.appendChild(atas);
    var bar = buat("div", "rank-bar");
    var isi = document.createElement("span");
    isi.style.width = (na ? 0 : Math.max(2, Math.min(100, persen))) + "%";
    bar.appendChild(isi);
    baris.appendChild(bar);
    if (sub) { baris.appendChild(buat("p", "rank-sub", sub)); }
    kotak.appendChild(baris);
  }

  // Daftar peringkat dari {nama, nilai (angka atau null), teks, sub}. urutNaik = nilai kecil di atas.
  function peringkat(kotak, baris, urutNaik) {
    kosongkan(kotak);
    var ada = baris.filter(function (b) { return b.nilai !== null; });
    var tidak = baris.filter(function (b) { return b.nilai === null; });
    ada.sort(function (a, b) { return urutNaik ? a.nilai - b.nilai : b.nilai - a.nilai; });
    var maks = 0;
    ada.forEach(function (b) { if (b.nilai > maks) { maks = b.nilai; } });
    ada.forEach(function (b) { barisNilai(kotak, b.ikon, b.nama, b.teks, maks > 0 ? b.nilai / maks * 100 : 0, b.sub, false); });
    tidak.forEach(function (b) { barisNilai(kotak, b.ikon, b.nama, "", 0, b.sub, true); });
    if (baris.length === 0) { kotak.appendChild(buat("p", "note", BELUM)); }
  }

  function bulanLabel(ym) {
    return NAMA_BULAN[parseInt(ym.slice(5), 10) - 1] + " " + ym.slice(0, 4);
  }

  function namaK(p) { return namaKendaraan(p.kendaraan); }

  // ----- Grafik garis -----
  // seri: [{nama, warna, titik: [{t: "YYYY-MM-DD", y: angka, ket: teks}]}]
  function gambarGaris(kotak, legenda, infoEl, kunciSel, seri, fmtY) {
    kosongkan(kotak);
    if (legenda) { kosongkan(legenda); }
    var semua = [];
    seri.forEach(function (s) { s.titik.forEach(function (p) { semua.push(p); }); });
    if (semua.length === 0) { kotak.appendChild(buat("p", "note", BELUM)); infoEl.textContent = ""; return; }

    var NS = "http://www.w3.org/2000/svg";
    var W = 360, H = 190, kiri = 8, kanan = 12, atas = 22, dasar = 160;
    var tMin = semua[0].t, tMaks = semua[0].t, yMin = semua[0].y, yMaks = semua[0].y;
    semua.forEach(function (p) {
      if (p.t < tMin) { tMin = p.t; } if (p.t > tMaks) { tMaks = p.t; }
      if (p.y < yMin) { yMin = p.y; } if (p.y > yMaks) { yMaks = p.y; }
    });
    var span = Math.max(1, GarageService.selisihHari(tMin, tMaks));
    var pad = (yMaks - yMin) * 0.12 || Math.max(1, Math.abs(yMaks) * 0.1);
    var y0 = yMin - pad, y1 = yMaks + pad;
    function px(t) { return span === 1 && tMin === tMaks ? (kiri + (W - kiri - kanan) / 2) : kiri + (W - kiri - kanan) * GarageService.selisihHari(tMin, t) / span; }
    function py(y) { return dasar - (y - y0) / (y1 - y0) * (dasar - atas); }

    function el(nama, at) {
      var e = document.createElementNS(NS, nama);
      Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); });
      return e;
    }
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Grafik garis: " + seri.map(function (s) { return s.nama + " " + s.titik.length + " titik"; }).join(", "));
    svg.appendChild(el("line", { x1: kiri, x2: W - kanan, y1: dasar, y2: dasar, "class": "grid" }));
    svg.appendChild(el("line", { x1: kiri, x2: W - kanan, y1: atas, y2: atas, "class": "grid" }));
    var tA = el("text", { x: kiri, y: atas - 6, "class": "t" }); tA.textContent = fmtY(yMaks); svg.appendChild(tA);
    var tB = el("text", { x: kiri, y: dasar - 5, "class": "t" }); tB.textContent = fmtY(yMin); svg.appendChild(tB);
    [[tMin, "start"], [tMaks, "end"]].forEach(function (a, i) {
      if (i === 1 && tMin === tMaks) { return; }
      var tx = el("text", { x: i === 0 ? kiri : W - kanan, y: dasar + 15, "text-anchor": a[1], "class": "t" });
      tx.textContent = tanggalIndo(a[0]);
      svg.appendChild(tx);
    });
    var terpilih = aSel[kunciSel];
    seri.forEach(function (s, si) {
      if (s.titik.length > 1) {
        svg.appendChild(el("polyline", { points: s.titik.map(function (p) { return px(p.t).toFixed(1) + "," + py(p.y).toFixed(1); }).join(" "), "class": "ln", stroke: s.warna }));
      }
    });
    seri.forEach(function (s, si) {
      s.titik.forEach(function (p, pi) {
        var pilih = terpilih && terpilih.s === si && terpilih.p === pi;
        svg.appendChild(el("circle", { cx: px(p.t).toFixed(1), cy: py(p.y).toFixed(1), r: pilih ? 5 : 3.5, fill: s.warna, "class": "dot" + (pilih ? " sel" : "") }));
      });
    });
    seri.forEach(function (s, si) {
      s.titik.forEach(function (p, pi) {
        var hit = el("circle", { cx: px(p.t).toFixed(1), cy: py(p.y).toFixed(1), r: 13, "class": "hit" });
        hit.addEventListener("click", function () { aSel[kunciSel] = { s: si, p: pi }; tampilkanAnalitik(); });
        svg.appendChild(hit);
      });
    });
    kotak.appendChild(svg);
    if (legenda) {
      seri.forEach(function (s) {
        var li = buat("span", "");
        var dot = document.createElement("i"); dot.style.background = s.warna; li.appendChild(dot);
        li.appendChild(document.createTextNode(s.nama));
        legenda.appendChild(li);
      });
    }
    var info = terpilih && seri[terpilih.s] && seri[terpilih.s].titik[terpilih.p];
    if (!info) {
      var ss = seri[seri.length - 1]; info = ss.titik[ss.titik.length - 1];
      infoEl.textContent = (seri.length > 1 ? ss.nama + " · " : "") + info.ket;
    } else {
      infoEl.textContent = (seri.length > 1 ? seri[terpilih.s].nama + " · " : "") + info.ket;
    }
  }

  // ----- Grafik batang (memakai gambar yang sama dengan Pengeluaran) -----
  function batangAnalitik(kotakId, infoId, kunci, titik, teksInfo, fmt) {
    if (aSel[kunci] === undefined || aSel[kunci] >= titik.length) { aSel[kunci] = titik.length - 1; }
    gambarBatang($(kotakId), titik, aSel[kunci], function (i) { aSel[kunci] = i; tampilkanAnalitik(); }, fmt);
    $(infoId).textContent = teksInfo(titik[aSel[kunci]]);
  }

  function bulanBerakhir(h) {
    var akhirTgl = (!h.salah && h.rentang.sampai && h.rentang.sampai < h.hariIni) ? h.rentang.sampai : h.hariIni;
    return akhirTgl.slice(0, 7);
  }

  function dalamBulan(h, ym) {
    var r = h.rentang, a = ym + "-01", b = ym + "-31";
    return !h.salah && !((r.dari && b < r.dari) || (r.sampai && a > r.sampai));
  }

  function tampilkanAnalitik() {
    var hariIni = tanggalHariIni();
    var sel = $("a-kendaraan");
    sel.innerHTML = "";
    var o0 = document.createElement("option"); o0.value = "semua"; o0.textContent = "Semua kendaraan"; sel.appendChild(o0);
    dataKendaraan.forEach(function (v) {
      var o = document.createElement("option");
      o.value = String(v.id);
      o.textContent = namaKendaraan(v) + " · " + v.plat;
      sel.appendChild(o);
    });
    if (aKendaraan !== "semua" && !dataKendaraan.some(function (v) { return String(v.id) === String(aKendaraan); })) { aKendaraan = "semua"; }
    sel.value = String(aKendaraan);
    $("btn-ke-analitik").hidden = dataKendaraan.length === 0;
    $("a-bulan-box").hidden = aPeriode.jenis !== "bulan";
    $("a-rentang-box").hidden = aPeriode.jenis !== "rentang";

    if (dataKendaraan.length === 0) { $("a-kosong").hidden = false; $("a-isi").hidden = true; $("a-periode-info").textContent = ""; return; }
    $("a-kosong").hidden = true;
    $("a-isi").hidden = false;

    var d = { kendaraan: dataKendaraan, bbm: dataBBM, servis: dataServis, cuci: dataCuci, dokumen: dataDok, manual: dataBiaya };
    var h = GarageAnalitik.hitung(d, { vehicleId: aKendaraan === "semua" ? null : parseInt(aKendaraan, 10), periode: aPeriode }, hariIni);
    aHasil = h;
    $("a-periode-info").textContent = teksPeriode({ dari: h.rentang.dari, sampai: h.rentang.sampai, salah: h.salah });

    Array.prototype.forEach.call(document.querySelectorAll("#a-nav .pill"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-panel") === aPanel);
    });
    Array.prototype.forEach.call(document.querySelectorAll("#a-isi .panel"), function (p) {
      p.hidden = p.id !== "p-" + aPanel;
    });

    isiRingkasan(h);
    isiBBM(h);
    isiBiaya(h);
    isiRawat(h);
    isiBanding(h);
  }

  function jumlahSah(h) {
    var n = 0, tw = 0, diab = 0;
    h.kendaraan.forEach(function (p) { n += p.bbm.intervalSah; tw += p.bbm.tidakWajar; diab += p.odometer.diabaikan; });
    return { interval: n, tidakWajar: tw, diabaikan: diab };
  }

  function isiRingkasan(h) {
    var r = h.ringkasan, js = jumlahSah(h);
    setTile("a-total", r.totalPengeluaran === null ? null : rupiah(r.totalPengeluaran), r.totalPengeluaran === null ? "Belum ada pengeluaran pada periode ini." : h.transaksi.length + " transaksi");
    setTile("a-km", r.totalJarak === null ? null : angka(r.totalJarak) + " km", r.totalJarak === null ? "Perlu minimal 2 catatan odometer." : "");
    setTile("a-bpk", r.biayaPerKm === null ? null : rupiah(Math.round(r.biayaPerKm)) + "/km", r.biayaPerKm === null ? "Data belum mencukupi (jarak minimal " + GarageAnalitik.MIN_JARAK_BIAYA_KM + " km)." : "");
    setTile("a-kpl", r.kmPerLiter === null ? null : desimal(r.kmPerLiter, 1) + " km/L", r.kmPerLiter === null ? "Perlu 2 pengisian penuh berurutan." : js.interval + " interval penuh ke penuh");
    setTile("a-liter", r.totalLiter === null ? null : literTeks(r.totalLiter) + " L", "");
    setTile("a-rata", r.rataBulanan === null ? null : rupiah(r.rataBulanan), r.rataBulanan === null ? "" : "dibagi " + r.rataBulananBulan + " bulan");
    setTile("a-servis", r.jumlahServis === 0 ? null : String(r.jumlahServis), r.jumlahServis === 0 ? "" : r.kunjunganServis + " kunjungan");
    setTile("a-cuci", r.jumlahCuci === 0 ? null : String(r.jumlahCuci), "");

    var dk = kosongkan($("a-dok"));
    if (h.dokumen.total === 0) {
      dk.appendChild(buat("p", "note", BELUM));
    } else {
      var baris = buat("div", "x-tags");
      [["aktif", "Aktif"], ["segera", "Segera Kedaluwarsa"], ["kedaluwarsa", "Kedaluwarsa"], ["diganti", "Diperbarui"]].forEach(function (p) {
        baris.appendChild(buat("span", "badge st-" + p[0], p[1] + " · " + h.dokumen[p[0]]));
      });
      dk.appendChild(baris);
      var daftar = buat("div", "x-list");
      h.dokumen.mendesak.slice(0, 6).forEach(function (m) {
        var b = buat("div", "x-row static");
        var badan = buat("span", "x-body");
        badan.appendChild(buat("span", "x-nama", judulDokumen(m.rekam)));
        badan.appendChild(buat("span", "x-meta", namaKendaraanById(m.vehicleId) + (m.item ? " · " + m.item.label + " " + tanggalIndo(m.item.tanggal) : "")));
        b.appendChild(badan);
        b.appendChild(buat("span", "badge st-" + m.status, m.item ? teksSisaHari(m.item.sisaHari) : "Perlu dicek"));
        daftar.appendChild(b);
      });
      dk.appendChild(daftar);
      dk.appendChild(buat("p", "note hint", "Status dokumen mengikuti kendaraan yang dipilih, bukan periode."));
    }

    var titik = h.seriBulan.map(function (p) {
      return { label: NAMA_BULAN[parseInt(p.kunci.slice(5), 10) - 1], nama: bulanLabel(p.kunci), total: p.total, dalam: p.dalam };
    });
    batangAnalitik("a-g-bulan", "a-g-bulan-info", "bulan", titik, function (p) { return p.nama + " · " + (p.total === 0 ? "tidak ada catatan" : rupiah(p.total)) + (p.dalam ? "" : " (di luar periode)"); });

    var cat = [];
    if (js.diabaikan > 0) { cat.push(js.diabaikan + " catatan odometer diabaikan karena lebih rendah dari catatan sebelumnya."); }
    if (js.tidakWajar > 0) { cat.push(js.tidakWajar + " interval BBM tidak wajar (di luar 2 sampai 80 km/L) tidak dihitung."); }
    if (r.kmPerLiter !== null && h.kendaraan.length > 1) { cat.push("Konsumsi BBM gabungan semua kendaraan. Untuk perbandingan, lihat bagian Bandingkan atau pilih satu kendaraan."); }
    $("a-catatan").textContent = cat.join(" ");
  }

  function isiBBM(h) {
    var r = h.ringkasan, js = jumlahSah(h);
    var isi = 0, penuh = 0;
    h.kendaraan.forEach(function (p) { isi += p.bbm.jumlah; penuh += p.bbm.penuh; });
    setTile("b-kpl", r.kmPerLiter === null ? null : desimal(r.kmPerLiter, 1) + " km/L", r.kmPerLiter === null ? "Perlu 2 pengisian penuh berurutan." : js.interval + " interval, " + angka(Math.round(r.kmPerLiterJarak)) + " km");
    setTile("b-liter", r.totalLiter === null ? null : literTeks(r.totalLiter) + " L", "");
    setTile("b-biaya", r.totalBiayaBBM === null ? null : rupiah(r.totalBiayaBBM), "");
    setTile("b-isi", isi === 0 ? null : String(isi), isi === 0 ? "" : penuh + " penuh, " + (isi - penuh) + " sebagian");

    peringkat($("b-per-kendaraan"), h.kendaraan.map(function (p) {
      var b = p.bbm;
      return {
        nama: namaK(p), nilai: b.kmPerLiter, teks: b.kmPerLiter === null ? "" : desimal(b.kmPerLiter, 1) + " km/L",
        sub: b.kmPerLiter === null ? (b.penuh < 2 ? "Perlu minimal 2 pengisian penuh berurutan." : "Belum ada interval penuh ke penuh pada periode ini.") :
          b.intervalSah + " interval · " + angka(Math.round(b.jarakSah)) + " km · " + literTeks(b.literSah) + " L"
      };
    }), false);
    var m = "Metode penuh ke penuh: jarak antara dua pengisian penuh dibagi liter semua pengisian setelah penuh pertama sampai penuh kedua. Pengisian sebagian tidak pernah dihitung sendiri. Interval dihitung pada periode saat pengisian penuh penutupnya terjadi.";
    if (js.tidakWajar > 0) { m += " " + js.tidakWajar + " interval di luar 2 sampai 80 km/L tidak dihitung."; }
    $("b-metode").textContent = m;

    // Konsumsi bulanan (liter)
    var ym = bulanBerakhir(h), titik = [];
    for (var i = 11; i >= 0; i--) {
      var k = GaragePengeluaran.tambahBulan(ym, -i), liter = 0, biaya = 0, isiN = 0, jarak = 0, ls = 0;
      h.kendaraan.forEach(function (p) {
        var x = p.bbm.perBulan[k];
        if (x) { liter += x.liter; biaya += x.biaya; isiN += x.isi; jarak += x.jarak; ls += x.literSah; }
      });
      titik.push({ label: NAMA_BULAN[parseInt(k.slice(5), 10) - 1], nama: bulanLabel(k), total: Math.round(liter * 100) / 100, biaya: biaya, isi: isiN, kpl: ls > 0 ? jarak / ls : null, dalam: dalamBulan(h, k) });
    }
    batangAnalitik("a-g-liter", "a-g-liter-info", "liter", titik, function (p) {
      return p.nama + " · " + (p.isi === 0 ? "tidak ada pengisian" : literTeks(p.total) + " L · " + rupiah(p.biaya) + " · " + p.isi + " pengisian" + (p.kpl !== null ? " · " + desimal(p.kpl, 1) + " km/L" : ""));
    }, { penuh: function (n) { return literTeks(n) + " L"; }, singkat: function (n) { return literTeks(Math.round(n)) + " L"; } });

    // Tren efisiensi: satu titik per interval sah, satu garis per kendaraan
    var seri = [];
    h.kendaraan.forEach(function (p, i) {
      var sah = p.bbm.interval.filter(function (x) { return x.wajar; });
      if (sah.length === 0) { return; }
      seri.push({ nama: namaK(p), warna: WARNA_GARIS[seri.length % WARNA_GARIS.length], titik: sah.map(function (x) {
        return { t: x.tanggal, y: x.kmPerLiter, ket: tanggalIndo(x.tanggal) + " · " + desimal(x.kmPerLiter, 1) + " km/L · " + angka(Math.round(x.jarak)) + " km, " + literTeks(x.liter) + " L" };
      }) });
    });
    gambarGaris($("a-g-efisiensi"), $("a-g-efisiensi-leg"), $("a-g-efisiensi-info"), "efisiensi", seri, function (y) { return desimal(y, 1) + " km/L"; });
    $("b-efisiensi-ket").textContent = seri.length === 0 ? "Tren muncul setelah ada interval penuh ke penuh." : "Tiap titik = satu interval penuh ke penuh yang sah. Ketuk titik untuk detailnya." + (seri.length > 1 ? " Motor dan mobil tidak sebanding langsung." : "");

    // Harga BBM
    var jenisSel = $("b-jenis");
    jenisSel.innerHTML = "";
    h.harga.forEach(function (j) {
      var o = document.createElement("option"); o.value = j.jenis; o.textContent = j.jenis; jenisSel.appendChild(o);
    });
    if (!h.harga.some(function (j) { return j.jenis === aJenis; })) { aJenis = h.harga.length ? h.harga[0].jenis : ""; }
    jenisSel.value = aJenis;
    jenisSel.disabled = h.harga.length === 0;
    var pilihJ = h.harga.filter(function (j) { return j.jenis === aJenis; })[0];
    var seriH = pilihJ ? [{ nama: pilihJ.jenis, warna: WARNA_GARIS[0], titik: pilihJ.titik.map(function (x) {
      return { t: x.tanggal, y: x.harga, ket: tanggalIndo(x.tanggal) + " · " + rupiah(x.harga) + "/L · " + literTeks(x.liter) + " L" };
    }) }] : [];
    gambarGaris($("a-g-harga"), null, $("a-g-harga-info"), "harga:" + aJenis, seriH, function (y) { return rupiahSingkat(Math.round(y)); });
    var rs = kosongkan($("b-harga-ringkas"));
    if (pilihJ) {
      var x = pilihJ.ringkasan;
      function sel2(k, v, kelas) { var dv = buat("div", ""); dv.appendChild(buat("p", "k", k)); dv.appendChild(buat("p", "v" + (kelas ? " " + kelas : ""), v)); rs.appendChild(dv); }
      sel2("Harga terakhir", rupiah(Math.round(x.terakhir)) + "/L");
      if (x.selisih === null) { sel2("Perubahan", BELUM, "na"); }
      else if (x.selisih === 0) { sel2("Perubahan", "Tidak berubah"); }
      else { sel2("Perubahan", (x.selisih > 0 ? "Naik " : "Turun ") + rupiah(Math.abs(Math.round(x.selisih))), x.selisih > 0 ? "sel-naik" : "sel-turun"); }
      sel2("Terendah", rupiah(Math.round(x.terendah)) + "/L");
      sel2("Tertinggi", rupiah(Math.round(x.tertinggi)) + "/L");
      sel2("Rata-rata dibayar", x.rataRata === null ? BELUM : rupiah(Math.round(x.rataRata)) + "/L", x.rataRata === null ? "na" : "");
      sel2("Jumlah pengisian", String(x.jumlah));
    } else { rs.appendChild(buat("p", "note", BELUM)); }
    var hd = kosongkan($("b-harga-daftar"));
    h.harga.forEach(function (j) {
      var x = j.ringkasan, b = buat("div", "x-row static");
      var badan = buat("span", "x-body");
      badan.appendChild(buat("span", "x-nama", j.jenis));
      badan.appendChild(buat("span", "x-meta", x.jumlah + " pengisian · " + rupiah(Math.round(x.terendah)) + " sampai " + rupiah(Math.round(x.tertinggi)) + " per liter"));
      b.appendChild(badan);
      var teks = rupiah(Math.round(x.terakhir)) + "/L";
      var nilai = buat("span", "x-biaya", teks);
      badan.appendChild(buat("span", "x-meta " + (x.selisih === null || x.selisih === 0 ? "" : (x.selisih > 0 ? "delta-naik" : "delta-turun")),
        x.selisih === null ? "Baru satu pengisian" : (x.selisih === 0 ? "Harga tetap" : (x.selisih > 0 ? "Naik " : "Turun ") + rupiah(Math.abs(Math.round(x.selisih))) + " dari pengisian sebelumnya")));
      b.appendChild(nilai);
      hd.appendChild(b);
    });
    if (h.harga.length === 0) { hd.appendChild(buat("p", "note", BELUM)); }
  }

  function isiBiaya(h) {
    peringkat($("c-per-kendaraan"), h.kendaraan.map(function (p) {
      var bpk = p.biayaPerKm;
      var sub = bpk.nilai !== null ? "Biaya per km " + rupiah(Math.round(bpk.nilai)) + " (" + angka(bpk.jarak) + " km)" :
        "Biaya per km: data belum mencukupi" + (p.odometer.jarak !== null ? " (jarak " + angka(p.odometer.jarak) + " km, minimal " + GarageAnalitik.MIN_JARAK_BIAYA_KM + ")" : " (perlu 2 catatan odometer)");
      return { nama: namaK(p), nilai: p.pengeluaran.total, teks: p.pengeluaran.total === null ? "" : rupiah(p.pengeluaran.total), sub: p.pengeluaran.total === null ? "Belum ada pengeluaran pada periode ini." : p.pengeluaran.jumlah + " transaksi · " + sub };
    }), false);

    var kk = kosongkan($("c-kategori"));
    if (h.perKategori.length === 0) { kk.appendChild(buat("p", "note", BELUM)); }
    h.perKategori.forEach(function (b) {
      barisNilai(kk, b.kategori, b.kategori, rupiah(b.total), b.persen, b.jumlah + " transaksi · " + String(b.persen).replace(".", ",") + "%", false);
    });
    var pj = 0;
    h.perKategori.forEach(function (b) { if (b.kategori === "Pajak Kendaraan" || b.kategori === "Asuransi") { pj += b.total; } });
    $("c-pajak").textContent = pj > 0 ? "Pajak dan asuransi digabung: " + rupiah(pj) + ". Termasuk pengeluaran manual." : "Termasuk pengeluaran manual. Biaya pajak dan asuransi muncul bila diisi di menu Dokumen.";

    var bl = kosongkan($("c-bulan"));
    var seri = h.seriBulan.slice(-6).reverse();
    var sebelumnya = h.seriBulan.slice(-7, -1).reverse();
    seri.forEach(function (p, i) {
      var lalu = sebelumnya[i] ? sebelumnya[i].total : null;
      var b = buat("div", "x-row static");
      var badan = buat("span", "x-body");
      badan.appendChild(buat("span", "x-nama", bulanLabel(p.kunci)));
      var ket;
      if (lalu === null) { ket = ""; }
      else if (lalu === 0) { ket = p.total === 0 ? "Tidak ada pengeluaran" : "Bulan sebelumnya tidak ada pengeluaran"; }
      else { var sel = p.total - lalu; ket = sel === 0 ? "Sama dengan bulan sebelumnya" : (sel > 0 ? "Naik " : "Turun ") + rupiah(Math.abs(sel)) + " (" + String(Math.abs(Math.round(sel / lalu * 1000) / 10)).replace(".", ",") + "%)"; }
      var kelas = ket.indexOf("Naik") === 0 ? "delta-naik" : (ket.indexOf("Turun") === 0 ? "delta-turun" : "");
      badan.appendChild(buat("span", "x-meta " + kelas, ket));
      b.appendChild(badan);
      b.appendChild(buat("span", "x-biaya", p.total === 0 ? "Rp 0" : rupiah(p.total)));
      bl.appendChild(b);
    });
  }

  // Satu angka per kendaraan atau, untuk banyak kendaraan, daftar per kendaraan (tidak dicampur)
  function perKendaraanTeks(h, ambil) {
    return h.kendaraan.map(function (p) { var v = ambil(p); return namaK(p) + ": " + (v === null ? BELUM : v); }).join(" · ");
  }

  function isiRawat(h) {
    var banyak = h.kendaraan.length > 1;
    var r = h.ringkasan;
    $("r-judul-servis").textContent = banyak ? "Gabungan kendaraan terpilih" : namaK(h.kendaraan[0]);
    setTile("r-jumlah", r.jumlahServis === 0 ? null : String(r.jumlahServis), "");
    setTile("r-kunjungan", r.kunjunganServis === 0 ? null : String(r.kunjunganServis), r.kunjunganServis === 0 ? "" : "catatan di tanggal sama dihitung satu kunjungan");
    setTile("r-total", r.totalServis === null ? null : rupiah(r.totalServis), "");
    var f = 0, fAda = false;
    h.kendaraan.forEach(function (p) { if (p.servis.perBulan !== null) { f += p.servis.perBulan; fAda = true; } });
    setTile("r-freq", fAda ? String(Math.round(f * 10) / 10).replace(".", ",") + " kali/bulan" : null, "");
    if (banyak) {
      setTile("r-km", "Lihat per kendaraan", perKendaraanTeks(h, function (p) { return p.servis.rataKm === null ? null : angka(p.servis.rataKm) + " km"; }));
      setTile("r-hari", "Lihat per kendaraan", perKendaraanTeks(h, function (p) { return p.servis.rataHari === null ? null : String(p.servis.rataHari).replace(".", ",") + " hari"; }));
    } else {
      var s = h.kendaraan[0].servis;
      setTile("r-km", s.rataKm === null ? null : angka(s.rataKm) + " km", s.rataKm === null ? "Perlu 2 kunjungan dengan odometer." : "");
      setTile("r-hari", s.rataHari === null ? null : String(s.rataHari).replace(".", ",") + " hari", s.rataHari === null ? "Perlu 2 kunjungan servis." : "");
    }
    // kategori digabung
    var kat = {}, urut = [], totalK = 0;
    h.kendaraan.forEach(function (p) {
      p.servis.perKategori.forEach(function (k) {
        if (!kat[k.kategori]) { kat[k.kategori] = { kategori: k.kategori, jumlah: 0, total: 0, terakhir: "" }; urut.push(kat[k.kategori]); }
        kat[k.kategori].jumlah += k.jumlah; kat[k.kategori].total += k.total;
        if (k.terakhir > kat[k.kategori].terakhir) { kat[k.kategori].terakhir = k.terakhir; }
        totalK += k.total;
      });
    });
    urut.sort(function (a, b) { return b.total - a.total || b.jumlah - a.jumlah; });
    var besar = urut.length && urut[0].total > 0 ? urut[0] : null;
    setTile("r-besar", besar ? besar.kategori + " · " + rupiah(besar.total) : null, besar ? String(Math.round(besar.total / totalK * 1000) / 10).replace(".", ",") + "% dari biaya servis" : "Belum ada biaya servis pada periode ini.");
    var kk = kosongkan($("r-kategori"));
    if (urut.length === 0) { kk.appendChild(buat("p", "note", BELUM)); }
    var maks = urut.length ? Math.max(1, urut[0].total) : 1;
    urut.forEach(function (k) {
      barisNilai(kk, "Servis & Perawatan", k.kategori, k.total > 0 ? rupiah(k.total) : "Tanpa biaya", k.total / maks * 100, k.jumlah + " catatan · terakhir " + tanggalIndo(k.terakhir), false);
    });
    // jadwal
    var jd = kosongkan($("r-jadwal")), n = 0;
    h.kendaraan.forEach(function (p) {
      p.servis.jadwal.forEach(function (j) {
        n++;
        var b = buat("div", "x-row static");
        var badan = buat("span", "x-body");
        badan.appendChild(buat("span", "x-nama", j.kategori));
        badan.appendChild(buat("span", "x-meta", (banyak ? namaK(p) + " · " : "") + teksSisa(j)));
        b.appendChild(badan);
        b.appendChild(badgeStatus(j.status));
        jd.appendChild(b);
      });
    });
    if (n === 0) { jd.appendChild(buat("p", "note", "Belum ada jadwal perawatan. Isi jatuh tempo tanggal atau odometer pada catatan servis agar jadwal muncul di sini.")); }

    // cuci
    $("w-judul").textContent = banyak ? "Gabungan kendaraan terpilih" : namaK(h.kendaraan[0]);
    var jml = 0, brb = 0, tanpa = 0, tot = 0, adaT = false;
    h.kendaraan.forEach(function (p) { jml += p.cuci.jumlah; brb += p.cuci.berbiaya; tanpa += p.cuci.tanpaBiaya; if (p.cuci.total !== null) { tot += p.cuci.total; adaT = true; } });
    setTile("w-jumlah", jml === 0 ? null : String(jml), "");
    if (banyak) {
      setTile("w-hari", "Lihat per kendaraan", perKendaraanTeks(h, function (p) { return p.cuci.rataHari === null ? null : String(p.cuci.rataHari).replace(".", ",") + " hari"; }));
    } else {
      var c = h.kendaraan[0].cuci;
      setTile("w-hari", c.rataHari === null ? null : String(c.rataHari).replace(".", ",") + " hari", c.rataHari === null ? "Perlu minimal 2 catatan cuci." : "");
    }
    setTile("w-total", adaT ? rupiah(tot) : null, "");
    setTile("w-rata", brb > 0 ? rupiah(Math.round(tot / brb)) : null, brb > 0 ? "dari " + brb + " cuci berbiaya" : "");
    $("w-catatan").textContent = tanpa > 0 ? tanpa + " catatan cuci tanpa biaya tidak dihitung dalam total dan rata-rata biaya." : "";
    var ym = bulanBerakhir(h), titik = [];
    for (var i = 11; i >= 0; i--) {
      var k = GaragePengeluaran.tambahBulan(ym, -i), t = 0;
      h.kendaraan.forEach(function (p) { t += p.cuci.perBulanBiaya[k] || 0; });
      titik.push({ label: NAMA_BULAN[parseInt(k.slice(5), 10) - 1], nama: bulanLabel(k), total: t, dalam: dalamBulan(h, k) });
    }
    batangAnalitik("a-g-cuci", "a-g-cuci-info", "cuci", titik, function (p) { return p.nama + " · " + (p.total === 0 ? "tidak ada catatan" : rupiah(p.total)) + (p.dalam ? "" : " (di luar periode)"); });
  }

  function isiBanding(h) {
    var banyak = dataKendaraan.length >= 2;
    $("m-sedikit").hidden = banyak;
    $("m-isi").hidden = !banyak;
    if (!banyak) { return; }
    var per = h.semuaKendaraan;
    var jenis = {};
    per.forEach(function (p) { jenis[p.jenis || "?"] = true; });
    $("m-ket").textContent = "Semua kendaraan pada periode yang sama. " + teksPeriode({ dari: h.rentang.dari, sampai: h.rentang.sampai, salah: h.salah }) +
      (Object.keys(jenis).length > 1 ? " Mobil dan motor tidak setara untuk km/L dan biaya per km. Bandingkan terutama antar kendaraan sejenis." : "") +
      " Kendaraan yang datanya belum cukup ditulis \"" + BELUM + "\", bukan nol.";
    function baris(ambil, teks, sub, urutNaik, id) {
      peringkat($(id), per.map(function (p) {
        var v = ambil(p);
        return { nama: namaK(p), nilai: v, teks: v === null ? "" : teks(v), sub: sub(p, v) };
      }), urutNaik);
    }
    baris(function (p) { return p.pengeluaran.total; }, rupiah, function (p) { return p.pengeluaran.jumlah + " transaksi" + (p.jenis ? " · " + p.jenis : ""); }, false, "m-total");
    baris(function (p) { return p.biayaPerKm.nilai; }, function (v) { return rupiah(Math.round(v)) + "/km"; },
      function (p, v) { return v === null ? "Jarak atau biaya belum mencukupi (minimal " + GarageAnalitik.MIN_JARAK_BIAYA_KM + " km)" : "Jarak " + angka(p.biayaPerKm.jarak) + " km · makin kecil makin hemat"; }, true, "m-bpk");
    baris(function (p) { return p.bbm.kmPerLiter; }, function (v) { return desimal(v, 1) + " km/L"; },
      function (p, v) { return v === null ? "Perlu 2 pengisian penuh berurutan pada periode" : p.bbm.intervalSah + " interval penuh ke penuh"; }, false, "m-kpl");
    baris(function (p) { return p.odometer.jarak; }, function (v) { return angka(v) + " km"; },
      function (p, v) { return v === null ? "Perlu minimal 2 catatan odometer" : angka(p.odometer.kmAwal) + " sampai " + angka(p.odometer.kmAkhir) + " km"; }, false, "m-km");
    baris(function (p) { return p.servis.kunjungan === 0 ? null : p.servis.kunjungan; }, function (v) { return v + " kunjungan"; },
      function (p, v) { return v === null ? "Tidak ada catatan servis pada periode" : p.servis.jumlah + " catatan"; }, false, "m-freq");
    baris(function (p) { return p.servis.total; }, rupiah, function (p, v) { return v === null ? "Tidak ada catatan servis pada periode" : "Dari catatan di menu Servis"; }, false, "m-rawat");
  }

  // ----- Kontrol -----

  $("btn-ke-analitik").addEventListener("click", function () { tampilkanAnalitik(); pindahLayar("analitik"); });
  $("btn-analitik-kembali").addEventListener("click", function () { pindahLayar("garasi"); });
  $("a-kendaraan").addEventListener("change", function () { aKendaraan = this.value; aSel = {}; tampilkanAnalitik(); });
  $("a-periode").addEventListener("change", function () {
    aPeriode.jenis = this.value;
    var hariIni = tanggalHariIni();
    if (aPeriode.jenis === "bulan" && !aPeriode.bulan) { aPeriode.bulan = hariIni.slice(0, 7); $("a-bulan").value = aPeriode.bulan; }
    if (aPeriode.jenis === "rentang" && !aPeriode.dari && !aPeriode.sampai) {
      aPeriode.dari = hariIni.slice(0, 8) + "01"; aPeriode.sampai = hariIni;
      $("a-dari").value = aPeriode.dari; $("a-sampai").value = aPeriode.sampai;
    }
    aSel = {};
    tampilkanAnalitik();
  });
  $("a-bulan").addEventListener("change", function () { aPeriode.bulan = this.value; aSel = {}; tampilkanAnalitik(); });
  $("a-dari").addEventListener("change", function () { aPeriode.dari = this.value; aSel = {}; tampilkanAnalitik(); });
  $("a-sampai").addEventListener("change", function () { aPeriode.sampai = this.value; aSel = {}; tampilkanAnalitik(); });
  $("b-jenis").addEventListener("change", function () { aJenis = this.value; tampilkanAnalitik(); });
  Array.prototype.forEach.call(document.querySelectorAll("#a-nav .pill"), function (b) {
    b.addEventListener("click", function () { aPanel = b.getAttribute("data-panel"); tampilkanAnalitik(); window.scrollTo(0, 0); });
  });

  // ---------- Cadangkan data ----------

  var btnBackup = $("btn-backup");
  var btnSave = $("btn-save");
  var backupMsg = $("backup-msg");
  var cadangan = null; // { teks, nama } setelah cadangan dibuat

  btnBackup.addEventListener("click", function () {
    var sandi = $("b-sandi").value;
    var sandi2 = $("b-sandi2").value;
    cadangan = null;
    btnSave.hidden = true;

    if (sandi.length < 8) {
      pesan(backupMsg, "Sandi minimal 8 karakter.", "bad");
      return;
    }
    if (sandi !== sandi2) {
      pesan(backupMsg, "Kedua sandi tidak sama.", "bad");
      return;
    }

    btnBackup.disabled = true;
    pesan(backupMsg, "Membuat cadangan...");

    GarageBackup.buat(sandi).then(function (teks) {
      cadangan = { teks: teks, nama: "MY-GARAGE-cadangan-" + tanggalHariIni() + ".json" };
      btnSave.hidden = false;
      pesan(backupMsg, "Cadangan siap. Ketuk Simpan File Cadangan, lalu pilih Simpan ke Berkas.", "good");
    }).catch(function () {
      pesan(backupMsg, "Gagal membuat cadangan di perangkat ini.", "bad");
    }).then(function () {
      btnBackup.disabled = false;
    });
  });

  // Tombol ini sengaja terpisah agar iPhone mengizinkan menu simpan muncul
  btnSave.addEventListener("click", function () {
    if (!cadangan) { return; }
    var berkas = new File([cadangan.teks], cadangan.nama, { type: "application/json" });

    function selesai() {
      $("b-sandi").value = "";
      $("b-sandi2").value = "";
      btnSave.hidden = true;
      cadangan = null;
      pesan(backupMsg, "Selesai. Pastikan file cadangan muncul di aplikasi Berkas.", "good");
    }

    function unduhLangsung() {
      var url = URL.createObjectURL(berkas);
      var a = document.createElement("a");
      a.href = url;
      a.download = berkas.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      selesai();
    }

    if (navigator.canShare && navigator.canShare({ files: [berkas] })) {
      navigator.share({ files: [berkas], title: "Cadangan MY GARAGE" })
        .then(selesai)
        .catch(function (err) {
          if (err && err.name === "AbortError") { return; } // dibatalkan, tombol tetap ada
          unduhLangsung();
        });
    } else {
      unduhLangsung();
    }
  });

  // ---------- Pulihkan data ----------

  var restoreMsg = $("restore-msg");
  var btnRestore = $("btn-restore");

  btnRestore.addEventListener("click", function () {
    var berkas = $("r-file").files[0];
    var sandi = $("r-sandi").value;

    if (!berkas) {
      pesan(restoreMsg, "Pilih file cadangan dulu.", "bad");
      return;
    }
    if (!sandi) {
      pesan(restoreMsg, "Masukkan sandi cadangan.", "bad");
      return;
    }
    tanya("Data saat ini akan DIGANTI dengan isi cadangan. Lanjutkan?", "Ya, ganti data", jalankanPulih, "Pulihkan cadangan");

    function jalankanPulih() {
    btnRestore.disabled = true;
    pesan(restoreMsg, "Memulihkan data...");

    var pembaca = new FileReader();
    pembaca.onerror = function () {
      pesan(restoreMsg, "File tidak bisa dibaca.", "bad");
      btnRestore.disabled = false;
    };
    pembaca.onload = function () {
      GarageBackup.pulihkan(pembaca.result, sandi).then(function (jumlah) {
        $("r-file").value = "";
        $("r-sandi").value = "";
        pesan(restoreMsg, "Berhasil. " + jumlah.kendaraan + " kendaraan, " +
          jumlah.servis + " catatan servis, " + jumlah.bbm + " catatan BBM, " +
          jumlah.cuci + " catatan cuci, " + jumlah.dokumen + " dokumen, " +
          jumlah.pengeluaran + " pengeluaran manual, dan " +
          jumlah.foto + " foto dipulihkan.", "good");
        return muatUlang();
      }).catch(function (err) {
        var kode = err && err.message;
        if (kode === "sandi") {
          pesan(restoreMsg, "Sandi salah, atau file cadangan rusak. Data Anda tidak diubah.", "bad");
        } else if (kode === "versi") {
          pesan(restoreMsg, "Cadangan ini dibuat oleh versi MY GARAGE yang lebih baru. Perbarui aplikasi dulu.", "bad");
        } else if (kode === "rusak") {
          pesan(restoreMsg, "Foto di dalam cadangan rusak. Data Anda tidak diubah.", "bad");
        } else {
          pesan(restoreMsg, "File ini bukan cadangan MY GARAGE. Data Anda tidak diubah.", "bad");
        }
      }).then(function () {
        btnRestore.disabled = false;
      });
    };
    pembaca.readAsText(berkas);
    }
  });

  // ---------- Awal ----------

  // Minta iPhone agar tidak menghapus data aplikasi ini secara otomatis
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }

  // Aktifkan mode offline (service worker)
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  muatUlang();
})();
