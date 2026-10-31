// Koçun kendi envanterini şablondan içe aktarması — SAF, sınanabilir.
//
// ── NEDEN DOSYA YÜKLEME DEĞİL, YAPIŞTIRMA ───────────────────────
// İstek "Word veya Google dokümanı üzerinden" idi. İkisi de dosya
// olarak sorunlu:
//   • .docx bir zip içinde XML. Metni çıkarmak mümkün ama hangi
//     satırın soru olduğu koçun biçimlendirmeyi harfiyen uygulamasına
//     bağlı; bir satır birleşse içe aktarma SESSİZCE yanlış envanter
//     üretir. Üstelik zip okuyucu yeni bir bağımlılık.
//   • Google Dokümanlar OAuth istiyor — Calendar tam bu yüzden
//     ertelendi.
//
// Tabloyu kopyalayıp yapıştırmak ikisini de kapsıyor: Word, Google
// Dokümanlar, Excel ve Sheets tablo kopyalarken SEKMEYLE ayrılmış
// metin veriyor. Ayrıştırması basit ve güvenilir, bağımlılık yok.
// İçindekiler aktarmada aynı desen zaten kullanılıyor.
//
// ── SORU KODLARI SIRAYA BAĞLI ───────────────────────────────────
// Cevaplar `s1, s2...` kodlarıyla saklanıyor. Envanter yeniden içe
// aktarılıp soru sırası değişirse eski cevaplar başka soruya denk
// gelir. Bu yüzden cevabı olan envanterin soruları DEĞİŞTİRİLMİYOR;
// değiştirmek isteyen yeni envanter oluşturuyor. (Çağıran taraf bu
// kuralı uyguluyor; burada yalnız kodlar üretiliyor.)

export const TURLER = {
  siklik: { kod: "siklik", ad: "Sıklık (Hiç → Her zaman)" },
  acik:   { kod: "acik",   ad: "Açık uçlu (yazarak)" },
};

// Şablonun sütun sırası. Yalnız ilk sütun zorunlu.
export const SABLON_SUTUNLARI = ["soru", "tür", "boyut", "ters"];

export const EN_AZ_SORU = 3;
export const EN_COK_SORU = 60;

// İndirilebilir şablon. Noktalı virgül: Türkçe Excel'de varsayılan
// liste ayırıcısı bu; virgül kullanılsa sütunlar tek hücreye düşüyor.
export function sablonMetni() {
  return [
    "soru;tür;boyut;ters",
    "Çalışırken telefonum elimin altında olur;sıklık;dikkat;evet",
    "Güne başlamadan o gün ne çalışacağımı biliyorum;sıklık;planlama;hayır",
    "Yanlış yaptığım soruya geri dönüp incelerim;sıklık;hata;hayır",
    "Hangi derste kendini en zayıf görüyorsun?;açık;;",
  ].join("\r\n");
}

// Satırın ayırıcısını bulur. Sekme önce bakılıyor: Word ve Google
// Dokümanlar tablo kopyasında sekme veriyor ve soru metninin içinde
// virgül bulunması çok olası.
function ayiriciBul(metin) {
  const satirlar = String(metin ?? "").split(/\r?\n/).filter(s => s.trim());
  if (satirlar.length === 0) return null;
  for (const a of ["\t", ";", ","]) {
    // Ayırıcı sayılması için satırların ÇOĞUNDA bulunmalı; tek
    // satırda geçen virgül ayırıcı değil, metnin parçası.
    const varOlan = satirlar.filter(s => s.includes(a)).length;
    if (varOlan >= Math.ceil(satirlar.length / 2)) return a;
  }
  return null;
}

const DOGRU_SOZLER = ["evet", "e", "x", "✓", "1", "true", "var", "ters"];

function turCoz(ham) {
  const t = (ham ?? "").trim().toLocaleLowerCase("tr");
  if (!t) return "siklik";                       // boş = sıklık
  if (t.startsWith("aç") || t.startsWith("ac") || t.startsWith("yaz")) return "acik";
  if (t.startsWith("sık") || t.startsWith("sik") || t.startsWith("ölç") || t.startsWith("olc")) return "siklik";
  return null;
}

