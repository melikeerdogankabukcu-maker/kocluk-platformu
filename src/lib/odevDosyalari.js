// Ödev gönderimindeki dosyalar.
//
// Gönderim iki biçimde olabilir:
//   yeni  -> dosyalar: [{url, ad}, ...]
//   eski  -> file_url + file_name (tek dosya)
//
// Okuyan her yer bu fonksiyondan geçiyor. Böylece migration çalışmadan
// önce de, eski bir kayıt taşınmadan kalsa da arayüz doğru davranıyor —
// "dosya yok" gibi görünmesi öğrencinin ödevi kayboldu sanmasına yol açardı.
export function odevDosyalari(gonderim) {
  if (!gonderim) return [];

  const liste = Array.isArray(gonderim.dosyalar) ? gonderim.dosyalar : [];
  if (liste.length > 0) {
    return liste.filter(d => d?.url).map(d => ({
      url: d.url,
      ad:  d.ad || "Ödev dosyası",
    }));
  }

  return gonderim.file_url
    ? [{ url: gonderim.file_url, ad: gonderim.file_name || "Ödev dosyası" }]
    : [];
}

// Genel URL'den storage yolunu çıkarır (silme için gerekiyor).
// .../storage/v1/object/public/homework/<yol>
export function storageYolu(url, kova = "homework") {
  if (!url) return null;
  const isaret = `/object/public/${kova}/`;
  const yer = url.indexOf(isaret);
  if (yer === -1) return null;
  // Yol kısmı yüklenirken kodlanmış olabilir
  try {
    return decodeURIComponent(url.slice(yer + isaret.length).split("?")[0]);
  } catch {
    return url.slice(yer + isaret.length).split("?")[0];
  }
}

// Yükleme sırasında kullanılacak storage yolu.
//
// Dosya adı yola KONULMUYOR, yalnızca uzantısı alınıyor: Türkçe karakter
// ve boşluk içeren adlar storage anahtarında sorun çıkarıyor. Görünen ad
// zaten dosyalar[].ad içinde saklanıyor.
//
// Eski kayıtlar `{ogrenci}/{gorev}` yolunu kullanıyordu; yeni yol araya
// zaman damgası koyduğu için o anahtarla çakışmıyor ve her dosya kendi
// anahtarına yazılıyor — eskiden hepsi aynı anahtara yazılıp üst üste
// biniyordu.
export function yeniDosyaYolu(userId, taskId, dosyaAdi, sira, damga = Date.now()) {
  const uzanti = (String(dosyaAdi).match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  return `${userId}/${taskId}-${damga}-${sira}${uzanti}`;
}

export const DOSYA_SINIRI    = 10;                 // gönderim başına
export const BOYUT_SINIRI_MB = 10;
