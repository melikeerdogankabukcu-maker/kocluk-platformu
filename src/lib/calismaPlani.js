// Haftalık çalışma planı — saf yardımcılar (veritabanı yok, React yok).
//
// Burada duran her şey Node'da sınanabiliyor: video adresi çözümleme,
// sıra hesabı, hafta başı. Arayüzdeki sürükle-bırak yalnızca bu
// fonksiyonların sonuçlarını veritabanına yazıyor.

export const GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
export const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export const DILIMLER = [
  { kod: "sabah", ad: "Sabah" },
  { kod: "ogle",  ad: "Öğleden sonra" },
  { kod: "aksam", ad: "Akşam" },
];

export const TURLER = {
  konu:    { ad: "Konu çalışması", simge: "📘" },
  kaynak:  { ad: "Soru bankası",   simge: "📕" },
  video:   { ad: "Konu videosu",   simge: "▶️" },
  serbest: { ad: "Tekrar / serbest", simge: "✏️" },
};

const GUN_MS = 86400000;

// Yerel tarih → "YYYY-MM-DD". toISOString UTC'ye çeviriyor ve Türkiye
// saatinde gece yarısından sonraki üç saatte günü bir geri kaydırıyor.
export const tarihMetni = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Verilen tarihin haftasının PAZARTESİ'si. Pazar haftanın SONU sayılıyor.
export function haftaBasi(tarih = new Date()) {
  const d = new Date(tarih);
  d.setHours(0, 0, 0, 0);
  const gun = d.getDay();                       // 0 = Pazar
  d.setDate(d.getDate() - (gun === 0 ? 6 : gun - 1));
  return d;
}

export const haftaKaydir = (pazartesi, hafta) => {
  const d = new Date(pazartesi);
  d.setDate(d.getDate() + hafta * 7);
  return d;
};

// 0 = Pazartesi. Bugünün plandaki gün indeksi.
export const bugununGunu = (tarih = new Date()) => (tarih.getDay() + 6) % 7;

export function haftaAraligiMetni(pazartesi) {
  const pazar = new Date(pazartesi.getTime() + 6 * GUN_MS);
  const ayni = pazartesi.getMonth() === pazar.getMonth();
  const bas = pazartesi.toLocaleDateString("tr-TR", ayni ? { day: "numeric" } : { day: "numeric", month: "long" });
  const son = pazar.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  return `${bas} – ${son}`;
}

