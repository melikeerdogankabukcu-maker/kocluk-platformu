// Seviye ve avatar mantığı.
// XP veritabanında hesaplanır (ogrenci_puan RPC); burada yalnızca XP'nin
// seviyeye ve avatar aşamasına çevrilmesi var.

// Seviye eşiği: 25*(n-1)*n → 0, 50, 150, 300, 500, 750, 1050, 1400, 1800, 2250...
// Artan aralık: her seviye bir öncekinden 50 XP daha pahalı.
// (SQL'deki seviye rozetleri de bu formülü kullanır — değiştirilirse ikisi
//  birlikte güncellenmeli.)
export const seviyeEsigi = (n) => 25 * (n - 1) * n;

export function seviyeHesapla(xp = 0) {
  let n = 1;
  while (seviyeEsigi(n + 1) <= xp) n++;
  const bu    = seviyeEsigi(n);
  const sonra = seviyeEsigi(n + 1);
  const araToplam = sonra - bu;
  return {
    seviye: n,
    xp,
    buSeviyeBasi: bu,
    sonrakiEsik: sonra,
    kalan: sonra - xp,
    ilerleme: araToplam > 0 ? Math.min(Math.round(((xp - bu) / araToplam) * 100), 100) : 0,
  };
}

// Avatar türleri — her biri 6 aşamada evrilir. Öğrenci hangisini büyüteceğini seçer.
export const AVATAR_TURLERI = {
  agac: {
    ad: "Ağaç", aciklama: "Tohumdan zirveye",
    asamalar: [
      { emoji: "🌱", ad: "Fide" },   { emoji: "🌿", ad: "Filiz" },
      { emoji: "🪴", ad: "Fidan" },  { emoji: "🌳", ad: "Ağaç" },
      { emoji: "🌲", ad: "Çınar" },  { emoji: "🏆", ad: "Zirve" },
    ],
  },
  kus: {
    ad: "Kuş", aciklama: "Yumurtadan kartala",
    asamalar: [
      { emoji: "🥚", ad: "Yumurta" }, { emoji: "🐣", ad: "Civciv" },
      { emoji: "🐤", ad: "Yavru" },   { emoji: "🕊️", ad: "Kanatlanan" },
      { emoji: "🦅", ad: "Kartal" },  { emoji: "👑", ad: "Zirvedeki" },
    ],
  },
  uzay: {
    ad: "Uzay", aciklama: "Kıvılcımdan galaksiye",
    asamalar: [
      { emoji: "✨", ad: "Kıvılcım" }, { emoji: "🌠", ad: "Meteor" },
      { emoji: "🚀", ad: "Roket" },    { emoji: "🛰️", ad: "Uydu" },
      { emoji: "🪐", ad: "Gezegen" },  { emoji: "🌌", ad: "Galaksi" },
    ],
  },
};

// Seviye → avatar aşaması (her 2 seviyede bir evrilir, 6 aşamada tavan yapar)
export const asamaIndeksi = (seviye) => Math.min(Math.floor((seviye - 1) / 2), 5);

export function avatarDurumu(tur, seviye) {
  const t = AVATAR_TURLERI[tur] ?? AVATAR_TURLERI.agac;
  const i = asamaIndeksi(seviye);
  return {
    tur: t,
    asama: t.asamalar[i],
    asamaIndeks: i,
    sonAsama: i >= t.asamalar.length - 1,
    // Bir sonraki evrim hangi seviyede
    sonrakiEvrim: i >= 5 ? null : (i + 1) * 2 + 1,
  };
}

// XP kırılımının okunabilir etiketleri (kaynak: ogrenci_puan RPC)
export const XP_ETIKET = {
  gorev:         { ad: "Tamamlanan görev", puan: 10 },
  test:          { ad: "Test kaydı",       puan: 5  },
  odev:          { ad: "Onaylanan ödev",   puan: 15 },
  sinav:         { ad: "Deneme sınavı",    puan: 20 },
  ders:          { ad: "Yapılan ders",     puan: 10 },
  program_adimi: { ad: "Program adımı",    puan: 8  },
  rozet:         { ad: "Rozet",            puan: 25 },
  net_artisi:    { ad: "Net artışı",       puan: 30 },
};
