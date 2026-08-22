import { useState, useEffect } from "react";
import { API_URL } from "../lib/config";
import { analizGetir } from "../lib/analizApi";

// Analiz servisi Render'ın ücretsiz katmanında; 15 dakika hareketsizlikten
// sonra uykuya geçiyor ve ilk istek konteyner ayağa kalkana kadar bekliyor
// (uyanıkken ~0.2sn, uykudan ~10sn). Kullanıcı "Akıllı Analiz"e basana
// kadar beklemesin diye panel açılır açılmaz servise boş bir istek atıp
// arka planda uyandırıyoruz. Yanıtı kimse okumuyor, hata da umursanmıyor —
// tek amacı konteyneri ayağa kaldırmak.
let uyandirmaDenendi = false;
export function servisiUyandir() {
  if (uyandirmaDenendi) return;          // oturum başına bir kez yeter
  uyandirmaDenendi = true;
  fetch(`${API_URL}/`, { cache: "no-store" }).catch(() => {});
}

// Uyanma bu süreyi aşarsa kullanıcıya "servis uyanıyor" denir; boş bir
// bekleme ekranı yerine ne olduğunu bilsin.
export const UYANMA_ESIGI_MS = 2500;

// Tek bir öğrenci için Python analiz backend'inden "analiz" + "öneriler" verisini
// bileşen yüklendiğinde (ya da studentId değiştiğinde) çeker.
//
// Kullanım yerleri:
//  - StudentDashboard  → kendi analizini gösterir (studentId = userId)
//  - ParentDashboard   → bağlı çocuğun analizini gösterir (studentId = child.id)
export function useAnaliz(studentId, aralik = null) {
  const [analiz,   setAnaliz]   = useState(null);
  const [oneriler, setOneriler] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [uyaniyor, setUyaniyor] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    // Tarih aralığı verilirse analiz o döneme göre hesaplanır (dönem raporu için)
    const sorgu = new URLSearchParams();
    if (aralik?.baslangic) sorgu.set("baslangic", aralik.baslangic);
    if (aralik?.bitis)     sorgu.set("bitis", aralik.bitis);
    const ek = sorgu.toString() ? `?${sorgu}` : "";
    let iptalEdildi = false;

    const getir = async () => {
      setLoading(true);
      const sayac = setTimeout(() => { if (!iptalEdildi) setUyaniyor(true); }, UYANMA_ESIGI_MS);
      try {
        const [analizRes, onerilerRes] = await Promise.all([
          analizGetir(`/analiz/${studentId}${ek}`),
          analizGetir(`/oneriler/${studentId}`),
        ]);
        const analizData   = await analizRes.json();
        const onerilerData = await onerilerRes.json();
        if (!iptalEdildi) {
          setAnaliz(analizData);
          setOneriler(onerilerData.oneriler ?? []);
        }
      } catch {
        // Backend çalışmıyorsa sessizce geç — sayfanın geri kalanı çalışmaya devam etsin
        if (!iptalEdildi) {
          setAnaliz(null);
          setOneriler([]);
        }
      }
      clearTimeout(sayac);
      if (!iptalEdildi) { setUyaniyor(false); setLoading(false); }
    };

    getir();
    return () => { iptalEdildi = true; };
  }, [studentId, aralik?.baslangic, aralik?.bitis]);

  return { analiz, oneriler, loading, uyaniyor };
}

// Birden fazla öğrencinin analizini "satıra tıklayınca getir + önbelleğe al" mantığıyla
// yönetir. TeacherDashboard'daki genişleyen öğrenci satırları için kullanılır — her
// öğrencinin analizi yalnızca ilk açılışta backend'den çekilir, sonrasında önbellekten okunur.
export function useAnalizCache() {
  const [expandedId,    setExpandedId]    = useState(null);
  const [analizCache,   setAnalizCache]   = useState({});
  const [onerilerCache, setOnerilerCache] = useState({});
  const [loadingFor,    setLoadingFor]    = useState(null);
  const [uyaniyorFor,   setUyaniyorFor]   = useState(null);

  const toggle = async (studentId) => {
    if (expandedId === studentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(studentId);
    if (analizCache[studentId]) return; // zaten önbellekte var, tekrar çekme

    setLoadingFor(studentId);
    const sayac = setTimeout(() => setUyaniyorFor(studentId), UYANMA_ESIGI_MS);
    try {
      const [analizRes, onerilerRes] = await Promise.all([
        analizGetir(`/analiz/${studentId}`),
        analizGetir(`/oneriler/${studentId}`),
      ]);
      const analizData   = await analizRes.json();
      const onerilerData = await onerilerRes.json();
      setAnalizCache(prev   => ({ ...prev, [studentId]: analizData }));
      setOnerilerCache(prev => ({ ...prev, [studentId]: onerilerData.oneriler ?? [] }));
    } catch {
      setAnalizCache(prev => ({ ...prev, [studentId]: null }));
    }
    clearTimeout(sayac);
    setUyaniyorFor(null);
    setLoadingFor(null);
  };

  return {
    expandedId,
    toggle,
    getAnaliz:   (studentId) => analizCache[studentId],
    getOneriler: (studentId) => onerilerCache[studentId] ?? [],
    isLoading:   (studentId) => loadingFor === studentId,
    isUyaniyor:  (studentId) => uyaniyorFor === studentId,
  };
}
