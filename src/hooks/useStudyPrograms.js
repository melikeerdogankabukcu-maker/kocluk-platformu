import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { STUDY_PROGRAMS } from "../lib/studyPrograms";

// Program kütüphanesi. Tablo yoksa (migration çalışmadıysa) koddaki hazır
// programlara düşülür — böylece uygulama her durumda çalışır.
// Program içeriği { weeks: [...] } biçiminde; koddaki yapıyla birebir aynı.
export function useStudyPrograms() {
  const [programlar, setProgramlar] = useState([]);
  const [dbden, setDbden] = useState(false);
  const [loading, setLoading] = useState(true);

  const yukle = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("study_programs")
      .select("id, kod, title, subtitle, description, icerik, hazir")
      .order("hazir", { ascending: false })
      .order("title", { ascending: true });

    if (error || !data || data.length === 0) {
      // Yedek: koddaki hazır programlar
      setProgramlar(Object.values(STUDY_PROGRAMS).map(p => ({
        id: null, kod: p.id, title: p.title, subtitle: p.subtitle,
        description: p.description, icerik: { weeks: p.weeks }, hazir: true,
      })));
      setDbden(false);
    } else {
      setProgramlar(data);
      setDbden(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  return { programlar, dbden, loading, yukle };
}

// --- Program içeriği üzerinde sayım yardımcıları ---
export const icerikSatirSayisi = (icerik) =>
  (icerik?.weeks ?? []).reduce(
    (s, w) => s + (w.days ?? []).reduce((a, g) => a + (g.dersler ?? []).length, 0), 0);

export const icerikHaftaSatirlari = (icerik) => {
  const h = {};
  (icerik?.weeks ?? []).forEach(w => {
    h[w.week] = (w.days ?? []).reduce((s, g) => s + (g.dersler ?? []).length, 0);
  });
  return h;
};
