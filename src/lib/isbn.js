// ISBN doğrulama ve normalleştirme — SAF, Node'da sınanabilir.
//
// ── NEDEN SAĞLAMA TOPLAMI DENETLENİYOR ──────────────────────────
// Barkod okuma kamera işi: ışık, açı ve bulanıklık yüzünden bir rakam
// yanlış okunabiliyor. Yanlış ISBN sessizce kaydedilirse kitap yanlış
// kimlikle durur — ve ISBN'in asıl değeri ileride "aynı kitap mı"
// sorusuna cevap vermek olduğu için, bozuk bir numara bütün paylaşılan
// kütüphaneyi zehirler. Sağlama toplamı tutmayan numara ALINMIYOR.
//
// ── NEDEN HEP ISBN-13'E ÇEVRİLİYOR ──────────────────────────────
// Aynı kitap hem 10 hem 13 haneli yazılabiliyor. İki biçim bir arada
// saklanırsa aynı kitap iki ayrı kayıt olur. Tek biçim: ISBN-13.

// Girilen metinden rakamları (ve ISBN-10'un X'ini) ayıklar.
export function temizle(ham) {
  if (!ham) return "";
  return String(ham).toUpperCase().replace(/[^0-9X]/g, "");
}

// ISBN-13 (EAN-13) sağlama hanesi: 1,3,1,3... ağırlıklı toplam % 10 = 0
function on3Gecerli(kod) {
  if (!/^\d{13}$/.test(kod)) return false;
  let toplam = 0;
  for (let i = 0; i < 13; i++) toplam += Number(kod[i]) * (i % 2 === 0 ? 1 : 3);
  return toplam % 10 === 0;
}

// ISBN-10: 10,9,8...1 ağırlıklı toplam % 11 = 0; son hane X = 10
function on0Gecerli(kod) {
  if (!/^\d{9}[0-9X]$/.test(kod)) return false;
  let toplam = 0;
  for (let i = 0; i < 9; i++) toplam += Number(kod[i]) * (10 - i);
  toplam += kod[9] === "X" ? 10 : Number(kod[9]);
  return toplam % 11 === 0;
}

function on0dan13e(kod) {
  const govde = "978" + kod.slice(0, 9);
  let toplam = 0;
  for (let i = 0; i < 12; i++) toplam += Number(govde[i]) * (i % 2 === 0 ? 1 : 3);
  return govde + String((10 - (toplam % 10)) % 10);
}

// Ham girdiyi tek biçime çevirir.
//
// Çıktı: { isbn, hata }
//   isbn  13 haneli, geçerli numara (hata varsa null)
//   hata  kullanıcıya gösterilecek sebep (yoksa null)
//
// Sebep AÇIKÇA dönüyor: "geçersiz" demek, kullanıcının elindeki
// barkodun mu yoksa okumanın mı bozuk olduğunu anlamasını engellerdi.
export function isbnCoz(ham) {
  const kod = temizle(ham);
  if (!kod) return { isbn: null, hata: "ISBN boş." };

  if (kod.length === 13) {
    if (!/^(978|979)/.test(kod)) {
      // 13 hane ama kitap barkodu değil (ör. gıda ürünü EAN'ı)
      return { isbn: null, hata: "Bu bir kitap barkodu değil (978/979 ile başlamıyor)." };
    }
    return on3Gecerli(kod)
      ? { isbn: kod, hata: null }
      : { isbn: null, hata: "ISBN sağlaması tutmadı; numarayı kontrol edin." };
  }

  if (kod.length === 10) {
    return on0Gecerli(kod)
      ? { isbn: on0dan13e(kod), hata: null }
      : { isbn: null, hata: "ISBN-10 sağlaması tutmadı; numarayı kontrol edin." };
  }

  return { isbn: null, hata: `ISBN 10 ya da 13 haneli olmalı (${kod.length} hane girildi).` };
}

// Ekranda gösterim: 978-605-...-X biçimi okunurluğu artırıyor.
// Grup sınırları ülkeye/yayıncıya göre değişiyor ve tam ayrım bir
// tabloya bağlı; burada yalnızca kaba, sabit bir bölme yapılıyor —
// amaç güzel görünmek, numarayı yorumlamak değil.
export function isbnYaz(isbn) {
  const k = temizle(isbn);
  if (k.length !== 13) return k;
  return `${k.slice(0, 3)}-${k.slice(3, 4)}-${k.slice(4, 8)}-${k.slice(8, 12)}-${k.slice(12)}`;
}
