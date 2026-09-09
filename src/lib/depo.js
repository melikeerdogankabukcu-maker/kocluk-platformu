import { supabase } from "../supabase";
import { storageYolu } from "./odevDosyalari";

// Depodaki dosyalara imzalı (süreli) adresle erişim.
//
// ── NEDEN ───────────────────────────────────────────────────────
// 'homework' kovası public açılmıştı: kayıtlı adres tahmin edilmesi güç
// olsa da, adresi eline geçiren HERKES dosyayı açabiliyordu — kimlik
// doğrulaması yok. Ödev ve test görselleri bir yana, profil
// fotoğraflarının çoğu reşit olmayan öğrencilere ait. Kova artık
// kapalı; dosyalar yalnızca yetkili kullanıcının o an ürettiği, kısa
// ömürlü bir adresle açılıyor.
//
// ── KAYITLI ADRESLER DEĞİŞMEDİ ──────────────────────────────────
// Veritabanındaki eski public adresler olduğu gibi duruyor; artık
// doğrudan açılabilir bir bağlantı değil, YOLUN KAYDI olarak
// kullanılıyorlar. Böylece dört tabloyu ve içlerindeki JSON dizilerini
// yeniden yazan bir veri göçü gerekmedi — o göç, yarısı dönmüş hâlde
// kalırsa dosyaları büsbütün erişilemez yapardı.

const KOVA = "homework";

// İmza ömrü. Kısa tutuluyor: imzalı adres de paylaşılabilir bir
// bağlantı, farkı süresinin dolması. Bir saat, bir dosyayı açıp
// okumaya fazlasıyla yetiyor.
export const IMZA_SANIYE = 3600;

// Tam public adres ya da doğrudan yol kabul eder.
function yolaCevir(urlVeyaYol) {
  if (!urlVeyaYol) return null;
  if (!/^https?:\/\//i.test(urlVeyaYol)) return urlVeyaYol;
  return storageYolu(urlVeyaYol, KOVA);
}

// Tek dosya için imzalı adres. Üretilemezse null döner; çağıran taraf
// kullanıcıya "açılamadı" der, sessizce kırık bağlantı göstermez.
export async function imzaliUrl(urlVeyaYol, saniye = IMZA_SANIYE) {
  const yol = yolaCevir(urlVeyaYol);
  if (!yol) return null;
  const { data, error } = await supabase.storage.from(KOVA).createSignedUrl(yol, saniye);
  if (error) {
    console.error("[Imzali adres]", yol, error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

// Birden fazla dosya için tek istek. Bir mesajdaki üç ek ya da bir
// testin görselleri için ayrı ayrı istek atmak gereksiz tur demekti.
export async function imzaliUrlListesi(urlListesi, saniye = IMZA_SANIYE) {
  const yollar = urlListesi.map(yolaCevir).filter(Boolean);
  if (yollar.length === 0) return {};
  const { data, error } = await supabase.storage.from(KOVA).createSignedUrls(yollar, saniye);
  if (error) {
    console.error("[Imzali adres listesi]", error.message);
    return {};
  }
  const harita = {};
  (data ?? []).forEach(d => { if (d?.path && d?.signedUrl) harita[d.path] = d.signedUrl; });
  // Anahtar olarak çağıranın verdiği özgün değeri kullanmak daha kolay
  const sonuc = {};
  urlListesi.forEach(u => {
    const y = yolaCevir(u);
    if (y && harita[y]) sonuc[u] = harita[y];
  });
  return sonuc;
}
