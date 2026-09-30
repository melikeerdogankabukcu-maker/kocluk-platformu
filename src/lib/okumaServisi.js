// Görsel okuma servisine bağlantı — İSTEĞE BAĞLI ve GÜVENLİ.
//
// ── NEDEN VAR ───────────────────────────────────────────────────
// Sayfa numaralarını tarayıcıda tesseract okuyor ve çoğu fotoğrafta
// iyi okuyor. Zor fotoğrafta (gölgede kalmış, küçük, iki sütunlu)
// yetmiyor: gerçek bir kitap sayfasında 49 numaranın 19'unu bildi.
// Aynı sayfanın numara şeridini PARSeq'e okutunca 34 oldu.
//
// ÖLÇÜM (3 gerçek fotoğraf, 147 elle yazılmış sayfa numarası):
//   yalnız tarayıcı            → 110 doğru / 13 yanlış
//   şeridi servis okuyunca     → 123 doğru / 14 yanlış
// Kazancın tamamı ZOR fotoğraftan geliyor; kolay iki fotoğrafta
// tesseract birer numara önde. Bu yüzden servis HER SAYFADA DEĞİL,
// yalnız okuma puanı düşükken çağrılıyor.
//
// ── KAPALIYKEN HİÇBİR ŞEY DEĞİŞMİYOR ────────────────────────────
// Adres tanımlı değilse bu dosya hiçbir şey yapmıyor; okuma bugünkü
// gibi tamamen tarayıcıda kalıyor. Servis açıkken de hata, zaman aşımı
// ya da boş cevap durumunda tarayıcının kendi sonucu kullanılıyor:
// yeni bir bağımlılık yüzünden çalışan akışı kaybetmek olmaz.
//
// ── NE GÖNDERİLİYOR ─────────────────────────────────────────────
// Sayfanın tamamı değil, yalnız SAYFA NUMARASI ŞERİDİ — sağ kenardaki
// ince bir sütun. Kitabın metni cihazda kalıyor.

const ADRES = (import.meta.env?.VITE_OKUMA_SERVISI ?? "").trim();
const ANAHTAR = (import.meta.env?.VITE_OKUMA_ANAHTAR ?? "").trim();
const ZAMAN_ASIMI = 60000;   // model yüklüyse şerit okuma ~15 sn sürüyor

export const servisVar = () => ADRES.length > 0;

// Şeritlerdeki sayıları okur.
//
// girdi : blob (ön işlenmiş sayfa görüntüsü), kutular [{x0,y0,x1,y1}]
// çıktı : [{ metin, x0, x1, y0, y1, guven }]  — sayfa koordinatında,
//         tarayıcıdaki numaralariEsle'nin beklediği biçimde.
//         Servis yoksa ya da bir şey ters giderse BOŞ dizi.
export async function seritleriOku(blob, kutular) {
  if (!servisVar() || !blob || !kutular?.length) return [];

  const vazgec = new AbortController();
  const sayac = setTimeout(() => vazgec.abort(), ZAMAN_ASIMI);
  try {
    const govde = new FormData();
    govde.append("dosya", blob, "sayfa.png");
    govde.append("kutular", JSON.stringify(kutular));
    govde.append("on_isle", "false");   // görüntüyü tarayıcı zaten hazırladı

    const cevap = await fetch(`${ADRES.replace(/\/+$/, "")}/serit`, {
      method: "POST",
      body: govde,
      signal: vazgec.signal,
      headers: ANAHTAR ? { "X-OCR-Anahtar": ANAHTAR } : undefined,
    });
    if (!cevap.ok) return [];

    const veri = await cevap.json();
    const sayilar = [];
    for (const serit of veri?.seritler ?? []) {
      for (const kelime of serit?.kelimeler ?? []) {
        // Servis kutuyu dört nokta olarak veriyor; burada sınırlayıcı
        // dikdörtgene indiriliyor.
        const nokta = kelime?.kutu ?? [];
        if (nokta.length < 4) continue;
        const xs = nokta.map(p => p[0]), ys = nokta.map(p => p[1]);
        // Baştaki/sondaki nokta dolgusu artıkları ayıklanıyor; temiz
        // sayı değilse ATILIYOR. Uydurma numara, numarasız satırdan
        // kötüdür — kitaba yanlış sayfa yazmak sessiz bir hatadır.
        const metin = String(kelime.metin ?? "").replace(/^[^0-9]+/, "").replace(/[^0-9]+$/, "");
        if (!/^\d{1,4}$/.test(metin)) continue;
        sayilar.push({
          metin,
          x0: Math.min(...xs), x1: Math.max(...xs),
          y0: Math.min(...ys), y1: Math.max(...ys),
          guven: Math.round((kelime.guven ?? 0) * 100),
        });
      }
    }
    return sayilar;
  } catch {
    // Ağ yok, servis kapalı, zaman aşımı: sessizce tarayıcıya dönülüyor.
    return [];
  } finally {
    clearTimeout(sayac);
  }
}
