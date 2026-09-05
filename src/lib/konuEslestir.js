// Kitap bölüm başlığını müfredat konusuna eşleştirir.
//
// Kitaplar konu adlarını müfredatla birebir yazmıyor:
//   "Bölme–Bölünebilme"        → "Bölme ve Bölünebilme"
//   "TEMEL KAVRAMLAR"          → "Temel Kavramlar"
//   "Rasyonel Sayılar (Test 4)" → "Rasyonel Sayılar"
//
// ── TÜRKÇE KÜÇÜLTME ŞART ────────────────────────────────────────
// Düz toLowerCase() "İ" harfini birleşik noktalı bir i'ye çeviriyor ve
// "İSTATİSTİK" ile "istatistik" EŞLEŞMİYOR. Bu tuzağa daha önce test
// eşleştirmesinde düşülmüştü; burada da aynısı geçerli.
//
// ── AKSANLAR DÜŞÜRÜLÜYOR ────────────────────────────────────────
// OCR "ü"yü "u", "ş"yi "s" okuyabiliyor. Karşılaştırma aksansız
// yapılıyor ki bu tür okuma hataları eşleşmeyi bozmasın. Gösterimde
// hep özgün metin kullanılıyor, yalnızca karşılaştırma sadeleşiyor.

const AKSAN = { ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

// Karşılaştırma biçimi: Türkçe küçült, aksanı düşür, noktalamayı
// boşluğa çevir, tek boşluğa indir.
export function sadelestir(metin) {
  return (metin ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşüâîû]/g, ch => AKSAN[ch] ?? ch)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Eşleşmeyi bozan ama anlam taşımayan kelimeler. "ve" atılınca
// "Bölme ve Bölünebilme" ile "Bölme–Bölünebilme" aynı belirteçlere
// iniyor. "test", "ünite", "bölüm" kitaplara özgü süslemeler.
const DOLGU = new Set([
  "ve", "ile", "veya", "bolum", "unite", "test", "konu", "kisim",
  "ders", "sayfa", "genel", "tekrar", "cozumlu", "sorular", "soru",
]);

// Salt sayılar da eleniyor: "Test 4", "Ünite 10" gibi eklerdeki numara
// konu adının parçası değil ve iki farklı bölümü yanlışlıkla
// benzeştirebiliyor.
const belirtecler = (metin) =>
  sadelestir(metin).split(" ")
    .filter(k => k.length > 1 && !DOLGU.has(k) && !/^\d+$/.test(k));

// İki belirteç kümesinin örtüşmesi (Jaccard). 1 = aynı, 0 = ilgisiz.
function ortusme(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const kA = new Set(a), kB = new Set(b);
  let kesisim = 0;
  kA.forEach(k => { if (kB.has(k)) kesisim += 1; });
  return kesisim / (kA.size + kB.size - kesisim);
}

// Bir konunun tüm belirteçleri başlıkta geçiyor mu? "Rasyonel Sayılar
// (Test 4)" başlığında "Rasyonel Sayılar" konusunun hepsi var; Jaccard
// bunu 0.67'ye düşürüyor ama eşleşme aslında tam. Kapsama ayrı ölçülüyor.
function kapsiyorMu(baslikBel, konuBel) {
  if (konuBel.length === 0) return false;
  const k = new Set(baslikBel);
  return konuBel.every(x => k.has(x));
}

export const ESIK = 0.5;      // altındaki eşleşmeler "emin değil" sayılıyor

// Başlığı verilen konu listesine eşleştirir.
// konular: ["Temel Kavramlar", "Sayı Basamakları", ...]
// Dönüş: { konu, skor } — eşleşme yoksa konu null.
//
// EMİN OLMADIĞINDA NULL DÖNÜYOR. Zayıf bir eşleşmeyi kabul etmek,
// ödevi yanlış konuya bağlamak demek; koç da bunu ancak öğrenci yanlış
// sayfaları çözdüğünde fark ederdi. Eşleşmeyen bölüm listede "bağlanmadı"
// olarak duruyor ve koç elle bağlayabiliyor.
export function konuEslestir(baslik, konular) {
  const bBel = belirtecler(baslik);
  if (bBel.length === 0) return { konu: null, skor: 0 };

  let enIyi = { konu: null, skor: 0 };
  for (const konu of konular) {
    const kBel = belirtecler(konu);
    // Tam kapsama en güçlü sinyal; yoksa örtüşme oranına bakılıyor.
    const skor = kapsiyorMu(bBel, kBel)
      ? 0.9 + 0.1 * ortusme(bBel, kBel)
      : ortusme(bBel, kBel);
    if (skor > enIyi.skor) enIyi = { konu, skor };
  }

  return enIyi.skor >= ESIK ? enIyi : { konu: null, skor: enIyi.skor };
}

// Bölüm listesini toplu eşleştirir; her bölüme konu ve skor ekler.
export function bolumleriEslestir(bolumler, konular) {
  return bolumler.map(b => {
    const { konu, skor } = konuEslestir(b.baslik, konular);
    return { ...b, konu, eslesmeSkoru: Math.round(skor * 100) / 100 };
  });
}
