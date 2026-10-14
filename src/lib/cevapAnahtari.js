// Cevap anahtarı mantığı — SAF, Node'da sınanabilir.
//
// Veritabanındaki kısıtların aynısı burada da duruyor (uzunluk, şık
// aralığı). İki yerde olması tekrar değil, iş bölümü: arayüz kullanıcıya
// SEBEBİYLE birlikte anında söylüyor, veritabanı ise son söz olarak
// bozuk veriyi hiçbir yoldan içeri almıyor.

export const SIKLAR = ["A", "B", "C", "D", "E"];
export const IPTAL = "-";          // iptal edilen soru: ne doğru ne yanlış

// Anahtar dizesini çözer.
//
// Çıktı: { dizi, hata, tamam }
//   dizi   soru başına bir karakter (eksikler boş dize)
//   hata   kullanıcıya gösterilecek sebep, yoksa null
//   tamam  kaydedilebilir mi
export function anahtarCoz(cevaplar, soruSayisi, sikSayisi) {
  const ham = String(cevaplar ?? "").toUpperCase();
  const izinli = SIKLAR.slice(0, sikSayisi).concat(IPTAL);

  const dizi = Array.from({ length: soruSayisi }, (_, i) => {
    const h = ham[i];
    return h && izinli.includes(h) ? h : "";
  });

  // Şık sayısının dışında harf girilmiş mi? (4 şıklı testte E)
  const disHarf = [...ham].find(h => SIKLAR.includes(h) && !izinli.includes(h));
  if (disHarf) {
    return { dizi, tamam: false, hata: `${sikSayisi} şıklı testte "${disHarf}" olamaz.` };
  }

  if (ham.length > soruSayisi) {
    return { dizi, tamam: false,
      hata: `${soruSayisi} soru için ${ham.length} cevap girildi; fazlası yok sayılıyor.` };
  }

  const eksik = dizi.filter(h => !h).length;
  if (eksik > 0) {
    return { dizi, tamam: false, hata: `${eksik} soru boş; anahtarın tamamı girilmeli.` };
  }

  return { dizi, tamam: true, hata: null };
}

// Okunan cevaplarla anahtarı karşılaştırır.
//
// BU İŞLEV ARAYÜZDE ÖNİZLEME İÇİN; gerçek puanlama SUNUCUDA yapılacak,
// çünkü anahtar öğrencinin cihazına inmemeli (bkz.
// cevap_anahtari_migration.sql). Koç kendi ekranında bir kontrol yapmak
// isterse diye burada da duruyor.
//
// Okunan dizide boş karakter "işaretlenmemiş" demek: boş bırakılan soru
// yanlış değil, net hesabında da yanlış gibi sayılmıyor.
export function karsilastir(okunan, anahtar) {
  const sonuc = { dogru: 0, yanlis: 0, bos: 0, iptal: 0, detay: [] };
  const a = String(anahtar ?? "").toUpperCase();

  for (let i = 0; i < a.length; i++) {
    const beklenen = a[i];
    const verilen = String(okunan ?? "")[i]?.toUpperCase() ?? "";

    if (beklenen === IPTAL) {
      sonuc.iptal++;
      sonuc.detay.push({ soru: i + 1, durum: "iptal", verilen });
      continue;
    }
    if (!verilen || verilen === IPTAL) {
      sonuc.bos++;
      sonuc.detay.push({ soru: i + 1, durum: "bos", verilen: "" });
      continue;
    }
    const dogruMu = verilen === beklenen;
    dogruMu ? sonuc.dogru++ : sonuc.yanlis++;
    sonuc.detay.push({ soru: i + 1, durum: dogruMu ? "dogru" : "yanlis", verilen });
  }

  // Net: doğru − yanlış/4. İptal edilen soru paydadan da düşüyor.
  sonuc.net = Math.round((sonuc.dogru - sonuc.yanlis / 4) * 100) / 100;
  return sonuc;
}
