// Gelişim envanterleri — hazır içerik.
//
// ── NEDEN KODDA, VERİTABANINDA DEĞİL ────────────────────────────
// Hazır çalışma programlarıyla aynı kalıp: yeni envanter eklemek
// migration gerektirmiyor, sürüm çıkınca bütün koçlarda anında
// oluyor. Satılan şey tam olarak bu — yeni bir koç ilk gün elinde
// hazır içerik buluyor. Cevaplar ve koçun değerlendirmesi
// veritabanında.
//
// ── SINIR: BU BİR PSİKOLOJİK TEST DEĞİL ─────────────────────────
// Türkiye'de test uygulama ve yorumlama yetkisi lisanslı uzmanlarda;
// yayımlanmış standart envanterler (çoklu zekâ, mesleki ilgi,
// kişilik) ayrıca telifli. Buradaki envanterler:
//   • bizim yazdığımız, hiçbir ölçekten alınmamış,
//   • PUANLAMAYAN — ekranda sayı yok,
//   • TANI KOYMAYAN, ETİKET YAPIŞTIRMAYAN,
//   • ölçtüğü şey davranış ve alışkanlık; kişilik ya da yetenek değil.
//
// Etiket üretmemek bilinçli: "görsel öğrenen" gibi bir çıktı bir kez
// yapışıyor ve yanlış olduğunda öğrenciyi yıllarca takip ediyor.
// Çıktı profil değil, UYGULANABİLİR ÖNERİ.
//
// ── YORUM KURALLARI DA VERİ ─────────────────────────────────────
// Eşikler ve öneri metinleri fonksiyon değil veri. Böylece bir
// envanter ileride veritabanına ya da bir dosyaya taşınabiliyor;
// değerlendirme işlevi tek ve envanterden bağımsız kalıyor.

// Sıklık ölçeği. Sayılar yalnız İÇ hesap için; hiçbir yerde
// kullanıcıya gösterilmiyor.
export const SIKLIK = [
  { deger: 1, etiket: "Hiç" },
  { deger: 2, etiket: "Nadiren" },
  { deger: 3, etiket: "Bazen" },
  { deger: 4, etiket: "Sık sık" },
  { deger: 5, etiket: "Her zaman" },
];

