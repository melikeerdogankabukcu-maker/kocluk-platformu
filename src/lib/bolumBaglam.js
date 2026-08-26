import { createContext, useContext } from "react";

// Bir bileşenin sekmeli bir Bolum'un içinde çizilip çizilmediği.
//
// Card ve SectionTitle buna bakıp çerçeve/başlık davranışını
// değiştiriyor; böylece alt bileşenlerin hiçbirine prop eklemek
// gerekmiyor ve biri unutulup iç içe iki kart çıkması mümkün olmuyor.
//
// Bolum.jsx yerine AYRI DOSYADA: bileşen dosyasından bağlam ve yardımcı
// dışa açmak Fast Refresh'i bozuyor (react-refresh kuralı).
export const BolumIcinde = createContext(false);

// "use" ile başlıyor: içinde useContext çağırdığı için hook adlandırma
// kuralına uyması gerekiyor, yoksa React'in hook denetimi bunu sıradan
// bir fonksiyon sanıyor.
export function useBolumIcinde() {
  return useContext(BolumIcinde);
}

// ── SEKME KAYIT DEFTERİ ─────────────────────────────────────────
// Bildirimler bolum-test, bolum-sinav gibi kimliklere kaydırıyor.
// Bölümler sekmeli olunca KAPALI sekmenin içeriği DOM'da hiç bulunmuyor:
// bildirime tıklayan kullanıcı için hiçbir şey olmaz ve hata da
// görünmez, çünkü scrollIntoView çağrılacak bir eleman yoktur.
//
// Her Bolum sekme kimliklerini buraya yazıyor; bolumeGit önce buradan
// sorup ilgili sekmeyi AÇIYOR, sonra kaydırıyor.
export const sekmeSahibi = new Map();   // hedefId -> sekmeyi açan fonksiyon

export function bolumSekmesiniAc(hedefId) {
  const ac = sekmeSahibi.get(hedefId);
  if (!ac) return false;
  ac();
  return true;
}
