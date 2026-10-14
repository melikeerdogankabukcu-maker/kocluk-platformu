// Kamerayla barkod / QR okuma.
//
// ── TARAYICI DESTEĞİ DÜRÜSTÇE ───────────────────────────────────
// Tarayıcının yerleşik `BarcodeDetector` arayüzü kullanılıyor.
// Android Chrome'da var; **iOS Safari'de YOK** ve iPhone'daki her
// tarayıcı (Chrome dâhil) Safari motorunu kullandığı için iPhone'da
// tarama çalışmıyor. Bu bir hata değil, platform sınırı.
//
// Bu yüzden `taramaVarMi()` ayrı bir işlev: arayüz tarama düğmesini
// göstermeden önce soruyor ve desteklenmiyorsa elle giriş sunuyor.
// Düğmeyi gösterip tıklayınca "olmadı" demek, kullanıcıya kendi
// cihazını suçlatırdı.
//
// ── NEDEN HARİCİ KÜTÜPHANE YOK ──────────────────────────────────
// Kitap barkodu EAN-13; tarayıcı dışı bir çözücü (zxing-wasm) birkaç
// yüz kilobayt ve bu iş için henüz ölçülmedi. Elle giriş yolu zaten
// çalışıyor. Cevap kâğıdındaki kodda durum farklı olacak: onun biçimini
// BİZ seçiyoruz, yani QR seçilirse küçük bir çözücü (jsQR ~15 KB)
// yeterli olur — o iş geldiğinde ölçülüp karar verilecek.

export const taramaVarMi = () =>
  typeof window !== "undefined" && "BarcodeDetector" in window;

// Desteklenen biçimler cihazdan cihaza değişiyor; istediğimiz biçim
// listede yoksa tarama baştan reddediliyor.
export async function desteklenenBicimler() {
  if (!taramaVarMi()) return [];
  try {
    return await window.BarcodeDetector.getSupportedFormats();
  } catch {
    return [];
  }
}

// Kamerayı açar ve ilk geçerli kodu okur.
//
// Girdi:
//   video     kameranın bağlanacağı <video> öğesi
//   bicimler  aranacak kod biçimleri
//   onKod     her okunan ham kod için çağrılıyor; `true` dönerse
//             tarama biter (doğrulamayı çağıran yapıyor — ISBN
//             sağlaması tutmayan bir okumada taramaya devam etmek
//             gerekiyor, durmak değil)
//
// Çıktı: tarama durdurucu işlev. Çağıran bileşen kapanırken MUTLAKA
// çağırmalı, yoksa kamera açık kalıyor.
export async function taramaBaslat(video, { bicimler = ["ean_13", "ean_8", "qr_code"], onKod, onHata } = {}) {
  if (!taramaVarMi()) {
    onHata?.("Bu tarayıcı barkod taramayı desteklemiyor.");
    return () => {};
  }

  let akis = null, zamanlayici = null, bitti = false;

  const durdur = () => {
    bitti = true;
    if (zamanlayici) clearInterval(zamanlayici);
    // Kamerayı bırakmak ŞART: bırakılmazsa cihazın kamera ışığı yanık
    // kalıyor ve kullanıcı uygulamanın kendisini izlediğini sanıyor.
    akis?.getTracks().forEach(t => t.stop());
    if (video) video.srcObject = null;
  };

  try {
    const mevcut = await desteklenenBicimler();
    const istenen = bicimler.filter(b => mevcut.includes(b));
    if (!istenen.length) {
      onHata?.("Bu cihaz kitap barkodunu okuyamıyor.");
      return durdur;
    }

    // Arka kamera isteniyor; yoksa tarayıcı eldekiyle dönüyor.
    akis = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }, audio: false,
    });
    if (bitti) { akis.getTracks().forEach(t => t.stop()); return durdur; }

    video.srcObject = akis;
    video.setAttribute("playsinline", "true");   // iOS tam ekrana geçmesin
    await video.play();

    const dedektor = new window.BarcodeDetector({ formats: istenen });

    // Her kareyi değil, saniyede ~4 kare: çözümleme pahalı ve telefonu
    // ısıtıyor; okuma hızına gözle görülür katkısı yok.
    zamanlayici = setInterval(async () => {
      if (bitti || video.readyState < 2) return;
      try {
        const kodlar = await dedektor.detect(video);
        for (const k of kodlar) {
          if (k.rawValue && onKod?.(k.rawValue)) { durdur(); return; }
        }
      } catch {
        // Tek karelik çözümleme hataları yutuluyor: kare bulanık
        // olabilir, bir sonraki kare okunur.
      }
    }, 250);
  } catch (err) {
    // İzin reddi en sık karşılaşılan durum; ayrı mesaj hak ediyor.
    onHata?.(err?.name === "NotAllowedError"
      ? "Kamera izni verilmedi."
      : "Kamera açılamadı: " + (err?.message ?? "bilinmeyen hata"));
    durdur();
  }

  return durdur;
}
