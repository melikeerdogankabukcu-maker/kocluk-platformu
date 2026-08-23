import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir, hatalariBildir } from "../lib/db";
import { branslariEkle, kocEtiketi } from "../lib/branslar";
import { COLORS } from "../lib/theme";
import { genelDegerlendirmeStil } from "../lib/analizHelpers";
import { computeTopicProgress } from "../lib/progressHelpers";
import { fmtTime, lessonStatusStyle, lessonTypeLabel } from "../lib/lessonHelpers";
import { useAnaliz } from "../hooks/useAnaliz";
import { useLessons } from "../hooks/useLessons";
import Card from "../components/Card";
import SectionTitle from "../components/SectionTitle";
import StatCard from "../components/StatCard";
import ProgressBar from "../components/ProgressBar";
import AlertChip from "../components/AlertChip";
import CalendarMonth from "../components/CalendarMonth";
import SinavAnalizi from "../components/SinavAnalizi";
import Rozetler from "../components/Rozetler";
import SeviyeAvatar from "../components/SeviyeAvatar";
import VeliRaporu from "../components/VeliRaporu";
import { useProgramAtama } from "../hooks/useProgramAtama";
import Mesajlar from "../components/Mesajlar";
import { programTakvimOgeleri } from "../lib/studyPrograms";

