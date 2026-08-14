// Sınav türüne göre her dersin soru sayısı.
// Girişte doğru+yanlış+boş toplamı bu sayıyı aşamaz.
//
// Değerler ÖSYM'nin standart dağılımına göredir ve kullanıcı tarafından
// doğrulanmıştır (2026-08-03). Deneme yapısı değişirse buradan güncellenir.
export const EXAM_LIMITS = {
  TYT: {
    "Türkçe": 40,
    "Matematik": 30,
    "Geometri": 10,
    "Fizik": 7,
    "Kimya": 7,
    "Biyoloji": 6,
    "Tarih": 5,
    "Coğrafya": 5,
    "Felsefe": 5,
    "Din Kültürü": 5,
  },
  AYT: {
    "Matematik": 30,
    "Geometri": 10,
    "Fizik": 14,
    "Kimya": 13,
    "Biyoloji": 13,
    "Edebiyat": 24,
    "Tarih": 10,
    "Coğrafya": 6,
  },
  LGS: {
    "Türkçe": 20,
    "Matematik": 20,
    "Fen Bilimleri": 20,
    "İnkılap Tarihi": 10,
    "Din Kültürü": 10,
    "İngilizce": 10,
  },
};

// AYT'de öğrencinin alanına göre girdiği dersler. TYT herkes için aynıdır.
// (SÖZ için Tarih-2/Coğrafya-2/Felsefe/Din AYT dersleri müfredatta olmadığından
//  şimdilik tanımlı değil — eklenirse buraya yazılır.)
export const AYT_ALAN_DERSLERI = {
  sayisal:      ["Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji"],
  esit_agirlik: ["Matematik", "Geometri", "Edebiyat", "Tarih", "Coğrafya"],
};

// Alan tercihine göre AYT ders listesini süzer; alan bilinmiyorsa hepsi gösterilir.
export function alanaGoreSuz(examType, dersler, alan) {
  if (examType !== "AYT") return dersler;
  const izinli = AYT_ALAN_DERSLERI[alan];
  return izinli ? dersler.filter(d => izinli.includes(d)) : dersler;
}

// Bir dersin soru sayısı (tanımsızsa null → sınır uygulanmaz)
export const soruLimiti = (examType, ders) => EXAM_LIMITS[examType]?.[ders] ?? null;

// Sınav türünün toplam soru sayısı
export const toplamSoru = (examType) =>
  Object.values(EXAM_LIMITS[examType] ?? {}).reduce((s, n) => s + n, 0);
