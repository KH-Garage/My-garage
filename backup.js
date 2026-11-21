// MY GARAGE - backup.js (cadangan terkunci sandi, dibuat dan dibuka di perangkat Anda)
// Sandi tidak pernah disimpan atau dikirim ke mana pun.
// Kunci: PBKDF2 (250.000 putaran) -> AES-GCM 256 bit.

var GarageBackup = (function () {
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function keBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var teks = "";
    for (var i = 0; i < bytes.length; i++) { teks += String.fromCharCode(bytes[i]); }
    return btoa(teks);
  }

  function dariBase64(base64) {
    var teks = atob(base64);
    var bytes = new Uint8Array(teks.length);
    for (var i = 0; i < teks.length; i++) { bytes[i] = teks.charCodeAt(i); }
    return bytes;
  }

  // Mengubah sandi menjadi kunci enkripsi
  function buatKunci(sandi, garam) {
    return crypto.subtle.importKey("raw", enc.encode(sandi), "PBKDF2", false, ["deriveKey"])
      .then(function (dasar) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: garam, iterations: 250000, hash: "SHA-256" },
          dasar,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      });
  }

  // Memastikan isi cadangan berbentuk daftar kendaraan yang benar
  function validKendaraan(item) {
    return item && typeof item === "object" &&
      typeof item.nama === "string" &&
      typeof item.plat === "string" &&
      typeof item.jenis === "string" &&
      typeof item.tahun === "number";
  }

  // Membuat teks cadangan terkunci dari semua data saat ini
  function buat(sandi) {
    return GarageDB.all().then(function (items) {
      var garam = crypto.getRandomValues(new Uint8Array(16));
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var isi = enc.encode(JSON.stringify({ kendaraan: items }));

      return buatKunci(sandi, garam).then(function (kunci) {
        return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, kunci, isi);
      }).then(function (terkunci) {
        return JSON.stringify({
          aplikasi: "MY GARAGE",
          versi: 1,
          dibuat: new Date().toISOString(),
          garam: keBase64(garam),
          iv: keBase64(iv),
          data: keBase64(terkunci)
        });
      });
    });
  }

  // Membuka cadangan dengan sandi, lalu MENGGANTI semua data saat ini
  // Hasil: jumlah kendaraan yang dipulihkan
  // Galat: "format" (file bukan cadangan MY GARAGE) atau "sandi" (sandi salah)
  function pulihkan(teks, sandi) {
    var paket;
    try { paket = JSON.parse(teks); } catch (e) { return Promise.reject(new Error("format")); }
    if (!paket || paket.aplikasi !== "MY GARAGE" || !paket.garam || !paket.iv || !paket.data) {
      return Promise.reject(new Error("format"));
    }

    var garam, iv, data;
    try {
      garam = dariBase64(paket.garam);
      iv = dariBase64(paket.iv);
      data = dariBase64(paket.data);
    } catch (e) { return Promise.reject(new Error("format")); }

    return buatKunci(sandi, garam).then(function (kunci) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, kunci, data);
    }).catch(function () {
      throw new Error("sandi");
    }).then(function (terbuka) {
      var isi;
      try { isi = JSON.parse(dec.decode(terbuka)); } catch (e) { throw new Error("format"); }
      if (!isi || !Array.isArray(isi.kendaraan) || !isi.kendaraan.every(validKendaraan)) {
        throw new Error("format");
      }
      return GarageDB.replaceAll(isi.kendaraan).then(function () {
        return isi.kendaraan.length;
      });
    });
  }

  return { buat: buat, pulihkan: pulihkan };
})();
