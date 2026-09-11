// İçindekiler ayrıştırıcı.
//
// Bir soru bankasının içindekiler sayfası metne çevrildikten sonra
// buradan geçiyor ve "başlık + sayfa aralığı" satırlarına dönüyor.
// Girdinin nereden geldiği önemli değil (yapıştırma, PDF, OCR); üç yol
// da aynı metin kutusunda birleşiyor ve aynı ayrıştırıcıyı kullanıyor.
//
// ── NEDEN OCR'DAN SONRA DÜZENLENEBİLİR METİN ────────────────────
// OCR hata yapar: "Bölme ve Bölünebilme" yerine "Bölme ve Böluinebilme"
// okuyabilir. Doğrudan ayrıştırıp kaydetseydik koç yanlışı ancak
// haftalar sonra, ödev yanlış konuya bağlandığında fark ederdi. Metin
// kutusu ara adım olarak duruyor: OCR sonucu oraya düşüyor, koç
// gözden geçiriyor, sonra ayrıştırılıyor.

// Satır sonundaki sayfa numarası: nokta/çizgi dolgusu, boşluk ya da
// doğrudan bitişik olabilir.
//   "1. Temel Kavramlar .......... 7"
//   "Sayı Basamakları                23"
//   "3  Bölme ve Bölünebilme    41-58"
//
// DOLGU KARAKTERLERİ GENİŞ TUTULUYOR: OCR uzun nokta dizilerini sık sık
// virgül, tırnak, iki nokta ya da yıldıza çeviriyor. Dar bir sınıf
// yazsaydık bu satırlar hiç ayrıştırılamaz, koç da nedenini anlamazdı.
const DOLGU_KARAKTER = "\\s.,;:'\"`´·•*~°^_\\-–—";
const SATIR = new RegExp(`^(.*?)[${DOLGU_KARAKTER}]*?(\\d{1,4})(?:\\s*[-–—]\\s*(\\d{1,4}))?\\s*$`);

// Baştaki numaralandırma: "1.", "1)", "01 -", "BÖLÜM 3", "ÜNİTE 2"
//
// NOKTALI/NOKTASIZ I AÇIKÇA YAZILIYOR. /i bayrağı "Ö"yü "ö" ile
// eşleştiriyor ama "İ" (U+0130) ile düz "i"yi EŞLEŞTİRMİYOR: JavaScript'in
// büyük-küçük denkliği Türkçe'nin noktalı I'sını tanımıyor. Sınandı —
// "ÜNİTE 10 Çarpanlara Ayırma" satırında ön ek temizlenmeden kalıyordu.
const BAS_NUMARA = /^\s*(?:(?:b[öo]l[üu]m|[üu]n[iİıI]te|test|konu)\s*)?\d{1,3}\s*[.)\-–—:]?\s+/i;

// Bölüm/ünite başlığı: sayfa numarası taşımayan, "BÖLÜM"/"ÜNİTE"
// geçen satır. Noktalı I açıkça yazılıyor — /i bayrağı "İ" ile düz
// "i"yi eşleştirmiyor (aynı tuzağa BAS_NUMARA'da da düşülmüştü).
const BOLUM_BASLIGI = /^\s*(?:\d{1,3}\s*[.)\-–—:]?\s*)?(?:b[öo]l[üu]m|[üu]n[iİıI]te|k[iİıI]s[iİıI]m)\s*[:.\-–—]?\s*(.+?)\s*$/i;

// Ayrıştırmaya hiç girmemesi gereken satırlar
const ATLANACAK = /^\s*(?:i[çc]indekiler|contents|sayfa|page|[içc]erik)\s*$/i;

// Bir başlığın gerçekten başlık olup olmadığı: en az bir harf içermeli
// ve tamamı noktalama olmamalı.
const HARF = /[\p{L}]/u;

// Metni satırlara böler; boş satırlar ve tek başına duran sayfa
// numaraları elenir.
function satirlar(metin) {
  return (metin ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !ATLANACAK.test(s) && !/^\d{1,4}$/.test(s));
}

