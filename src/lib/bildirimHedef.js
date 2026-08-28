import { bolumSekmesiniAc } from "./bolumBaglam";

// Bildirime tıklanınca gidilecek bölüm. Uygulama tek sayfa olduğu için
// yönlendirme yerine ilgili karta kaydırıp kısa süreli vurgu yapıyoruz.
// Hedef hem bildirim türüne hem de bakan kişinin rolüne bağlı:
// "ödev yüklendi" öğretmende Ödev Kontrol'e, öğrencide takvime gider.
//
// Öğrencide artık ayrı "Görevlerim" kartı YOK; görevler Takvimim'in içinde.
// O yüzden gorev/odev bildirimleri bolum-ders'e (takvim kartı) gidiyor.
// Öğretmen tarafı değişmedi, orada bolum-gorevler kartı duruyor.
const HEDEFLER = {
  // Görev bildirimi de öğrenci listesine: koç oradan doğruluyor.
  gorev:    { student: "bolum-ders", teacher: "bolum-ogrenciler" },
  // Koçta ÖĞRENCİ LİSTESİNE gidiyor, görev atama formuna değil: öğrencinin
  // gönderdiği dosyalar ve testler orada, öğrencinin satırı açılınca
  // görünüyor. bolum-gorevler yeni görev YAZMA formu — bildirime tıklayan
  // koç oraya düşünce "dosyaları göremiyorum" oluyor.
  odev:     { student: "bolum-ders", teacher: "bolum-ogrenciler" },
  test:     { student: "bolum-test",     teacher: "bolum-test" },
  sinav:    { student: "bolum-sinav",    teacher: "bolum-sinav" },
  ders:     { student: "bolum-ders",     teacher: "bolum-ders",  parent: "bolum-ders" },
  odeme:    { student: "bolum-ders",     teacher: "bolum-ders",  parent: "bolum-odeme" },
  baglanti: { student: "bolum-baglanti", teacher: "bolum-baglanti" },
  rozet:    { student: "bolum-rozet",    parent:  "bolum-rozet" },
  mesaj:    { student: "bolum-mesaj",    teacher: "bolum-mesaj", parent: "bolum-mesaj" },
  // Yalnızca yöneticiye gidiyor; aşağıdaki teacher→admin türetmesi bunu
  // etkilemiyor çünkü teacher anahtarı yok.
  kayit:    { admin: "bolum-rol" },
};

// Admin öğretmenin üst kümesi ve aynı paneli görüyor; bildirim hedefleri de
// aynı. Tek tek yazmak yerine türetiliyor ki yeni bir tür eklendiğinde
// admin'i güncellemeyi unutmak mümkün olmasın.
Object.values(HEDEFLER).forEach(h => { if (h.teacher) h.admin = h.teacher; });

export const bildirimHedefi = (tur, rol) => HEDEFLER[tur]?.[rol] ?? null;

// Hedefe kaydır ve kısa süre vurgula. Bölüm bulunamazsa sessizce geç.
//
// Hedef sekmeli bir bölümün KAPALI sekmesindeyse DOM'da hiç bulunmuyor.
// Önce o sekme açılıyor, sonra React'in çizmesi için bir kare beklenip
// kaydırma tekrar deneniyor — beklenmezse eleman hâlâ yoktur.
export function bolumeGit(hedefId) {
  if (!hedefId) return false;
  let el = document.getElementById(hedefId);
  if (!el) {
    if (!bolumSekmesiniAc(hedefId)) return false;
    requestAnimationFrame(() => bolumeGit(hedefId));
    return true;
  }

  el.scrollIntoView({ behavior: "smooth", block: "center" });

  const eskiGolge = el.style.boxShadow;
  const eskiGecis = el.style.transition;
  el.style.transition = "box-shadow .25s ease";
  el.style.boxShadow  = "0 0 0 3px rgba(15,110,86,0.45)";
  setTimeout(() => {
    el.style.boxShadow = eskiGolge;
    setTimeout(() => { el.style.transition = eskiGecis; }, 300);
  }, 1600);
  return true;
}
