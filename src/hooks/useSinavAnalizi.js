import { useState, useEffect } from "react";
import { API_URL } from "../lib/config";

// Sınav analizi verisini Python backend'inden çeker.
// Yalnızca gerektiğinde (modal açılınca) çağrılsın diye "etkin" bayrağı alır.
export function useSinavAnalizi(studentId, etkin = true, aralik = null) {
  const [veri,    setVeri]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [hata,    setHata]    = useState(false);

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
      try {
        const res = await fetch(`${API_URL}/sinav-analizi/${studentId}${ek}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!iptalEdildi) setVeri(data);
      } catch {
        // Backend kapalıysa sayfanın geri kalanı çalışmaya devam etsin
        if (!iptalEdildi) { setVeri(null); setHata(true); }
      }
      if (!iptalEdildi) setLoading(false);
    };

    getir();
    return () => { iptalEdildi = true; };
  }, [studentId, etkin, aralik?.baslangic, aralik?.bitis]);

  return { veri, loading, hata };
}
