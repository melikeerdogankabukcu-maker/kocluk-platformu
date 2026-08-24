// Test sayılarının tek hesaplama yeri.
//
// Yanlış sayısı ayrıca tutuluyor çünkü YANLIŞ ile BOŞ aynı şey değil:
// TYT/AYT'de net = doğru − yanlış/4, boş bırakılan soru neti düşürmüyor.
// İkisini birbirine karıştırmak öğrencinin netini olduğundan yüksek
// gösterirdi.
//
// Boş SAKLANMIYOR, buradan türetiliyor: üçü de saklansaydı birbiriyle
// çelişebilirdi ve hangisinin doğru olduğu belirsiz kalırdı.

const sayi = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Girdi hem form alanları (metin) hem veritabanı satırı olabilir.
// yanlisAlan: veritabanında yanlis_count, formda wrong_count.
export function testOzeti(kaynak) {
  if (!kaynak) return null;
  const toplam = sayi(kaynak.question_count);
  const dogru  = sayi(kaynak.correct_count);
  const yanlis = sayi(kaynak.yanlis_count ?? kaynak.wrong_count);

  if (toplam === null || toplam <= 0) return null;

  const oran = dogru === null ? null : Math.round((dogru / toplam) * 100);

  // Yanlış girilmemişse (eski kayıtlar) boş ve net BİLİNMİYOR. Sıfır
  // varsaymak, hiç yanlışı olmayan bir test gibi gösterirdi.
  if (yanlis === null || dogru === null) {
    return { toplam, dogru, yanlis: null, bos: null, net: null, oran, gecersiz: false };
  }

  const gecersiz = dogru + yanlis > toplam;
  const bos = gecersiz ? null : toplam - dogru - yanlis;
  // Net tek ondalıkla: 12 - 5/4 = 10.75 -> 10,8
  const net = gecersiz ? null : Math.round((dogru - yanlis / 4) * 10) / 10;

  return { toplam, dogru, yanlis, bos, net, oran, gecersiz };
}

// Listelerde tek satırlık özet: "12D 5Y 3B · net 10,8"
export function testOzetMetni(kaynak) {
  const o = testOzeti(kaynak);
  if (!o) return "";
  if (o.yanlis === null) return `${o.dogru ?? 0}/${o.toplam} doğru`;
  if (o.gecersiz)        return `${o.dogru}/${o.toplam} doğru`;
  return `${o.dogru}D ${o.yanlis}Y ${o.bos}B · net ${String(o.net).replace(".", ",")}`;
}
