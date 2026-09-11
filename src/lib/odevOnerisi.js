import { sadelestir } from "./konuEslestir";

// Ödev önerisi motoru.
//
// Girdi: öğrencinin testleri ve görevleri + kitaplıktaki bölümler.
// Çıktı: koça sunulan "şu konudan şu kitabın şu sayfaları" listesi.
//
// ── NEDEN KOÇA ÖNERİ, DOĞRUDAN GÖREV DEĞİL ──────────────────────
// Puanlama az veriyle çalışıyor ve konu eşleştirmesi bulanık. Yanlış
// eşleşmiş bir bölümden doğrudan görev açsaydık öğrenci yanlış
// sayfaları çözer, koç bunu ancak iş bittikten sonra fark ederdi.
// Liste koçun önüne geliyor, o onaylıyor.
//
// ── ÖLÇÜLMEYEN ŞEY ZAYIF SAYILMIYOR ─────────────────────────────
// Bu dosyadaki en önemli kural. Üç soruluk bir testten "doğruluk %33"
// çıkarmak, o konuyu öğrencinin en zayıf konusu ilan etmek demek.
// Doğruluk yalnızca YETERLI_SORU eşiğini geçen konularda hesaplanıyor.
// Altında kalanlar "zayıf" değil, "verisi yok" — ve bu ayrı, meşru bir
// öneri sebebi (hiç çalışılmamış konu), farklı bir etiketle sunuluyor.

// Doğruluk hesaplamak için gereken en az soru sayısı.
export const YETERLI_SORU = 10;

// Bu oranın altındaki doğruluk "zayıf" sayılıyor.
export const ZAYIF_ESIGI = 65;

// Tek bir göreve verilecek en fazla sayfa. Üstündeki bölümler
// dilimleniyor: 44 sayfalık bir bölümü tek ödev olarak vermek,
// öğrencinin hiç başlamamasının en kısa yolu.
export const SAYFA_DILIMI = 12;

// Son bu kadar günde görev atanmış konu yeniden önerilmiyor.
export const TEKRAR_BEKLEME_GUN = 7;

// ── REDDEDİLEN ÖNERİ NE KADAR BEKLER ────────────────────────────
// Koçun elediği bölüm bu süre boyunca yeniden önerilmiyor. Kalıcı
// olarak silinmiyor: "bu konuyu ŞİMDİ vermeyeceğim" ile "bu konuyu
// ASLA vermeyeceğim" aynı şey değil ve öğrencinin durumu iki ay sonra
// değişmiş olabilir. Süre dolunca öneri, o günkü verilere göre yeniden
// değerlendiriliyor.
export const RED_BEKLEME_GUN = 45;

const GUN_MS = 86400000;
const anahtarla = (ders, konu) => `${sadelestir(ders)}||${sadelestir(konu)}`;

// ── ÖĞRENCİNİN KONU DURUMU ──────────────────────────────────────
// Her (ders, konu) için: kaç soru çözmüş, kaçı doğru, kaç görev
// almış, kaçını bitirmiş, en son ne zaman görev almış, açık görevi
// var mı.
export function konuDurumu({ tests = [], tasks = [] }) {
  const harita = new Map();
  const al = (ders, konu) => {
    const a = anahtarla(ders, konu);
    if (!harita.has(a)) {
      harita.set(a, {
        anahtar: a, ders, konu,
        soru: 0, dogru: 0,
        gorevToplam: 0, gorevTamam: 0, acikGorev: false,
        sonAtama: null, gorevBasliklari: [],
      });
    }
    return harita.get(a);
  };

  tests.forEach(t => {
    if (!t.topic) return;
    const d = al(t.subject ?? "", t.topic);
    d.soru  += t.question_count || 0;
    d.dogru += t.correct_count  || 0;
  });

  tasks.forEach(t => {
    if (!t.topic) return;
    const d = al(t.subject ?? "", t.topic);
    d.gorevToplam += 1;
    if (t.is_done) d.gorevTamam += 1;
    else d.acikGorev = true;
    d.gorevBasliklari.push(t.title ?? "");
    // Atama anı: tarihi olan görevde due_date, yoksa oluşturulma.
    const an = t.due_date ? new Date(`${t.due_date}T00:00:00`) : new Date(t.created_at);
    if (!Number.isNaN(an.getTime()) && (!d.sonAtama || an > d.sonAtama)) d.sonAtama = an;
  });

  // Doğruluk YALNIZCA yeterli örneklemde hesaplanıyor; altında null.
  harita.forEach(d => {
    d.dogruluk = d.soru >= YETERLI_SORU ? Math.round((d.dogru / d.soru) * 100) : null;
    d.tamamlanma = d.gorevToplam > 0 ? Math.round((d.gorevTamam / d.gorevToplam) * 100) : null;
  });

  return harita;
}

