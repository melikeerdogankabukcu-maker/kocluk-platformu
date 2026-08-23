import { useState, useEffect } from "react";
import { analizGetir } from "../lib/servisApi";
import { UYANMA_ESIGI_MS } from "./useAnaliz";

// Sınav analizi verisini Python backend'inden çeker.
// Yalnızca gerektiğinde (modal açılınca) çağrılsın diye "etkin" bayrağı alır.
export function useSinavAnalizi(studentId, etkin = true, aralik = null) {
  const [veri,    setVeri]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [hata,    setHata]    = useState(false);
  const [uyaniyor, setUyaniyor] = useState(false);

  useEffect(() => {
    if (!studentId || !etkin) return;
    const sorgu = new URLSearchParams();
    if (aralik?.baslangic) sorgu.set("baslangic", aralik.baslangic);
    if (aralik?.bitis)     sorgu.set("bitis", aralik.bitis);
    const ek = sorgu.toString() ? `?${sorgu}` : "";
    let iptalEdildi = false;

    const getir = async () => {
      setLoading(true);
      setHata(false);
      const sayac = setTimeout(() => { if (!iptalEdildi) setUyaniyor(true); }, UYANMA_ESIGI_MS);
      try {
        const res = await analizGetir(`/sinav-analizi/${studentId}${ek}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!iptalEdildi) setVeri(data);
      } catch {
        // Backend kapalıysa sayfanın geri kalanı çalışmaya devam etsin
        if (!iptalEdildi) { setVeri(null); setHata(true); }
      }
      clearTimeout(sayac);
      if (!iptalEdildi) { setUyaniyor(false); setLoading(false); }
    };

    getir();
    return () => { iptalEdildi = true; };
  }, [studentId, etkin, aralik?.baslangic, aralik?.bitis]);

  return { veri, loading, hata, uyaniyor };
}
