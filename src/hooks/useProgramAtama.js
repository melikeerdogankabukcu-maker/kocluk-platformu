import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";

// Öğrencinin aktif çalışma programı atamaları.
// Hem program kartı hem takvim aynı veriyi kullandığı için tek yerden yönetilir.
// Tablo yoksa (migration çalışmadıysa) etkin=false döner, çağıranlar sessizce gizlenir.
//
// ÇOKLU ATAMA: eskiden tek atama döndürülüyordu (limit 1) ve yeni atama
// öncekini pasife alıyordu. Artık öğrenci birden fazla programı aynı anda
// yürütebiliyor, o yüzden hepsi dönüyor. Tekil kullanan yerler için `atama`
// ilk (en yeni) atamayı verir.
export function useProgramAtama(studentId) {
  const [atamalar, setAtamalar] = useState([]);
  const [etkin, setEtkin] = useState(true);
  const [loading, setLoading] = useState(true);

  const yukle = useCallback(async () => {
    if (!studentId) { setAtamalar([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("program_atamalari").select("*")
      .eq("student_id", studentId).eq("aktif", true)
      .order("created_at", { ascending: false });
    if (error) { setEtkin(false); setLoading(false); return; }
    setAtamalar(data ?? []);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { yukle(); }, [yukle]);

  // Bir adımı tamamlandı/tamamlanmadı olarak çevirir (iyimser güncelleme).
  // Birden fazla atama olabildiği için hangi atamaya ait olduğu artık şart.
  const satirCevir = async (atamaId, anahtar) => {
    const atama = atamalar.find(a => a.id === atamaId);
    if (!atama) return;
    const kume = new Set(atama.tamamlananlar ?? []);
    kume.has(anahtar) ? kume.delete(anahtar) : kume.add(anahtar);
    const dizi = [...kume];
    setAtamalar(list => list.map(a => (a.id === atamaId ? { ...a, tamamlananlar: dizi } : a)));
    const { hata } = await calistir(
      supabase.from("program_atamalari").update({ tamamlananlar: dizi }).eq("id", atamaId),
      "Program adimi isaretleme"
    );
    if (hata) yukle();
  };

  return { atamalar, atama: atamalar[0] ?? null, etkin, loading, yukle, satirCevir };
}
