// Roller bazında uygulama renk paleti — TopBar ve dashboard'lar arasında paylaşılır.
export const COLORS = {
  student: { bg: "#0F6E56", light: "#E1F5EE", mid: "#1D9E75", text: "#085041" },
  teacher: { bg: "#534AB7", light: "#EEEDFE", mid: "#7F77DD", text: "#3C3489" },
  parent:  { bg: "#854F0B", light: "#FAEEDA", mid: "#BA7517", text: "#633806" },
};

// Admin, öğretmenin ÜST KÜMESİ: koçluk yapar, ayrıca ortak müfredatı yönetir.
// Aynı paneli ve paleti kullanıyor — ayrı bir görünüm gerekmiyor, ayrı palet
// tanımlansa COLORS[role] her yerde ikinci bir dala ihtiyaç duyardı.
COLORS.admin = COLORS.teacher;

// ── SEÇİLEBİLİR PALETLER ────────────────────────────────────────
// Kişiselleştirmenin tamamı BU DOSYADA biter: panel renkleri tek
// yerden geliyor ve bileşenlere `c` olarak taşınıyor. Bu yüzden
// kullanıcıya renk seçtirmek, dağınık bir temalandırma işi değil —
// yalnız `c`nin nereden çözüldüğünü değiştirmek.
//
// KAPSAM BİLEREK DAR: değişen şey panelin vurgu rengi. Tam tema
// (karanlık mod, zemin/kart renkleri) BU İŞİN İÇİNDE DEĞİL; kod
// tabanında hâlâ elle yazılmış yüzden fazla hex var ve onları
// toplamak haftalara mal olur (bkz. tasarim.js).
//
// Her palet aynı dört tonu taşıyor, çünkü bileşenler bu dördünü
// bekliyor:
//   bg    koyu zemin (üzerine BEYAZ yazı yazılıyor)
//   light çok açık zemin (üzerine koyu yazı)
//   mid   vurgu (çizgi, ikincil düğme, başlık rengi)
//   text  açık zemin üzerine koyu yazı
// Yeni palet eklerken bu ilişki korunmalı, yoksa okunurluk bozulur.
export const PALETLER = {
  okyanus:  { ad: "Okyanus",  ...COLORS.student },
  menekse:  { ad: "Menekşe",  ...COLORS.teacher },
  kehribar: { ad: "Kehribar", ...COLORS.parent },
  gece:     { ad: "Gece",     bg: "#1E3A5F", light: "#E7EEF6", mid: "#3D6B9E", text: "#13273F" },
  orman:    { ad: "Orman",    bg: "#2F5D3A", light: "#E8F3EA", mid: "#4E8A5E", text: "#1F3E27" },
  gul:      { ad: "Gül",      bg: "#9B2C52", light: "#FBE9EF", mid: "#C4517B", text: "#6B1C38" },
  kiremit:  { ad: "Kiremit",  bg: "#9A4A24", light: "#FBEDE5", mid: "#C47446", text: "#6B3218" },
};

// Rolün varsayılanı + kullanıcının seçimi → kullanılacak palet.
// Seçim yoksa ya da tanınmayan bir kod geldiyse (eski kayıt, elle
// düzenlenmiş satır) rolün kendi paleti kalıyor: panel renksiz
// kalmaktansa varsayılanla açılsın.
export function paletCoz(rol, temaKodu) {
  return PALETLER[temaKodu] ?? COLORS[rol] ?? COLORS.student;
}
