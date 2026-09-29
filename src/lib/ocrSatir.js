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

// Kendisi numaralı olan başlıklar: "Test 3", "BÖLÜM 2", "Ünite 10".
// Sayfa numarası olmadan bir işe yaramıyorlar (bkz. satirMetni).
const BASLIK_NUMARASI = /^(?:test|b[öo]l[üu]m|[üu]n[iİ]te|konu)\s*\d{1,3}$/i;

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

// ── SÜTUNLARI BUL ───────────────────────────────────────────────
// Gerçek içindekiler sayfalarının çoğu İKİ SÜTUN: beş kitap fotoğrafı
// ölçüldü, dördü iki sütunlu. Tek sütun varsayan okuma, sağ sütunun
// başlığını sol sütunun numarası sanıyor ve satırların yarısını
// kaybediyor.
//
// Sütunu bulmanın yolu SAYFA NUMARASI ŞERİTLERİ: numaralar sağa dayalı
// dizildiği için sağ kenarları (x1) birkaç piksel içinde aynı. Şerit
// bulununca sütunun sınırı da belli oluyor.
//
// ── "Test 1" TUZAĞI ─────────────────────────────────────────────
// İçindekilerde başlıkların kendisi de numaralı: "Test 1", "BÖLÜM - 3".
// Onlar da sağa dayalı bir şerit oluşturuyor ve nokta dolgusu
// silindikten sonra ardlarında da geniş boşluk kalıyor — yani
// "ardından boşluk gelen sayı" ölçütü onları ayıklamıyor (denendi,
// sütunlar ikiye katlandı).
//
// Ayırt eden şey DEĞERİN BÜYÜKLÜĞÜ. Gerçek veriyle ölçüldü:
//   sayfa şeritleri  → medyan 254, 286, 26, 75, 93
//   başlık şeritleri → medyan 5, 2, 3, 5, 4
// Sayfa numarası şeridinin medyanı 10'un altına düşmüyor; bir
// içindekiler sayfası neredeyse hiç 10 sayfadan kısa olmuyor.
const SERIT_GENISLIK = 0.02;   // şerit içi x1 yayılımı (sayfa genişliğine göre)
const SERIT_BIRLESIM = 0.04;   // bu kadar yakın iki şerit aynı sütundur
const EN_AZ_UYE      = 3;      // bir şerit en az bu kadar numara taşır
const EN_AZ_MEDYAN   = 10;     // başlık numaralarını ayıklayan eşik

// Satırlardaki temiz sayı kelimeleri (şerit araması için).
export const sayiKelimeleri = (satirlar) =>
  satirlar.flatMap(s => s.kelimeler.filter(k => SAYI.test(k.metin)));

// Şerit bulunamayan sayfa için son çare: sağ %22 numara şeridi sayılıyor.
export const tekSutun = (genislik) => ([
  { x0: 0, x1: genislik, sayiX: Math.round(genislik * 0.78) },
]);

// Verilen sayı kelimelerinden sütunları çıkarır. Bulamazsa BOŞ döner —
// çağıran o zaman rakam geçişini tüm sayfaya uygulayıp yeniden deneyebilir.
export function seritleriBul(sayiListesi, genislik) {
  const sayilar = [...(sayiListesi ?? [])]
    .filter(k => SAYI.test(k.metin))
    .sort((a, b) => a.x1 - b.x1);

  // Sağ kenara göre sıkı kümeler
  const seritler = [];
  sayilar.forEach(k => {
    const son = seritler[seritler.length - 1];
    if (son && k.x1 - son.ilkX1 <= genislik * SERIT_GENISLIK) son.uyeler.push(k);
    else seritler.push({ ilkX1: k.x1, uyeler: [k] });
  });

  // Yakın şeritleri birleştir: "100" üç haneli olduğu için "99"dan
  // biraz daha geniş; aynı sütunun numaraları iki kümeye düşebiliyor.
  const birlesik = [];
  seritler.forEach(c => {
    const son = birlesik[birlesik.length - 1];
    if (son && c.ilkX1 - son.ilkX1 <= genislik * SERIT_BIRLESIM) son.uyeler.push(...c.uyeler);
    else birlesik.push({ ilkX1: c.ilkX1, uyeler: [...c.uyeler] });
  });

  const gecerli = birlesik.filter(c => {
    if (c.uyeler.length < EN_AZ_UYE) return false;
    const degerler = c.uyeler.map(k => +k.metin).sort((a, b) => a - b);
    return degerler[Math.floor(degerler.length / 2)] >= EN_AZ_MEDYAN;
  });

  if (!gecerli.length) return [];

  const sutunlar = [];
  gecerli.forEach((c, i) => {
    const sol = i === 0 ? 0 : sutunlar[i - 1].x1;
    const sag = Math.round(Math.max(...c.uyeler.map(u => u.x1)) + genislik * 0.01);
    sutunlar.push({
      x0: sol,
      x1: i === gecerli.length - 1 ? Math.max(sag, genislik) : sag,
      sayiX: Math.max(sol, Math.round(Math.min(...c.uyeler.map(u => u.x0)) - genislik * 0.015)),
    });
  });

  return sutunlar;
}

