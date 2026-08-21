import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir, hatalariBildir } from "../lib/db";
import { API_URL } from "../lib/config";
import { COLORS } from "../lib/theme";
import { genelDegerlendirmeStil } from "../lib/analizHelpers";
import { useTopics } from "../lib/TopicsContext";
import { bolumeGit } from "../lib/bildirimHedef";
import { programTakvimOgeleri } from "../lib/studyPrograms";
import SinavGirisFormu from "../components/SinavGirisFormu";
import KonuYonetimi from "../components/KonuYonetimi";
import BaglantiYonetimi from "../components/BaglantiYonetimi";
import GrupYonetimi from "../components/GrupYonetimi";
import VeliRaporu from "../components/VeliRaporu";
import HaftalikProgram from "../components/HaftalikProgram";
import Mesajlar from "../components/Mesajlar";
import DenetimKaydi from "../components/DenetimKaydi";
import RolYonetimi from "../components/RolYonetimi";
import { useGruplar } from "../hooks/useGruplar";
import ProgramDuzenleyici from "../components/ProgramDuzenleyici";
import { useAnalizCache } from "../hooks/useAnaliz";
import Card from "../components/Card";
import SectionTitle from "../components/SectionTitle";
import StatCard from "../components/StatCard";
import AlertChip from "../components/AlertChip";
import LessonPlanner from "../components/LessonPlanner";
import SinavAnalizi from "../components/SinavAnalizi";