// Başlığı temizler: baştaki numaralandırma, sondaki dolgu, fazla boşluk.
// ── NOKTA DOLGUSU HARF OLARAK OKUNDUĞUNDA ───────────────────────
// OCR uzun nokta dizilerini çoğu zaman NOKTA OLARAK GÖRMÜYOR; harfe
// çeviriyor. "Temel Kavramlar .......... 7" satırı "Temel Kavramlar
// eeeeeeeeee 7" ya da "Temel Kavramlar aaannnnn 7" olarak çıkabiliyor.
// Karakter sınıfıyla temizlik burada işe yaramıyor, çünkü gelen şey
// noktalama değil harf.
//
// Ayırt edici özellik karakterin NE OLDUĞU değil, TEKRAR ETMESİ:
// hiçbir Türkçe başlık aynı harfi üst üste üç kez içermez. Sondan
// başlayarak, aynı karakterin (ya da iki karakterlik bir desenin) üç ve
// daha fazla tekrarı atılıyor.
//
// Başlığın SONUNDAN çalışıyor: dolgu hep başlıkla sayfa numarası
// arasında. Ortadaki bir tekrara dokunmuyoruz — "Ali'nin nn kuralı"
// gibi bir başlık bozulmasın.
const TEKRAR_SONU = /(?:(.)\1{2,}|(..)(?:\2){2,})[\s.,;:'"`´·•*~°^_\-–—]*$/u;

export function dolguSil(baslik) {
  let s = baslik ?? "";
  // Birden fazla tur: "Kavramlar ...eeee..." gibi karışık dolgular
  // tek geçişte tamamen temizlenmiyor.
  for (let tur = 0; tur < 4; tur++) {
    const yeni = s
      .replace(new RegExp(`[${DOLGU_KARAKTER}]+$`), "")
      .replace(TEKRAR_SONU, "");
    if (yeni === s) break;
    s = yeni;
  }
  return s.trim();
}

export function basligiTemizle(ham) {
  const s = dolguSil(
    (ham ?? "")
      .replace(BAS_NUMARA, "")
      .replace(/\s{2,}/g, " ")
  );
  // Dolgu temizlendikten sonra tek harflik bir kalıntı kalabiliyor
  // ("Kavramlar e"). Sondaki yalnız harf, başlığın parçası olamaz.
  return s.replace(/\s+\S$/u, m => (/\d/.test(m) ? m : "")).trim();
}

// Metin → [{ sira, baslik, sayfaBas, sayfaSon }]
//
// SAYFA ARALIĞI TÜRETİLİYOR: içindekiler yalnızca başlangıç sayfasını
// verir. Bir bölümün bitişi, bir sonraki bölümün başlangıcının bir
// eksiği sayılıyor. Son bölümün bitişi bilinmiyor ve NULL kalıyor —
// uydurulmuyor, çünkü kitabın kaç sayfa olduğunu bilmiyoruz.
export function icindekileriAyristir(metin) {
  const bulunan = [];
  const atlanan = [];

  // ── BÖLÜM BAŞLIĞI BAĞLAM OLARAK TUTULUYOR ──────────────────
  // "02. BÖLÜM: MADDE VE ÖZELLİKLERİ" satırının sayfa numarası yok,
  // o yüzden bölüm olarak kaydedilmiyor. Ama altındaki girdiler için
  // KİMLİK taşıyor: kitabın alt başlıkları ("Kütle - Hacim ve
  // Özkütle", "Adesyon, Kohezyon...") müfredattan daha ince taneli ve
  // tek başlarına hiçbir müfredat konusuna oturmuyorlar. Bölüm adı
  // ise tam olarak müfredattaki konu: "Madde ve Özellikleri".
  //
  // Bu bağlam olmadan koca bir bölümün altı girdisi de "bağlanmadı"
  // kalıyor ve ödev önerisinde hiç kullanılamıyordu.
  let bolumBasligi = null;

  for (const satir of satirlar(metin)) {
    const m = SATIR.exec(satir);
    if (!m) {
      const b = BOLUM_BASLIGI.exec(satir);
      if (b) bolumBasligi = basligiTemizle(b[1]);
      atlanan.push(satir);
      continue;
    }

    const baslik = basligiTemizle(m[1]);
    // Başlıksız satır (yalnız numaralar) ya da harfsiz satır işe yaramaz
    if (!baslik || !HARF.test(baslik)) { atlanan.push(satir); continue; }

    const bas = Number(m[2]);
    const son = m[3] ? Number(m[3]) : null;
    bulunan.push({ baslik, sayfaBas: bas, sayfaSon: son, bolum: bolumBasligi });
  }

  // Sayfa numarası artan gitmeyen satırlar genelde yanlış okumadır
  // (OCR "7"yi "77" yapar). Elemiyoruz ama işaretliyoruz: koç görsün.
  let oncekiSayfa = 0;
  const bolumler = bulunan.map((b, i) => {
    const geriGidiyor = b.sayfaBas < oncekiSayfa;
    if (!geriGidiyor) oncekiSayfa = b.sayfaBas;

    // Bitiş verilmemişse sonraki bölümün başlangıcından türet.
    let sayfaSon = b.sayfaSon;
    if (sayfaSon == null) {
      const sonraki = bulunan[i + 1];
      if (sonraki && sonraki.sayfaBas > b.sayfaBas) sayfaSon = sonraki.sayfaBas - 1;
    }

    return {
      sira: i + 1,
      baslik: b.baslik,
      bolum: b.bolum ?? null,
      sayfaBas: b.sayfaBas,
      sayfaSon,
      supheli: geriGidiyor,
    };
  });

  return { bolumler, atlanan };
}

// Bölümün sayfa sayısı — bitişi bilinmiyorsa null.
export const sayfaSayisi = (b) =>
  b.sayfaBas != null && b.sayfaSon != null ? b.sayfaSon - b.sayfaBas + 1 : null;
