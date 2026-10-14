// Hazır avatarlar.
//
// ── NEDEN FOTOĞRAF DEĞİL DE SİMGE ───────────────────────────────
// Kullanıcıların çoğu 18 yaş altı. Profil fotoğrafı yüklemek zaten
// mümkün (student_profiles.photo_url) ama herkesin yüklemek istemesi
// beklenmez; istemeyenin elinde yalnızca baş harfler kalıyordu.
// Hazır simge, kimliğini açmadan kişiselleştirme imkânı veriyor —
// ve çocuk gizliliği açısından fotoğraftan iyisi.
//
// ── NEDEN EMOJİ, NEDEN GÖRSEL DOSYASI DEĞİL ─────────────────────
// Görsel dosyası demek: üretmek, depolamak, imzalı adresle sunmak ve
// her yeni avatar için dağıtım. Emoji her cihazda var, bedava geliyor,
// ölçeklenebiliyor ve depo gerektirmiyor. Platformlar arasında çizim
// farkı var ama hepsinde TANINIYOR — bu iş için yeterli.
//
// Seçki bilerek "sınav koçluğu" tonunda: oyuncak değil, çocukça değil.
export const AVATARLAR = [
  { kod: "baykus",   simge: "🦉", ad: "Baykuş" },
  { kod: "pusula",   simge: "🧭", ad: "Pusula" },
  { kod: "roket",    simge: "🚀", ad: "Roket" },
  { kod: "kitap",    simge: "📚", ad: "Kitap" },
  { kod: "hedef",    simge: "🎯", ad: "Hedef" },
  { kod: "filiz",    simge: "🌱", ad: "Filiz" },
  { kod: "yildiz",   simge: "⭐", ad: "Yıldız" },
  { kod: "dag",      simge: "⛰️", ad: "Dağ" },
  { kod: "teleskop", simge: "🔭", ad: "Teleskop" },
  { kod: "satranc",  simge: "♟️", ad: "Satranç" },
];

// Koddan simgeye. Tanınmayan kod (eski kayıt, elle düzenlenmiş satır)
// null dönüyor; çağıran baş harflere düşüyor.
export const avatarSimgesi = (kod) =>
  AVATARLAR.find(a => a.kod === kod)?.simge ?? null;
