// Okuma ataması hesapları — SAF, Node'da sınanabilir.
//
// ── NEDEN AYRI DOSYA ────────────────────────────────────────────
// Tarih aritmetiği sessiz hata üretmeye en müsait yer: bir günlük
// kayma kimsenin fark etmediği bir "gecikti" damgası demek. Burada
// saat dilimi, ay sonu ve sınır günleri sınanıyor.
//
// ── "GECİKTİ" SAKLANMIYOR, HESAPLANIYOR ─────────────────────────
// Veritabanında durum yalnız 'devam' | 'bitti'. Gecikme her bakışta
// yeniden çıkıyor; saklansaydı her gece satırları güncelleyen bir işe
// ihtiyaç olurdu ve o iş çalışmadığı gün ekran yanlış gösterirdi.

// 'YYYY-MM-DD' → yerel gün. new Date('2026-10-31') UTC geceyarısı
// veriyor ve UTC+3'te bir gün kayabiliyor; parçalardan kurmak bunu
// kesin olarak önlüyor.
export function gunCoz(tarih) {
  if (tarih instanceof Date) return new Date(tarih.getFullYear(), tarih.getMonth(), tarih.getDate());
  const m = String(tarih ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export const bugunGun = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const GUN_MS = 86400000;

// İki gün arasındaki tam gün sayısı. Yaz saati geçişlerinde saat
// farkı oluşabildiği için yuvarlanıyor, bölme sonucu kırpılmıyor.
export function gunFarki(a, b) {
  if (!a || !b) return null;
  return Math.round((b - a) / GUN_MS);
}

// Kalan gün. Başlangıç günü SAYILIYOR: "20 günde bitir" denince
// bugün başlayan öğrencinin 20 günü var, 19 değil. Son gün 0 değil 1
// döndürüyor; 0 "süre doldu" demek.
export function kalanGun(baslangic, gunSayisi, bugun = bugunGun()) {
  const bas = gunCoz(baslangic);
  if (!bas || !gunSayisi) return null;
  const gecen = gunFarki(bas, gunCoz(bugun));
  if (gecen == null) return null;
  return gunSayisi - gecen;
}

export const gecikmisMi = (baslangic, gunSayisi, bugun = bugunGun()) => {
  const k = kalanGun(baslangic, gunSayisi, bugun);
  return k != null && k <= 0;
};

// Ekranda yazan metin. Gecikmede sayı POZİTİF gösteriliyor:
// "-3 gün kaldı" diye bir şey okunmuyor.
export function sureMetni(baslangic, gunSayisi, bugun = bugunGun()) {
  const k = kalanGun(baslangic, gunSayisi, bugun);
  if (k == null) return "";
  if (k > 1)  return `${k} gün kaldı`;
  if (k === 1) return "son gün";
  if (k === 0) return "süre doldu";
  return `${-k} gün gecikti`;
}

export function ilerlemeYuzdesi(okunan, toplam) {
  const t = Number(toplam) || 0;
  if (t <= 0) return null;                 // toplam sayfa girilmemiş
  const o = Math.max(0, Number(okunan) || 0);
  return Math.min(100, Math.round((o / t) * 100));
}

// Kalan sayfayı kalan güne bölüyor: koçun ve öğrencinin tek bakışta
// göreceği sayı bu. Süre dolmuşsa kalan gün 1 sayılıyor — sıfıra
// bölmek yerine "hepsi bugün" demek doğru cevap.
export function gunlukHedef(toplam, okunan, baslangic, gunSayisi, bugun = bugunGun()) {
  const t = Number(toplam) || 0;
  if (t <= 0) return null;
  const kalanSayfa = Math.max(0, t - (Number(okunan) || 0));
  if (kalanSayfa === 0) return 0;
  const k = kalanGun(baslangic, gunSayisi, bugun);
  if (k == null) return null;
  return Math.ceil(kalanSayfa / Math.max(1, k));
}

// Öğrenci geride mi? Geçen günün oranı ile okunan sayfanın oranı
// karşılaştırılıyor. Koçun "12 gün kaldı" dışında görmesi gereken şey
// tam olarak bu: geri sayım tek başına ilerlemeyi söylemiyor.
//
// Eşik %15: günlük dalgalanmayı "geride" saymamak için. Bir gün
// okumayan öğrenciyi uyarmak uyarıyı anlamsızlaştırırdı.
export const GERIDE_ESIGI = 0.15;

export function geridemi(toplam, okunan, baslangic, gunSayisi, bugun = bugunGun()) {
  const t = Number(toplam) || 0;
  if (t <= 0 || !gunSayisi) return null;         // ölçülemiyor
  const k = kalanGun(baslangic, gunSayisi, bugun);
  if (k == null) return null;
  const gecenGun = gunSayisi - k;
  if (gecenGun <= 0) return false;               // henüz başlamadı
  const beklenen = Math.min(1, gecenGun / gunSayisi);
  const gercek = Math.min(1, (Number(okunan) || 0) / t);
  return gercek + GERIDE_ESIGI < beklenen;
}