// Birinci geçişin sayılarıyla dene; olmazsa tek sütun.
// (Rakam geçişini de deneyen tam akış metinCikar.js'de.)
export function sutunlariBul(satirlar, genislik) {
  const sutunlar = seritleriBul(sayiKelimeleri(satirlar), genislik);
  return sutunlar.length ? sutunlar : tekSutun(genislik);
}

// Satırları sütunlara böl. Tesseract iki sütunlu sayfada sol ve sağ
// satırı TEK satır sayıyor (aynı y'deler); sütun sınırıyla ikiye
// ayrılıyorlar. Sütun içinde y sırası korunuyor.
export function sutunaAyir(satirlar, sutun) {
  return satirlar
    .map(s => {
      const kelimeler = s.kelimeler.filter(k => {
        const orta = (k.x0 + k.x1) / 2;
        return orta >= sutun.x0 && orta < sutun.x1;
      });
      if (!kelimeler.length) return null;
      const y0 = Math.min(...kelimeler.map(k => k.y0));
      const y1 = Math.max(...kelimeler.map(k => k.y1));
      return { y0, y1, orta: (y0 + y1) / 2, yukseklik: y1 - y0, kelimeler };
    })
    .filter(Boolean);
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
// Satır başındaki çöp belirteçler: "CO Test 1", "ı Test 2", "| Test 6".
// Sayfa kenarındaki cilt gölgesi, delik izi ya da komşu sütunun
// kırpılmış harfi. Ölçüldü: sayfa numarası doğru okunan satırların
// ~%8'inde başlık yalnızca bu yüzden bozuk çıkıyordu.
//
// Ölçüt: EN FAZLA İKİ karakter, DÜŞÜK güven ve satırın BAŞINDA. Ortadaki
// kısa sözcüklere dokunulmuyor ("ve", "-"), yüksek güvenli kısa
// belirteçler de kalıyor (gerçekten "3." olabilir).
const COP_GUVEN = 45;

function basiTemizle(kelimeler) {
  let i = 0;
  while (i < kelimeler.length - 1) {
    const k = kelimeler[i];
    const kisa = k.metin.length <= 2;
    const zayif = k.guven != null && k.guven < COP_GUVEN;
    // Harf ya da rakam içermeyen belirteç ("|", "'", ".") güvenine
    // bakılmadan atılıyor: başlık olamaz.
    const anlamsiz = !/[\p{L}\p{N}]/u.test(k.metin);
    if ((kisa && zayif) || anlamsiz) i++;
    else break;
  }
  return kelimeler.slice(i);
}

export function satirMetni(satir, numara, sutunX) {
  const baslik = basiTemizle(satir.kelimeler.filter(k => k.x0 < sutunX))
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

  // ── SAYFASIZ "Test 3" SATIRI YAZILMIYOR ───────────────────────
  // İçindekilerde başlıklar numaralı: "Test 3", "BÖLÜM 2". Bu satırın
  // sayfa numarası okunamadıysa metne "Test 3" diye yazmak, ayrıştırıcının
  // başlığın kendi numarasını SAYFA sanmasına yol açıyor: koç "Test" adlı
  // bir bölüm ve 3. sayfa görüyor. Ölçüldü: iki kitapta 12 yanlış sayfa
  // numarasının 7'si bu satırlardan geliyordu.
  //
  // Numarası okunamamış böyle bir satır hiçbir bilgi taşımıyor (başlığın
  // kendisi "Test 3"); atlanıyor. Koç metin kutusunda eksik satırı
  // görüp ekleyebiliyor — yanlış sayfaya gönderilen bir ödevi ise
  // fark etmesinin yolu yok.
  if (!numara && BASLIK_NUMARASI.test(baslik)) return "";

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