export default function TeacherDashboard({ userId, userName, role }) {
  const c = COLORS.teacher;
  const { sinavTurleri, examSubjectsOf, topicsOf, tumDersler: tumDerslerFn, tumKonular: tumKonularFn, dersinTuru } = useTopics();
  const { gruplar, yukle: gruplariTazele } = useGruplar(userId);
  const [students,    setStudents]    = useState([]);
  const [taskMap,     setTaskMap]     = useState({});
  const [profileMap,  setProfileMap]  = useState({});
  const [submissions, setSubmissions] = useState([]);
  const [recentTests, setRecentTests] = useState([]);
  // Ogrenci basina gomulu program adimlari (haftalik program ciktisinda kullaniliyor)
  const [programMap,  setProgramMap]  = useState({});
  // Mesajlasilabilecek veliler: ogrencilerin family_links kayitlarindan
  const [veliler,     setVeliler]     = useState([]);
  const [bagKurulabilir, setBagKurulabilir] = useState(false);  // teacher_students tablosu var mı

  // Görev listesi uzun olabilir (bir program tek seferde onlarca görev açar);
  // varsayılan olarak son 6 tanesi gösterilir, bu state hangi öğrencinin
  // listesinin tamamen açıldığını tutar.
  const [acikGorevListesi, setAcikGorevListesi] = useState(null);
  // Düzenlenen görevin taslağı: { id, title, subject, topic, due_date, estimated_minutes }
  const [gorevTaslak, setGorevTaslak] = useState(null);
  const [returningId, setReturningId] = useState(null);
  const [returnNote,  setReturnNote]  = useState("");
  const [loading,     setLoading]     = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  // due_dates: birden fazla tarih seçilebilir. Her (öğrenci × tarih) için
  // ayrı görev satırı açılır — grup atamasındaki mantığın aynısı, herkes
  // kendi ilerlemesini tutsun diye.
  const [form, setForm] = useState({
    student_id: "", title: "", subject: "", custom_subject: "", topic: "",
    exam_type: "TYT", estimated_minutes: "", due_dates: [],
  });
  const [tarihGirdi, setTarihGirdi] = useState("");

  const tarihEkle = (t) => {
    if (!t) return;
    setForm(f => (f.due_dates.includes(t) ? f : { ...f, due_dates: [...f.due_dates, t].sort() }));
  };
  const tarihCikar = (t) =>
    setForm(f => ({ ...f, due_dates: f.due_dates.filter(x => x !== t) }));

  // Öğrenci analizi (Python backend) — satıra tıklayınca getir + önbelleğe al
  const { expandedId: expandedStudent, toggle: toggleAnaliz, getAnaliz, getOneriler, isLoading: isLoadingAnalizFor, isUyaniyor: isUyaniyorAnalizFor } = useAnalizCache();

  const loadData = async () => {
    // Yalnızca bu öğretmene bağlı öğrenciler. teacher_students tablosu henüz
    // yoksa (migration çalışmadıysa) eski davranışa düşülür.
    const { data: baglar, error: bagHata } = await supabase
      .from("teacher_students").select("student_id")
      .eq("teacher_id", userId).eq("durum", "onaylandi");

    let studentData = [];
    if (bagHata) {
      const { data, error } = await supabase
        .from("users").select("id, full_name, email").eq("role", "student");
      if (error) console.error("[Ogrenci listesi]", error);
      studentData = data ?? [];
    } else {
      const ids = (baglar ?? []).map(b => b.student_id);
      if (ids.length > 0) {
        const { data, error } = await supabase
          .from("users").select("id, full_name, email").in("id", ids);
        if (error) console.error("[Bagli ogrenciler]", error);
        studentData = data ?? [];
      }
    }
    setBagKurulabilir(!bagHata);

    const studentIds = studentData.map(s => s.id);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const sonuclar = await Promise.all([
      supabase.from("tasks").select("*").eq("teacher_id", userId),
      studentIds.length > 0
        ? supabase.from("student_profiles").select("*").in("id", studentIds)
        : Promise.resolve({ data: [] }),
      studentIds.length > 0
        ? supabase.from("homework_submissions")
            .select("*, tasks(title, subject)")
            .in("student_id", studentIds)
            .order("submitted_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      studentIds.length > 0
        ? supabase.from("test_sessions")
            .select("*")
            .in("student_id", studentIds)
            .gte("created_at", weekAgo.toISOString())
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      studentIds.length > 0
        ? supabase.from("program_atamalari").select("*")
            .in("student_id", studentIds).eq("aktif", true)
        : Promise.resolve({ data: [] }),
      // Ogrencilerin velileri — mesajlasma kisi listesi icin
      studentIds.length > 0
        ? supabase.from("family_links").select("parent_id, student_id")
            .in("student_id", studentIds)
        : Promise.resolve({ data: [] }),
    ]);
    hatalariBildir(sonuclar,
      ["gorevler", "ogrenci profilleri", "odev gonderimleri", "testler",
       "program atamalari", "veli baglantilari"]);
    const [{ data: taskData }, { data: profileData }, { data: submissionData },
      { data: testData }, { data: atamaData }, { data: veliBaglari }] = sonuclar;

    // Gomulu programlarin adimlarini ogrenciye gore grupla. Ogretmenin kendi
    // yazdigi programlar zaten goreve donustugu icin burada yer almaz.
    const progMap = {};
    (atamaData ?? []).forEach(a => {
      (progMap[a.student_id] ??= []).push(...programTakvimOgeleri(a));
    });

    const grouped = {};
    (taskData ?? []).forEach(t => {
      if (!grouped[t.student_id]) grouped[t.student_id] = [];
      grouped[t.student_id].push(t);
    });

    const profMap = {};
    (profileData ?? []).forEach(p => { profMap[p.id] = p; });

    setStudents(studentData);
    setTaskMap(grouped);
    setProfileMap(profMap);
    setSubmissions(submissionData ?? []);
    setRecentTests(testData ?? []);
    setProgramMap(progMap);

    // Veli adlarini cek; hangi ogrencinin velisi oldugu etikette gosteriliyor
    const veliIdleri = [...new Set((veliBaglari ?? []).map(v => v.parent_id))];
    if (veliIdleri.length > 0) {
      const { veri } = await calistir(
        supabase.from("users").select("id, full_name").in("id", veliIdleri),
        "Veli listesi", { sessiz: true }
      );
      const ogrenciAdi = Object.fromEntries(studentData.map(s => [s.id, s.full_name]));
      setVeliler((veri ?? []).map(v => {
        const bag = (veliBaglari ?? []).find(b => b.parent_id === v.id);
        return { ...v, etiket: bag ? `· ${ogrenciAdi[bag.student_id] ?? ""} velisi` : "· veli" };
      }));
    } else setVeliler([]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [userId]);

  // Seçili hedefin öğrenci id'leri — tek öğrenci ya da bir grubun tamamı
  const hedefOgrenciler = () => {
    if (form.student_id.startsWith("grup:")) {
      const g = gruplar.find(x => x.id === form.student_id.slice(5));
      return g ? g.uyeler : [];
    }
    return form.student_id ? [form.student_id] : [];
  };

  const handleAssign = async () => {
    const hedefler = hedefOgrenciler();
    if (hedefler.length === 0 || !form.title.trim()) return;
    setSaving(true);
    const ortak = {
      teacher_id: userId,
      title: form.title.trim(),
      subject: (form.subject === "__diger" ? form.custom_subject.trim() : form.subject) || null,
      // Ders seçici değişince topic zaten temizleniyor (aşağıdaki onChange),
      // bu yüzden burada ayrıca __diger kontrolü gerekmiyor. Kaldırılması
      // kopyalanan görevin konusunu koruyor: müfredat dışı dersli bir görev
      // kopyalandığında konusu da geliyor.
      topic: form.topic || null,
      estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
    };
    // Her (öğrenci × tarih) için ayrı satır: gruba atamadaki mantığın aynısı,
    // herkes kendi ilerlemesini tutsun diye. Tarih seçilmediyse tek satır ve
    // due_date null — eski davranış korunur.
    const tarihler = form.due_dates.length > 0 ? form.due_dates : [null];
    const satirlar = hedefler.flatMap(sid =>
      tarihler.map(t => ({ ...ortak, student_id: sid, due_date: t }))
    );
    // Gruptaki bir ogrencinin bagi onayli degilse WITH CHECK tum insert'i
    // reddeder; hata okunmazsa ogretmen hicbir gorev atanmadigini fark etmez.
    const { hata } = await calistir(
      supabase.from("tasks").insert(satirlar),
      "Gorev atama"
    );
    setSaving(false);
    if (hata) return;
    setForm({ student_id: "", title: "", subject: "", custom_subject: "", topic: "",
      exam_type: "TYT", estimated_minutes: "", due_dates: [] });
    setTarihGirdi("");
    setShowForm(false);
    loadData();
  };

  // Görev düzenleme/silme. RLS'de ek iş yok: "Ogretmen kendi ogrencisinin
  // gorevleri" politikası FOR ALL ve ogrencim_mi(student_id) kontrollü.
  // Ders/konu listeleri TYT ve AYT'nin birleşimi: tasks tablosunda exam_type
  // tutulmuyor, hangi sınavdan geldiği bilinmiyor.
  // Gorev duzenlemede ders/konu listeleri TUM sinav turlerinin birlesimi:
  // tasks tablosunda exam_type tutulmuyor, gorevin hangi sinavdan geldigi
  // bilinmiyor. Once yalnizca TYT+AYT birlestiriliyordu; KPSS/LGS/DGS
  // eklenince o dersler listede hic gorunmezdi.
  const tumDersler = tumDerslerFn();
  const tumKonular = (ders) => tumKonularFn(ders);

  const duzenleInput = {
    padding: "6px 9px", borderRadius: 7, border: "1.5px solid #f0ede8",
    fontSize: 11.5, boxSizing: "border-box", width: "100%", background: "#fff",
  };

  const gorevDuzenle = (t) => setGorevTaslak({
    id: t.id, title: t.title ?? "", subject: t.subject ?? "", topic: t.topic ?? "",
    due_date: t.due_date ?? "", estimated_minutes: t.estimated_minutes ?? "",
  });

  const gorevKaydet = async () => {
    if (!gorevTaslak?.title.trim()) { alert("Görev başlığı boş olamaz"); return; }
    setSaving(true);
    const { hata } = await calistir(
      supabase.from("tasks").update({
        title: gorevTaslak.title.trim(),
        subject: gorevTaslak.subject || null,
        topic: gorevTaslak.topic || null,
        due_date: gorevTaslak.due_date || null,
        estimated_minutes: gorevTaslak.estimated_minutes
          ? parseInt(gorevTaslak.estimated_minutes) : null,
      }).eq("id", gorevTaslak.id),
      "Gorev guncelleme"
    );
    setSaving(false);
    if (hata) return;
    setGorevTaslak(null);
    loadData();
  };

  // Kopyalama ayrı bir form açmıyor: mevcut "Görev Ata" formunu görevin
  // içeriğiyle dolduruyor. Böylece çoklu tarih ve gruba atama gibi tüm
  // yetenekler kopyada da geçerli oluyor.
  const gorevKopyala = (t) => {
    // Dersin hangi sınav müfredatında olduğunu bul; hiçbirinde yoksa
    // "Diğer (elle yaz)" kipine düş, ders adı kaybolmasın.
    // Konu da veriliyor: aynı ders birden fazla sınavda geçebiliyor,
    // konu eşleşmesi hangi sınava ait olduğunu kesinleştiriyor.
    const tur = dersinTuru(t.subject, t.topic);
    setForm({
      student_id: t.student_id,
      title: t.title ?? "",
      subject: tur ? t.subject : (t.subject ? "__diger" : ""),
      custom_subject: tur ? "" : (t.subject ?? ""),
      topic: t.topic ?? "",
      exam_type: tur ?? "TYT",
      estimated_minutes: t.estimated_minutes ?? "",
      due_dates: [],            // tarihi öğretmen yeniden seçsin
    });
    setTarihGirdi("");
    setShowForm(true);
    // Form listenin altında; kullanıcı nereye gittiğini görsün.
    setTimeout(() => bolumeGit("bolum-gorevler"), 50);
  };

  const gorevSil = async (t) => {
    if (!window.confirm(`"${t.title}" görevi silinsin mi?\n\nBu işlem geri alınamaz.`)) return;
    setSaving(true);
    const { hata } = await calistir(
      supabase.from("tasks").delete().eq("id", t.id),
      "Gorev silme"
    );
    setSaving(false);
    if (hata) return;
    loadData();
  };

  const handleReview = async (submissionId, status, note = null) => {
    const { hata } = await calistir(
      supabase.from("homework_submissions").update({
        status,
        teacher_note: note || null,
        reviewed_at:  new Date().toISOString(),
      }).eq("id", submissionId),
      "Odev degerlendirme"
    );
    if (hata) return;
    setReturningId(null);
    setReturnNote("");
    loadData();
  };

  const pendingSubmissions = submissions.filter(s => s.status === "beklemede");

  const totalTasks = Object.values(taskMap).flat().length;
  const doneTasks  = Object.values(taskMap).flat().filter(t => t.is_done).length;

  const initials = (name = "") => name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ padding: "20px 16px", maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ background: c.bg, borderRadius: 18, padding: "22px 24px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Merhaba, {userName}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.2 }}>
          {students.length} öğrenci<br />toplam {totalTasks} görev atandı
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <AlertChip type="success" text={`${doneTasks} görev tamamlandı`} />
          <AlertChip type="warn"    text={`${totalTasks - doneTasks} bekliyor`} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Öğrenci"     value={students.length} sub="kayıtlı"   color={c.mid} />
        <StatCard label="Atanan görev" value={totalTasks}      sub="toplam"    color={c.mid} />
        <StatCard label="Tamamlanan"  value={doneTasks}        sub="görev"     color={c.mid} />
      </div>

      {/* Öğrenci listesi */}
      <Card>
        <SectionTitle title="Öğrenci durumu" action="+ Görev Ata" color={c.mid} />
        {loading ? (
          <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0" }}>Yükleniyor...</div>
        ) : students.length === 0 ? (
          <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
            Henüz öğrenci yok 📭
          </div>
        ) : students.map((s, i) => {
          const sTasks  = taskMap[s.id] ?? [];
          const done    = sTasks.filter(t => t.is_done).length;
          const total   = sTasks.length;
          const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
          const alertType = total > 0 && pct === 0 ? "danger" : pct < 50 && total > 0 ? "warn" : null;
          const isOpen    = expandedStudent === s.id;
          const sAnaliz   = getAnaliz(s.id);
          const sOneriler = getOneriler(s.id);
          const isLoadingThis = isLoadingAnalizFor(s.id);
            const isUyaniyorThis = isUyaniyorAnalizFor(s.id);

          return (
            <div key={s.id} style={{ borderBottom: i < students.length - 1 ? "1px solid #f5f2ee" : "none" }}>
              <div onClick={() => toggleAnaliz(s.id)} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 0", cursor: "pointer",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: c.light, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 12, fontWeight: 700, color: c.text,
                }}>{initials(s.full_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{s.full_name}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {alertType && <AlertChip type={alertType} text={alertType === "danger" ? "Başlamadı" : "Az ilerledi"} />}
                      <span style={{ fontSize: 11, color: "#888" }}>{done}/{total} görev</span>
                      <span style={{ fontSize: 11, color: c.mid, fontWeight: 700 }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: "#f0ede8", overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`, height: "100%", borderRadius: 99,
                      background: alertType === "danger" ? "#E24B4A" : alertType === "warn" ? "#EF9F27" : c.mid,
                      transition: "width .6s ease",
                    }} />
                  </div>
                </div>
              </div>

              {/* Genişleyen analiz paneli */}
              {isOpen && (
                <div style={{ padding: "4px 0 16px 48px" }}>
                  {/* Kayıt bilgileri (profil doluysa göster) */}
                  {(() => {
                    const prof = profileMap[s.id];
                    const fLabel = { sayisal: "Sayısal", esit_agirlik: "Eşit Ağırlık", sozel: "Sözel" };
                    const rLabel = { anne: "Anne", baba: "Baba", vasi: "Vasi/Diğer" };
                    if (!prof || (!prof.school_name && !prof.grade && !prof.parent_name)) return null;
                    return (
                      <div style={{ padding: "8px 12px", borderRadius: 10, background: "#fafaf8", marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", marginBottom: 5 }}>KAYIT BİLGİLERİ</div>
                        {(prof.school_name || prof.grade || prof.field_preference) && (
                          <div style={{ fontSize: 12, color: "#555", marginBottom: prof.parent_name ? 4 : 0 }}>
                            🏫 {[
                              prof.school_name,
                              prof.grade ? (prof.grade === "Mezun" ? "Mezun" : `${prof.grade}. Sınıf`) : null,
                              fLabel[prof.field_preference] ?? null,
                            ].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {prof.parent_name && (
                          <div style={{ fontSize: 12, color: "#555", marginBottom: prof.parent2_name ? 3 : 0 }}>
                            👤 {prof.parent_name}
                            {rLabel[prof.parent_relationship] ? ` (${rLabel[prof.parent_relationship]})` : ""}
                            {prof.parent_phone ? ` · 📞 ${prof.parent_phone}` : ""}
                            {prof.parent_email ? ` · ✉️ ${prof.parent_email}` : ""}
                          </div>
                        )}
                        {prof.parent2_name && (
                          <div style={{ fontSize: 12, color: "#555" }}>
                            👤 {prof.parent2_name}
                            {rLabel[prof.parent2_relationship] ? ` (${rLabel[prof.parent2_relationship]})` : ""}
                            {prof.parent2_phone ? ` · 📞 ${prof.parent2_phone}` : ""}
                            {prof.parent2_email ? ` · ✉️ ${prof.parent2_email}` : ""}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Atanan görevler — hangi görev, hangi tarihe, hangi programdan */}
                  {sTasks.length > 0 && (() => {
                    const hepsi = acikGorevListesi === s.id;
                    // En yeni tarih üstte; tarihsizler sona.
                    const sirali = [...sTasks].sort((a, b) =>
                      (b.due_date ?? "").localeCompare(a.due_date ?? ""));
                    const gosterilen = hepsi ? sirali : sirali.slice(0, 6);
                    return (
                      <div style={{ padding: "8px 12px", borderRadius: 10, background: "#fafaf8", marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", marginBottom: 6 }}>
                          ATANAN GÖREVLER ({done}/{total})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {gosterilen.map(t => (
                            gorevTaslak?.id === t.id ? (
                              /* Düzenleme kipi */
                              <div key={t.id} style={{
                                display: "flex", flexDirection: "column", gap: 5,
                                padding: 8, borderRadius: 8, background: "#fff",
                                border: `1.5px solid ${c.mid}`,
                              }}>
                                <input autoFocus value={gorevTaslak.title}
                                  placeholder="Görev başlığı"
                                  onChange={e => setGorevTaslak(g => ({ ...g, title: e.target.value }))}
                                  onKeyDown={e => { if (e.key === "Escape") setGorevTaslak(null); }}
                                  style={{ ...duzenleInput, fontWeight: 600 }} />
                                <div style={{ display: "flex", gap: 5 }}>
                                  <select value={gorevTaslak.subject}
                                    onChange={e => setGorevTaslak(g => ({ ...g, subject: e.target.value, topic: "" }))}
                                    style={{ ...duzenleInput, flex: 1 }}>
                                    <option value="">Ders yok</option>
                                    {gorevTaslak.subject && !tumDersler.includes(gorevTaslak.subject) && (
                                      <option value={gorevTaslak.subject}>{gorevTaslak.subject}</option>
                                    )}
                                    {tumDersler.map(d => <option key={d} value={d}>{d}</option>)}
                                  </select>
                                  <select value={gorevTaslak.topic}
                                    onChange={e => setGorevTaslak(g => ({ ...g, topic: e.target.value }))}
                                    style={{ ...duzenleInput, flex: 1 }}>
                                    <option value="">Konu yok</option>
                                    {/* Müfredatta olmayan mevcut konu kaybolmasın */}
                                    {gorevTaslak.topic && !tumKonular(gorevTaslak.subject).includes(gorevTaslak.topic) && (
                                      <option value={gorevTaslak.topic}>{gorevTaslak.topic}</option>
                                    )}
                                    {tumKonular(gorevTaslak.subject).map(k => <option key={k} value={k}>{k}</option>)}
                                  </select>
                                </div>
                                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                  <input type="date" value={gorevTaslak.due_date}
                                    onChange={e => setGorevTaslak(g => ({ ...g, due_date: e.target.value }))}
                                    style={{ ...duzenleInput, flex: 1 }} />
                                  <input type="number" placeholder="dk" value={gorevTaslak.estimated_minutes}
                                    onChange={e => setGorevTaslak(g => ({ ...g, estimated_minutes: e.target.value }))}
                                    style={{ ...duzenleInput, width: 62 }} />
                                  <div style={{ flex: 1 }} />
                                  <button onClick={() => setGorevTaslak(null)} disabled={saving} style={{
                                    fontSize: 10.5, padding: "5px 10px", borderRadius: 99,
                                    border: "1px solid #f0ede8", background: "#fff", color: "#888",
                                    cursor: "pointer", fontWeight: 600,
                                  }}>Vazgeç</button>
                                  <button onClick={gorevKaydet} disabled={saving} style={{
                                    fontSize: 10.5, padding: "5px 12px", borderRadius: 99, border: "none",
                                    background: c.bg, color: "#fff", cursor: "pointer", fontWeight: 700,
                                    opacity: saving ? 0.7 : 1,
                                  }}>{saving ? "..." : "Kaydet"}</button>
                                </div>
                              </div>
                            ) : (
                            <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 11.5 }}>
                              <span style={{ flexShrink: 0, color: t.is_done ? "#1A6B3C" : "#c8c2ba", fontWeight: 700 }}>
                                {t.is_done ? "✓" : "○"}
                              </span>
                              <span style={{ flexShrink: 0, color: "#888", minWidth: 52 }}>
                                {t.due_date
                                  ? new Date(t.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })
                                  : "tarihsiz"}
                              </span>
                              <span style={{
                                flex: 1, minWidth: 0, color: t.is_done ? "#9aa" : "#333",
                                textDecoration: t.is_done ? "line-through" : "none",
                              }}>
                                {t.title}
                                {(t.subject || t.topic) && (
                                  <span style={{ color: "#aaa" }}>
                                    {" · "}{[t.subject, t.topic].filter(Boolean).join(" · ")}
                                  </span>
                                )}
                              </span>
                              {t.kaynak_program && (
                                <span title={`${t.kaynak_program} programından`} style={{
                                  flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: "1px 6px",
                                  borderRadius: 99, background: c.light, color: c.text,
                                  maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>{t.kaynak_program}</span>
                              )}
                              <button onClick={() => gorevKopyala(t)} title="Kopyala — Görev Ata formunu bu görevle doldurur" style={{
                                flexShrink: 0, background: "none", border: "none", padding: "0 2px",
                                color: c.mid, fontSize: 12, cursor: "pointer",
                              }}>⧉</button>
                              <button onClick={() => gorevDuzenle(t)} title="Düzenle" style={{
                                flexShrink: 0, background: "none", border: "none", padding: "0 2px",
                                color: c.mid, fontSize: 12, cursor: "pointer",
                              }}>✎</button>
                              <button onClick={() => gorevSil(t)} disabled={saving} title="Sil" style={{
                                flexShrink: 0, background: "none", border: "none", padding: "0 2px",
                                color: "#C98A8A", fontSize: 12, cursor: "pointer",
                              }}>✕</button>
                            </div>
                            )
                          ))}
                        </div>
                        {sirali.length > 6 && (
                          <button onClick={() => setAcikGorevListesi(hepsi ? null : s.id)} style={{
                            marginTop: 6, background: "none", border: "none", padding: 0,
                            color: c.mid, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          }}>
                            {hepsi ? "▴ daha az" : `▾ tümünü göster (${sirali.length})`}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Sınav analizi — veri yalnızca açılınca çekilir */}
                  <div style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <SinavAnalizi
                      studentId={s.id} color={c} variant="buton" hemenYukle={false}
                      baslik={`${s.full_name} — Sınav Analizi`}
                    />
                    <VeliRaporu
                      studentId={s.id} studentName={s.full_name} color={c} variant="buton"
                      baslik={`${s.full_name} — Dönem Raporu`}
                    />
                    <HaftalikProgram
                      tasks={sTasks} programOgeleri={programMap[s.id] ?? []}
                      ogrenciAdi={s.full_name} color={c} variant="buton"
                      baslik={`${s.full_name} — Haftalık Program`}
                    />
                  </div>

                  {isLoadingThis ? (
                    <div style={{ fontSize: 12, color: "#aaa" }}>
                      {isUyaniyorThis
                        ? "Analiz servisi uyanıyor, birkaç saniye..."
                        : "Analiz yükleniyor..."}
                    </div>
                  ) : !sAnaliz ? (
                    <div style={{ fontSize: 12, color: "#aaa" }}>
                      Analiz alınamadı — backend çalışıyor mu? ({API_URL})
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Genel değerlendirme: çaba (görev tamamlama) + sonuç (sınav trendi) birleşimi */}
                      {sAnaliz.genel_degerlendirme && (() => {
                        const gd = sAnaliz.genel_degerlendirme;
                        const stil = genelDegerlendirmeStil(gd.durum);
                        return (
                          <div style={{
                            padding: "10px 12px", borderRadius: 10,
                            background: stil.bg, border: `1px solid ${stil.renk}22`,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 13 }}>{stil.emoji}</span>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: stil.renk }}>{gd.baslik}</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: "#444", lineHeight: 1.5 }}>{gd.aciklama}</div>
                            {gd.ek_notlar?.length > 0 && (
                              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${stil.renk}22`, display: "flex", flexDirection: "column", gap: 3 }}>
                                {gd.ek_notlar.map((n, i) => (
                                  <div key={i} style={{ fontSize: 10.5, color: "#666", lineHeight: 1.4 }}>{n}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Sınav trendi */}
                      {sAnaliz.sinav_trend?.mesaj && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 12px", borderRadius: 10, fontSize: 12,
                          background: sAnaliz.sinav_trend.durum === "artis" ? c.light
                            : sAnaliz.sinav_trend.durum === "dusus" ? "#FFF0F0" : "#FFF7E6",
                          color: "#333",
                        }}>
                          <span>{sAnaliz.sinav_trend.durum === "artis" ? "📈" : sAnaliz.sinav_trend.durum === "dusus" ? "📉" : "💡"}</span>
                          {sAnaliz.sinav_trend.mesaj}
                        </div>
                      )}

                      {/* Güçlü / zayıf ders */}
                      {(sAnaliz.en_guclu_ders || sAnaliz.en_zayif_ders) && (
                        <div style={{ display: "flex", gap: 8 }}>
                          {sAnaliz.en_guclu_ders && (
                            <div style={{ flex: 1, background: c.light, borderRadius: 8, padding: "7px 10px", fontSize: 11 }}>
                              <span style={{ color: c.text, fontWeight: 700 }}>🏆 {sAnaliz.en_guclu_ders.ders}</span>
                              <span style={{ color: c.mid, marginLeft: 6 }}>{sAnaliz.en_guclu_ders.net} net</span>
                            </div>
                          )}
                          {sAnaliz.en_zayif_ders && (
                            <div style={{ flex: 1, background: "#FFF0F0", borderRadius: 8, padding: "7px 10px", fontSize: 11 }}>
                              <span style={{ color: "#A32D2D", fontWeight: 700 }}>⚠️ {sAnaliz.en_zayif_ders.ders}</span>
                              <span style={{ color: "#E24B4A", marginLeft: 6 }}>{sAnaliz.en_zayif_ders.net} net</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Öncelikli konular */}
                      {sOneriler.length > 0 ? (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 6 }}>ÖNCELİKLİ KONULAR</div>
                          {sOneriler.map((o, oi) => (
                            <div key={oi} style={{
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              padding: "6px 0", borderTop: oi === 0 ? "none" : "1px solid #f5f2ee",
                            }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "#222" }}>{o.oneri}</div>
                                <div style={{ fontSize: 10, color: "#aaa" }}>{o.aciklama}</div>
                              </div>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                                background: o.oncelik === "yuksek" ? "#FFF0F0" : "#FFF7E6",
                                color:      o.oncelik === "yuksek" ? "#A32D2D"  : "#854F0B",
                              }}>{o.oncelik === "yuksek" ? "Acil" : "Orta"}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#bbb" }}>Şu an öncelikli konu tespit edilmedi 👍</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Ödev Kontrol */}
      <Card id="bolum-odev">
        <SectionTitle
          title={`Ödev Kontrol${pendingSubmissions.length > 0 ? ` (${pendingSubmissions.length} bekliyor)` : ""}`}
          color={c.mid}
        />
        {pendingSubmissions.length === 0 ? (
          <div style={{ fontSize: 13, color: "#aaa", padding: "8px 0", textAlign: "center" }}>
            Bekleyen ödev yok ✓
          </div>
        ) : pendingSubmissions.map((sub, i) => {
          const student     = students.find(s => s.id === sub.student_id);
          const isReturning = returningId === sub.id;
          return (
            <div key={sub.id} style={{
              padding: "12px 0",
              borderBottom: i < pendingSubmissions.length - 1 ? "1px solid #f5f2ee" : "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>
                    {student?.full_name ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {sub.tasks?.title ?? "—"}
                    {sub.tasks?.subject ? ` · ${sub.tasks.subject}` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 1 }}>
                    {new Date(sub.submitted_at).toLocaleDateString("tr-TR", {
                      day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                  <a href={sub.file_url} target="_blank" rel="noreferrer" style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 99,
                    background: "#f5f2ee", color: "#555", textDecoration: "none",
                  }}>📎 Görüntüle</a>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => handleReview(sub.id, "onaylandi")} style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 99,
                      border: "none", background: "#E8F9F0", color: "#1A6B3C",
                      cursor: "pointer", fontWeight: 600,
                    }}>✓ Onayla</button>
                    <button onClick={() => { setReturningId(isReturning ? null : sub.id); setReturnNote(""); }} style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 99,
                      border: "none",
                      background: isReturning ? "#FFF0F0" : "#f5f2ee",
                      color: isReturning ? "#A32D2D" : "#666",
                      cursor: "pointer", fontWeight: 600,
                    }}>↩ İade Et</button>
                  </div>
                </div>
              </div>

              {/* İade notu girişi */}
              {isReturning && (
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  <input
                    placeholder="İade notu (isteğe bağlı)"
                    value={returnNote}
                    onChange={e => setReturnNote(e.target.value)}
                    style={{
                      flex: 1, padding: "7px 10px", borderRadius: 8,
                      border: "1.5px solid #f0ede8", fontSize: 12,
                    }}
                  />
                  <button onClick={() => handleReview(sub.id, "iade_edildi", returnNote)} style={{
                    padding: "7px 14px", borderRadius: 8, border: "none",
                    background: "#A32D2D", color: "#fff", fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                  }}>Gönder</button>
                  <button onClick={() => { setReturningId(null); setReturnNote(""); }} style={{
                    padding: "7px 12px", borderRadius: 8,
                    border: "1.5px solid #f0ede8", background: "#fff",
                    color: "#888", fontSize: 12, cursor: "pointer",
                  }}>İptal</button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Öğrenci listesi yönetimi (teacher_students) */}
      {bagKurulabilir && (
        <div id="bolum-baglanti"><BaglantiYonetimi userId={userId} rol="teacher" color={c} onDegisti={loadData} /></div>
      )}

      {/* Gruplar — toplu görev/program ataması için. Bağlantı yönetiminin
          hemen ardında: önce öğrenci eklenir, sonra gruplanır. */}
      <GrupYonetimi userId={userId} students={students} color={c} onDegisti={gruplariTazele} />

      {/* Son Çözülen Testler (son 7 gün) — öğrenci test girince burada görünür */}
      {recentTests.length > 0 && (
        <Card id="bolum-test">
          <SectionTitle title={`Son Çözülen Testler (${recentTests.length})`} color={c.mid} />
          {recentTests.map((t, i) => {
            const student = students.find(s => s.id === t.student_id);
            const oran = t.question_count > 0 ? Math.round((t.correct_count / t.question_count) * 100) : null;
            return (
              <div key={t.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                padding: "10px 0", borderBottom: i < recentTests.length - 1 ? "1px solid #f5f2ee" : "none",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>
                    {student?.full_name ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    🧪 {t.subject}{t.topic ? ` · ${t.topic}` : ""} · {new Date(t.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {t.file_url && (
                    <a href={t.file_url} target="_blank" rel="noreferrer" style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 99,
                      background: "#f5f2ee", color: "#555", textDecoration: "none",
                    }}>📎 Görüntüle</a>
                  )}
                  {oran != null && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                      background: oran >= 70 ? "#E8F9F0" : oran >= 50 ? "#FFF7E6" : "#FFF0F0",
                      color:      oran >= 70 ? "#1A6B3C" : oran >= 50 ? "#854F0B" : "#A32D2D",
                    }}>{t.correct_count}/{t.question_count} · %{oran}</span>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Takvim + Ders Planlama */}
      <div id="bolum-ders"><LessonPlanner userId={userId} role="teacher" counterparts={students} color={c} /></div>

      {/* Sınav Sonucu Girişi (ders D/Y + yanlış konular) */}
      <div id="bolum-sinav"><SinavGirisFormu students={students} profileMap={profileMap} color={c} onKaydedildi={loadData} /></div>

      {/* Çalışma programı: kütüphane + atama */}
      {/* Denetim kaydı — yalnızca admin. Rol kontrolü BURADA yapılıyor:
          RLS admin olmayana boş liste döndürüyor (hata değil), o yüzden
          bileşen kendini gizleyemez, "Kayıt yok" yazardı. */}
      {role === "admin" && <RolYonetimi userId={userId} color={c} />}
      {role === "admin" && <DenetimKaydi color={c} />}

      {/* Öğrenciler ve velileriyle mesajlaşma */}
      <Mesajlar userId={userId} kisiler={[...students, ...veliler]} color={c} />

      {/* Program yazma + atama: atama her programın kendi satırında açılıyor */}
      <ProgramDuzenleyici userId={userId} students={students} color={c} />

      {/* Müfredat konularını yönetme */}
      <KonuYonetimi userId={userId} color={c} />

      {/* Görev Atama Formu */}
      <Card id="bolum-gorevler">
        <SectionTitle title="Görev Ata" color={c.mid} />
        {!showForm ? (
          <button onClick={() => setShowForm(true)} style={{
            width: "100%", padding: "11px 0", borderRadius: 12,
            border: `1.5px dashed ${c.mid}`, background: "transparent",
            color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>+ Yeni Görev Ata</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Hedef: tek öğrenci ya da grup */}
            <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
              style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13, color: "#222" }}>
              <option value="">Öğrenci veya grup seç...</option>
              {gruplar.filter(g => g.uyeler.length > 0).length > 0 && (
                <optgroup label="Gruplar (toplu atama)">
                  {gruplar.filter(g => g.uyeler.length > 0).map(g => (
                    <option key={g.id} value={`grup:${g.id}`}>{g.ad} ({g.uyeler.length} öğrenci)</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Öğrenciler">
                {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </optgroup>
            </select>

            {/* Sınav türü (müfredat seçimi için) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sinavTurleri.map(tip => (
                <button key={tip} onClick={() => setForm(f => ({ ...f, exam_type: tip, subject: "", topic: "" }))} style={{
                  flex: 1, padding: "7px 0", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${form.exam_type === tip ? c.bg : "#f0ede8"}`,
                  background: form.exam_type === tip ? c.bg : "#fff",
                  color: form.exam_type === tip ? "#fff" : "#888", cursor: "pointer",
                }}>{tip}</button>
              ))}
            </div>

            {/* Ders (müfredattan) */}
            <select value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value, topic: "" }))}
              style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13, color: form.subject ? "#222" : "#aaa" }}>
              <option value="">Ders seç...</option>
              {examSubjectsOf(form.exam_type).map(d => <option key={d} value={d}>{d}</option>)}
              <option value="__diger">Diğer (elle yaz)</option>
            </select>

            {/* Konu (seçilen dersin müfredatından) veya serbest ders adı */}
            {form.subject === "__diger" ? (
              <input
                placeholder="Ders adı (ör. İngilizce)"
                value={form.custom_subject}
                onChange={e => setForm(f => ({ ...f, custom_subject: e.target.value }))}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13 }}
              />
            ) : form.subject && (
              <select value={form.topic}
                onChange={e => {
                  const konu = e.target.value;
                  // Konu seçilince başlığı öner; öğretmen elle yazdıysa dokunma
                  setForm(f => ({ ...f, topic: konu, title: (!f.title || f.title === f.topic) ? konu : f.title }));
                }}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13, color: form.topic ? "#222" : "#aaa" }}>
                <option value="">Konu seç...</option>
                {topicsOf(form.exam_type, form.subject).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {/* Görev başlığı (konu seçilince otomatik dolar, düzenlenebilir) */}
              <input
                placeholder="Görev başlığı (ör. Türev — 50 soru)"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13 }}
              />
              {/* Süre */}
              <input
                placeholder="Süre (dk)"
                type="number"
                value={form.estimated_minutes}
                onChange={e => setForm(f => ({ ...f, estimated_minutes: e.target.value }))}
                style={{ width: 90, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13 }}
              />
            </div>

            {/* Tarihler — birden fazla seçilebilir, her tarih için ayrı görev açılır */}
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                Tarih {form.due_dates.length > 0 && `(${form.due_dates.length} seçili)`}
              </div>
              <input type="date" value={tarihGirdi}
                onChange={e => { tarihEkle(e.target.value); setTarihGirdi(""); }}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13, boxSizing: "border-box" }} />

              {form.due_dates.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {form.due_dates.map(t => (
                    <span key={t} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: c.light, color: c.bg, fontSize: 12, fontWeight: 600,
                      padding: "5px 8px 5px 10px", borderRadius: 999,
                    }}>
                      {new Date(`${t}T00:00:00`).toLocaleDateString("tr-TR",
                        { day: "numeric", month: "short", weekday: "short" })}
                      <button onClick={() => tarihCikar(t)} title="Kaldır" style={{
                        background: "none", border: "none", color: c.bg, cursor: "pointer",
                        fontSize: 14, lineHeight: 1, padding: 0,
                      }}>×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Kaç görev açılacağını önceden göster: gruba çok tarihli atamada
                  satır sayısı hızla büyüyor, öğretmen bunu görmeden onaylamasın. */}
              {(() => {
                const ogr = hedefOgrenciler().length;
                const tar = Math.max(form.due_dates.length, 1);
                if (ogr === 0) return null;
                return (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
                    {ogr} öğrenci × {tar} tarih = <b style={{ color: c.bg }}>{ogr * tar} görev</b>
                  </div>
                );
              })()}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAssign} disabled={saving} style={{
                flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                background: c.bg, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                opacity: saving ? 0.7 : 1,
              }}>{saving ? "Kaydediliyor..." : "Görevi Ata"}</button>
              <button onClick={() => setShowForm(false)} style={{
                padding: "11px 16px", borderRadius: 12,
                border: "1.5px solid #f0ede8", background: "#fff",
                color: "#888", fontSize: 13, cursor: "pointer",
              }}>İptal</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
