// OCR çıktısını satırlara ve sayfa numaralarına çevirme.
//
// ── NEDEN AYRI BİR GEÇİŞ ────────────────────────────────────────
// İçindekiler sayfasında sağdaki sütun SADECE sayı. Tesseract ise oraya
// Türkçe sözlükle bakıyor ve tek haneli bir bağlamda harf uyduruyor:
// "25" → "ZD", "31" → "3İ", "35" → "ASD", "39" → "Sİ", "43" → "Aİ".
// Sözcük düzeltmesi bunu kurtarmıyor; çünkü hata okumada, yazımda değil.
//
// Çözüm: sayı sütununu İKİNCİ KEZ, yalnızca rakam alfabesiyle okumak.
// Alfabe 10 karaktere indiğinde "Z" diye bir seçenek kalmıyor.
//
// Bu dosya saf tutuldu: tesseract'ın verdiği kutuları alıp satır kurar,
// sütunun nerede başladığını bulur, sayıları satırlara eşler. Tarayıcıya
// ve kütüphaneye bağlı olmadığı için Node'da sınanabiliyor.

// Sayfa numarası: en fazla 4 hane (kitapta 4 haneli sayfa nadir ama var).
const SAYI = /^\d{1,4}$/;

// Tesseract'ın blok ağacından (blok → paragraf → satır → kelime) düz bir
// satır listesi. Satır kavramını kendimiz y'ye göre yeniden kurmuyoruz:
// tesseract'ın satırları zaten harf yüksekliğini biliyor, bizim tahminimiz
// ondan iyi olmaz.
export function satirlariAl(bloklar = []) {
  const satirlar = [];
  (bloklar ?? []).forEach(blok => {
    (blok?.paragraphs ?? []).forEach(paragraf => {
      (paragraf?.lines ?? []).forEach(satir => {
        const kelimeler = (satir?.words ?? [])
          .map(k => ({
            metin: (k.text ?? "").trim(),
            x0: k.bbox?.x0 ?? 0, x1: k.bbox?.x1 ?? 0,
            y0: k.bbox?.y0 ?? 0, y1: k.bbox?.y1 ?? 0,
            guven: typeof k.confidence === "number" ? k.confidence : null,
          }))
          .filter(k => k.metin);
        if (!kelimeler.length) return;
        const y0 = Math.min(...kelimeler.map(k => k.y0));
        const y1 = Math.max(...kelimeler.map(k => k.y1));
        satirlar.push({ y0, y1, orta: (y0 + y1) / 2, yukseklik: y1 - y0, kelimeler });
      });
    });
  });
  return satirlar.sort((a, b) => a.orta - b.orta);
}

// Bir belirteci sayfa numarasına çevirmeyi dener; olmazsa null.
//
// ── HARF→RAKAM TAHMİNİ YOK ──────────────────────────────────────
// Bir ara "ZD"yi 20, "Sİ"yi 51 yapan bir karışma tablosu vardı.
// Gerçek kitapla karşılaştırınca ikisi de YANLIŞ çıktı: "ZD" 25,
// "Sİ" 39 idi. Yani hata harfin biçiminde değil, okumanın kendisinde;
// tersine çevirmek sayfa numarasını uydurmak olurdu ve koç 39. sayfa
// yerine 51. sayfayı ödev verirdi — bunu anlamasının bir yolu da yok.
//
// Bu yüzden yalnızca BİÇİMSEL düzeltme yapılıyor: aradaki boşluk ve
// noktalama. Okunamayan numara BOŞ kalıyor; koç kendisi yazıyor.
// Numaraları doğru okuma işi, rakam alfabesiyle yapılan ikinci OCR
// geçişinin görevi.
export function numaraCoz(belirtec) {
  const t = String(belirtec ?? "").trim();
  if (!t) return null;

  // "4 1" → "41": OCR geniş aralıklı basılmış numarayı ikiye bölüyor.
  // Sondaki nokta/virgül de atılıyor ("25." → "25").
  const sade = t.replace(/\s+/g, "").replace(/[.,;:·•]+$/, "");
  return SAYI.test(sade) ? sade : null;
}

// Sayı sütunu nerede başlıyor?
//
// Satırların SON belirtecine bakılıyor: içlerinde temiz rakam olanların
// sol kenarlarının en solu, sütunun başı sayılıyor. Hiçbiri temiz
// okunmadıysa (kötü fotoğraf) sayfanın sağ %22'si varsayılıyor —
// ikinci geçişin hiç yapılmaması, yanlış yerden yapılmasından iyidir
// ama hiç denememek de bu satırları kaybetmek olurdu.
export function sayiSutunuBaslangici(satirlar, genislik) {
  const sonlar = satirlar
    .map(s => s.kelimeler[s.kelimeler.length - 1])
    .filter(Boolean);

  const temiz = sonlar.filter(k => SAYI.test(k.metin.replace(/\s+/g, "")));
  // En az iki temiz numara: bir tanesi rastlantı olabilir (ör. başlıkta
  // geçen "2. Bölüm" satır sonuna düşmüş olabilir).
  if (temiz.length >= 2) {
    const enSol = Math.min(...temiz.map(k => k.x0));
    // Sütunu biraz sola genişletiyoruz: numaraların hizası tam değil ve
    // ikinci geçiş kırpmayı kaçırmasın.
    return Math.max(0, Math.round(enSol - genislik * 0.02));
  }
  return Math.round(genislik * 0.78);
}

