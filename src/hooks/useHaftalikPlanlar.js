import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { haftaBasi, tarihMetni } from "../lib/calismaPlani";

const DILIM_SIRA = { sabah: 0, ogle: 1, aksam: 2 };

// Birden fazla öğrencinin BU HAFTAKİ planı — koçun öğrenci listesi için.
//
// Öğrenci başına ayrı istek atılmıyor: 20 öğrencili bir koçta 20×3 istek
// demekti. Üç sorgu (planlar, bloklar, bağlı testler) bütün öğrencileri
// birlikte getiriyor.
//
// Dönüş: { [studentId]: { plan, bloklar, testler: { blok_id: test } } }
// Planı olmayan öğrenci haritada YOK — "plan yok" ile "plan var, blok yok"
// ekranda farklı gösterilsin.
export function useHaftalikPlanlar(studentIds) {
  const [harita, setHarita] = useState({});
  const anahtar = [...(studentIds ?? [])].sort().join(",");

  const yukle = useCallback(async () => {
    const ids = anahtar ? anahtar.split(",") : [];
    if (ids.length === 0) { setHarita({}); return; }

    const { data: planlar, error } = await supabase
      .from("calisma_planlari").select("id, student_id, hafta_basi")
      .in("student_id", ids).eq("hafta_basi", tarihMetni(haftaBasi()));
    // Tablo yoksa sessizce boş: plan özelliği kurulmamış bir ortamda
    // öğrenci listesi etkilenmesin.
    if (error || !planlar?.length) { setHarita({}); return; }

    const { data: bloklar } = await supabase
      .from("calisma_bloklari").select("*")
      .in("plan_id", planlar.map(p => p.id));

    const blokIdleri = (bloklar ?? []).map(b => b.id);
    let testler = [];
    if (blokIdleri.length) {
      const { data, error: tHata } = await supabase
        .from("test_sessions")
        .select("id, blok_id, question_count, correct_count, yanlis_count")
        .in("blok_id", blokIdleri);
      testler = tHata ? [] : data ?? [];
    }

    const testHarita = Object.fromEntries(testler.map(t => [t.blok_id, t]));
    const sonuc = {};
    planlar.forEach(p => {
      // Dilim sırası açıkça: alfabetik sıralama "akşam"ı "sabah"ın önüne
      // koyardı.
      const pb = (bloklar ?? []).filter(b => b.plan_id === p.id)
        .sort((a, b) => a.gun - b.gun || DILIM_SIRA[a.dilim] - DILIM_SIRA[b.dilim] || a.sira - b.sira);
      sonuc[p.student_id] = {
        plan: p,
        bloklar: pb,
        testler: Object.fromEntries(pb.filter(b => testHarita[b.id]).map(b => [b.id, testHarita[b.id]])),
      };
    });
    setHarita(sonuc);
  }, [anahtar]);

  useEffect(() => { yukle(); }, [yukle]);

  return { planlar: harita, yukle };
}
