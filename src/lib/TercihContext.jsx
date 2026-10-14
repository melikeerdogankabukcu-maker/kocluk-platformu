import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { paletCoz } from "./theme";

// Kullanıcının görünüm tercihleri (renk teması + hazır avatar).
//
// ── NEDEN BAĞLAM (CONTEXT) ──────────────────────────────────────
// Tercihi hem TopBar hem panelin kendisi kullanıyor. Her biri ayrı
// sorgu açsaydı aynı satır iki kez okunurdu ve ikisi farklı anda
// gelince bar ile panel bir an farklı renkte kalırdı.
//
// ── TABLO YOKSA UYGULAMA ÇALIŞMAYA DEVAM EDER ───────────────────
// Migration çalıştırılmadan önce de panel açılmalı: okuma hatası
// yutuluyor ve rolün varsayılan paleti kullanılıyor. Aynı karar
// TopicsContext'te de verilmişti — yeni bir tablo, çalışan uygulamayı
// düşürmemeli.
const TercihCtx = createContext(null);

const BOS = { tema: null, avatar: null };

export function TercihSaglayici({ userId, rol, children }) {
  const [tercih, setTercih] = useState(BOS);
  const [yuklendi, setYuklendi] = useState(false);

  useEffect(() => {
    let iptal = false;
    if (!userId) { setTercih(BOS); setYuklendi(true); return; }

    supabase.from("kullanici_tercihleri")
      .select("tema, avatar").eq("id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (iptal) return;
        // Tablo yok (42P01 / PGRST205) ya da okunamadı: varsayılanla devam.
        if (error && error.code !== "42P01" && error.code !== "PGRST205") {
          console.error("[Tercih okuma]", error);
        }
        setTercih(data ?? BOS);
        setYuklendi(true);
      });

    return () => { iptal = true; };
  }, [userId]);

  // Kaydetme İYİMSER: seçim ekranda hemen görünüyor, sunucu sonra
  // yetişiyor. Renk seçmek için bekleme ekranı göstermek, işin
  // kendisinden uzun sürerdi. Hata olursa eski değere dönülüyor.
  const kaydet = useCallback(async (yeni) => {
    if (!userId) return { hata: new Error("Kullanıcı yok") };
    const onceki = tercih;
    const birlesik = { ...tercih, ...yeni };
    setTercih(birlesik);

    const { error } = await supabase.from("kullanici_tercihleri")
      .upsert({ id: userId, ...birlesik }, { onConflict: "id" });

    if (error) {
      console.error("[Tercih kaydetme]", error);
      setTercih(onceki);
      return { hata: error };
    }
    return { hata: null };
  }, [userId, tercih]);

  const deger = useMemo(() => ({
    tercih, yuklendi, kaydet,
    palet: paletCoz(rol, tercih.tema),
  }), [tercih, yuklendi, kaydet, rol]);

  return <TercihCtx.Provider value={deger}>{children}</TercihCtx.Provider>;
}

// Sağlayıcı dışında çağrılırsa rolün varsayılanıyla çalışır: bir
// bileşen bağlam olmadan da render edilebilmeli (izole deneme, eski
// bir ekran) — renksiz kalıp çökmesindense varsayılan görünsün.
export function useTercih(rol = "student") {
  return useContext(TercihCtx) ?? {
    tercih: BOS, yuklendi: true,
    kaydet: async () => ({ hata: null }),
    palet: paletCoz(rol, null),
  };
}
