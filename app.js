// MY GARAGE - app.js (mengatur perilaku aplikasi)

(function () {
  var listEl = document.getElementById("vehicle-list");
  var emptyEl = document.getElementById("empty");
  var sheet = document.getElementById("sheet");
  var form = document.getElementById("vehicle-form");
  var errorEl = document.getElementById("form-error");
  var todayEl = document.getElementById("today");

  var tahunIni = new Date().getFullYear();

  // Tanggal hari ini dalam bahasa Indonesia
  todayEl.textContent = "Hari ini: " + new Date().toLocaleDateString("id-ID", {
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

  // Menampilkan daftar kendaraan di layar
  function tampilkan(items) {
    listEl.innerHTML = "";
    emptyEl.hidden = items.length > 0;

    // Kendaraan terbaru di atas
    items.sort(function (a, b) { return b.dibuat - a.dibuat; });

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

  // Membaca semua kendaraan dari database lalu menampilkannya
  function muatUlang() {
    return GarageDB.all().then(tampilkan).catch(function () {
      listEl.innerHTML = "";
      listEl.appendChild(buat("p", "today", "Database tidak bisa dibuka di perangkat ini."));
    });
  }

  function bukaForm() {
    form.reset();
    errorEl.hidden = true;
    sheet.hidden = false;
    document.body.classList.add("lock");
    document.getElementById("f-nama").focus();
  }

  function tutupForm() {
    sheet.hidden = true;
    document.body.classList.remove("lock");
  }

  function tampilkanError(pesan) {
    errorEl.textContent = pesan;
    errorEl.hidden = false;
  }

  function simpan() {
    var nama = document.getElementById("f-nama").value.trim();
    var plat = document.getElementById("f-plat").value.trim().toUpperCase();
    var tahun = parseInt(document.getElementById("f-tahun").value, 10);
    var jenis = document.getElementById("f-jenis").value;

    if (!nama || !plat) {
      tampilkanError("Nama kendaraan dan plat nomor wajib diisi.");
      return;
    }
    if (isNaN(tahun) || tahun < 1950 || tahun > tahunIni + 1) {
      tampilkanError("Isi tahun antara 1950 dan " + (tahunIni + 1) + ".");
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
      tampilkanError("Gagal menyimpan. Coba lagi.");
    });
  }

  // Menghubungkan tombol dengan fungsinya
  Array.prototype.forEach.call(document.querySelectorAll(".js-add"), function (tombol) {
    tombol.addEventListener("click", bukaForm);
  });
  document.getElementById("btn-cancel").addEventListener("click", tutupForm);
  sheet.addEventListener("click", function (e) {
    if (e.target === sheet) { tutupForm(); }
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    simpan();
  });

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
