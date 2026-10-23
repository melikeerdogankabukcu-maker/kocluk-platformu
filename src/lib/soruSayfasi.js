// Soru sayfası: bir fotoğraf, birden çok soru.
//
// ── NEDEN SORU SORU DEĞİL ───────────────────────────────────────
// Soruları tek tek yazmak (metin + beş şık) bir kitap için
// kullanılamaz: 400 soruluk bir kaynakta 2000 alan demek. Koçun elinde
// zaten kitabın kendisi var. Yaptığımız iş soruyu YENİDEN YAZMAK değil,
// SAYFAYI KONUYLA EŞLEŞTİRMEK: fotoğraf + hangi soru numaraları +
// cevap anahtarı.
//
// Veri modeli bunun için değişmedi: `sorular` tablosu `metin` boşken
// `gorsel_url` dolu olmasına izin veriyor (soru_icerik kısıtı). Bir
// sayfa yüklemek, aynı görseli paylaşan N satır yazmak demek.
//
// ── ŞIKLAR FOTOĞRAFTA ───────────────────────────────────────────
// Şık metinleri girilmiyor (`siklar: []`). Öğrenci şıkları
// fotoğraftan okuyor, ekranda yalnız harfleri işaretliyor. Bu yüzden
// `sik_sayisi` sayfa başına tek bir değer olarak soruluyor.

// Şık harfleri ve iptal işareti tek yerde duruyor: cevap anahtarı
// modülü de aynı kısıtları uyguluyor, ikisi ayrışırsa biri
// veritabanının kabul etmediği bir harfi geçerli sayardı.
import { SIKLAR, IPTAL } from "./cevapAnahtari";
export { SIKLAR, IPTAL };

// Depoda soru sayfalarının önekı. Ödev dosyaları `<kullanici>/...`
// altında duruyor ve izinleri YOLA göre veriliyor; soru sayfası ise
// koçun yüklediği, öğrencinin okuduğu bir dosya. Bu yüzden ayrı bir
// önek ve `soru_sayfasi_depo_migration.sql` içindeki ayrı politikalar:
// erişim ölçütü kişi değil KİTAP.
export const SAYFA_ONEK = "sorular";

export const IZINLI_TURLER  = ["image/jpeg", "image/png", "image/webp"];
export const BOYUT_SINIRI_MB = 10;

// `sorular/<banka_id>/<damga>.<uzanti>`
//
// Dosya adı yola konulmuyor, yalnız uzantısı alınıyor: Türkçe karakter
// ve boşluk içeren adlar depo anahtarında sorun çıkarıyor (ödev
// dosyalarında aynı gerekçe). Kitap kimliği yolun İÇİNDE olmak zorunda:
// depo politikası izni oradan okuyor.
export function sayfaYolu(bankaId, dosyaAdi, damga = Date.now()) {
  const uzanti = (String(dosyaAdi ?? "").match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? ".jpg").toLowerCase();
  return `${SAYFA_ONEK}/${bankaId}/${damga}${uzanti}`;
}

export function dosyaGecerli(dosya) {
  if (!dosya) return "Fotoğraf seçilmedi.";
  if (!IZINLI_TURLER.includes(dosya.type)) return "Yalnız JPEG, PNG ve WEBP yüklenebilir.";
  if (dosya.size > BOYUT_SINIRI_MB * 1024 * 1024) return `Fotoğraf ${BOYUT_SINIRI_MB} MB'tan büyük.`;
  return null;
}

// Cevap anahtarını harf dizisine çevirir.
//
// Girdi serbest biçimde kabul ediliyor: "ACBDE", "a c b d e",
// "A,C,B,D,E" hepsi aynı. Sebep: koç anahtarı kitabın arkasından
// kopyalıyor, araya boşluk ve virgül karışması kaçınılmaz; biçim
// uyarısı vermek işi yavaşlatmaktan başka bir şey yapmazdı.
//
// '-' iptal edilmiş soru demek (ne doğru ne yanlış sayılıyor);
// tabloda da bu değer tutuluyor.
export function cevapAnahtariniCoz(metin, sikSayisi = 5) {
  const izinli = SIKLAR.slice(0, sikSayisi);
  const harfler = [];
  for (const ch of String(metin ?? "").toUpperCase()) {
    if (/[\s,;.\-/|]/.test(ch)) {
      // Ayırıcılar atlanıyor; '-' ise tek başına durduğunda iptal
      // işareti, ayırıcı olarak da kullanılabiliyor. Ayrımı yapamazdık,
      // bu yüzden iptal için ayrı bir işaret alıyoruz: '0'.
      continue;
    }
    if (ch === "0") { harfler.push(IPTAL); continue; }
    if (!izinli.includes(ch)) {
      return { harfler: [], hata: `"${ch}" ${sikSayisi} şıklı bir soruda geçerli bir cevap değil.` };
    }
    harfler.push(ch);
  }
  if (harfler.length === 0) return { harfler: [], hata: "Cevap anahtarı boş." };
  return { harfler, hata: null };
}

// Sayfanın soru satırları. Numara ilk numaradan ardışık gidiyor:
// anahtarın uzunluğu kaç soru olduğunu da söylüyor, ayrıca "kaç soru"
// sormak gerekmiyor (ve iki yerden gelen sayı çelişebilirdi).
export function sayfaSorulari({ bankaId, bolumId, konu, gorselYolu, ilkNumara, harfler, sikSayisi = 5 }) {
  return harfler.map((harf, i) => ({
    banka_id:    bankaId,
    bolum_id:    bolumId || null,
    numara:      ilkNumara + i,
    metin:       null,          // soru metni fotoğrafta
    gorsel_url:  gorselYolu,
    sik_sayisi:  sikSayisi,
    siklar:      [],            // şıklar da fotoğrafta
    dogru_cevap: harf,
    konu:        konu || null,
  }));
}

// Kitapta aynı numara iki kez olamıyor (soru_banka_numara kısıtı).
// Çakışma yüklemeden ÖNCE bulunuyor: sonra bulunsa fotoğraf depoya
// yazılmış, satırlar reddedilmiş olurdu — ortada sahipsiz bir dosya
// kalırdı.
export function cakisanNumaralar(varOlanSorular, numaralar) {
  const var_ = new Set((varOlanSorular ?? []).map(s => s.numara));
  return numaralar.filter(n => var_.has(n));
}

// Soruları sayfalara bölüyor: aynı görseli paylaşan ARDIŞIK sorular
// bir grup. Metin soruları (görseli olmayan) tek başına kalıyor.
//
// Hem koçun listesi hem öğrencinin çözme ekranı bunu kullanıyor:
// sayfa fotoğrafını her soru için yeniden göstermek, öğrenciyi her
// soruda sayfanın başına atardı.
export function sayfalaraBol(sorular) {
  const gruplar = [];
  for (const s of sorular ?? []) {
    const son = gruplar.at(-1);
    if (s.gorsel_url && son && son.gorsel_url === s.gorsel_url) son.sorular.push(s);
    else gruplar.push({ gorsel_url: s.gorsel_url ?? null, sorular: [s] });
  }
  return gruplar;
}
