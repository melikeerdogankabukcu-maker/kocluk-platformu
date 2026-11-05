import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";

const BOS = {
  kurumId: null, kurumAdi: null, yonetici: false, tur: null,
  uyeSayisi: 0, yoneticiVar: false, kurumGorunsun: false, yuklendi: false,
};

// Kişinin kendi kurum bilgisi: kuruma bağlı mı, yöneticisi mi, kurum
// gerçekten çok kişili mi.
//
// ── NEDEN PANELDE DEĞİL BURADA ──────────────────────────────────
// Kurum paneli yalnız yöneticide görünmeli. Kararı panelin kendisi
// verseydi (yönetici değilse null döndürseydi) sekme listede durur ve
// tıklanınca boş açılırdı — "Testler" sekmesinde tam olarak bu
// olmuştu. Sekmeyi EKLEYİP EKLEMEME kararı panelden önce verilmeli.
//
// ── SEKME ÜYEYE DE AÇIK ─────────────────────────────────────────
// İlk sürümde sekme yalnız YÖNETİCİDE çıkıyordu ve kuruma eklenen
// koçlar kurumla ilgili hiçbir şey görmüyordu — bağlı oldukları
// kurumun adını bile. Üstelik kuruma taşınan koçun rolü 'uye'ye
// sıfırlandığı için, yönetici atanmadığı sürece sekme HİÇ KİMSEDE
// çıkmıyordu.
//
// Artık sekme kurumun bütün üyelerinde var; içerik role göre
// değişiyor (yönetici yönetiyor, üye görüyor).
//
// ── TEK ÜYELİ BİREYSEL KURUMDA YİNE YOK ─────────────────────────
// Her koç öğretmen yapıldığında kendi bireysel kurumu açılıyor. Tek
// kişilik bireysel kurumda gösterecek bir şey yok.
//
// Okul türü kurumda üye sayısına BAKILMIYOR: bir okul tek koçla
// başlayabilir ve panel tam da içeri koç almak için gerekiyor.
// Gizlemek, kurumu kuran yöneticiyi kilitlerdi.
//
// Okunan sütunlar (kurum_id, kurum_rolu) `users` üzerinde
// authenticated'e açık; e-posta daraltmasından etkilenmiyor.
export default function useKurumRolu(userId) {
  const [durum, setDurum] = useState(BOS);

  useEffect(() => {
    let iptal = false;
    if (!userId) { setDurum({ ...BOS, yuklendi: true }); return; }

    (async () => {
      const { veri: ben } = await calistir(
        supabase.from("users").select("kurum_id, kurum_rolu").eq("id", userId).maybeSingle(),
        "Kurum rolu", { sessiz: true });
      if (iptal) return;

      const kurumId  = ben?.kurum_id ?? null;
      const yonetici = ben?.kurum_rolu === "yonetici" && !!kurumId;
      if (!kurumId) { setDurum({ ...BOS, yuklendi: true }); return; }

      const [{ veri: kurum }, { veri: uyeler }] = await Promise.all([
        calistir(supabase.from("kurumlar").select("ad, tur").eq("id", kurumId).maybeSingle(),
          "Kurum bilgisi", { sessiz: true }),
        calistir(supabase.from("users").select("id, kurum_rolu").eq("kurum_id", kurumId),
          "Kurum uyeleri", { sessiz: true }),
      ]);
      if (iptal) return;

      const tur = kurum?.tur ?? null;
      const liste = uyeler ?? [];
      const uyeSayisi = liste.length;
      const tekKisilikBireysel = tur === "bireysel" && uyeSayisi <= 1;

      setDurum({
        kurumId,
        kurumAdi: kurum?.ad ?? null,
        yonetici, tur, uyeSayisi,
        // Yöneticisiz kurum kilitli; üyenin bunu görmesi gerekiyor ki
        // sebebini bilsin ve yöneticiye başvursun.
        yoneticiVar: liste.some(u => u.kurum_rolu === "yonetici"),
        kurumGorunsun: !tekKisilikBireysel,
        yuklendi: true,
      });
    })();

    return () => { iptal = true; };
  }, [userId]);

  return durum;
}