// İkinci geçişten gelen sayıları satırlara eşle.
//
// Ölçüt DİKEY ÖRTÜŞME: sayının kutusu hangi satırın bandına giriyorsa
// o satıra ait. Yalnızca "en yakın merkez" ölçütü, satır aralığı sık
// kitaplarda numarayı bir alt satıra kaydırabiliyordu.
export function numaralariEsle(satirlar, sayiKelimeleri) {
  const eslesme = new Map();          // satır indeksi -> numara metni
  (sayiKelimeleri ?? []).forEach(k => {
    const numara = numaraCoz(k.metin);
    if (!numara) return;
    const orta = (k.y0 + k.y1) / 2;

    let enIyi = -1, enIyiOrtusme = 0, enIyiUzaklik = Infinity;
    satirlar.forEach((s, i) => {
      const ortusme = Math.min(s.y1, k.y1) - Math.max(s.y0, k.y0);
      const uzaklik = Math.abs(s.orta - orta);
      if (ortusme > enIyiOrtusme || (ortusme === enIyiOrtusme && uzaklik < enIyiUzaklik)) {
        enIyi = i; enIyiOrtusme = ortusme; enIyiUzaklik = uzaklik;
      }
    });

    // Örtüşme yoksa ve merkez de uzaksa eşleme yapılmıyor: sayfa
    // altındaki tarih ya da sayfa numarası gibi başıboş sayılar
    // bir başlığa yapışmasın.
    if (enIyi < 0) return;
    const s = satirlar[enIyi];
    const esik = Math.max(6, (s.yukseklik || 12) * 0.6);
    if (enIyiOrtusme <= 0 && enIyiUzaklik > esik) return;

    // Aynı satıra iki sayı düşerse sağdaki kazanıyor: içindekilerde
    // sayfa numarası en sağdaki sütundur.
    const onceki = eslesme.get(enIyi);
    if (!onceki || k.x0 > onceki.x0) eslesme.set(enIyi, { metin: numara, x0: k.x0 });
  });

  const sonuc = new Map();
  eslesme.forEach((v, k) => sonuc.set(k, v.metin));
  return sonuc;
}

// Satırı metne çevir: başlık + sayfa numarası.
//
// Sayı sütununa düşen belirteçler başlıktan ÇIKARILIYOR: ikinci geçiş
// numarayı zaten doğru okudu, birinci geçişin oraya uydurduğu harf
// yığınının ("ZD", "Aİ") başlıkta kalması anlamsız olurdu.
export function satirMetni(satir, numara, sutunX) {
  const baslik = satir.kelimeler
    .filter(k => k.x0 < sutunX)
    .map(k => k.metin)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (numara) return baslik ? `${baslik} ${numara}` : numara;

  // İkinci geçiş bu satıra numara vermediyse, birinci geçişin son
  // belirteci biçimsel olarak numara olabilir mi diye bakılıyor.
  const son = satir.kelimeler[satir.kelimeler.length - 1];
  const sutunda = son && son.x0 >= sutunX;
  const kurtarilan = sutunda ? numaraCoz(son.metin) : null;
  if (kurtarilan) return baslik ? `${baslik} ${kurtarilan}` : kurtarilan;

  // Numaraya çevrilemeyen KISA belirteç, sayı sütununda duran OCR
  // gürültüsü:
  // başlıkta bırakılmıyor ("Özkütle ASD" değil "Özkütle"). Uzun bir
  // belirteç ise başlığın kendisi olabilir (sütun sınırı tahminle
  // bulunduğunda uzun başlıklar sağa taşıyor) — ona dokunulmuyor.
  if (sutunda && son.metin.length <= 4 && baslik) return baslik;

  // Hiçbir şey yoksa satırın tamamı (numarasız bir ara başlık olabilir).
  return satir.kelimeler.map(k => k.metin).join(" ").replace(/\s+/g, " ").trim();
}

// Tüm satırları metne çevir.
export function satirlariMetne(satirlar, eslesme, sutunX) {
  return satirlar
    .map((s, i) => satirMetni(s, eslesme.get(i), sutunX))
    .filter(Boolean)
    .join("\n");
}
