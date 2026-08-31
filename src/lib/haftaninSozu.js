// Haftanın sözü.
//
// ── NEDEN VERİTABANI YOK ────────────────────────────────────────
// Sözler sabit bir liste; koçun düzenlediği bir içerik değil. Tabloya
// koymak her açılışta bir sorgu, bir RLS yüzeyi ve boş liste hâlinde
// gösterilecek bir "henüz söz yok" durumu demekti. Paketin içinde
// duruyorlar; yeni söz eklemek bu dosyaya bir satır yazmak.
//
// ── NEDEN RASTGELE DEĞİL ────────────────────────────────────────
// Söz ISO hafta numarasından türetiliyor: aynı hafta boyunca herkeste
// aynı ve sabit. Math.random olsaydı her sayfa yenilemesinde değişirdi
// ve "haftanın sözü" adı yalan olurdu; öğrenciyle koçun aynı sözden
// konuşabilmesi de mümkün olmazdı.

const SOZLER = [
  { metin: "Başarı, her gün tekrarlanan küçük çabaların toplamıdır.", kim: "Robert Collier" },
  { metin: "Bir şeyi öğrenmenin en iyi yolu, onu birine anlatmaktır.", kim: "Richard Feynman" },
  { metin: "Zorluk, kolaylığın habercisidir. Yeter ki bırakma.", kim: null },
  { metin: "Bugün yapabileceğini yarına bırakma; yarın da yeni bir bugün olacak.", kim: null },
  { metin: "Yavaş gitmekten korkma, olduğun yerde durmaktan kork.", kim: "Çin atasözü" },
  { metin: "Hata yapmayan, yeni bir şey denemiyor demektir.", kim: "Albert Einstein" },
  { metin: "Dün kendinden daha iyi olmak, bugünün tek yarışıdır.", kim: null },
  { metin: "Emek olmadan yemek olmaz.", kim: "Türk atasözü" },
  { metin: "Disiplin, hedefle sonuç arasındaki köprüdür.", kim: "Jim Rohn" },
  { metin: "Okumak, insanı tamam; konuşmak, hazır; yazmak, tam eder.", kim: "Francis Bacon" },
  { metin: "Kaybetmekten değil, denememekten kork.", kim: null },
  { metin: "Bir günde bir saat, bir yılda kırk beş iş günü eder.", kim: null },
  { metin: "Aklın yolu bir değil, biner. Yeter ki yürümeye başla.", kim: null },
  { metin: "Sabır acıdır ama meyvesi tatlıdır.", kim: "Jean-Jacques Rousseau" },
  { metin: "Hedefi olmayan gemiye hiçbir rüzgâr yardım etmez.", kim: "Seneca" },
  { metin: "Zor olan, imkânsız olan değildir; sadece daha çok tekrar ister.", kim: null },
  { metin: "Bilmediğini bilmek, bilmenin başlangıcıdır.", kim: null },
  { metin: "Bugünün işini bitir; yarının seni bekleyen kendi işi var.", kim: null },
  { metin: "Küçük adımlar da adımdır; yeter ki aynı yöne olsun.", kim: null },
  { metin: "Başarı hazırlık ile fırsatın buluştuğu yerdir.", kim: "Seneca" },
  { metin: "Çalışırken yorulmak, sınavda pişman olmaktan hafiftir.", kim: null },
  { metin: "Not almadan okumak, delik kovayla su taşımaktır.", kim: null },
  { metin: "Tekrar, öğrenmenin annesidir.", kim: "Latin özdeyişi" },
  { metin: "Kendine inanmadan başlarsan, yarısını kaybederek başlarsın.", kim: null },
  { metin: "Yolun uzunluğu değil, her gün attığın adım belirler varışı.", kim: null },
  { metin: "Bir konuyu anlamak, ezberlemekten hep daha hızlıdır.", kim: null },
];

// ISO 8601 hafta numarası. Yerel yeni yıl / artık yıl kaymalarını
// doğru saysın diye standart algoritma kullanılıyor: tarih o haftanın
// perşembesine taşınıp yılın ilk perşembesiyle farkı alınıyor.
export function isoHafta(tarih = new Date()) {
  const d = new Date(Date.UTC(tarih.getFullYear(), tarih.getMonth(), tarih.getDate()));
  const gun = d.getUTCDay() || 7;              // pazar = 7
  d.setUTCDate(d.getUTCDate() + 4 - gun);      // haftanın perşembesi
  const yilBasi = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yilBasi) / 86400000 + 1) / 7);
}

// Hafta numarası + yıl: yıl da katılıyor ki liste uzunluğu haftaya tam
// bölünen bir sayı olduğunda her yıl aynı sıra tekrarlanmasın.
export function haftaninSozu(tarih = new Date()) {
  const h = isoHafta(tarih);
  return SOZLER[(h + tarih.getFullYear()) % SOZLER.length];
}

export const sozSayisi = SOZLER.length;
