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

// Fotoğraftan OCR ile metin çıkarır.
//
// Dil verisi (Türkçe) ilk kullanımda indiriliyor ve tarayıcı önbelleğine
// alınıyor; ilerleme geri bildirimi bu yüzden önemli — indirme sessiz
// geçerse kullanıcı uygulamayı donmuş sanır.
export async function fotografMetni(dosya, { ilerleme } = {}) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("tur", 1, {
    logger: (m) => {
      if (!ilerleme) return;
      const yuzde = typeof m.progress === "number" ? Math.round(m.progress * 100) : null;
      ilerleme({ asama: m.status, yuzde });
    },
  });
  try {
    const { data } = await worker.recognize(dosya);
    return { metin: data?.text ?? "", guven: data?.confidence ?? null };
  } finally {
    // Worker kapatılmazsa arka planda WASM belleği tutuluyor; birkaç
    // aktarımdan sonra sekme belirgin biçimde ağırlaşıyor.
    await worker.terminate();
  }
}
