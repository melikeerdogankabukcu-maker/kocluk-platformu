// İçindekiler sayfasını metne çevirme: PDF ve fotoğraf (OCR).
//
// ── İKİSİ DE TARAYICIDA, DIŞARI VERİ GİTMİYOR ───────────────────
// Ne PDF ne de fotoğraf sunucuya yükleniyor; ikisi de kullanıcının
// tarayıcısında çözülüyor. Anahtar gerekmiyor, çağrı başına ücret
// oluşmuyor ve kitabın sayfası hiçbir üçüncü tarafa gitmiyor.
//
// ── KÜTÜPHANELER GEREKTİĞİNDE YÜKLENİYOR ────────────────────────
// tesseract.js ve pdfjs-dist birlikte megabaytlarca yer tutuyor. İkisi
// de dinamik import ile çağrılıyor: paneli açan herkes değil, yalnızca
// gerçekten PDF ya da fotoğraf aktaran indiriyor.
//
// ── OCR'IN SONUCU DOĞRU KABUL EDİLMİYOR ─────────────────────────
// Buradan çıkan metin doğrudan kaydedilmiyor; düzenlenebilir bir kutuya
// düşüyor. OCR "Bölünebilme"yi "Böluinebilme" okuyabilir ve bu, sessizce
// yanlış konuya bağlanmış bir bölüm demek olurdu.

// Aynı satırdaki parçaları birleştirmek için y koordinatı toleransı.
// PDF'te aynı satırın öğeleri birkaç ondalık kayabiliyor.
const SATIR_TOLERANS = 3;

// PDF'ten metin çıkarır. Metin katmanı olmayan (taranmış) PDF'lerde
// boş döner — çağıran bunu kullanıcıya söylüyor.
export async function pdfMetni(dosya, { enFazlaSayfa = 12 } = {}) {
  const pdfjs = await import("pdfjs-dist");
  // Worker'ı Vite'ın çözebileceği biçimde veriyoruz; ayarlanmazsa
  // pdf.js kendi CDN'ini arar ve çevrimdışı ortamda sessizce takılır.
  pdfjs.GlobalWorkerOptions.workerSrc =
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const belge = await pdfjs.getDocument({ data: await dosya.arrayBuffer() }).promise;
  const sayfaSayisi = Math.min(belge.numPages, enFazlaSayfa);
  const parcalar = [];

  for (let i = 1; i <= sayfaSayisi; i++) {
    const sayfa = await belge.getPage(i);
    const icerik = await sayfa.getTextContent();

    // ── SATIRLARI GERİ KURMAK ŞART ────────────────────────────
    // pdf.js metni konumlandırılmış parçalar hâlinde veriyor, satır
    // kavramı yok. Ayrıştırıcı satır bazlı çalıştığı için parçaları
    // y koordinatına göre grupluyoruz; yoksa bütün içindekiler tek
    // bir devasa satır olurdu ve hiçbir başlık çıkmazdı.
    const satirlar = new Map();
    for (const oge of icerik.items) {
      const metin = (oge.str ?? "").trim();
      if (!metin) continue;
      const y = Math.round((oge.transform?.[5] ?? 0) / SATIR_TOLERANS);
      const x = oge.transform?.[4] ?? 0;
      if (!satirlar.has(y)) satirlar.set(y, []);
      satirlar.get(y).push({ x, metin });
    }

    // y azalan = yukarıdan aşağı (PDF'te origin sol ALT köşe)
    [...satirlar.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parcalarSatir]) => {
        parcalarSatir.sort((a, b) => a.x - b.x);
        parcalar.push(parcalarSatir.map(p => p.metin).join(" "));
      });
  }

  await belge.destroy?.();
  return { metin: parcalar.join("\n"), sayfaSayisi, toplamSayfa: belge.numPages };
}

// ── GÖRSEL ÖN İŞLEME ────────────────────────────────────────────
// Ham telefon fotoğrafı doğrudan OCR'a verildiğinde sonuç vasat
// çıkıyordu. İki nedeni var ve ikisi de düzeltilebilir:
//
// 1) ÇÖZÜNÜRLÜK. Tesseract ~300 DPI için ayarlı. İçindekiler sayfasının
//    uzaktan çekilmiş fotoğrafında harfler 10-12 piksel yüksekliğinde
//    kalıyor; bu boyutta "ı/i", "rn/m", "5/S" ayırt edilemiyor. Görsel
//    büyütülüyor.
//
// 2) AYDINLATMA. Sayfanın bir yanına gölge düşüyor. Tesseract kendi
//    içinde TEK bir eşik değeriyle siyah-beyaza indiriyor; gölgeli
//    yarıda bütün metin siyaha, aydınlık yarıda bir kısmı beyaza
//    gidiyor. Burada YEREL eşikleme yapılıyor: her pikselin eşiği
//    kendi çevresinin ortalamasından hesaplanıyor, böylece gölge
//    sınırın kendisi kayıyor ve iki yarı da okunabilir kalıyor.
//    (Bradley–Roth yöntemi; integral görüntüyle tek geçişte.)
const HEDEF_GENISLIK = 1800;