export default function ParentDashboard({ userId, userName }) {
  const c = COLORS.parent;
  const [child, setChild] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Mesajlaşma kişi listesi. Aşağıdaki effect içinde doldurulduğu için
  // tanımı effect'ten ÖNCE olmak zorunda — sonra tanımlansaydı setOgretmenler
  // "declared before use" ile çalışma anında patlardı.
  const [ogretmenler, setOgretmenler] = useState([]);

  useEffect(() => {
    const load = async () => {
      const { data: links, error: bagHatasi } = await supabase
        .from("family_links").select("student_id").eq("parent_id", userId);
      if (bagHatasi) console.error("[Veli-cocuk bagi]", bagHatasi);

      if (!links || links.length === 0) { setLoading(false); return; }

      const studentId = links[0].student_id;

      const sonuclar = await Promise.all([
        supabase.from("users").select("id, full_name").eq("id", studentId).single(),
        supabase.from("tasks").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
        // Cocugun onayli ogretmenleri — mesajlasma kisi listesi
        supabase.from("teacher_students").select("teacher_id")
          .eq("student_id", studentId).eq("durum", "onaylandi"),
      ]);
      hatalariBildir(sonuclar, ["cocuk bilgisi", "gorevler", "cocugun ogretmenleri"]);
      const [{ data: studentData }, { data: taskData }, { data: bagData }] = sonuclar;

      setChild(studentData);
      setTasks(taskData ?? []);

      const ogrIdleri = (bagData ?? []).map(b => b.teacher_id);
      if (ogrIdleri.length > 0) {
        const { veri } = await calistir(
          supabase.from("users").select("id, full_name").in("id", ogrIdleri),
          "Ogretmen listesi", { sessiz: true }
        );
        setOgretmenler(await branslariEkle(veri ?? []));
      }
      setLoading(false);
    };
    load();
  }, [userId]);

  // Akıllı analiz (Python backend) — çocuğun genel değerlendirmesi
  const { analiz } = useAnaliz(child?.id);

  // Çocuğun çalışma programları — takvimde salt okunur görünür.
  // Birden fazla program aynı anda aktif olabilir; hepsinin adımları işlenir.
  const { atamalar: programAtamalari } = useProgramAtama(child?.id);
  const programOgeleri = programAtamalari.flatMap(a => programTakvimOgeleri(a));

  // Çocuğun dersleri (RLS: veli bağlı çocuğun derslerini okuyabilir)
  const { lessons, reportPaid } = useLessons(userId);

  // Takvimde salt-okunur görev gösterimi
  const renderTask = (t) => (
    <div key={"task-" + t.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#F3F7FF", border: "1px solid #DCE7FB" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: t.is_done ? "#9aa" : "#222",
            textDecoration: t.is_done ? "line-through" : "none",
          }}>📌 {t.title}</div>
          {t.subject && <div style={{ fontSize: 11, color: "#8896b5", marginTop: 1 }}>{t.subject}</div>}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, flexShrink: 0,
          background: t.is_done ? "#E8F9F0" : "#EAF1FE",
          color:      t.is_done ? "#1A6B3C" : "#3763C4",
        }}>{t.is_done ? "Yapıldı ✓" : "Yapılacak"}</span>
      </div>
    </div>
  );

  // Takvimde salt-okunur çalışma programı adımı
  const renderProgramOge = (o) => (
    <div key={o.id} style={{
      display: "flex", alignItems: "flex-start", gap: 9,
      padding: "10px 12px", borderRadius: 10,
      background: o.tamamlandi ? "#F4FBF7" : "#FFFAF0",
      border: `1px solid ${o.tamamlandi ? "#D5EBDE" : "#F0E2C4"}`,
    }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>{o.tamamlandi ? "✅" : "📚"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600,
          color: o.tamamlandi ? "#9bb0a5" : "#222",
          textDecoration: o.tamamlandi ? "line-through" : "none",
        }}>{o.ders} — {o.konu}</div>
        <div style={{ fontSize: 10.5, color: "#a08c6a", marginTop: 1 }}>
          {o.hafta}. hafta · {o.sure}
        </div>
      </div>
    </div>
  );

  // Takvimde salt-okunur ders gösterimi
  // Katılım rozeti — LessonPlanner'daki ile aynı renkler
  const KATILIM_ROZET = {
    geldi:     { label: "Geldi ✓",   bg: "#E8F9F0", color: "#1A6B3C" },
    gec_geldi: { label: "Geç geldi", bg: "#FFF7E6", color: "#854F0B" },
    gelmedi:   { label: "Gelmedi",   bg: "#FFF0F0", color: "#A32D2D" },
  };

  const renderLesson = (l) => {
    const st = lessonStatusStyle(l.status);
    return (
      <div key={l.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#fafaf8", border: "1px solid #f0ede8" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>
              {fmtTime(l.start_time)}{l.end_time ? `–${fmtTime(l.end_time)}` : ""} · {l.teacher?.full_name ?? "Öğretmen"}
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              {lessonTypeLabel(l.lesson_type)}
              {l.lesson_type === "yuzyuze" && l.location ? ` · 📍 ${l.location}` : ""}
              {l.title ? ` · ${l.title}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* Katılım: veli de görsün. Öğretmen işaretlemediyse hiç çıkmıyor. */}
            {l.katilim && KATILIM_ROZET[l.katilim] && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99,
                background: KATILIM_ROZET[l.katilim].bg, color: KATILIM_ROZET[l.katilim].color,
              }}>{KATILIM_ROZET[l.katilim].label}</span>
            )}
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: st.bg, color: st.color }}>
              {st.label}
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 13 }}>Yükleniyor...</div>
  );

  if (!child) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>👨‍👩‍👦</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>Henüz bir öğrenci bağlantısı yok</div>
      {/* Eski metin "öğretmeninizden isteyin" diyordu ama öğretmende böyle
          bir düğme yoktu — veli çıkmaza giriyordu. Artık bağ, kayıt
          onaylanırken kuruluyor; burası yalnızca eksik kaldığı durum. */}
      <div style={{
        fontSize: 13, color: "#777", marginTop: 8, lineHeight: 1.6,
        maxWidth: 380, marginLeft: "auto", marginRight: "auto",
      }}>
        Hesabınız henüz bir öğrenciye bağlanmadı. Koçunuza <b>çocuğunuzun
        platformda kayıtlı e-posta adresini</b> iletin; bağlantıyı kurduğunda
        çocuğunuzun gelişimi burada görünmeye başlayacak.
      </div>
    </div>
  );

  const doneTasks  = tasks.filter(t => t.is_done).length;
  const totalTasks = tasks.length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Konu ilerlemesi: görevlerden otomatik hesaplanır (elle giriş kaldırıldı)
  const progressList = computeTopicProgress(tasks);

  // Yazışılabilecek kişiler: çocuk ve koçları. Çocuk EN ÜSTTE — velinin
  // en doğal muhatabı o. Buraya kadar geldiysek child zaten dolu.
  const mesajKisileri = [
    { ...child, etiket: "· çocuğunuz" },
    ...ogretmenler.map(o => ({ ...o, etiket: kocEtiketi(o) })),
  ];

  // Ödeme takibi — yalnızca öğretmenin 'yapıldı' işaretlediği dersler
  const completedLessons = lessons.filter(l => l.completed);
  const paidCount     = completedLessons.filter(l => l.payment_status === "odendi").length;
  const reportedCount = completedLessons.filter(l => l.payment_status === "bildirildi").length;
  const unpaidCount   = completedLessons.filter(l => l.payment_status === "odenmedi").length;

  return (
    <div style={{ padding: "20px 16px", maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ background: c.bg, borderRadius: 18, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Merhaba, {userName}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.2 }}>
            {child.full_name}<br />
            {doneTasks === totalTasks && totalTasks > 0 ? "Tüm görevler tamam! 🎉" : `${totalTasks - doneTasks} görev bekliyor`}
          </div>
          <AlertChip type={pct >= 80 ? "success" : pct >= 40 ? "warn" : "danger"}
            text={`Görevlerin %${pct}'i tamamlandı`} />
        </div>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: "rgba(255,255,255,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
        }}>👨‍👩‍👦</div>
      </div>

      {/* Genel değerlendirme: çaba (görev tamamlama) + sonuç (sınav trendi) birleşimi */}
      {analiz?.genel_degerlendirme && (() => {
        const gd = analiz.genel_degerlendirme;
        const stil = genelDegerlendirmeStil(gd.durum);
        return (
          <Card>
            <SectionTitle title="Genel Değerlendirme" color={c.mid} />
            <div style={{
              padding: "14px 16px", borderRadius: 12,
              background: stil.bg, border: `1px solid ${stil.renk}22`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>{stil.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: stil.renk }}>{gd.baslik}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#444", lineHeight: 1.5 }}>{gd.aciklama}</div>
              {gd.ek_notlar?.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${stil.renk}22`, display: "flex", flexDirection: "column", gap: 4 }}>
                  {gd.ek_notlar.map((n, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: "#666", lineHeight: 1.4 }}>{n}</div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        );
      })()}

      {/* Stats */}
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Toplam görev"  value={totalTasks} sub="atandı"    color={c.mid} />
        <StatCard label="Tamamlanan"    value={doneTasks}  sub="görev"     color={c.mid} />
        <StatCard label="Tamamlanma"    value={`%${pct}`}  sub="oran"      color={c.mid} />
      </div>

      {/* Sınav Analizi (çocuğun net gelişimi + odak konular) */}
      <SinavAnalizi studentId={child.id} color={c} baslik={`${child.full_name.split(" ")[0]} — Sınav Analizi`} />

      {/* Dönem raporu (yazdırılabilir) */}
      <VeliRaporu studentId={child.id} studentName={child.full_name} color={c} />

      {/* Çocuğun seviyesi ve rozetleri */}
      <SeviyeAvatar studentId={child.id} color={c} salt baslik={`${child.full_name.split(" ")[0]} — Seviye`} />
      <Rozetler studentId={child.id} color={c} baslik={`${child.full_name.split(" ")[0]} — Rozetler`} />

      {/* Ödeme Durumu */}
      <Card id="bolum-odeme">
        <SectionTitle title="Ödeme Durumu" color={c.mid} />
        <div style={{ display: "flex", gap: 10, marginBottom: completedLessons.length ? 14 : 0 }}>
          <StatCard label="Yapılan ders" value={completedLessons.length}     sub="toplam" color={c.mid} />
          <StatCard label="Ödenen"       value={paidCount}                   sub="ders"   color={c.mid} />
          <StatCard label="Bekleyen"     value={unpaidCount + reportedCount} sub="ders"   color={c.mid} />
        </div>
        {completedLessons.length === 0 ? (
          <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: "8px 0" }}>Henüz yapılmış (ücretlendirilen) ders yok</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {completedLessons.map(l => {
              const paid     = l.payment_status === "odendi";
              const reported = l.payment_status === "bildirildi";
              return (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "#fafaf8" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>
                      {new Date(l.lesson_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}
                      {l.teacher?.full_name ? ` · ${l.teacher.full_name}` : ""}
                    </div>
                    {l.title && <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{l.title}</div>}
                  </div>
                  {paid ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "#E8F9F0", color: "#1A6B3C", flexShrink: 0 }}>Ödendi ✓</span>
                  ) : reported ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "#FFF7E6", color: "#854F0B", flexShrink: 0 }}>Onay bekleniyor</span>
                  ) : (
                    <button onClick={() => reportPaid(l.id)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 99, border: "none", background: c.bg, color: "#fff", cursor: "pointer", flexShrink: 0 }}>Ödedim</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Son görevler */}
      <Card>
        <SectionTitle title={`${child.full_name.split(" ")[0]}'in Görevleri`} color={c.mid} />
        {tasks.length === 0 ? (
          <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0", textAlign: "center" }}>Henüz görev atanmadı 📭</div>
        ) : tasks.slice(0, 6).map((t, i) => (
          <div key={t.id} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 0", borderBottom: i < Math.min(tasks.length, 6) - 1 ? "1px solid #f5f2ee" : "none",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              background: t.is_done ? c.mid : "transparent",
              border: t.is_done ? "none" : `2px solid ${c.mid}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {t.is_done && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500,
                color: t.is_done ? "#bbb" : "#222",
                textDecoration: t.is_done ? "line-through" : "none" }}>{t.title}</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                {[t.subject, t.estimated_minutes ? `${t.estimated_minutes} dk` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            {!t.is_done && (
              <span style={{ fontSize: 11, background: "#FFF7E6", color: "#854F0B",
                padding: "3px 9px", borderRadius: 99, fontWeight: 500 }}>Bekliyor</span>
            )}
          </div>
        ))}
      </Card>

      {/* Konu ilerlemesi */}
      <Card>
        <SectionTitle title="Konu ilerlemesi" color={c.mid} />
        {progressList.length === 0 ? (
          <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0", textAlign: "center" }}>Henüz ilerleme kaydedilmedi 📊</div>
        ) : progressList.map(p => (
          <ProgressBar
            key={`${p.subject}||${p.topic}`}
            pct={p.percentage}
            color={p.percentage >= 80 ? c.mid : p.percentage >= 50 ? "#EF9F27" : "#E24B4A"}
            label={`${p.subject} — ${p.topic}`}
            sub={`${p.done}/${p.total} görev · %${p.percentage}${p.percentage >= 80 ? " ✓" : ""}`}
          />
        ))}
      </Card>

      {/* Ders Takvimi (salt okunur) */}
      {/* Çocuk ve koçlarıyla mesajlaşma */}
      <Mesajlar userId={userId} kisiler={mesajKisileri} color={c} baslik="Mesajlar" />

      <Card id="bolum-ders">
        <SectionTitle title="Ders Takvimi" color={c.mid} />
        <CalendarMonth lessons={lessons} tasks={tasks} programItems={programOgeleri}
          color={c} renderLesson={renderLesson} renderTask={renderTask} renderProgram={renderProgramOge} />
      </Card>
    </div>
  );
}
