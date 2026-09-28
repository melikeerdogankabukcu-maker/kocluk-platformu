import { satirlariAl, sayiSutunuBaslangici, numaralariEsle, satirlariMetne } from "./ocrSatir";
import { ikiliyeCevir, sayfaKutusu, HEDEF_GENISLIK } from "./goruntuIsle";

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
// Piksel matematiği (yerel eşikleme, eğiklik, nokta dolgusu silme)
// goruntuIsle.js'de ve TARAYICIDAN BAĞIMSIZ: aynı kod Node'da gerçek
// kitap fotoğraflarıyla çalıştırılıp ölçülebiliyor. Burada kalan iş
// tarayıcıya özgü olan: dosyayı çözmek, büyütmek, döndürmek.
// Sayfa aramak için küçük bir kopya yeter: karar blok ortalamalarından
// veriliyor, tam çözünürlükte çalışmak boşa iş.
const TARAMA_GENISLIK = 600;

async function gorseliHazirla(dosya) {
  // Tarayıcı API'leri: bu yol yalnızca istemcide çalışıyor.
  const bitmap = await createImageBitmap(dosya);

  // ── 1) SAYFAYI BUL ────────────────────────────────────────────
  // Kare sayfadan geniş: masa, ekran kenarı, gölge de içinde. Bunlar
  // satır bantlarını ve yerel eşiği bozuyor (ayrıntı goruntuIsle.js'de).
  // Önce sayfanın sınırları bulunuyor, işlem onun içinde yapılıyor.
  let kaynak = { x: 0, y: 0, genislik: bitmap.width, yukseklik: bitmap.height };
  try {
    const tOlcek = Math.min(1, TARAMA_GENISLIK / bitmap.width);
    const tg = Math.max(1, Math.round(bitmap.width * tOlcek));
    const ty = Math.max(1, Math.round(bitmap.height * tOlcek));
    const tarama = document.createElement("canvas");
    tarama.width = tg; tarama.height = ty;
    const tctx = tarama.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(bitmap, 0, 0, tg, ty);
    const kucuk = tctx.getImageData(0, 0, tg, ty);
    const kutu = sayfaKutusu({ data: kucuk.data, genislik: tg, yukseklik: ty });
    if (kutu.kirpildi) {
      kaynak = {
        x: Math.round(kutu.x / tOlcek),
        y: Math.round(kutu.y / tOlcek),
        genislik: Math.round(kutu.genislik / tOlcek),
        yukseklik: Math.round(kutu.yukseklik / tOlcek),
      };
    }
  } catch {
    // Sayfa bulunamadıysa tüm kareyle devam: eski davranış.
  }

  // ── 2) BÜYÜT ──────────────────────────────────────────────────
  // En fazla 3 kat: daha fazlası ayrıntı katmıyor, yalnızca OCR'ı
  // yavaşlatıyor ve belleği şişiriyor. Ölçekleme tuvale bırakılıyor —
  // tarayıcının çift doğrusal süzgeci hem hızlı hem iyi.
  const olcek = Math.max(1, Math.min(3, HEDEF_GENISLIK / kaynak.genislik));
  const g = Math.round(kaynak.genislik * olcek);
  const y = Math.round(kaynak.yukseklik * olcek);

  const tuval = document.createElement("canvas");
  tuval.width = g; tuval.height = y;
  const ctx = tuval.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Kaynaktan KIRPARAK çiziyor: ayrı bir kırpma adımı gerekmiyor.
  ctx.drawImage(bitmap, kaynak.x, kaynak.y, kaynak.genislik, kaynak.yukseklik, 0, 0, g, y);
  bitmap.close?.();

  const gorsel = ctx.getImageData(0, 0, g, y);
  const { aci } = ikiliyeCevir({ data: gorsel.data, genislik: g, yukseklik: y });
  ctx.putImageData(gorsel, 0, 0);

  // Eğiklik düzeltme. Küçük açılarda dokunmuyoruz: yeniden örnekleme
  // harfleri hafifçe bulandırıyor ve 0.5 derece altı zaten OCR'ı
  // etkilemiyor — kazancı olmayan bir bozulma olurdu.
  if (Math.abs(aci) < 0.5) {
    const blob = await new Promise(cozumle => tuval.toBlob(cozumle, "image/png"));
    return { blob, genislik: g, yukseklik: y };
  }

  const dondurulmus = document.createElement("canvas");
  dondurulmus.width = g; dondurulmus.height = y;
  const dctx = dondurulmus.getContext("2d");
  // Zemin BEYAZ: döndürünce köşelerde açıkta kalan alan saydam kalırsa
  // OCR onu siyah görüp sayfanın kenarına sahte karakterler uyduruyor.
  dctx.fillStyle = "#fff";
  dctx.fillRect(0, 0, g, y);
  dctx.translate(g / 2, y / 2);
  // İŞARET: egiklikBul zaten DÜZELTME açısını döndürüyor (sayfa +2°
  // eğikse -2° veriyor), olduğu gibi uygulanıyor.
  dctx.rotate((aci * Math.PI) / 180);
  dctx.drawImage(tuval, -g / 2, -y / 2);

  const blob = await new Promise(cozumle => dondurulmus.toBlob(cozumle, "image/png"));
  return { blob, genislik: g, yukseklik: y };
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
// ── SAYFA BÖLÜTLEME KİPİ TEK BAŞINA YETMİYOR ────────────────────
// İçindekiler sayfasında başlık solda, sayfa numarası çok sağda ve
// aralarında geniş bir boşluk var. Tesseract bunu kimi kitapta İKİ
// SÜTUN sanıyor; o zaman numaralar başlıklarından kopuyor ve satır
// tamamen kayboluyor. Hangi kipin doğru olduğu kitaptan kitaba
// değişiyor ve önceden bilinemiyor.
//
// Çözüm tahmin etmek değil ÖLÇMEK: birinci kip az satır verdiyse
// ikincisi deneniyor ve AYRIŞTIRILABİLİR SATIR SAYISI yüksek olan
// seçiliyor. Ölçüt çağıran taraftan geliyor (degerlendir), böylece bu
// dosya ayrıştırıcıyı tanımak zorunda kalmıyor.
const KIP_BIRINCIL = "6";    // tek düzgün metin bloğu
const KIP_YEDEK    = "4";    // değişken boyutlu tek sütun
const YETERLI_SATIR = 4;

// ── SAYFA NUMARALARI İÇİN İKİNCİ GEÇİŞ ──────────────────────────
// Sağdaki sütun sadece sayı; tesseract oraya Türkçe sözlükle bakınca
// harf uyduruyor ("25" → "ZD"). Sütun ikinci kez, alfabesi 10 rakama
// indirilmiş hâlde okunuyor. TEK çağrı: satır satır kırpmak otuz ayrı
// çağrı ve saniyeler demekti; sütunun tamamı bir kerede okunup kutuların
// dikey örtüşmesiyle satırlara eşleniyor.
const RAKAMLAR = "0123456789";

export async function fotografMetni(dosyalar, { ilerleme, degerlendir } = {}) {
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
    // Başlık ile sayfa numarası arasındaki boşluk korunsun. Silinirse
    // "Temel Kavramlar7" gibi birleşik bir satır çıkıyor ve numara
    // ayrıştırılamıyor.
    await worker.setParameters({ preserve_interword_spaces: "1" });

    const parcalar = [];
    let guvenToplam = 0, guvenSayi = 0;

    // Kelime kutuları da isteniyor (blocks): satırı ve sayı sütununu
    // kutulardan kuruyoruz. Yalnızca "text" isteseydik elimizde düz metin
    // olurdu ve numaranın sayfanın neresinde durduğunu bilemezdik.
    const oku = async (girdi, kip) => {
      await worker.setParameters({ tessedit_pageseg_mode: kip });
      const { data } = await worker.recognize(girdi, {}, { text: true, blocks: true });
      const metin = data?.text ?? "";
      return {
        metin, bloklar: data?.blocks ?? null,
        guven: data?.confidence ?? null,
        puan: degerlendir ? degerlendir(metin) : null,
      };
    };

    // Sayı sütununu rakam alfabesiyle oku, satırlara eşle, metni yeniden kur.
    // Kutu gelmediyse (eski çekirdek) birinci geçişin metni olduğu gibi
    // kullanılıyor — kazanç kaybedilir ama akış bozulmaz.
    const numaralariTazele = async (girdi, sonuc, olcu) => {
      const satirlar = satirlariAl(sonuc.bloklar);
      if (!satirlar.length || !olcu) return sonuc.metin;

      const sutunX = sayiSutunuBaslangici(satirlar, olcu.genislik);
      const genislik = Math.max(1, olcu.genislik - sutunX);
      let sayiKelimeleri;
      try {
        await worker.setParameters({
          tessedit_char_whitelist: RAKAMLAR,
          tessedit_pageseg_mode: "6",
        });
        const { data } = await worker.recognize(
          girdi,
          { rectangle: { left: sutunX, top: 0, width: genislik, height: olcu.yukseklik } },
          { text: true, blocks: true }
        );
        // Kırpılmış bölgenin kutuları kendi köşesine göre geliyor;
        // birinci geçişle karşılaştırılabilmesi için sola kaydırma
        // geri ekleniyor.
        sayiKelimeleri = satirlariAl(data?.blocks)
          .flatMap(st => st.kelimeler)
          .map(k => ({ ...k, x0: k.x0 + sutunX, x1: k.x1 + sutunX }));
      } catch {
        // Kırpma başarısızsa numarasız devam: satırlar yine kurulacak,
        // son belirteç harf–rakam tablosundan geçirilecek.
        sayiKelimeleri = [];
      } finally {
        await worker.setParameters({ tessedit_char_whitelist: "" });
      }

      const eslesme = numaralariEsle(satirlar, sayiKelimeleri);
      const yeni = satirlariMetne(satirlar, eslesme, sutunX);

      // Ölçüt yine ayrıştırılabilir satır sayısı: yeniden kurulan metin
      // birinci geçişten KÖTÜ çıkarsa (beklenmedik bir düzen) eskisi
      // kalıyor.
      if (!degerlendir) return yeni || sonuc.metin;
      return degerlendir(yeni) >= degerlendir(sonuc.metin) ? yeni : sonuc.metin;
    };

    for (let i = 0; i < liste.length; i++) {
      ilerleme?.({ asama: "hazirlik", yuzde: null, sira: i + 1, toplam: liste.length });
      let girdi, olcu = null;
      try {
        const hazir = await gorseliHazirla(liste[i]);
        girdi = hazir.blob;
        olcu = { genislik: hazir.genislik, yukseklik: hazir.yukseklik };
      } catch {
        // Ön işleme başarısızsa (bozuk görsel, eski tarayıcı) ham
        // dosyayla devam: vasat sonuç, hiç sonuç yoktan iyi.
        girdi = liste[i];
      }

      let sonuc = await oku(girdi, KIP_BIRINCIL);
      // İkinci kip yalnızca gerektiğinde: her görseli iki kez okumak
      // süreyi ikiye katlardı ve çoğu kitapta birincisi yeterli.
      if (degerlendir && sonuc.puan < YETERLI_SATIR) {
        ilerleme?.({ asama: "ikinci deneme", yuzde: null, sira: i + 1, toplam: liste.length });
        const yedek = await oku(girdi, KIP_YEDEK);
        if (yedek.puan > sonuc.puan) sonuc = yedek;
      }

      // Sayfa numaralarını rakam geçişiyle düzelt
      ilerleme?.({ asama: "sayfa numaralari", yuzde: null, sira: i + 1, toplam: liste.length });
      const metin = await numaralariTazele(girdi, sonuc, olcu);

      if (metin) parcalar.push(metin);
      if (typeof sonuc.guven === "number") { guvenToplam += sonuc.guven; guvenSayi += 1; }
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
