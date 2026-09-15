// Program kütüphanesindeki bir programı haftalık çalışma planına çevirme.
//
// Program yapısı: { weeks: [{ week, title, days: [{ gun, dersler: [...] }] }] }
// days her zaman PAZARTESİ'den PAZAR'a 7 gün; plan bloğunun gun alanı
// (0 = Pazartesi) günün SIRASINDAN geliyor, adından değil — eski hazır
// programlarda gün adları bozuk yazılmış ("SALI", "ÇARŞAMBA").
//
// Bu dosya saf: veritabanına dokunmuyor, Node'da sınanabiliyor.

const DK_UST = 1440;

// "2 sa" → 120, "2.5 sa" → 150, "1,5 saat" → 90, "135 dk" → 135,
// "1 sa 30 dk" → 90, "45" → 45, "—" → null.
//
// Görev dönüşümündeki eski ayrıştırıcı "2 sa"yı 2 DAKİKA, "2.5 sa"yı
// 25 dakika okuyordu (yalnızca "saat" kelimesini tanıyor, noktayı
// siliyordu). Hazır programların tamamı "sa" ile yazılmış.
export function sureDakika(metin) {
  if (metin == null) return null;
  if (typeof metin === "number") {
    return metin > 0 && metin <= DK_UST ? Math.round(metin) : null;
  }
  const s = String(metin).toLocaleLowerCase("tr").replace(/,/g, ".");
  const re = /(\d+(?:\.\d+)?)\s*(saat|sa|dakika|dak|dk)?/g;
  let toplam = 0;
  let bulundu = false;
  let m;
  while ((m = re.exec(s)) !== null) {
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const saat = m[2] === "saat" || m[2] === "sa";
    toplam += saat ? n * 60 : n;
    bulundu = true;
  }
  if (!bulundu) return null;
  const dk = Math.round(toplam);
  return dk > 0 && dk <= DK_UST ? dk : null;
}

const kucuk = (s) => String(s ?? "").trim().toLocaleLowerCase("tr");
const RESIMLI = /\p{Extended_Pictographic}/u;

// Programdaki ders adını müfredattaki adla eşle. Hazır programlar
// "FİZİK" yazıyor, müfredat "Fizik"; ikisi aynı ders sayılmazsa öneri
// motoru plandaki çalışmayı o dersin konusuna yazamıyor.
// Eşleşme yoksa: emoji içeren etiket (📝 DENEME, 🔁 TEKRAR) ders değil → null;
// düz yazıysa koçun yazdığı ad olduğu gibi kalıyor.
export function dersEsle(ders, bilinenDersler = []) {
  const d = String(ders ?? "").trim();
  if (!d) return null;
  const esit = bilinenDersler.find(x => kucuk(x) === kucuk(d));
  if (esit) return esit;
  if (RESIMLI.test(d)) return null;
  return d;
}

// Tek bir program satırı → blok alanları (plan_id ve sira hariç).
export function satirBlogu(satir, gun, { dilim = "aksam", bilinenDersler = [] } = {}) {
  const konu = satir.konu?.trim() || null;
  const ders = dersEsle(satir.ders, bilinenDersler);
  const baslik = satir.baslik?.trim() || konu || satir.ders?.trim() || "";
  if (!baslik) return null;

  // Ders + konu varsa konu çalışması; deneme, tekrar, dinlenme gibi
  // satırlar serbest blok. Serbest blokta ders/konu tutulmuyor: plan
  // geçmişi öneri motoruna ders+konu anahtarıyla gidiyor, "🔁 TEKİ" bir
  // ders gibi oraya düşmesin.
  const konuMu = !!(ders && konu);

  // Öncelikten yalnızca "kritik" taşınıyor. Düzenleyicinin varsayılanı
  // 🟠 olduğu için hepsini yazmak her bloğun notunu aynı simgeyle
  // doldururdu.
  const not = [satir.oncelik === "🔴" ? "🔴" : null, satir.aciklama?.trim() || null]
    .filter(Boolean).join(" ");

  return {
    gun,
    dilim,
    tur: konuMu ? "konu" : "serbest",
    baslik,
    ders: konuMu ? ders : null,
    konu: konuMu ? konu : null,
    sure_dk: sureDakika(satir.sure),
    aciklama: not || null,
  };
}

// Programın bir haftası → blok listesi, gün ve satır sırasıyla.
export function haftaBloklari(hafta, secenek = {}) {
  const bloklar = [];
  (hafta?.days ?? []).slice(0, 7).forEach((g, gi) => {
    (g?.dersler ?? []).forEach(satir => {
      const b = satirBlogu(satir, gi, secenek);
      if (b) bloklar.push(b);
    });
  });
  return bloklar;
}

// Programdan hangi haftalar alınacak: baslangicNo'dan itibaren adet kadar,
// programın sonunu aşmadan. Hafta numarası değil sırası esas — silinmiş
// haftadan sonra numaralar yeniden verilse de eski kayıtlar bozuk olabilir.
export function secilenHaftalar(icerik, baslangicNo = 1, adet = 1) {
  const haftalar = icerik?.weeks ?? [];
  const i = Math.max(0, haftalar.findIndex(w => w.week === baslangicNo));
  return haftalar.slice(i, i + Math.max(1, adet));
}

// Aynı blok ikinci kez eklenmesin. Koç aktarımı iki kez çalıştırırsa ya da
// programın bir haftasını zaten eklemişse, plan kopyalarla dolmasın.
// Anahtar dilimi İÇERMİYOR: koç aktarılan bloğu akşamdan sabaha
// sürüklediyse o blok hâlâ "planda var" sayılmalı.
const blokAnahtari = (b) =>
  [b.gun, kucuk(b.baslik), kucuk(b.ders), kucuk(b.konu)].join("|");

// mevcut: plandaki bloklar ({ gun, dilim, sira, baslik, ders, konu })
// yeni:   eklenecek bloklar (sira yok)
// Dönüş:  { eklenecek: sira verilmiş bloklar, atlanan: sayı }
// Sıra: hücrenin en büyük sırasının arkasına, 1000 aralıkla — sürükle-bırak
// orta nokta hesabına yer kalsın.
export function eklenecekBloklar(mevcut = [], yeni = []) {
  const var_ = new Set(mevcut.map(blokAnahtari));
  const enBuyuk = new Map();
  mevcut.forEach(b => {
    const h = `${b.gun}|${b.dilim}`;
    enBuyuk.set(h, Math.max(enBuyuk.get(h) ?? 0, Number(b.sira) || 0));
  });

  const eklenecek = [];
  let atlanan = 0;
  yeni.forEach(b => {
    const a = blokAnahtari(b);
    if (var_.has(a)) { atlanan += 1; return; }
    var_.add(a);   // aynı aktarım içindeki tekrar da tek sayılsın
    const h = `${b.gun}|${b.dilim}`;
    const sira = (enBuyuk.get(h) ?? 0) + 1000;
    enBuyuk.set(h, sira);
    eklenecek.push({ ...b, sira });
  });
  return { eklenecek, atlanan };
}

// Önizleme: haftanın günlerine düşen blok sayıları (Pzt..Paz).
export function gunDagilimi(bloklar = []) {
  const d = [0, 0, 0, 0, 0, 0, 0];
  bloklar.forEach(b => { if (b.gun >= 0 && b.gun <= 6) d[b.gun] += 1; });
  return d;
}
