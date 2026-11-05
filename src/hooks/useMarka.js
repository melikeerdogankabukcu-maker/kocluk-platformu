import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { imzaliUrl } from "../lib/depo";

// Kullanıcının göreceği kurum markası: ad + imzalı logo adresi.
//
// ── KOÇ, ÖĞRENCİ VE VELİ AYNI MARKAYI GÖRÜYOR ───────────────────
// Öğrencide kurum doğrudan yazılı değil (`users.kurum_id` yalnız
// koçlarda dolu); "koçumun kurumu" sunucuda çözülüyor
// (`marka_kurumum` RPC'si). Satış değeri burada: dershane velisine
// kendi markasını gösteriyor.
//
// ── ANAHTAR LOGONUN VARLIĞI ─────────────────────────────────────
// Logo yoksa platformun genel markası kalıyor. Kurum türüne
// bakılmıyor: kendi markasıyla çalışan tek kişilik bir koç da
// logosunu koyabiliyor.
//
// ── MARKA YOKSA EKRAN DEĞİŞMİYOR ────────────────────────────────
// RPC boş dönerse ya da logo açılamazsa `null` dönüyor; üst bar
// bugünkü hâlinde kalıyor. Markalama bir iyileştirme, uygulamanın
// açılmasının koşulu değil.
export default function useMarka(userId) {
  const [marka, setMarka] = useState(null);   // { ad, logo } | null

  useEffect(() => {
    let iptal = false;
    if (!userId) { setMarka(null); return; }

    (async () => {
      const { veri } = await calistir(supabase.rpc("marka_kurumum"),
        "Kurum markasi", { sessiz: true });
      if (iptal) return;

      // RPC tablo döndürüyor; tek satır bekleniyor.
      const k = Array.isArray(veri) ? veri[0] : veri;
      if (!k?.ad) { setMarka(null); return; }

      // Kova kapalı: logo ancak imzalı adresle açılıyor.
      const logo = k.logo_url ? await imzaliUrl(k.logo_url) : null;
      if (iptal) return;
      setMarka({ ad: k.ad, logo });
    })();

    return () => { iptal = true; };
  }, [userId]);

  return marka;
}