export const CALISMA_ALISKANLIGI = {
  kod: "calisma_aliskanligi",
  ad: "Çalışma Alışkanlığı Envanteri",
  sure: "5 dakika",
  aciklama:
    "Doğru ya da yanlış cevap yok, puan da verilmiyor. Amaç çalışma " +
    "biçimini tanımak: ne kadar süreyle, hangi saatte ve nasıl bir " +
    "ortamda verimli olduğunu bulup programını ona göre kurmak.",
  // Öğrenciye gösterilen güvence. Dürüst cevap alınmazsa veri çöp.
  gizlilik:
    "Cevaplarını yalnızca sen ve koçun görüyor. Velin cevapları değil, " +
    "koçunun değerlendirmesini görüyor.",

  sorular: [
    // ── kesintisiz çalışma kapasitesi ──
    { kod: "blok1", boyut: "blok", tur: "siklik", ters: true,
      metin: "Çalışmaya başladıktan 20-25 dakika sonra dikkatim dağılır." },
    { kod: "blok2", boyut: "blok", tur: "siklik",
      metin: "Bir oturuşta 1 saatten uzun, ara vermeden çalışabilirim." },
    { kod: "blok3", boyut: "blok", tur: "siklik", ters: true,
      metin: "Uzun çalışmalarda sonlara doğru okuduğumu anlamamaya başlarım." },

    // ── erteleme ──
    { kod: "ert1", boyut: "erteleme", tur: "siklik", ters: true,
      metin: "Zor ya da sevmediğim konuyu günün sonuna bırakırım." },
    { kod: "ert2", boyut: "erteleme", tur: "siklik", ters: true,
      metin: "Çalışmaya oturmak için kendimi zorlamam gerekir; masaya geçmek en zor kısım." },

    // ── verimli saat (tek seçim) ──
    { kod: "saat", boyut: "saat", tur: "secim",
      metin: "Gün içinde kendimi en verimli hissettiğim zaman:",
      secenekler: [
        { deger: "sabah",  etiket: "Sabah (uyandıktan sonraki ilk saatler)" },
        { deger: "ogle",   etiket: "Öğleden sonra" },
        { deger: "aksam",  etiket: "Akşam" },
        { deger: "gece",   etiket: "Gece yarısına doğru" },
        { deger: "belirsiz", etiket: "Değişiyor / bilmiyorum" },
      ] },

    // ── dikkat dağıtıcılar ──
    { kod: "dik1", boyut: "dikkat", tur: "siklik", ters: true,
      metin: "Çalışırken telefonum elimin altında olur." },
    { kod: "dik2", boyut: "dikkat", tur: "siklik", ters: true,
      metin: "Çalışırken bildirimlere ya da mesajlara bakarım." },
    { kod: "dik3", boyut: "dikkat", tur: "siklik",
      metin: "Çalıştığım yer sessiz ve toplu olur." },

    // ── planlama ──
    { kod: "plan1", boyut: "planlama", tur: "siklik",
      metin: "Güne başlamadan o gün ne çalışacağımı biliyorum." },
    { kod: "plan2", boyut: "planlama", tur: "siklik", ters: true,
      metin: "Planladığım işleri bitiremeden gün biter." },

    // ── hatadan dönüş ──
    { kod: "hata1", boyut: "hata", tur: "siklik",
      metin: "Yanlış yaptığım soruya geri dönüp neden yanlış yaptığımı incelerim." },
    { kod: "hata2", boyut: "hata", tur: "siklik",
      metin: "Boş bıraktığım soruların konusunu not edip tekrar ederim." },
  ],

  // Boyut başına yorum. `dusuk`/`orta`/`yuksek` eşikleri 1–5
  // ortalamasına göre; `oneri` öğrenciye de koça da aynı gösteriliyor.
  // Eğilim metni (`egilim`) yalnız koça.
  boyutlar: {
    blok: {
      ad: "Kesintisiz çalışma süresi",
      dusuk: {
        egilim: "Kısa sürede dikkati dağılıyor.",
        oneri: { baslik: "Bloklarını kısalt",
          metin: "90 dakikalık oturumlar sana uymuyor. 25-30 dakika çalış, 5 dakika ara ver; üç turdan sonra uzun ara. Aynı sürede daha fazla iş çıkıyor." } },
      orta: {
        egilim: "Orta uzunlukta bloklarda verimli.",
        oneri: { baslik: "40-45 dakikalık bloklar",
          metin: "40-45 dakikalık bloklar senin için doğru aralık. Araları atlamadan kullan; süreyi uzatmak yerine blok sayısını artır." } },
      yuksek: {
        egilim: "Uzun süre kesintisiz çalışabiliyor.",
        oneri: { baslik: "Uzun bloklarını koru",
          metin: "Uzun süre odaklanabiliyorsun; bu bir avantaj. Yine de 60 dakikada bir kısa ara ver — yorgunluk fark edilmeden okuma hızını düşürüyor." } },
    },
    erteleme: {
      ad: "Başlama / erteleme",
      dusuk: {
        egilim: "Başlamakta belirgin zorluk; zor konuyu erteliyor.",
        oneri: { baslik: "Güne zor konuyla başla",
          metin: "Sevmediğin konuyu sona bırakmak onu her gün büyütüyor. Güne o konudan sadece 10 dakikayla başla — amaç bitirmek değil, başlamak. Masaya oturma eşiğini düşürmek için çalışmaya oturduğunda ilk işin kalemi eline almak olsun." } },
      orta: {
        egilim: "Zaman zaman erteliyor.",
        oneri: { baslik: "Zor konuyu güne yay",
          metin: "Zor konuyu günün ilk yarısına koy. Akşama bırakılan konu çoğu gün ertesi güne kalıyor." } },
      yuksek: {
        egilim: "Başlamakta zorlanmıyor.",
        oneri: { baslik: "Sıralamayı kendin kur",
          metin: "Başlamak senin için sorun değil; bu yüzden sıralamayı zorluğa göre değil tekrar gereksinimine göre kurabilirsin." } },
    },
    dikkat: {
      ad: "Çalışma ortamı",
      dusuk: {
        egilim: "Dikkat dağıtıcılar çalışmanın içinde.",
        oneri: { baslik: "Telefonu odadan çıkar",
          metin: "Telefonu sessize almak yetmiyor; masada durması bile dikkati bölüyor. Çalışma başlarken başka bir odaya bırak. Bir blok boyunca bakmamak, iki blok boyunca yarım bakmaktan iyi." } },
      orta: {
        egilim: "Ortam kısmen kontrollü.",
        oneri: { baslik: "Blok içinde bildirim yok",
          metin: "Bildirimlere blok aralarında bak, blok içinde değil. Her bakış sonrası toparlanma birkaç dakika alıyor." } },
      yuksek: {
        egilim: "Ortamı toplu ve kontrollü.",
        oneri: { baslik: "Ortamını koru",
          metin: "Çalışma ortamın düzenli; bu görünmeyen bir avantaj. Yer değiştirdiğinde (okul, kütüphane) aynı düzeni kurmaya çalış." } },
    },
    planlama: {
      ad: "Planlama",
      dusuk: {
        egilim: "Günü plansız başlıyor, planı bitiremiyor.",
        oneri: { baslik: "Günü üç işle sınırla",
          metin: "Uzun liste bitmediği için planı bırakmaya yol açıyor. Her gün için en fazla üç iş yaz; bitince ekle. Bitmiş kısa liste, yarısı dolu uzun listeden daha çok iş çıkarıyor." } },
      orta: {
        egilim: "Planlıyor ama taşıyor.",
        oneri: { baslik: "Süreyi 1,5 katıyla yaz",
          metin: "İşlerin tahmin ettiğinden uzun sürüyor. Plana yazarken tahmininin 1,5 katını yaz — taşmayan plan, taşan plandan daha çok uygulanıyor." } },
      yuksek: {
        egilim: "Planlı çalışıyor.",
        oneri: { baslik: "Haftalık plana geç",
          metin: "Günlük planlamayı oturtmuşsun; haftalık plana geçebilirsin. Hafta başında dağılımı kur, gün içinde yalnız uygula." } },
    },
    hata: {
      ad: "Hatadan dönüş",
      dusuk: {
        egilim: "Yanlışlara geri dönmüyor — en yüksek kazanç burada.",
        oneri: { baslik: "Yanlış defteri tut",
          metin: "Çözülen soru sayısı değil, dönülen yanlış sayısı net artırıyor. Her çalışmada yanlışlarını tek bir deftere yaz: soru değil, YANLIŞ SEBEBİ (bilgi eksiği / işlem hatası / soruyu yanlış okuma). Haftada bir o deftere bak." } },
      orta: {
        egilim: "Bazen geri dönüyor.",
        oneri: { baslik: "Dönüşü düzenli hâle getir",
          metin: "Yanlışlara ara ara dönüyorsun. Bunu teste bağla: her testten sonra 10 dakika yanlışlara ayır, konuyu değiştirmeden." } },
      yuksek: {
        egilim: "Yanlışlarını düzenli inceliyor.",
        oneri: { baslik: "Sebebe göre ayır",
          metin: "Yanlışlarına dönüyorsun; bir adım ileri git ve sebebe göre ayır. İşlem hatası ile bilgi eksiği farklı çözüm istiyor." } },
    },
    saat: {
      ad: "Verimli saat",
      // Tek seçimli boyut: eşik yok, seçeneğe göre öneri.
      secimler: {
        sabah: { egilim: "Sabah verimli.",
          oneri: { baslik: "Zor dersi sabaha koy",
            metin: "En zor dersini sabahın ilk bloğuna koy. Akşamı tekrar ve soru çözümü için ayır." } },
        ogle: { egilim: "Öğleden sonra verimli.",
          oneri: { baslik: "Ağır işi öğleden sonraya",
            metin: "Yeni konu öğrenmeyi öğleden sonraya, tekrarı sabaha ve akşama koy." } },
        aksam: { egilim: "Akşam verimli.",
          oneri: { baslik: "Akşam bloğunu koru",
            metin: "Akşam bloğunu zor derse ayır; ama uyku saatinden 1 saat önce bitir, yoksa hem uyku hem ertesi gün bozuluyor." } },
        gece: { egilim: "Gece çalışıyor — uyku riski.",
          oneri: { baslik: "Geceyi öne çek",
            metin: "Gece çalışmak verimli görünüyor çünkü ortam sessiz, ama sınav sabah yapılıyor ve uyku düzeni netine doğrudan etki ediyor. Blokları iki hafta içinde kademeli olarak bir-iki saat öne çek." } },
        belirsiz: { egilim: "Verimli saati belirsiz.",
          oneri: { baslik: "Bir hafta ölç",
            metin: "Hangi saatte verimli olduğunu bilmiyorsun. Bir hafta boyunca her çalışma sonrası saatini ve 1-5 arası verim notunu yaz; hafta sonunda kalıp kendini gösteriyor." } },
      },
    },
  },
};

