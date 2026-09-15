import { supabase } from "../supabase";
import { haftaKaydir, tarihMetni } from "./calismaPlani";
import { haftaBloklari, eklenecekBloklar } from "./programAktar";

// Programın seçilen haftalarını bir öğrencinin çalışma planına yazar.
// Programın 1. seçilen haftası ilkPazartesi'nin haftasına, sonrakiler
// birer hafta ileriye düşer.
//
// Plan yoksa BOŞ oluşturuluyor (kopyalamadan): koç o haftayı programdan
// kuruyor, geçen haftanın blokları üstüne binmesin. Plan varsa bloklar
// mevcutların ARKASINA ekleniyor; aynı blok ikinci kez girmiyor.
//
// Her hafta ayrı yazılıyor; bir hafta hata verirse önceki haftalar
// kalıyor ve dönüşte hangi haftada durulduğu söyleniyor. Yarım kalan
// aktarım yeniden çalıştırılabilir: eklenmiş bloklar atlanır.
export async function programiPlanaAktar({
  studentId, haftalar, ilkPazartesi, dilim = "aksam", bilinenDersler = [],
}) {
  let eklenen = 0, atlanan = 0, yazilanHafta = 0;

  for (let i = 0; i < haftalar.length; i++) {
    const hafta = tarihMetni(haftaKaydir(ilkPazartesi, i));

    const { data: planId, error: pHata } = await supabase.rpc("calisma_plani_olustur", {
      p_student: studentId, p_hafta: hafta, p_kopyala: false,
    });
    if (pHata) return { eklenen, atlanan, yazilanHafta, hata: pHata, hataHaftasi: hafta };

    const { data: mevcut, error: mHata } = await supabase
      .from("calisma_bloklari").select("gun, dilim, sira, baslik, ders, konu")
      .eq("plan_id", planId);
    if (mHata) return { eklenen, atlanan, yazilanHafta, hata: mHata, hataHaftasi: hafta };

    const { eklenecek, atlanan: a } = eklenecekBloklar(
      mevcut ?? [], haftaBloklari(haftalar[i], { dilim, bilinenDersler })
    );
    atlanan += a;

    if (eklenecek.length) {
      const { error: eHata } = await supabase
        .from("calisma_bloklari")
        .insert(eklenecek.map(b => ({ ...b, plan_id: planId })));
      if (eHata) return { eklenen, atlanan, yazilanHafta, hata: eHata, hataHaftasi: hafta };
      eklenen += eklenecek.length;
    }
    yazilanHafta += 1;
  }

  return { eklenen, atlanan, yazilanHafta, hata: null };
}
