// Cevap kâğıdı: kimlik kodu ve yerleşim hesapları — SAF, Node'da
// sınanabilir.
//
// ── KİMLİK NEDEN QR DEĞİL ───────────────────────────────────────
// Değerlendirme belgesi kâğıda QR koymayı öneriyor. Kâğıdı BİZ
// bastığımız için buna mecbur değiliz ve iki sebeple istemiyoruz:
//
// 1) QR okumak ya bir kütüphane (birkaç yüz KB) ya da tarayıcının
//    BarcodeDetector'ı demek — ikincisi iOS'ta YOK (bkz. kodOkuyucu.js).
//    Kâğıdı okuyan taraf iPhone'da çalışmazsa özelliğin yarısı ölür.
// 2) Baloncukları zaten okuyacağız. Kimliği de DOLU/BOŞ KARE ŞERİDİ
//    olarak basarsak, aynı doluluk ölçümüyle okunuyor — yeni bir
//    bağımlılık, yeni bir hata kaynağı yok.
//
// Şerit 24 veri biti + 6 sağlama biti. Tek bir karenin yanlış okunması
// sessizce başka bir kâğıdın koduna dönüşmemeli: sağlama tutmazsa kod
// REDDEDİLİYOR, tahmin edilmiyor.

export const VERI_BIT = 24;          // 16.7 milyon kâğıt kodu
export const SAGLAMA_BIT = 6;
export const TOPLAM_BIT = VERI_BIT + SAGLAMA_BIT;
export const EN_BUYUK_KOD = 2 ** VERI_BIT - 1;

// Sağlama: bitlerin ağırlıklı toplamı mod 64. Tek bit hatasını ve
// çoğu iki bit hatasını yakalıyor; amaç şifreleme değil, yanlış
// okumayı fark etmek.
export function saglama(kod) {
  let toplam = 0;
  for (let i = 0; i < VERI_BIT; i++) {
    if ((kod >> i) & 1) toplam += i + 1;
  }
  return toplam % (2 ** SAGLAMA_BIT);
}

// Kod → basılacak kare dizisi (true = dolu).
// Sıra: önce veri bitleri (düşük bitten yükseğe), sonra sağlama.
export function kodBitleri(kod) {
  if (!Number.isInteger(kod) || kod < 0 || kod > EN_BUYUK_KOD) return null;
  const s = saglama(kod);
  const bitler = [];
  for (let i = 0; i < VERI_BIT; i++) bitler.push(Boolean((kod >> i) & 1));
  for (let i = 0; i < SAGLAMA_BIT; i++) bitler.push(Boolean((s >> i) & 1));
  return bitler;
}

// Okunan kare dizisi → kod. Sağlama tutmazsa null.
//
// Dönüş null ise çağıran "kâğıt tanınamadı" demeli; yakın bir kodu
// tahmin etmek, bir öğrencinin cevaplarını başkasının kâğıdına
// yazmanın yolu olurdu.
export function bitlerdenKod(bitler) {
  if (!Array.isArray(bitler) || bitler.length !== TOPLAM_BIT) return null;
  let kod = 0;
  for (let i = 0; i < VERI_BIT; i++) if (bitler[i]) kod |= (1 << i);
  let okunanSaglama = 0;
  for (let i = 0; i < SAGLAMA_BIT; i++) if (bitler[VERI_BIT + i]) okunanSaglama |= (1 << i);
  // kod >>> 0: 24. bit işaretli sayıya kaymasın
  return saglama(kod >>> 0) === okunanSaglama ? (kod >>> 0) : null;
}

// Yeni kâğıt kodu. Sıralı değil rastgele: sıralı kod, bir kâğıdın
// koduna bakıp komşusunu üretmeyi mümkün kılardı.
export function yeniKod() {
  return Math.floor(Math.random() * (EN_BUYUK_KOD + 1));
}

// Kodun insan tarafından okunabilir hâli — kâğıdın köşesine basılıyor.
// Şerit okunamazsa koç bunu elle girebilsin diye var.
export const kodYaz = (kod) =>
  kod.toString(36).toUpperCase().padStart(5, "0").replace(/^(.{3})/, "$1-");

export function kodCoz(metin) {
  const temiz = String(metin ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!temiz) return null;
  const kod = parseInt(temiz, 36);
  return Number.isInteger(kod) && kod >= 0 && kod <= EN_BUYUK_KOD ? kod : null;
}

// ── IZGARA YERLEŞİMİ ────────────────────────────────────────────
// Soru sayısı arttıkça tek sütun sayfaya sığmıyor. Sütun sayısı
// soru sayısından türetiliyor; okuyan taraf aynı hesabı yaparak
// baloncuğun nerede olduğunu biliyor — yerleşim kâğıtla kod arasında
// paylaşılan tek gerçek.
export function sutunDuzeni(soruSayisi, sutunBasinaEnFazla = 25) {
  const sutun = Math.max(1, Math.ceil(soruSayisi / sutunBasinaEnFazla));
  const satir = Math.ceil(soruSayisi / sutun);
  return { sutun, satir };
}

// Soru numarası → (sütun, satır). Numaralar sütun sütun ilerliyor:
// 1..25 birinci sütun, 26..50 ikinci. Satır satır ilerleseydi
// öğrenci aşağı değil sağa doğru işaretlerdi, alışkanlığa ters.
export function soruYeri(indeks, soruSayisi, sutunBasinaEnFazla = 25) {
  const { satir } = sutunDuzeni(soruSayisi, sutunBasinaEnFazla);
  return { sutun: Math.floor(indeks / satir), satir: indeks % satir };
}