async function gorseliHazirla(dosya) {
  // Tarayıcı API'leri: bu yol yalnızca istemcide çalışıyor.
  const bitmap = await createImageBitmap(dosya);

  // En fazla 3 kat: daha fazlası ayrıntı katmıyor, yalnızca OCR'ı
  // yavaşlatıyor ve belleği şişiriyor.
  const olcek = Math.max(1, Math.min(3, HEDEF_GENISLIK / bitmap.width));
  const g = Math.round(bitmap.width * olcek);
  const y = Math.round(bitmap.height * olcek);

  const tuval = document.createElement("canvas");
  tuval.width = g; tuval.height = y;
  const ctx = tuval.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, g, y);
  bitmap.close?.();

  const gorsel = ctx.getImageData(0, 0, g, y);
  const p = gorsel.data;

  // Gri tonlama + integral görüntü (her noktada sol-üst dikdörtgenin
  // toplamı). Integral sayesinde pencere ortalaması pencere boyutundan
  // bağımsız, sabit maliyetle bulunuyor.
  const gri = new Uint8Array(g * y);
  const integral = new Float64Array((g + 1) * (y + 1));
  for (let j = 0; j < y; j++) {
    let satirToplam = 0;
    for (let i = 0; i < g; i++) {
      const k = (j * g + i) * 4;
      const v = (p[k] * 0.299 + p[k + 1] * 0.587 + p[k + 2] * 0.114) | 0;
      gri[j * g + i] = v;
      satirToplam += v;
      integral[(j + 1) * (g + 1) + (i + 1)] = integral[j * (g + 1) + (i + 1)] + satirToplam;
    }
  }

  // Pencere genişliğin ~1/16'sı; metin satırından belirgin biçimde
  // büyük olmalı ki harfin kendi karanlığı eşiği aşağı çekmesin.
  const yari = Math.max(8, Math.round(g / 32));
  const T = 0.15;                       // ortalamanın %15 altı → siyah

  for (let j = 0; j < y; j++) {
    const j1 = Math.max(j - yari, 0), j2 = Math.min(j + yari, y - 1);
    for (let i = 0; i < g; i++) {
      const i1 = Math.max(i - yari, 0), i2 = Math.min(i + yari, g - 1);
      const alan = (i2 - i1 + 1) * (j2 - j1 + 1);
      const toplam =
        integral[(j2 + 1) * (g + 1) + (i2 + 1)]
        - integral[j1 * (g + 1) + (i2 + 1)]
        - integral[(j2 + 1) * (g + 1) + i1]
        + integral[j1 * (g + 1) + i1];
      const siyah = gri[j * g + i] * alan < toplam * (1 - T);
      const k = (j * g + i) * 4;
      const v = siyah ? 0 : 255;
      p[k] = p[k + 1] = p[k + 2] = v;
      p[k + 3] = 255;
    }
  }

  ctx.putImageData(gorsel, 0, 0);
  return new Promise(cozumle => tuval.toBlob(cozumle, "image/png"));
}

// Fotoğraftan OCR ile metin çıkarır.
//
// Dil verisi (Türkçe) ilk kullanımda indiriliyor ve tarayıcı önbelleğine
// alınıyor; ilerleme geri bildirimi bu yüzden önemli — indirme sessiz
// geçerse kullanıcı uygulamayı donmuş sanır.
//
// BİRDEN FAZLA GÖRSEL TEK WORKER'DA: içindekiler çoğu kitapta iki üç
// sayfa. Her görsel için ayrı worker açmak, dil verisinin yeniden
// yüklenmesi ve her seferinde birkaç saniye demekti.
export async function fotografMetni(dosyalar, { ilerleme } = {}) {
  const liste = Array.isArray(dosyalar) ? dosyalar : [dosyalar];
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("tur", 1, {
    logger: (m) => {
      if (!ilerleme) return;
      const yuzde = typeof m.progress === "number" ? Math.round(m.progress * 100) : null;
      ilerleme({ asama: m.status, yuzde });
    },
  });

  try {
    await worker.setParameters({
      // 6 = tek düzgün metin bloğu. Varsayılan (3, otomatik) içindekiler
      // sayfasını başlık/sütun diye bölmeye çalışıp satırları
      // karıştırabiliyor; ayrıştırıcımız satır bazlı olduğu için bu
      // doğrudan kayıp demek.
      tessedit_pageseg_mode: "6",
      // Başlık ile sayfa numarası arasındaki boşluk korunsun. Silinirse
      // "Temel Kavramlar7" gibi birleşik bir satır çıkıyor ve numara
      // ayrıştırılamıyor.
      preserve_interword_spaces: "1",
    });

    const parcalar = [];
    let guvenToplam = 0, guvenSayi = 0;

    for (let i = 0; i < liste.length; i++) {
      ilerleme?.({ asama: "hazirlik", yuzde: null, sira: i + 1, toplam: liste.length });
      let girdi;
      try {
        girdi = await gorseliHazirla(liste[i]);
      } catch {
        // Ön işleme başarısızsa (bozuk görsel, eski tarayıcı) ham
        // dosyayla devam: vasat sonuç, hiç sonuç yoktan iyi.
        girdi = liste[i];
      }
      const { data } = await worker.recognize(girdi);
      if (data?.text) parcalar.push(data.text);
      if (typeof data?.confidence === "number") { guvenToplam += data.confidence; guvenSayi += 1; }
    }

    return {
      metin: parcalar.join("\n"),
      guven: guvenSayi > 0 ? guvenToplam / guvenSayi : null,
      sayfa: liste.length,
    };
  } finally {
    // Worker kapatılmazsa arka planda WASM belleği tutuluyor; birkaç
    // aktarımdan sonra sekme belirgin biçimde ağırlaşıyor.
    await worker.terminate();
  }
}
