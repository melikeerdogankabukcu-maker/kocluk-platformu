// Soruların öğrenciye açılabilirliği.
//
// Etiketler bilerek açık sözlü: "kapalı pilot"un izinli OLMADIĞI
// arayüzde de yazılı dursun.
//
// ── SON SÖZ VERİTABANINDA ───────────────────────────────────────
// Asıl denetim `banka_ogrenciye_sunulabilir_mi()` içinde: hem soru
// listesi hem sayfa fotoğraflarının depo izni oradan geçiyor. Buradaki
// liste arayüzün aynı kuralı KULLANICIYA SÖYLEYEBİLMESİ için var —
// "onaylı ama kapalı" durumunu koça anlatmanın başka yolu yok. İki
// yerde olması tekrar değil iş bölümü; ayrışmasın diye tek dosyada.
export const HAK_DURUMU = [
  { kod: "deneme",       ad: "Deneme (öğrenciye kapalı)", acik: false },
  { kod: "kapali_pilot", ad: "Kapalı pilot — izin yok, yalnız kendi öğrencilerim", acik: true },
  { kod: "izinli",       ad: "Yayınevi izni var", acik: true },
  { kod: "kendi",        ad: "Kendi/kurum sorularım", acik: true },
  { kod: "acik",         ad: "Kamuya açık (ÖSYM çıkmış vb.)", acik: true },
];

// Bilinmeyen kod öğrenciye KAPALI sayılıyor: yeni bir durum eklenip
// burası güncellenmezse telif kilidi sessizce açılmasın.
export function ogrenciyeAcik(kod) {
  return HAK_DURUMU.find(h => h.kod === (kod ?? "deneme"))?.acik === true;
}

export function hakDurumuAdi(kod) {
  return HAK_DURUMU.find(h => h.kod === (kod ?? "deneme"))?.ad ?? "bilinmiyor";
}
