// MY GARAGE - app.js (mengatur perilaku aplikasi)

(function () {
  function $(id) { return document.getElementById(id); }

  var tahunIni = new Date().getFullYear();
  var dataKendaraan = [];
  var dataServis = [];
  var kendaraanTerpilih = null; // id kendaraan yang sedang dilihat di layar Servis
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

  // Odometer tertinggi yang pernah dicatat di servis untuk satu kendaraan
  function kmTertinggi(vehicleId) {
    var tertinggi = 0;
    dataServis.forEach(function (s) {
      if (s.vehicleId === vehicleId && s.km > tertinggi) { tertinggi = s.km; }
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
      t.classList.toggle("active", t.getAttribute("data-view") === nama);
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
    return Promise.all([GarageDB.all(), GarageDB.serviceAll()]).then(function (hasil) {
      dataKendaraan = hasil[0];
      dataServis = hasil[1];
      // Kendaraan terbaru di atas
      dataKendaraan.sort(function (a, b) { return (b.dibuat || 0) - (a.dibuat || 0); });
      return muatFoto();
    }).then(function () {
      tampilkanKendaraan();
      tampilkanServis();
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
        if (confirm("Hapus " + namaKendaraan(v) + " dari garasi? Catatan servis dan fotonya ikut terhapus.")) {
          GarageDB.remove(v.id).then(muatUlang);
        }
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
        pesan(errorKendaraan, "Odometer tidak boleh lebih rendah dari catatan servis tertinggi (" +
          angka(tertinggi) + " km).", "bad");
        return;
      }
      var lama = odometerKendaraan(sedangUbah);
      if (lama !== null && odometer < lama &&
          !confirm("Odometer lebih rendah dari sebelumnya (" + angka(lama) + " km). Ini koreksi yang benar?")) {
        return;
      }
    }

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

  function tampilkanServis() {
    var ada = dataKendaraan.length > 0;
    var daftar = $("service-list");
    var kosong = $("service-empty");
    var ringkasan = $("service-summary");

    $("service-picker").hidden = !ada;
    $("btn-add-service").hidden = !ada;
    daftar.innerHTML = "";

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
      return String(b.tanggal).localeCompare(String(a.tanggal)) || (b.id - a.id);
    });

    kosong.hidden = catatan.length > 0;
    ringkasan.hidden = catatan.length === 0;

    if (catatan.length === 0) {
      $("service-empty-title").textContent = "Belum ada catatan servis";
      $("service-empty-text").textContent = "Ketuk + Catat untuk mencatat servis pertama kendaraan ini.";
      return;
    }

    var total = 0;
    var kmTerjauh = kmTertinggi(kendaraanTerpilih);
    catatan.forEach(function (s) { total += s.biaya; });
    var odoSekarang = odometerKendaraan(kendaraan);
    if (odoSekarang !== null && odoSekarang > kmTerjauh) { kmTerjauh = odoSekarang; }
    $("sum-biaya").textContent = rupiah(total);
    $("sum-km").textContent = angka(kmTerjauh) + " km";

    catatan.forEach(function (s) {
      var kartu = buat("article", "card record");

      var atas = buat("div", "r-top");
      atas.appendChild(buat("h2", "r-title", s.jenis));
      atas.appendChild(buat("span", "r-cost", rupiah(s.biaya)));
      kartu.appendChild(atas);

      kartu.appendChild(buat("p", "r-meta", tanggalIndo(s.tanggal) + " · " + angka(s.km) + " km"));
      if (s.catatan) { kartu.appendChild(buat("p", "r-note", s.catatan)); }

      var hapus = buat("button", "link-btn", "Hapus");
      hapus.type = "button";
      hapus.addEventListener("click", function () {
        if (confirm("Hapus catatan servis ini?")) {
          GarageDB.serviceRemove(s.id).then(muatUlang);
        }
      });
      kartu.appendChild(hapus);

      daftar.appendChild(kartu);
    });
  }

  pilih.addEventListener("change", function () {
    kendaraanTerpilih = parseInt(pilih.value, 10);
    tampilkanServis();
  });

  // ---------- Formulir catat servis ----------

  var sheetServis = $("sheet-servis");
  var formServis = $("service-form");
  var errorServis = $("service-error");

  function bukaFormServis() {
    if (dataKendaraan.length === 0) { return; }
    formServis.reset();
    errorServis.hidden = true;
    isiPilihan($("s-kendaraan"), kendaraanTerpilih);
    $("s-tanggal").value = tanggalHariIni();
    bukaSheet(sheetServis, $("s-km"));
  }

  function simpanServis() {
    var vehicleId = parseInt($("s-kendaraan").value, 10);
    var tanggal = $("s-tanggal").value;
    var km = parseInt($("s-km").value, 10);
    var biaya = parseInt($("s-biaya").value, 10);
    var jenis = $("s-jenis").value;
    var catatan = $("s-catatan").value.trim();

    if (isNaN(vehicleId)) {
      pesan(errorServis, "Pilih kendaraan dulu.", "bad");
      return;
    }
    if (!tanggal) {
      pesan(errorServis, "Isi tanggal servis.", "bad");
      return;
    }
    if (isNaN(km) || km < 0 || km > 2000000) {
      pesan(errorServis, "Isi odometer dengan angka antara 0 dan 2.000.000 km.", "bad");
      return;
    }
    if (isNaN(biaya) || biaya < 0 || biaya > 10000000000) {
      pesan(errorServis, "Isi biaya dengan angka rupiah, tanpa titik. Isi 0 jika gratis.", "bad");
      return;
    }

    // Odometer harus naik mengikuti tanggal: tidak boleh lebih rendah dari catatan yang lebih lama,
    // dan tidak boleh lebih tinggi dari catatan yang lebih baru.
    var bentrok = null;
    dataServis.forEach(function (s) {
      if (bentrok || s.vehicleId !== vehicleId) { return; }
      if (s.tanggal < tanggal && s.km > km) {
        bentrok = "Odometer lebih rendah dari catatan sebelumnya: " + angka(s.km) +
          " km pada " + tanggalIndo(s.tanggal) + ".";
      } else if (s.tanggal > tanggal && s.km < km) {
        bentrok = "Odometer lebih tinggi dari catatan yang lebih baru: " + angka(s.km) +
          " km pada " + tanggalIndo(s.tanggal) + ".";
      }
    });
    if (bentrok) {
      pesan(errorServis, bentrok, "bad");
      return;
    }

    GarageDB.serviceAdd({
      vehicleId: vehicleId,
      tanggal: tanggal,
      km: km,
      jenis: jenis,
      biaya: biaya,
      catatan: catatan,
      dibuat: Date.now()
    }).then(function () {
      kendaraanTerpilih = vehicleId;
      tutupSheet(sheetServis);
      return muatUlang();
    }).catch(function () {
      pesan(errorServis, "Gagal menyimpan. Coba lagi.", "bad");
    });
  }

  $("btn-add-service").addEventListener("click", bukaFormServis);
  $("btn-cancel-service").addEventListener("click", function () { tutupSheet(sheetServis); });
  sheetServis.addEventListener("click", function (e) {
    if (e.target === sheetServis) { tutupSheet(sheetServis); }
  });
  formServis.addEventListener("submit", function (e) {
    e.preventDefault();
    simpanServis();
  });
  formServis.addEventListener("input", function () { errorServis.hidden = true; });

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
    if (!confirm("Data saat ini akan DIGANTI dengan isi cadangan. Lanjutkan?")) {
      return;
    }

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
          jumlah.servis + " catatan servis, dan " + jumlah.foto + " foto dipulihkan.", "good");
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
