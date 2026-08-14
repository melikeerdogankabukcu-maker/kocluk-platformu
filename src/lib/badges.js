// Rozet tanımları. Rozetler veritabanında tetikleyicilerle veriliyor
// (bkz. program_rozet_migration.sql → rozetleri_guncelle); burada yalnızca
// gösterim bilgileri var. Kod eşleşmesi SQL'deki rozet_ver çağrılarıyla birebir.
export const ROZETLER = {
  ilk_gorev:     { ad: "İlk Adım",          emoji: "🌱", aciklama: "İlk görevini tamamladın",                grup: "Görev" },
  gorev_10:      { ad: "Düzenli",           emoji: "📋", aciklama: "10 görev tamamladın",                    grup: "Görev" },
  gorev_50:      { ad: "Azimli",            emoji: "🏋️", aciklama: "50 görev tamamladın",                    grup: "Görev" },
  gorev_100:     { ad: "Yılmaz",            emoji: "💪", aciklama: "100 görev tamamladın",                   grup: "Görev" },
  ilk_test:      { ad: "Deneme Başlangıcı", emoji: "🧪", aciklama: "İlk test kaydını girdin",                grup: "Test" },
  test_25:       { ad: "Soru Avcısı",       emoji: "🎯", aciklama: "25 test kaydı girdin",                   grup: "Test" },
  test_100:      { ad: "Soru Ustası",       emoji: "🏹", aciklama: "100 test kaydı girdin",                  grup: "Test" },
  odev_5:        { ad: "Ödevci",            emoji: "📎", aciklama: "5 ödevin onaylandı",                     grup: "Ödev" },
  odev_20:       { ad: "Titiz",             emoji: "🧾", aciklama: "20 ödevin onaylandı",                    grup: "Ödev" },
  ders_10:       { ad: "Sadık Öğrenci",     emoji: "🤝", aciklama: "10 birebir derse katıldın",              grup: "Ders" },
  ilk_sinav:     { ad: "İlk Deneme",        emoji: "📊", aciklama: "İlk deneme sınavın girildi",             grup: "Sınav" },
  sinav_10:      { ad: "Deneme Maratonu",   emoji: "🏃", aciklama: "10 deneme sınavı girildi",               grup: "Sınav" },
  net_artis:     { ad: "Yükseliş",          emoji: "📈", aciklama: "Netini bir önceki denemeye göre artırdın", grup: "Sınav" },
  net_artis_10:  { ad: "Sıçrama",           emoji: "🚀", aciklama: "Netini 10 puandan fazla artırdın",       grup: "Sınav" },
  net_50:        { ad: "50 Net",            emoji: "🥉", aciklama: "Bir denemede 50 nete ulaştın",           grup: "Sınav" },
  net_75:        { ad: "75 Net",            emoji: "🥈", aciklama: "Bir denemede 75 nete ulaştın",           grup: "Sınav" },
  net_100:       { ad: "100 Net",           emoji: "🥇", aciklama: "Bir denemede 100 nete ulaştın",          grup: "Sınav" },
  hafta_tamam:   { ad: "Haftayı Bitirdin",  emoji: "🗓️", aciklama: "Çalışma programında bir haftayı tamamladın", grup: "Program" },
  hafta_4:       { ad: "Dört Hafta Aralıksız", emoji: "🔥", aciklama: "Programda 4 haftayı tamamladın",      grup: "Program" },
  program_tamam: { ad: "Program Bitti",     emoji: "🏆", aciklama: "Çalışma programının tamamını bitirdin",  grup: "Program" },
  seviye_5:      { ad: "Seviye 5",          emoji: "⭐", aciklama: "5. seviyeye ulaştın",                     grup: "Seviye" },
  seviye_10:     { ad: "Seviye 10",         emoji: "🌟", aciklama: "10. seviyeye ulaştın",                    grup: "Seviye" },
};

export const rozetBilgi = (kod) =>
  ROZETLER[kod] ?? { ad: kod, emoji: "🏅", aciklama: "", grup: "Diğer" };

export const tumRozetler = () =>
  Object.entries(ROZETLER).map(([kod, r]) => ({ kod, ...r }));
