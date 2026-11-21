// MY GARAGE - app.js (mengatur perilaku aplikasi)

(function () {
  function $(id) { return document.getElementById(id); }

  var listEl = $("vehicle-list");
  var emptyEl = $("empty");
  var sheet = $("sheet");
  var form = $("vehicle-form");
  var errorEl = $("form-error");
  var tahunIni = new Date().getFullYear();

  // Tanggal hari ini dalam bahasa Indonesia
  $("today").textContent = "Hari ini: " + new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  // Membuat satu elemen HTML dengan aman (teks tidak dibaca sebagai kode)
  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) { e.className = kelas; }
    if (teks !== undefined) { e.textContent = teks; }
    return e;
  }

  // Menampilkan pesan kecil di bawah tombol. jenis: "good", "bad", "warn" atau kosong
  function pesan(el, teks, jenis) {
    el.textContent = teks;
    el.className = "note" + (jenis ? " " + jenis : "");
    el.hidden = false;
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

  // ---------- Daftar kendaraan ----------

  function tampilkan(items) {
    listEl.innerHTML = "";
    emptyEl.hidden = items.length > 0;

    // Kendaraan terbaru di atas
    items.sort(function (a, b) { return (b.dibuat || 0) - (a.dibuat || 0); });

    items.forEach(function (v) {
      var kartu = buat("article", "card vehicle");
      kartu.appendChild(buat("p", "v-type", v.jenis));
      kartu.appendChild(buat("h2", "v-name", v.nama));

      var info = buat("div", "v-meta");
      info.appendChild(buat("span", "plate", v.plat));
      info.appendChild(buat("span", "v-year", "Tahun " + v.tahun));
      kartu.appendChild(info);

      var hapus = buat("button", "link-btn", "Hapus");
      hapus.type = "button";
      hapus.addEventListener("click", function () {
        if (confirm("Hapus " + v.nama + " dari garasi?")) {
          GarageDB.remove(v.id).then(muatUlang);
        }
      });
      kartu.appendChild(hapus);

      listEl.appendChild(kartu);
    });
  }

  function muatUlang() {
    return GarageDB.all().then(tampilkan).catch(function () {
      listEl.innerHTML = "";
      listEl.appendChild(buat("p", "today", "Database tidak bisa dibuka di perangkat ini."));
    });
  }

  // ---------- Formulir tambah kendaraan ----------

  function bukaForm() {
    form.reset();
    errorEl.hidden = true;
    sheet.hidden = false;
    document.body.classList.add("lock");
    $("f-nama").focus();
  }

  function tutupForm() {
    sheet.hidden = true;
    document.body.classList.remove("lock");
  }

  function simpan() {
    var nama = $("f-nama").value.trim();
    var plat = $("f-plat").value.trim().toUpperCase();
    var tahun = parseInt($("f-tahun").value, 10);
    var jenis = $("f-jenis").value;

    if (!nama || !plat) {
      pesan(errorEl, "Nama kendaraan dan plat nomor wajib diisi.", "bad");
      return;
    }
    if (isNaN(tahun) || tahun < 1950 || tahun > tahunIni + 1) {
      pesan(errorEl, "Isi tahun antara 1950 dan " + (tahunIni + 1) + ".", "bad");
      return;
    }

    GarageDB.add({
      jenis: jenis,
      nama: nama,
      plat: plat,
      tahun: tahun,
      dibuat: Date.now()
    }).then(function () {
      tutupForm();
      muatUlang();
    }).catch(function () {
      pesan(errorEl, "Gagal menyimpan. Coba lagi.", "bad");
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".js-add"), function (tombol) {
    tombol.addEventListener("click", bukaForm);
  });
  $("btn-cancel").addEventListener("click", tutupForm);
  sheet.addEventListener("click", function (e) {
    if (e.target === sheet) { tutupForm(); }
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    simpan();
  });

  // ---------- Cadangkan data ----------

  var btnBackup = $("btn-backup");
  var btnSave = $("btn-save");
  var backupMsg = $("backup-msg");
  var cadangan = null; // { teks, nama } setelah cadangan dibuat

  function tanggalHariIni() {
    var d = new Date();
    var bulan = ("0" + (d.getMonth() + 1)).slice(-2);
    var hari = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + bulan + "-" + hari;
  }

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
    if (!confirm("Data kendaraan saat ini akan DIGANTI dengan isi cadangan. Lanjutkan?")) {
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
        pesan(restoreMsg, "Berhasil. " + jumlah + " kendaraan dipulihkan.", "good");
        muatUlang();
      }).catch(function (err) {
        if (err && err.message === "sandi") {
          pesan(restoreMsg, "Sandi salah, atau file cadangan rusak.", "bad");
        } else {
          pesan(restoreMsg, "File ini bukan cadangan MY GARAGE.", "bad");
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
