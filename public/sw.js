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
// Başka HİÇBİR ŞEY yakalanmıyor:
//   - index.html hep ağdan gelir → yeni sürüm anında görünür
//   - Supabase ve analiz servisi istekleri hiç dokunulmadan geçer
//   - GET olmayan istekler ve başka alan adları es geçilir
//
// respondWith çağrılmayan istek tarayıcının normal akışına düşüyor;
// yani buradaki bir eksiklik "çalışmıyor" değil, "önbelleklenmiyor"
// anlamına geliyor.

const ONBELLEK = "kocluk-varlik-v1";

self.addEventListener("install", (olay) => {
  // Bekleyen sürüm hemen devreye girsin: iki sekme arasında farklı
  // servis çalışanı sürümleri dolaşmasın.
  self.skipWaiting();
  olay.waitUntil(caches.open(ONBELLEK));
});

self.addEventListener("activate", (olay) => {
  olay.waitUntil((async () => {
    // Eski sürüm önbellekleri temizleniyor; ONBELLEK adı değiştiğinde
    // öncekiler diskte kalmasın.
    const adlar = await caches.keys();
    await Promise.all(adlar.filter(a => a !== ONBELLEK).map(a => caches.delete(a)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (olay) => {
  const istek = olay.request;
  if (istek.method !== "GET") return;

  let url;
  try { url = new URL(istek.url); } catch { return; }

  // Yalnızca kendi alan adımızdaki içerik özetli varlıklar
  if (url.origin !== self.location.origin) return;
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
