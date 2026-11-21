// MY GARAGE - app.js (mengatur perilaku aplikasi)

(function () {
  var jsStatus = document.getElementById("js-status");
  var cssStatus = document.getElementById("css-status");
  var today = document.getElementById("today");

  // Tampilkan tanggal hari ini dalam bahasa Indonesia
  var tanggal = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  today.textContent = "Hari ini: " + tanggal;

  // Tandai bahwa JavaScript berjalan
  jsStatus.textContent = "JavaScript berjalan";
  jsStatus.className = "ok";

  // Tandai bahwa CSS terpasang (latar halaman harus hitam arang)
  var bg = getComputedStyle(document.body).backgroundColor;
  if (bg === "rgb(16, 17, 20)") {
    cssStatus.className = "ok";
  } else {
    cssStatus.textContent = "Gaya (CSS) belum terpasang";
  }

  // Aktifkan mode offline (service worker)
  var swStatus = document.getElementById("sw-status");
  var bisaOffline = "serviceWorker" in navigator && location.protocol.indexOf("http") === 0;

  if (bisaOffline) {
    navigator.serviceWorker.register("sw.js").then(function () {
      swStatus.textContent = "Mode offline aktif";
      swStatus.className = "ok";
    }).catch(function () {
      swStatus.textContent = "Mode offline gagal diaktifkan";
    });
  } else {
    swStatus.textContent = "Mode offline aktif setelah aplikasi di-hosting";
  }
})();