export const ENVANTERLER = [CALISMA_ALISKANLIGI];

export const envanterBul = (kod) => ENVANTERLER.find(e => e.kod === kod) ?? null;

// Eşikler: 1–5 ortalaması. 2,5 ve 3,5 ortanın iki yanı; uçlara
// yakın değerleri "orta" saymak öneriyi işe yaramaz hâle getirirdi.
const ESIK_DUSUK = 2.5;
const ESIK_YUKSEK = 3.5;

export function seviye(ortalama) {
  if (ortalama < ESIK_DUSUK) return "dusuk";
  if (ortalama > ESIK_YUKSEK) return "yuksek";
  return "orta";
}

// Cevapları değerlendirir — SAF.
//
// Girdi: envanter, cevaplar { soruKod: deger }
// Çıktı: { egilimler: [{boyut, ad, seviye, metin}], oneriler: [{boyut, baslik, metin}], eksik: [soruKod] }
//
// Eksik cevap ATLANIYOR, sıfır sayılmıyor: boş bırakılan soruyu "hiç"
// saymak öğrenciyi olmadığı bir eğilime sokardı. Bir boyutun hiçbir
// sorusu cevaplanmamışsa o boyut hiç yorumlanmıyor.
export function envanterDegerlendir(envanter, cevaplar = {}) {
  const egilimler = [];
  const oneriler = [];
  const eksik = [];
  const toplamlar = {};

  for (const soru of envanter?.sorular ?? []) {
    const cevap = cevaplar[soru.kod];
    if (cevap == null || cevap === "") { eksik.push(soru.kod); continue; }

    if (soru.tur === "secim") {
      const tanim = envanter.boyutlar?.[soru.boyut]?.secimler?.[cevap];
      if (tanim) {
        egilimler.push({ boyut: soru.boyut, ad: envanter.boyutlar[soru.boyut].ad,
                         seviye: cevap, metin: tanim.egilim });
        oneriler.push({ boyut: soru.boyut, ...tanim.oneri });
      }
      continue;
    }

    // Ters soruda yüksek cevap KÖTÜ: "dikkatim dağılır"a "her zaman"
    // demek düşük kapasite demek. 1-5 ölçeğinde 6'dan çıkarmak
    // yönü çeviriyor.
    const deger = soru.ters ? 6 - Number(cevap) : Number(cevap);
    const g = toplamlar[soru.boyut] ?? (toplamlar[soru.boyut] = { toplam: 0, adet: 0 });
    g.toplam += deger;
    g.adet += 1;
  }

  for (const [boyut, g] of Object.entries(toplamlar)) {
    const tanim = envanter.boyutlar?.[boyut];
    if (!tanim || g.adet === 0) continue;
    const sv = seviye(g.toplam / g.adet);
    const yorum = tanim[sv];
    if (!yorum) continue;
    egilimler.push({ boyut, ad: tanim.ad, seviye: sv, metin: yorum.egilim });
    oneriler.push({ boyut, ...yorum.oneri });
  }

  // En çok kazanç getiren öneri başa: hatadan dönüş ve erteleme,
  // ikisi de "düşük"te net artışına doğrudan etki ediyor.
  const agirlik = { hata: 0, erteleme: 1, dikkat: 2, blok: 3, planlama: 4, saat: 5 };
  oneriler.sort((a, b) => (agirlik[a.boyut] ?? 9) - (agirlik[b.boyut] ?? 9));

  return { egilimler, oneriler, eksik };
}