// ── VİDEO ADRESİ ────────────────────────────────────────────────
// Üç sonuç:
//   youtube → gömülü oynatıcı (youtube-nocookie)
//   vimeo   → gömülü oynatıcı (dnt=1)
//   baglanti → tanınmayan ama geçerli bir adres; yeni sekmede açılıyor.
//              "Başka bir sistemle entegre edilebilecek video" isteği
//              bu dal: bir LMS ya da kurs platformu bağlantısı da
//              blok olabiliyor, uygulamanın onu tanıması gerekmiyor.
//   gecersiz → http(s) değil. "javascript:" gibi değerler bağlantı
//              olarak basıldığında tıklayanın oturumunda kod çalıştırır;
//              veritabanı da aynı kuralı reddediyor.
//
// youtube-nocookie: standart youtube.com gömmesi, video oynatılmasa bile
// sayfa açılır açılmaz izleme çerezleri bırakıyor. Kullanıcıların bir
// kısmı reşit değil; nocookie alan adı oynatma başlayana kadar çerez
// bırakmıyor.
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function saniyeCoz(t) {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(t);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

export function videoCoz(adres) {
  const ham = (adres ?? "").trim();
  if (!ham) return { tur: "bos" };
  let u;
  try { u = new URL(ham); } catch { return { tur: "gecersiz" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { tur: "gecersiz" };

  const host = u.hostname.replace(/^www\.|^m\./, "").toLowerCase();

  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = null;
    if (host === "youtu.be") {
      id = u.pathname.slice(1).split("/")[0];
    } else if (u.pathname === "/watch") {
      id = u.searchParams.get("v");
    } else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
      if (m) id = m[1];
    }
    if (id && YT_ID.test(id)) {
      const bas = saniyeCoz(u.searchParams.get("t") ?? u.searchParams.get("start"));
      const q = new URLSearchParams({ rel: "0" });
      if (bas) q.set("start", String(bas));
      return {
        tur: "youtube", id, bas,
        gomme: `https://www.youtube-nocookie.com/embed/${id}?${q}`,
        kapak: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        adres: ham,
      };
    }
    // YouTube alan adı ama video kimliği yok (kanal, oynatma listesi):
    // gömülemez, bağlantı olarak açılıyor.
    return { tur: "baglanti", adres: ham, host };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = /\/(?:video\/)?(\d{6,})/.exec(u.pathname);
    if (m) {
      return { tur: "vimeo", id: m[1], gomme: `https://player.vimeo.com/video/${m[1]}?dnt=1`, adres: ham };
    }
    return { tur: "baglanti", adres: ham, host };
  }

  return { tur: "baglanti", adres: ham, host };
}

// ── SIRA ────────────────────────────────────────────────────────
// Bir hücredeki blokları sıraya dizer.
export const hucreBloklari = (bloklar, gun, dilim) =>
  bloklar
    .filter(b => b.gun === gun && b.dilim === dilim)
    .sort((a, b) => a.sira - b.sira);

const ADIM = 1000;

// Taşınan bloğun yeni sırası.
//   onceki: hedef hücredeki, taşınan HARİÇ, sıralı bloklar
//   hedefId: üstüne bırakılan blok (onun ÖNÜNE girer); null = hücre sonu
//
// Orta nokta: tek satır güncelleniyor, kardeşlere dokunulmuyor.
// Aralık iyice daraldığında (aynı iki blok arasına onlarca kez
// sokuşturma) orta nokta komşusuyla eşitlenebilir; o durumda
// yeniden numaralandırma gerektiği bildiriliyor.
export function yeniSira(onceki, hedefId = null) {
  if (onceki.length === 0) return { sira: ADIM, yenidenNumarala: false };

  if (hedefId == null) {
    return { sira: onceki[onceki.length - 1].sira + ADIM, yenidenNumarala: false };
  }

  const i = onceki.findIndex(b => b.id === hedefId);
  if (i === -1) return { sira: onceki[onceki.length - 1].sira + ADIM, yenidenNumarala: false };

  const sonra = onceki[i].sira;
  const once = i === 0 ? sonra - 2 * ADIM : onceki[i - 1].sira;
  const orta = (once + sonra) / 2;
  const yenidenNumarala = !(orta > once && orta < sonra) || sonra - once < 1e-6;
  return { sira: orta, yenidenNumarala };
}

// Hücrenin tamamını ADIM aralıklarla yeniden numaralar; değişen
// satırları döndürür.
export function yenidenNumarala(sirali) {
  return sirali
    .map((b, i) => ({ ...b, sira: (i + 1) * ADIM }))
    .filter((b, i) => b.sira !== sirali[i].sira);
}

// ── İLERLEME ────────────────────────────────────────────────────
export function ilerleme(bloklar) {
  const toplam = bloklar.length;
  const yapilan = bloklar.filter(b => b.yapildi).length;
  const dakika = bloklar.reduce((s, b) => s + (b.sure_dk || 0), 0);
  const yapilanDakika = bloklar.filter(b => b.yapildi).reduce((s, b) => s + (b.sure_dk || 0), 0);
  return {
    toplam, yapilan,
    oran: toplam ? Math.round((yapilan / toplam) * 100) : null,
    dakika, yapilanDakika,
    devreden: bloklar.filter(b => b.devreden && !b.yapildi).length,
  };
}

export function sureMetni(dk) {
  if (!dk) return "";
  if (dk < 60) return `${dk} dk`;
  const s = Math.floor(dk / 60), d = dk % 60;
  return d ? `${s} sa ${d} dk` : `${s} sa`;
}

// Bloğun tek satırlık alt bilgisi (ders · konu · sayfa · süre)
export function blokAltBilgi(b) {
  const sayfa = b.sayfa_bas
    ? (b.sayfa_son ? `${b.sayfa_bas}–${b.sayfa_son}. sayfa` : `${b.sayfa_bas}. sayfadan`)
    : null;
  return [b.ders, b.tur !== "kaynak" ? b.konu : null, sayfa, sureMetni(b.sure_dk)]
    .filter(Boolean).join(" · ");
}
