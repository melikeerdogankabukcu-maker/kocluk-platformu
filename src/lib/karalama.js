// Sayfa fotoğrafı üzerine karalama — saf geometri, Node'da sınanabilir.
//
// ── NEDEN ORANLI KOORDİNAT ──────────────────────────────────────
// Noktalar piksel değil, görsele göre 0–1 arası oran olarak tutuluyor.
// Fotoğraf genişliği ekrana göre değişiyor (telefon ↔ tablet, yan
// çevirme, "tam boy aç"), piksel tutulsaydı çizgiler her boyut
// değişiminde kayardı.
//
// ── SİLGİ ÇİZGİYİ SİLİYOR, PİKSELİ DEĞİL ────────────────────────
// Dokunulan çizginin tamamı kalkıyor. Piksel silmek kâğıttaki silgiye
// daha çok benzerdi ama geri alma mümkün olmazdı: çizgiler liste
// olduğu sürece "geri al" sadece listenin sonunu atmak.

// Varsayılan kalem: kırmızı. Sayfa baskısı siyah, öğrencinin kendi
// işi ondan ayırt edilebilir dursun.
export const KALEMLER = [
  { ad: "kırmızı", renk: "#e5484d" },
  { ad: "mavi",    renk: "#3b82f6" },
  { ad: "siyah",   renk: "#18181b" },
];

export const KALINLIK = 0.0035;   // görsel genişliğinin oranı
export const SILGI_YARICAP = 0.02;

// Bir noktanın [x1,y1]–[x2,y2] doğru parçasına uzaklığı.
// Çizgi hızlı çekildiğinde noktalar seyrek düşüyor; yalnız noktalara
// bakan bir silgi aradaki uzun parçaya hiç değmezdi.
export function noktaSegmentMesafesi(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const uzunlukKare = dx * dx + dy * dy;
  if (uzunlukKare === 0) return Math.hypot(x - x1, y - y1);
  // Noktanın parça üzerindeki izdüşümü, parçanın dışına taşmayacak şekilde
  let t = ((x - x1) * dx + (y - y1) * dy) / uzunlukKare;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

export function cizgiDokunuyorMu(cizgi, x, y, yaricap = SILGI_YARICAP) {
  const n = cizgi?.noktalar ?? [];
  if (n.length === 0) return false;
  if (n.length === 1) return Math.hypot(x - n[0][0], y - n[0][1]) <= yaricap;
  for (let i = 1; i < n.length; i++) {
    if (noktaSegmentMesafesi(x, y, n[i - 1][0], n[i - 1][1], n[i][0], n[i][1]) <= yaricap) {
      return true;
    }
  }
  return false;
}

// Dokunulan çizgileri çıkarıp kalanları döndürür. Hiçbiri silinmediyse
// AYNI diziyi döndürüyor: React'te gereksiz yeniden çizim olmasın.
export function cizgileriSil(cizgiler, x, y, yaricap = SILGI_YARICAP) {
  const kalan = (cizgiler ?? []).filter(c => !cizgiDokunuyorMu(c, x, y, yaricap));
  return kalan.length === (cizgiler ?? []).length ? cizgiler : kalan;
}

// Fare/dokunma olayından oranlı nokta. Görsel sınırının dışına taşan
// değer kırpılıyor: parmak görselin kenarından çıkıp geri girdiğinde
// çizgi uzaklara fırlamasın.
export function oranliNokta(olayX, olayY, kutu) {
  const g = kutu?.width  || 1;
  const y = kutu?.height || 1;
  const kirp = (v) => Math.max(0, Math.min(1, v));
  return [kirp((olayX - (kutu?.left ?? 0)) / g), kirp((olayY - (kutu?.top ?? 0)) / y)];
}
