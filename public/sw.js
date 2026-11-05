// Servis çalışanı.
//
// ── NEDEN VAR ───────────────────────────────────────────────────
// TWA (Play Store'daki Android kabuğu) sitenin "kurulabilir" olmasını
// istiyor ve bunun şartlarından biri bir fetch işleyicisinin varlığı.
// Yani bu dosyanın asıl işi kurulabilirlik; önbellek ikincil.
//
// ── BİLEREK ÇOK DAR ─────────────────────────────────────────────
// Yanlış yazılmış bir servis çalışanı, kullanıcıya AYLARCA eski bir
// paket servis edebilir ve bunu geri almanın kolay yolu yoktur. Bu
// projede haftada birkaç kez sürüm çıkıyor; böyle bir risk kabul
// edilemez. O yüzden yalnızca ŞU tek şey önbelleğe alınıyor:
//
//   /assets/... — Vite bu dosyaların adına içerik özeti koyuyor
//   (index-DEwk_um4.js gibi). İçerik değişince ad da değişiyor, yani
//   bu dosyalar TANIM GEREĞİ bayatlayamaz. Sonsuza dek önbellekte
//   tutmak doğru olan.
//
// Bunun dışında yalnız SAYFA İSTEĞİ (navigate) yakalanıyor ve o da
// ÖNCE AĞ: ağ her zaman deneniyor, yalnız BAŞARISIZ olursa önbellekteki
// kabuk veriliyor.
//
// ── NEDEN SAYFA DA EKLENDİ (5 Kasım 2026) ───────────────────────
// Öğrencilerin telefonunda "Safari, ağ bağlantısı kesildiği için
// sayfayı açamıyor" hatası görüldü. Site ayaktaydı, iki ayrı ağdan
// 200 dönüyordu; sorun zayıf mobil bağlantıda transferin yarıda
// kesilmesiydi ve adres tekrar açılınca giriliyordu. Yani geçici bir
// kopma, kullanıcıya tarayıcının ham hata sayfası olarak çıkıyordu —
// oysa uygulamanın bütün dosyaları zaten o telefonun önbelleğindeydi.
//
// "Önce ağ" olması şart: dosyanın başındaki "yeni sürüm anında
// görünür" güvencesi aynen duruyor, çünkü ağ çalıştığı sürece
// önbelleğe hiç bakılmıyor. Korkulan şey ÖNCE ÖNBELLEK'ti, bu değil.
//
// Supabase ve analiz servisi istekleri hiç dokunulmadan geçiyor;
// GET olmayan istekler ve başka alan adları es geçiliyor.
//
// respondWith çağrılmayan istek tarayıcının normal akışına düşüyor;
// yani buradaki bir eksiklik "çalışmıyor" değil, "önbelleklenmiyor"
// anlamına geliyor.

const ONBELLEK = "kocluk-varlik-v1";
const KABUK    = "kocluk-kabuk-v1";

// Sayfa her yolda aynı: Vercel bütün adresleri index.html'e
// yönlendiriyor. Tek anahtarla saklanıyor, yoksa gezilen her adres
// için ayrı bir kopya birikirdi.
const KABUK_ANAHTARI = "/";

// Hiç kabuk yoksa gösterilen sayfa. Ayrı bir dosya değil: dosya
// olsaydı onun da indirilmiş olması gerekirdi ve indirilemeyen tam da
// buydu.
const CEVRIMDISI = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bağlantı kurulamadı</title>
<style>
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#f7f4ef;color:#333;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
 .k{max-width:320px;padding:28px;text-align:center}
 h1{font-size:18px;margin:0 0 10px}
 p{font-size:14px;color:#666;margin:0 0 20px}
 button{width:100%;padding:12px;border:0;border-radius:12px;background:#0F6E56;
        color:#fff;font-size:15px;font-weight:700}
</style></head>
<body><div class="k">
 <h1>Bağlantı kurulamadı</h1>
 <p>İnternet bağlantınız koptu. Bağlantınızı kontrol edip tekrar deneyin.</p>
 <button onclick="location.reload()">Tekrar dene</button>
</div></body></html>`;

self.addEventListener("install", (olay) => {
  // Bekleyen sürüm hemen devreye girsin: iki sekme arasında farklı
  // servis çalışanı sürümleri dolaşmasın.
  self.skipWaiting();
  olay.waitUntil((async () => {
    await caches.open(ONBELLEK);
    const kabuk = await caches.open(KABUK);
    await kabuk.put("/__cevrimdisi",
      new Response(CEVRIMDISI, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  })());
});

self.addEventListener("activate", (olay) => {
  olay.waitUntil((async () => {
    // Eski sürüm önbellekleri temizleniyor; ONBELLEK adı değiştiğinde
    // öncekiler diskte kalmasın.
    const adlar = await caches.keys();
    const kalanlar = [ONBELLEK, KABUK];
    await Promise.all(adlar.filter(a => !kalanlar.includes(a)).map(a => caches.delete(a)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (olay) => {
  const istek = olay.request;
  if (istek.method !== "GET") return;

  let url;
  try { url = new URL(istek.url); } catch { return; }

  if (url.origin !== self.location.origin) return;

  // ── Sayfa isteği: ÖNCE AĞ ─────────────────────────────────────
  if (istek.mode === "navigate") {
    olay.respondWith((async () => {
      const kabuk = await caches.open(KABUK);
      try {
        const yanit = await fetch(istek);
        // Yalnız tam ve başarılı yanıt saklanıyor; hata sayfasını
        // kabuk diye saklamak arızayı kalıcılaştırırdı.
        if (yanit.ok && yanit.status === 200 && !yanit.redirected) {
          kabuk.put(KABUK_ANAHTARI, yanit.clone()).catch(() => {});
        }
        return yanit;
      } catch {
        // Ağ düştü. Daha önce açılmışsa uygulama olduğu gibi geliyor;
        // hiç açılmamışsa en azından Türkçe bir mesaj ve "tekrar dene".
        return (await kabuk.match(KABUK_ANAHTARI))
            ?? (await kabuk.match("/__cevrimdisi"))
            ?? Response.error();
      }
    })());
    return;
  }

  // ── İçerik özetli varlıklar: önce önbellek ────────────────────
  if (!url.pathname.startsWith("/assets/")) return;

  olay.respondWith((async () => {
    const onbellek = await caches.open(ONBELLEK);
    const varolan = await onbellek.match(istek);
    if (varolan) return varolan;

    const yanit = await fetch(istek);
    // Yalnızca başarılı ve tam yanıtlar saklanıyor: 206 (kısmi) ya da
    // hata yanıtını önbelleğe koymak bozuk bir dosyayı kalıcılaştırırdı.
    if (yanit.ok && yanit.status === 200) {
      onbellek.put(istek, yanit.clone()).catch(() => {});
    }
    return yanit;
  })());
});