// Bir bölümün sayfa dilimleri. Bitişi bilinmeyen bölüm tek parça
// kalıyor — kaç sayfa olduğunu bilmeden dilimlemek uydurma olurdu.
export function sayfaDilimleri(bolum, dilim = SAYFA_DILIMI) {
  const bas = bolum.sayfa_bas;
  const son = bolum.sayfa_son;
  if (bas == null) return [{ bas: null, son: null }];
  if (son == null || son < bas) return [{ bas, son: null }];
  const toplam = son - bas + 1;
  if (toplam <= dilim) return [{ bas, son }];
  const parcalar = [];
  for (let p = bas; p <= son; p += dilim) {
    parcalar.push({ bas: p, son: Math.min(p + dilim - 1, son) });
  }
  return parcalar;
}

const sayfaMetni = (bas, son) =>
  bas == null ? "" : son == null ? `${bas}. sayfadan itibaren` : `${bas}–${son}. sayfa`;

// ── DERS DÜZEYİ ─────────────────────────────────────────────────
// Konu düzeyinde ölçüm çoğu zaman yok (öğrenci o konuda hiç test
// çözmemiş). Ama DERS düzeyinde veri olabiliyor: Matematik'te genel
// doğruluğu %45 olan bir öğrencide, hiç dokunulmamış bir Matematik
// konusu, hiç dokunulmamış bir Fizik konusundan daha aciltir.
//
// Bu olmadan bütün "hiç çalışılmamış" konular aynı puanı alıyor,
// sıralama kitaptaki sıraya düşüyor ve HER ÖĞRENCİYE AYNI LİSTE
// çıkıyordu — bir öneri motorunun yapabileceği en işe yaramaz şey.
export function dersDurumu({ tests = [], tasks = [] }) {
  const harita = new Map();
  const al = (ders) => {
    const a = sadelestir(ders);
    if (!harita.has(a)) harita.set(a, { ders, soru: 0, dogru: 0, gorevToplam: 0, gorevTamam: 0 });
    return harita.get(a);
  };
  tests.forEach(t => {
    if (!t.subject) return;
    const d = al(t.subject);
    d.soru += t.question_count || 0;
    d.dogru += t.correct_count || 0;
  });
  tasks.forEach(t => {
    if (!t.subject) return;
    const d = al(t.subject);
    d.gorevToplam += 1;
    if (t.is_done) d.gorevTamam += 1;
  });
  harita.forEach(d => {
    d.dogruluk = d.soru >= YETERLI_SORU ? Math.round((d.dogru / d.soru) * 100) : null;
    d.tamamlanma = d.gorevToplam > 0 ? Math.round((d.gorevTamam / d.gorevToplam) * 100) : null;
  });
  return harita;
}

// Dersin "aciliyet" katkısı, 0–30 arası. Ölçüm yoksa 0 —
// bilinmeyeni kötü varsaymıyoruz.
function dersAciliyeti(d) {
  if (!d) return 0;
  if (d.dogruluk != null) return Math.max(0, Math.min(30, (100 - d.dogruluk) * 0.3));
  if (d.tamamlanma != null) return Math.max(0, Math.min(15, (100 - d.tamamlanma) * 0.15));
  return 0;
}

