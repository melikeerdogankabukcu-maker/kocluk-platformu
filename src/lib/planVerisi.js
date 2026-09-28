import { supabase } from "../supabase";
import { tarihMetni, haftaBasi } from "./calismaPlani";

// Bir öğrencinin bütün haftalık plan blokları, planın haftasıyla birlikte.
//
// Konu ilerlemesi, özet kartları ve analiz bu veriyi kullanıyor: plan ayrı
// bir sistem ama öğrencinin yaptığı iş açısından görevlerden farkı yok.
//
// Tablo yoksa (migration çalışmadıysa) ya da okuma yetkisi yoksa sessizce
// boş dönüyor — plan olmadan da panel çalışmaya devam etmeli.
export async function ogrencininBloklari(studentId) {
  const bos = { bloklar: [], buHafta: [] };
  if (!studentId) return bos;

  const { data: planlar, error } = await supabase
    .from("calisma_planlari").select("id, hafta_basi").eq("student_id", studentId);
  if (error || !planlar?.length) {
    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("[Plan okuma]", error);
    }
    return bos;
  }

  const { data: bloklar, error: bHata } = await supabase
    .from("calisma_bloklari")
    .select("id, plan_id, ders, konu, baslik, tur, yapildi, koc_onayi, sure_dk, calisilan_dk")
    .in("plan_id", planlar.map(p => p.id));
  if (bHata) { console.error("[Blok okuma]", bHata); return bos; }

  const haftasi = Object.fromEntries(planlar.map(p => [p.id, p.hafta_basi]));
  const hepsi = (bloklar ?? []).map(b => ({ ...b, hafta_basi: haftasi[b.plan_id] }));
  const buHaftaMetni = tarihMetni(haftaBasi());

  return { bloklar: hepsi, buHafta: hepsi.filter(b => b.hafta_basi === buHaftaMetni) };
}

// Birden çok öğrencinin plan blok sayıları: { studentId: { toplam, yapilan } }
//
// Koç panelindeki öğrenci satırı için. Öğrenci başına ayrı sorgu yerine
// tek seferde: beş öğrenci on istek demekti.
export async function ogrencilerinBlokSayilari(studentIdler = []) {
  if (!studentIdler.length) return {};

  const { data: planlar, error } = await supabase
    .from("calisma_planlari").select("id, student_id").in("student_id", studentIdler);
  if (error || !planlar?.length) return {};

  const { data: bloklar, error: bHata } = await supabase
    .from("calisma_bloklari").select("plan_id, yapildi")
    .in("plan_id", planlar.map(p => p.id));
  if (bHata) return {};

  const ogrencisi = Object.fromEntries(planlar.map(p => [p.id, p.student_id]));
  const sayim = {};
  (bloklar ?? []).forEach(b => {
    const ogr = ogrencisi[b.plan_id];
    if (!ogr) return;
    const g = sayim[ogr] ?? { toplam: 0, yapilan: 0 };
    g.toplam += 1;
    if (b.yapildi) g.yapilan += 1;
    sayim[ogr] = g;
  });
  return sayim;
}