// Yapıştırılan metni envanter tanımına çevirir.
//
// Çıktı: { sorular, boyutlar, uyarilar, hata }
//   hata dolu   → içe aktarılamaz, sebep yazılı
//   uyarilar    → aktarılabilir ama koç görmeli (atlanan satır vb.)
export function sablonCoz(metin) {
  const bos = { sorular: [], boyutlar: {}, uyarilar: [] };
  const ham = String(metin ?? "").trim();
  if (!ham) return { ...bos, hata: "Yapıştırılan alan boş." };

  const ayirici = ayiriciBul(ham);
  if (!ayirici) {
    return { ...bos, hata:
      "Sütunlar ayırt edilemedi. Tabloyu Word, Google Dokümanlar ya da " +
      "Excel'den olduğu gibi kopyalayıp yapıştırın." };
  }

  const satirlar = ham.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const uyarilar = [];
  const sorular = [];
  const boyutlar = {};

  satirlar.forEach((satir, i) => {
    const hucreler = satir.split(ayirici).map(h => h.trim().replace(/^["']|["']$/g, ""));
    const [soruMetni, turHam, boyutHam, tersHam] = hucreler;

    // Başlık satırı: ilk hücresi tam olarak "soru" olan satır atlanıyor.
    // Şablonu indirip dolduran koç başlığı silmek zorunda kalmasın.
    if (i === 0 && (soruMetni ?? "").toLocaleLowerCase("tr") === "soru") return;

    if (!soruMetni) return;                       // boş satır

    if (soruMetni.length < 5) {
      uyarilar.push(`${i + 1}. satır atlandı: soru metni çok kısa ("${soruMetni}").`);
      return;
    }
    if (soruMetni.length > 300) {
      uyarilar.push(`${i + 1}. satır atlandı: soru metni 300 karakterden uzun.`);
      return;
    }

    const tur = turCoz(turHam);
    if (!tur) {
      uyarilar.push(`${i + 1}. satır atlandı: "${turHam}" tanınmayan tür (sıklık ya da açık).`);
      return;
    }

    // Boyut yalnız ölçekli soruda anlamlı: açık uçlu cevap
    // ortalamaya girmiyor.
    let boyut = null;
    if (tur === "siklik" && boyutHam) {
      boyut = boyutHam.slice(0, 40);
      const kod = boyut.toLocaleLowerCase("tr").replace(/\s+/g, "_");
      boyutlar[kod] = boyut;
      boyut = kod;
    } else if (tur === "acik" && boyutHam) {
      uyarilar.push(`${i + 1}. satır: açık uçlu soruda boyut yoksayıldı.`);
    }

    sorular.push({
      kod: `s${sorular.length + 1}`,
      metin: soruMetni,
      tur,
      boyut,
      ters: tur === "siklik" &&
            DOGRU_SOZLER.includes((tersHam ?? "").trim().toLocaleLowerCase("tr")),
    });
  });

  if (sorular.length < EN_AZ_SORU) {
    return { sorular, boyutlar, uyarilar,
      hata: `En az ${EN_AZ_SORU} soru gerekiyor, ${sorular.length} okundu.` };
  }
  if (sorular.length > EN_COK_SORU) {
    return { sorular, boyutlar, uyarilar,
      hata: `En çok ${EN_COK_SORU} soru olabiliyor, ${sorular.length} okundu.` };
  }

  return { sorular, boyutlar, uyarilar, hata: null };
}

// Koç envanterinin özeti: boyut ortalamaları + açık uçlu cevaplar.
//
// Hazır envanterlerden farkı: BURADA ÖNERİ ÜRETİLMİYOR. Koç kendi
// envanterinin yorum metinlerini yazmıyor (şablonu üç katına
// çıkarırdı), o yüzden sistem yorum uydurmuyor — ortalamayı gösterip
// değerlendirmeyi koça bırakıyor.
export function kocEnvanteriOzeti(tanim, cevaplar = {}) {
  const toplamlar = {};
  const acikCevaplar = [];

  for (const soru of tanim?.sorular ?? []) {
    const cevap = cevaplar[soru.kod];
    if (cevap == null || cevap === "") continue;

    if (soru.tur === "acik") {
      acikCevaplar.push({ soru: soru.metin, cevap: String(cevap) });
      continue;
    }
    if (!soru.boyut) continue;                    // boyutsuz ölçekli soru özete girmiyor
    const deger = soru.ters ? 6 - Number(cevap) : Number(cevap);
    const g = toplamlar[soru.boyut] ?? (toplamlar[soru.boyut] = { toplam: 0, adet: 0 });
    g.toplam += deger;
    g.adet += 1;
  }

  const boyutlar = Object.entries(toplamlar).map(([kod, g]) => ({
    kod,
    ad: tanim?.boyutlar?.[kod] ?? kod,
    ortalama: Math.round((g.toplam / g.adet) * 10) / 10,
    soruSayisi: g.adet,
  })).sort((a, b) => a.ortalama - b.ortalama);     // en zayıf başa

  return { boyutlar, acikCevaplar };
}