// ── ÖNERİ ÜRETİMİ ───────────────────────────────────────────────
export function oneriUret({
  bolumler = [],        // soru_bankasi_bolumleri satırları
  bankalar = [],        // soru_bankalari satırları
  tests = [], tasks = [],
  agirliklar = {},      // { "ders||konu": sayı } — isteğe bağlı öncelik çarpanı
  konuSirasi = {},      // { "ders||konu": müfredattaki sıra } — eşitlik bozucu
  kararlar = {},        // { bolumId: { karar: "kabul"|"red", created_at } }
  adet = 5,
  baslangic = new Date(),
  gunAraligi = 1,
} = {}) {
  const durum = konuDurumu({ tests, tasks });
  const dersler = dersDurumu({ tests, tasks });
  const bankaHarita = new Map(bankalar.map(b => [b.id, b]));
  const simdi = Date.now();

  const adaylar = [];
  let redEdilen = 0;                                 // koça sayısı söyleniyor

  for (const bolum of bolumler) {
    if (!bolum.konu) continue;                       // müfredata bağlanmamış

    // ── KOÇUN ÖNCEKİ KARARI ───────────────────────────────────
    // Kabul edilen bölüm zaten görev olarak açıldı, yeniden
    // önerilmesinin anlamı yok. Reddedilen bölüm bekleme süresi
    // boyunca dışarıda; süre dolunca yeniden değerlendiriliyor.
    const karar = kararlar[bolum.id];
    if (karar?.karar === "kabul") continue;
    if (karar?.karar === "red") {
      const gecen = simdi - new Date(karar.created_at).getTime();
      if (gecen < RED_BEKLEME_GUN * GUN_MS) { redEdilen += 1; continue; }
    }
    const banka = bankaHarita.get(bolum.banka_id);
    const ders = banka?.ders ?? "";
    const a = anahtarla(ders, bolum.konu);
    const d = durum.get(a);

    // Bu bölüm daha önce ödev olarak verilmiş mi? Başlık eşleşmesi
    // kaba ama bu motorun ürettiği görevlerde başlık bölüm adını
    // taşıyor, yani ikinci turda kendi verdiğini tekrar önermiyor.
    const bolumSade = sadelestir(bolum.baslik);
    if (d?.gorevBasliklari.some(b => sadelestir(b).includes(bolumSade))) continue;

    // ── KATMANLI PUAN ─────────────────────────────────────────
    // Katmanlar ÇAKIŞMIYOR: ölçülmüş bir zayıflık, her zaman
    // ölçülmemiş bir boşluğun üstünde. Önceki sürümde %45 doğruluk
    // da "hiç çalışılmamış" da 55 puan alıyordu; gerçek zayıflık
    // kitaptaki sıraya karışıp kayboluyordu.
    const dersDurum = dersler.get(sadelestir(ders));
    const dersEk = dersAciliyeti(dersDurum);

    let sebep, gerekce, puan;
    if (d?.dogruluk != null && d.dogruluk < ZAYIF_ESIGI) {
      sebep = "zayif";
      puan = 100 + (ZAYIF_ESIGI - d.dogruluk);          // 100–165
      gerekce = `${d.soru} soruda %${d.dogruluk} doğruluk`;
    } else if (d?.tamamlanma != null && d.tamamlanma < 50) {
      sebep = "yarim";
      puan = 70 + (50 - d.tamamlanma) / 5;              // 70–80
      gerekce = `${d.gorevToplam} görevin ${d.gorevTamam}'i tamamlanmış`;
    } else if (!d || (d.soru === 0 && d.gorevToplam === 0)) {
      sebep = "bos";
      puan = 40 + dersEk;                               // 40–70
      gerekce = dersDurum?.dogruluk != null
        ? `Bu konuda kayıt yok; ${dersDurum.ders} genelinde %${dersDurum.dogruluk} doğruluk`
        : "Bu konuda hiç test ve görev kaydı yok";
    } else if (d.dogruluk == null && d.soru > 0) {
      // Soru çözmüş ama ölçmeye yetmiyor. "Zayıf" DEMİYORUZ.
      sebep = "az_veri";
      puan = 30 + dersEk / 2;
      gerekce = `Yalnızca ${d.soru} soru çözülmüş, ölçmek için az`;
    } else {
      continue;                                         // yeterince iyi
    }

    // ── AÇIK GÖREV VE YAKIN ATAMA: ELEME DEĞİL, İNDİRİM ───────
    // Bunlar önce listeden TAMAMEN ELİYORDU. Gerçek veride sonucu
    // şu oldu: 64 soruda %6 doğruluğu olan bir konu — veri setindeki
    // en ağır zayıflık — o konuda açık bir görev bulunduğu için
    // listede hiç görünmedi. Koçun görmesi gereken tek şey tam da
    // oydu.
    //
    // Artık puanı düşüyor ama kayboluyor: koç hem zayıflığı hem
    // "zaten görev var" bilgisini birlikte görüp kendisi karar
    // veriyor. Motorun işi bilgilendirmek, gizlemek değil.
    const ekNotlar = [];
    if (d?.acikGorev) { puan *= 0.55; ekNotlar.push("bu konuda açık görev var"); }
    if (d?.sonAtama && simdi - d.sonAtama.getTime() < TEKRAR_BEKLEME_GUN * GUN_MS) {
      const gun = Math.max(1, Math.round((simdi - d.sonAtama.getTime()) / GUN_MS));
      puan *= 0.7;
      ekNotlar.push(`${gun} gün önce görev verilmiş`);
    }
    if (ekNotlar.length) gerekce += ` · ${ekNotlar.join(" · ")}`;

    // Müfredat sırası eşitlik bozucu: aynı puandaki iki konudan
    // müfredatta önce geleni öne alıyor (temel konu, üstüne inşa
    // edilen konudan önce çalışılmalı). Etkisi kasten çok küçük —
    // sıralamayı belirlemesin, yalnızca berabereliği bozsun.
    const sira = konuSirasi[a];
    if (Number.isFinite(sira)) puan -= sira * 0.01;

    const carpan = Number(agirliklar[a]);
    if (Number.isFinite(carpan) && carpan > 0) {
      // Çarpan sınırlanıyor: tek bir ağırlık değeri sıralamayı
      // tamamen ele geçirmesin.
      puan *= Math.min(Math.max(carpan, 0.5), 2);
    }

    // Bölümün ilk dilimi öneriliyor; koç isterse aralığı değiştirir.
    const [ilk] = sayfaDilimleri(bolum);
    const dilimSayisi = sayfaDilimleri(bolum).length;

    adaylar.push({
      anahtar: `${bolum.id}`,
      bolumId: bolum.id,
      ders, konu: bolum.konu,
      sebep, gerekce, puan: Math.round(puan * 10) / 10,
      bankaId: banka?.id ?? null,
      bankaAdi: banka?.ad ?? "Kaynak",
      bolumBasligi: bolum.baslik,
      sayfaBas: ilk.bas, sayfaSon: ilk.son,
      dilimSayisi,
      sayfaMetni: sayfaMetni(ilk.bas, ilk.son),
    });
  }

  // Aynı konudan birden fazla bölüm çıkabiliyor (kitapta "Katılarda
  // Basınç", "Sıvı Basıncı" ayrı bölümler ama müfredatta tek "Basınç").
  // Konu başına EN İYİ bölüm alınıyor; yoksa liste tek bir konunun
  // bölümleriyle dolar ve öğrencinin geri kalanı hiç görünmez.
  const konuBasina = new Map();
  for (const a of adaylar.sort((x, y) => y.puan - x.puan)) {
    const k = anahtarla(a.ders, a.konu);
    if (!konuBasina.has(k)) konuBasina.set(k, a);
  }

  const secilen = [...konuBasina.values()]
    .sort((x, y) => y.puan - x.puan)
    .slice(0, adet);

  // Tarihler: bugünden sonraki günlere sırayla dağıtılıyor.
  const bas = new Date(baslangic);
  bas.setHours(0, 0, 0, 0);
  const liste = secilen.map((o, i) => {
    const t = new Date(bas.getTime() + (i * gunAraligi + 1) * GUN_MS);
    const g = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    return {
      ...o,
      tarih: g,
      baslik: [o.bolumBasligi, o.sayfaMetni].filter(Boolean).join(" — "),
    };
  });

  // Elenen öneri sayısı listeye iliştiriliyor: koç "neden az öneri
  // çıktı" sorusunun cevabını görebilsin, sessizce eksilmesin.
  liste.redEdilen = redEdilen;
  return liste;
}

export const SEBEP_ETIKET = {
  zayif:   { ad: "Zayıf",        renk: "#A32D2D", zemin: "#FFF0F0" },
  bos:     { ad: "Hiç çalışılmamış", renk: "#854F0B", zemin: "#FFF7E6" },
  yarim:   { ad: "Yarım kalmış", renk: "#854F0B", zemin: "#FFF7E6" },
  az_veri: { ad: "Az veri",      renk: "#3763C4", zemin: "#EAF1FE" },
};
