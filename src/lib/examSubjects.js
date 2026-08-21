// Müfredatı olmayan sınav türlerinin ders listeleri.
// TYT/AYT/LGS/KPSS/DGS dersleri veritabanındaki exam_topics tablosundan
// gelir (bkz. TopicsContext); burada yalnızca müfredatı olmayan türler tutulur.
// LGS artık exam_topics'te de var; burada YEDEK olarak duruyor — veritabanı
// okunamazsa (TopicsContext koddaki listeye düşer) LGS dersleri kaybolmasın.
export const STATIK_DERSLER = {
  LGS:           ["Türkçe", "Matematik", "Fen Bilimleri", "İnkılap Tarihi", "Din Kültürü", "İngilizce"],
  "Okul Sınavı": [],
};

// Derslerin SINAVDAKİ oturum sırası.
//
// Veritabanı sorgusu dersleri alfabetik döndürüyor; sınav sonucu girerken
// öğretmen kâğıttaki sırayı takip edemiyordu (TYT alfabetik "Biyoloji,
// Coğrafya, Din Kültürü..." ile başlıyordu, oysa sınavda Türkçe ilk).
// Burada gerçek oturum sırası tanımlı.
//
// Listede olmayan bir ders (öğretmenin kendi eklediği) sona alfabetik eklenir.
export const DERS_SIRASI = {
  // 1) Türkçe 40 · 2) Sosyal 20 · 3) Temel Matematik 40 · 4) Fen 20
  TYT: ["Türkçe",
        "Tarih", "Coğrafya", "Felsefe", "Din Kültürü",
        "Matematik", "Geometri",
        "Fizik", "Kimya", "Biyoloji"],

  // 1) Matematik 40 · 2) Fen 40 · 3) Edebiyat–Sosyal-1 40
  AYT: ["Matematik", "Geometri",
        "Fizik", "Kimya", "Biyoloji",
        "Edebiyat", "Tarih", "Coğrafya"],

  // 1) Sözel oturum · 2) Sayısal oturum
  LGS: ["Türkçe", "İnkılap Tarihi", "Din Kültürü", "İngilizce",
        "Matematik", "Fen Bilimleri"],

  // Genel Yetenek (Türkçe, Matematik) → Genel Kültür (Tarih, Coğrafya,
  // Vatandaşlık) → ayrı oturumdaki Eğitim Bilimleri
  KPSS: ["Türkçe", "Matematik", "Geometri",
         "Tarih", "Coğrafya", "Vatandaşlık",
         "Eğitim Bilimleri"],

  // Sayısal bölüm → sözel bölüm. Mantık iki bölüme de yayıldığı için sonda.
  DGS: ["Matematik", "Geometri", "Türkçe", "Mantık"],
};

// Dersleri sınav sırasına dizer. Sırada tanımlı olmayanlar (öğretmenin
// kendi eklediği dersler) sona alfabetik eklenir — böylece yeni ders
// eklendiğinde liste bozulmuyor, yalnızca sona iniyor.
export function dersleriSirala(examType, dersler) {
  const sira = DERS_SIRASI[examType];
  if (!sira) return [...dersler].sort((a, b) => a.localeCompare(b, "tr"));
  const bilinen = sira.filter(d => dersler.includes(d));
  const digerleri = dersler
    .filter(d => !sira.includes(d))
    .sort((a, b) => a.localeCompare(b, "tr"));
  return [...bilinen, ...digerleri];
}
