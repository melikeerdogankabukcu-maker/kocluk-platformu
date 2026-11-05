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

// ── RENK SIÇRAMASI (5 Kasım 2026) ───────────────────────────────
// Tercih sunucudan geldiği için ilk render'da `tema` boştu ve rolün
// VARSAYILAN yeşili çiziliyordu; seçilen renk ancak sorgu dönünce
// geliyordu. Yani her açılışta önce yanlış renk görünüyordu ve yavaş
// bağlantıda bu bir saniyeyi buluyordu.
//
// Tercih artık cihazda da tutuluyor ve ilk render ONDAN başlıyor.
// Sunucu yine sorulmaya devam ediyor; cihazdaki kopya yalnız o yanıt
// gelene kadarki boşluğu dolduruyor, SON SÖZ her zaman sunucunun.
//
// Anahtar kullanıcı başına: ortak bir cihazda ikinci hesap, birincinin
// rengiyle açılmasın.
const yerelAnahtar = (userId) => `ustad.tercih.${userId}`;

// localStorage gizli pencerede ve depolama kapalıyken PATLAYABİLİYOR;
// renk tercihi için uygulamayı düşürmeye değmez.
function yerelOku(userId) {
  if (!userId) return null;
  try {
    const ham = localStorage.getItem(yerelAnahtar(userId));
    if (!ham) return null;
    const v = JSON.parse(ham);
    // Bozuk ya da elle düzenlenmiş kayıt: yok sayılıyor.
    return v && typeof v === "object" ? { tema: v.tema ?? null, avatar: v.avatar ?? null } : null;
  } catch { return null; }
}

function yerelYaz(userId, tercih) {
  if (!userId) return;
  try { localStorage.setItem(yerelAnahtar(userId), JSON.stringify(tercih)); } catch { /* yok sayılıyor */ }
}

export function TercihSaglayici({ userId, rol, children }) {
  // İlk değer cihazdan: sunucu yanıtı beklenmeden doğru renkle açılıyor.
  const [tercih, setTercih] = useState(() => yerelOku(userId) ?? BOS);
  const [yuklendi, setYuklendi] = useState(false);

  useEffect(() => {
    let iptal = false;
    if (!userId) { setTercih(BOS); setYuklendi(true); return; }

    // Kullanıcı değiştiyse (çıkış-giriş) ilk değer artık eskiye ait;
    // yeni kullanıcının cihazdaki kaydı varsa ona geçiliyor.
    setTercih(yerelOku(userId) ?? BOS);

    supabase.from("kullanici_tercihleri")
      .select("tema, avatar").eq("id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (iptal) return;
        // Tablo yok (42P01 / PGRST205) ya da okunamadı: varsayılanla devam.
        if (error && error.code !== "42P01" && error.code !== "PGRST205") {
          console.error("[Tercih okuma]", error);
        }
        // Okuma BAŞARISIZSA cihazdaki kopya korunuyor: sunucuya
        // ulaşılamadı diye kullanıcının rengini sıfırlamak, çevrimdışı
        // açılışta her seferinde yanlış renk demek olurdu.
        if (error) { setYuklendi(true); return; }
        const gelen = data ?? BOS;
        setTercih(gelen);
        yerelYaz(userId, gelen);
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
    // Cihaza da hemen yazılıyor: sayfa kaydetmeden önce yenilenirse
    // kullanıcı seçtiği rengi görmeye devam etsin.
    yerelYaz(userId, birlesik);

    const { error } = await supabase.from("kullanici_tercihleri")
      .upsert({ id: userId, ...birlesik }, { onConflict: "id" });

    if (error) {
      console.error("[Tercih kaydetme]", error);
      setTercih(onceki);
      yerelYaz(userId, onceki);
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
