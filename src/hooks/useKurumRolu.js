import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";

// Kişinin kendi kurum bilgisi: kuruma bağlı mı, yöneticisi mi.
//
// ── NEDEN PANELDE DEĞİL BURADA ──────────────────────────────────
// Kurum paneli yalnız yöneticide görünmeli. Kararı panelin kendisi
// verseydi (yönetici değilse null döndürseydi) sekme listede durur ve
// tıklanınca boş açılırdı — "Testler" sekmesinde tam olarak bu
// olmuştu. Sekmeyi EKLEYİP EKLEMEME kararı panelden önce verilmeli.
//
// Okunan sütunlar (kurum_id, kurum_rolu) `users` üzerinde
// authenticated'e açık; e-posta daraltmasından etkilenmiyor.
export default function useKurumRolu(userId) {
  const [durum, setDurum] = useState({ kurumId: null, yonetici: false, yuklendi: false });

  useEffect(() => {
    let iptal = false;
    if (!userId) { setDurum({ kurumId: null, yonetici: false, yuklendi: true }); return; }

    calistir(
      supabase.from("users").select("kurum_id, kurum_rolu").eq("id", userId).maybeSingle(),
      "Kurum rolu", { sessiz: true }
    ).then(({ veri }) => {
      if (iptal) return;
      setDurum({
        kurumId:  veri?.kurum_id ?? null,
        yonetici: veri?.kurum_rolu === "yonetici" && !!veri?.kurum_id,
        yuklendi: true,
      });
    });

    return () => { iptal = true; };
  }, [userId]);

  return durum;
}
