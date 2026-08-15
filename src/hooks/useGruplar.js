import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { hatalariBildir } from "../lib/db";

// Öğretmenin öğrenci grupları ve üyelikleri.
// Hem grup yönetimi hem toplu atama (görev/program) aynı veriyi kullandığı için
// tek yerden yönetilir. Tablo yoksa etkin=false → çağıranlar sessizce gizlenir.
export function useGruplar(teacherId) {
  const [gruplar, setGruplar] = useState([]);      // [{id, ad, aciklama, renk, uyeler:[studentId]}]
  const [etkin, setEtkin]     = useState(true);
  const [loading, setLoading] = useState(true);

  const yukle = useCallback(async () => {
    if (!teacherId) { setLoading(false); return; }
    const { data: gs, error } = await supabase
      .from("ogrenci_gruplari").select("*")
      .eq("teacher_id", teacherId).order("ad");
    if (error) { setEtkin(false); setLoading(false); return; }

    const idler = (gs ?? []).map(g => g.id);
    let uyelikler = [];
    if (idler.length > 0) {
      const { data, error } = await supabase
        .from("grup_ogrencileri").select("grup_id, student_id").in("grup_id", idler);
      if (error) console.error("[Grup uyelikleri]", error);
      uyelikler = data ?? [];
    }
    setGruplar((gs ?? []).map(g => ({
      ...g,
      uyeler: uyelikler.filter(u => u.grup_id === g.id).map(u => u.student_id),
    })));
    setLoading(false);
  }, [teacherId]);

  useEffect(() => { yukle(); }, [yukle]);

  const grupEkle = async (ad, aciklama, renk) => {
    const { error } = await supabase.from("ogrenci_gruplari")
      .insert({ teacher_id: teacherId, ad: ad.trim(), aciklama: aciklama?.trim() || null, renk });
    if (error) return { error };
    await yukle();
    return {};
  };

  const grupSil = async (grupId) => {
    const { error } = await supabase.from("ogrenci_gruplari").delete().eq("id", grupId);
    if (error) return { error };
    await yukle();
    return {};
  };

  const uyeEkle = async (grupId, studentId) => {
    const { error } = await supabase.from("grup_ogrencileri")
      .insert({ grup_id: grupId, student_id: studentId });
    if (error) return { error };
    await yukle();
    return {};
  };

  const uyeCikar = async (grupId, studentId) => {
    const { error } = await supabase.from("grup_ogrencileri")
      .delete().eq("grup_id", grupId).eq("student_id", studentId);
    if (error) return { error };
    await yukle();
    return {};
  };

  return { gruplar, etkin, loading, yukle, grupEkle, grupSil, uyeEkle, uyeCikar };
}
