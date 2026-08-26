// Tasarım belirteçleri.
//
// Ölçüm: kod tabanında 144 farklı hex renk, 24 farklı fontSize ve 15
// farklı borderRadius elle yazılmış durumda. Aynı gri (#aaa) 116 yerde,
// aynı çizgi rengi (#f0ede8) 125 yerde tekrarlanıyor. Bir rengi
// değiştirmek yüz küsur yeri elle bulmak demekti.
//
// Buradaki değerler MEVCUT görünümden çıkarıldı, yeni bir palet
// uydurulmadı: amaç görünümü değiştirmek değil, dağınıklığı toplamak.
// Yeni yazılan her bileşen bunları kullanıyor; eskiler kademeli
// taşınıyor.

export const RENK = {
  zemin:      "#f7f4ef",   // sayfa arka planı
  kart:       "#fff",
  yuzey:      "#fafaf8",   // kart içi hafif bölge (satırlar, listeler)
  cizgi:      "#f0ede8",
  cizgiSolgun:"#f5f2ee",

  metin:        "#222",
  metinBaslik:  "#111",
  metinIkincil: "#666",
  metinSoluk:   "#888",
  metinCokSoluk:"#aaa",
  metinSilik:   "#bbb",

  // Durum renkleri — hep çift olarak kullanılıyor (zemin + yazı)
  basari: { zemin: "#E8F9F0", metin: "#1A6B3C" },
  uyari:  { zemin: "#FFF7E6", metin: "#854F0B" },
  hata:   { zemin: "#FFF0F0", metin: "#A32D2D" },
  bilgi:  { zemin: "#EAF1FE", metin: "#3763C4" },
  mor:    { zemin: "#F8F3FC", metin: "#7a5c92" },   // testler
};

// Boşluklar 4'ün katları. Önceden 3, 5, 6, 7, 9, 11, 13, 14, 18, 20
// gibi rastgele değerler vardı ve kartlar birbirini tutmuyordu.
export const BOSLUK = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28 };

// Köşe yuvarlaklıkları — 15 farklı değer vardı
export const KOSE = { s: 8, m: 10, l: 14, kart: 16, tam: 999 };

// Yazı ölçeği. Mevcut yarım puntolu merdiven (9 / 9.5 / 10 / 10.5 / 11 /
// 11.5 / 12 / 12.5 / 13) yedi kademeye indiriliyor. Boyutlar BİLEREK
// büyütülmedi: kullanıcı okunabilirlikten değil dağınıklıktan şikâyetçi,
// ve toplu büyütme dar ekranlarda taşma riski taşıyor.
export const YAZI = {
  mikro:   10,   // rozet, en alt etiket
  kucuk:   11,
  ikincil: 12,
  govde:   13,
  vurgu:   14,   // kart başlığı
  baslik:  16,
  buyuk:   20,
};

// Sayfanın iki bloğa ayrıldığı eşik. Altında tek sütun.
export const IKI_BLOK_ESIGI = 1040;
