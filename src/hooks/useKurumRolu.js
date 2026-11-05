import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";

const BOS = { kurumId: null, yonetici: false, tur: null, uyeSayisi: 0, panelGerekli: false, yuklendi: false };

// Kişinin kendi kurum bilgisi: kuruma bağlı mı, yöneticisi mi, kurum
// gerçekten çok kişili mi.
//
// ── NEDEN PANELDE DEĞİL BURADA ──────────────────────────────────
// Kurum paneli yalnız yöneticide görünmeli. Kararı panelin kendisi
// verseydi (yönetici değilse null döndürseydi) sekme listede durur ve
// tıklanınca boş açılırdı — "Testler" sekmesinde tam olarak bu
// olmuştu. Sekmeyi EKLEYİP EKLEMEME kararı panelden önce verilmeli.
//
// ── TEK ÜYELİ BİREYSEL KURUMDA SEKME YOK ────────────────────────
// Her koç öğretmen yapıldığında kendi bireysel kurumu açılıyor ve
// yöneticisi oluyor. Yani kural yalnız "yönetici mi" olsaydı sekme
// HERKESTE çıkardı ve tek başına çalışan koç, içinde yalnız kendisi
// olan bir "kurum yönetimi" ekranı görürdü.
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
        calistir(supabase.from("kurumlar").select("tur").eq("id", kurumId).maybeSingle(),
          "Kurum turu", { sessiz: true }),
        calistir(supabase.from("users").select("id").eq("kurum_id", kurumId),
          "Kurum uye sayisi", { sessiz: true }),
      ]);
      if (iptal) return;

      const tur = kurum?.tur ?? null;
      const uyeSayisi = (uyeler ?? []).length;
      // Tek üyeli BİREYSEL kurum: panelin gösterecek bir şeyi yok.
      const tekKisilikBireysel = tur === "bireysel" && uyeSayisi <= 1;

      setDurum({
        kurumId, yonetici, tur, uyeSayisi,
        panelGerekli: yonetici && !tekKisilikBireysel,
        yuklendi: true,
      });
    })();

    return () => { iptal = true; };
  }, [userId]);

  return durum;
}
