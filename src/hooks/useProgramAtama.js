import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

// Öğrencinin aktif çalışma programı ataması.
// Hem program kartı hem takvim aynı veriyi kullandığı için tek yerden yönetilir.
// Tablo yoksa (migration çalışmadıysa) etkin=false döner, çağıranlar sessizce gizlenir.
export function useProgramAtama(studentId) {
  const [atama, setAtama] = useState(null);
  const [etkin, setEtkin] = useState(true);
  const [loading, setLoading] = useState(true);

  const yukle = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("program_atamalari").select("*")
      .eq("student_id", studentId).eq("aktif", true)
      .order("created_at", { ascending: false }).limit(1);
    if (error) { setEtkin(false); setLoading(false); return; }
    setAtama(data?.[0] ?? null);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { yukle(); }, [yukle]);

  // Bir adımı tamamlandı/tamamlanmadı olarak çevirir (iyimser güncelleme)
  const satirCevir = async (anahtar) => {
    if (!atama) return;
    const kume = new Set(atama.tamamlananlar ?? []);
    kume.has(anahtar) ? kume.delete(anahtar) : kume.add(anahtar);
    const dizi = [...kume];
    setAtama(a => ({ ...a, tamamlananlar: dizi }));
    const { error } = await supabase.from("program_atamalari")
      .update({ tamamlananlar: dizi }).eq("id", atama.id);
    if (error) { alert("Kaydedilemedi: " + error.message); yukle(); }
  };

  return { atama, etkin, loading, yukle, satirCevir };
}
