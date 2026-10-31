// ISBN'den kitap adı ve yayınevi.
//
// ── DIŞ SERVİS, DIŞARI ÇIKAN TEK ŞEY ISBN ───────────────────────
// Google Books sorgulanıyor. Dışarı giden veri yalnızca ISBN — bir
// kitabın numarası, kullanıcıya ait hiçbir şey değil. Anahtar
// gerekmiyor, CORS açık.
//
// Open Library yerine Google Books: Türkçe yayınlarda kapsamı belirgin
// biçimde geniş. Yine de **sınav kaynaklarının çoğu hiçbir katalogda
// yok**; bu yüzden alan elle doldurulabilir kalıyor ve bulunamamak
// hata sayılmıyor.
//
// ── NEDEN KENDİLİĞİNDEN DEĞİL, DÜĞMEYLE ─────────────────────────
// ISBN yazılırken her tuşta istek atmak hem gereksiz trafik hem de
// kullanıcının yazdığı adı habersiz değiştirme riski. Arama açık bir
// eylem; gelen ad da doğrudan yazılmıyor, önerilip onaylanıyor.

export const KITAP_SERVISI = "https://www.googleapis.com/books/v1/volumes?q=isbn:";

// Yanıtı ayrıştırır — SAF, Node'da sınanabilir.
//
// Servis bulunamayan ISBN'de de 200 dönüyor (`totalItems: 0`), yani
// "hata yok" ile "kitap yok" aynı şey değil; ikisi ayrı ayrı ele
// alınıyor.
export function kitapBilgisiCoz(json) {
  const ilk = json?.items?.[0]?.volumeInfo;
  if (!ilk) return null;
  const ad = (ilk.title ?? "").trim();
  if (!ad) return null;
  return {
    // Alt başlık varsa ekleniyor: "TYT Matematik" ile "TYT Matematik
    // Soru Bankası" ayrı kitaplar ve katalog ikinciyi böyle veriyor.
    ad: ilk.subtitle ? `${ad} ${String(ilk.subtitle).trim()}` : ad,
    yayinevi: (ilk.publisher ?? "").trim() || null,
    yil: ilk.publishedDate ? String(ilk.publishedDate).slice(0, 4) : null,
  };
}

// Dönüş: { kitap, hata }
//   kitap null + hata null  → servis cevapladı, kitap yok
//   kitap null + hata dolu  → ulaşılamadı / bozuk yanıt
//
// `getir` dışarıdan verilebiliyor: sınamada gerçek ağa çıkmadan
// davranışın tamamı denenebilsin.
export async function kitapAra(isbn, { getir = fetch, surePayi = 8000 } = {}) {
  const temiz = String(isbn ?? "").replace(/[^0-9Xx]/g, "");
  if (temiz.length !== 13 && temiz.length !== 10) {
    return { kitap: null, hata: "Geçerli bir ISBN değil." };
  }

  // Zaman aşımı şart: yavaş bir dış servis formu süresiz bekletirdi.
  const kesici = typeof AbortController !== "undefined" ? new AbortController() : null;
  const sayac = kesici ? setTimeout(() => kesici.abort(), surePayi) : null;

  try {
    const yanit = await getir(KITAP_SERVISI + encodeURIComponent(temiz),
      kesici ? { signal: kesici.signal } : undefined);
    if (!yanit?.ok) return { kitap: null, hata: "Katalog servisine ulaşılamadı." };
    const json = await yanit.json();
    return { kitap: kitapBilgisiCoz(json), hata: null };
  } catch (err) {
    // İptal de dâhil her arıza aynı kapıya çıkıyor: kullanıcı için
    // ikisi arasında bir fark yok, alan elle doldurulacak.
    return { kitap: null, hata: err?.name === "AbortError"
      ? "Katalog servisi yanıt vermedi."
      : "Katalog servisine ulaşılamadı." };
  } finally {
    if (sayac) clearTimeout(sayac);
  }
}
