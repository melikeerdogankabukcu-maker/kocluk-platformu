import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { COLORS } from "../lib/theme";
import { useTopics } from "../lib/TopicsContext";
import { genelDegerlendirmeStil } from "../lib/analizHelpers";
import { computeTopicProgress } from "../lib/progressHelpers";
import { useAnaliz } from "../hooks/useAnaliz";
import Card from "../components/Card";
import SectionTitle from "../components/SectionTitle";
import StatCard from "../components/StatCard";
import TaskItem from "../components/TaskItem";
import ProgressBar from "../components/ProgressBar";
import AlertChip from "../components/AlertChip";
import LessonPlanner from "../components/LessonPlanner";
import Modal from "../components/Modal";
import SinavAnalizi from "../components/SinavAnalizi";
import BaglantiYonetimi from "../components/BaglantiYonetimi";
import Rozetler from "../components/Rozetler";
import SeviyeAvatar from "../components/SeviyeAvatar";
import { useProgramAtama } from "../hooks/useProgramAtama";
import { programTakvimOgeleri, atamaProgrami } from "../lib/studyPrograms";

export default function StudentDashboard({ userId, userName }) {
  const c = COLORS.student;
  const { examSubjectsOf, topicsOf } = useTopics();

  const [tasks,        setTasks]        = useState([]);
  const [testSessions, setTestSessions] = useState([]);
  const [examResults,  setExamResults]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [submissions,     setSubmissions]     = useState({});  // { task_id: submission }
  const [uploadingTaskId, setUploadingTaskId] = useState(null);
  const [teachers,        setTeachers]        = useState([]);
  const [profile,      setProfile]      = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [savingProfile,   setSavingProfile]   = useState(false);
  const [showTasksModal,    setShowTasksModal]    = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [profileForm,  setProfileForm]  = useState({
    birth_date: "", phone: "",
    parent_name: "", parent_relationship: "", parent_occupation: "",
    parent_phone: "", parent_email: "",
    parent2_name: "", parent2_relationship: "", parent2_occupation: "",
    parent2_phone: "", parent2_email: "",
    school_name: "", grade: "", field_preference: "",
  });

  // Çalışma programı — ayrı kart yok, adımlar takvime işleniyor
  const { atama: programAtama, satirCevir: programCevir } = useProgramAtama(userId);
  const programOgeleri = programTakvimOgeleri(programAtama);

  // Takvimin üstünde duran kompakt program şeridi (ayrı modül yerine)
  const programOzetSeridi = (() => {
    if (!programAtama) return null;
    const p = atamaProgrami(programAtama);
    if (!p?.weeks) return null;
    const yapilan = (programAtama.tamamlananlar ?? []).length;
    const toplam  = programAtama.toplam_satir || 1;
    const oran    = Math.round((yapilan / toplam) * 100);
    const gecen   = Math.floor((Date.now() - new Date(programAtama.baslangic).getTime()) / 86400000);
    const hafta   = Math.min(Math.max(Math.floor(gecen / 7) + 1, 1), p.weeks.length);
    const buHafta = p.weeks.find(w => w.week === hafta);
    return (
      <div style={{
        padding: "10px 12px", borderRadius: 10, marginBottom: 12,
        background: "#FFFAF0", border: "1px solid #F0E2C4",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#222", minWidth: 0 }}>{p.title ?? programAtama.program_adi ?? "Çalışma programı"}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#8a6d1f", flexShrink: 0 }}>%{oran}</span>
        </div>
        <div style={{ fontSize: 10.5, color: "#a08c6a", marginTop: 2 }}>
          {hafta}. hafta{buHafta ? ` — ${buHafta.title}` : ""} · {yapilan}/{toplam} adım
          {" · "}takvimde sarı noktalı günler
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "#F0E2C4", overflow: "hidden", marginTop: 6 }}>
          <div style={{ width: `${oran}%`, height: "100%", background: "#E0A526", transition: "width .5s ease" }} />
        </div>
      </div>
    );
  })();

  // Akıllı analiz (Python backend) — kendi analiz ve önerilerimiz
  const { analiz, oneriler } = useAnaliz(userId);

  // Test formu
  const [showTestForm,  setShowTestForm]  = useState(false);
  const [savingTest,    setSavingTest]    = useState(false);
  const [testForm,      setTestForm]      = useState({
    exam_type: "TYT", subject: "", topic: "",
    custom_subject: "", custom_topic: "",
    question_count: "", correct_count: "",
  });
  const [testFile, setTestFile] = useState(null);   // teste eklenecek çözüm görseli (opsiyonel)
  const testFileInputRef = useRef(null);

  const loadAll = async () => {
    const [t, ts, er, prof, sub, tch] = await Promise.all([
      supabase.from("tasks").select("*").eq("student_id", userId).order("created_at", { ascending: false }),
      supabase.from("test_sessions").select("*").eq("student_id", userId).order("created_at", { ascending: false }),
      supabase.from("exam_results").select("*").eq("student_id", userId).order("exam_date", { ascending: false }),
      supabase.from("student_profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("homework_submissions").select("*").eq("student_id", userId),
      supabase.from("teacher_students").select("teacher_id")
        .eq("student_id", userId).eq("durum", "onaylandi"),
    ]);
    setTasks(t.data ?? []);
    setTestSessions(ts.data ?? []);
    setExamResults(er.data ?? []);
    // Gönderimleri task_id → submission şeklinde map'e çevir
    const subMap = {};
    (sub.data ?? []).forEach(s => { subMap[s.task_id] = s; });
    setSubmissions(subMap);
    // Bağlı öğretmenler; tablo yoksa (migration çalışmadıysa) hepsine düşülür
    if (tch.error) {
      const { data } = await supabase.from("users").select("id, full_name").eq("role", "teacher");
      setTeachers(data ?? []);
    } else {
      const ids = (tch.data ?? []).map(b => b.teacher_id);
      const { data } = ids.length
        ? await supabase.from("users").select("id, full_name").in("id", ids)
        : { data: [] };
      setTeachers(data ?? []);
    }
    const profData = prof.data ?? null;
    setProfile(profData);
    if (profData) {
      setProfileForm({
        birth_date:           profData.birth_date           ?? "",
        phone:                profData.phone                ?? "",
        parent_name:          profData.parent_name          ?? "",
        parent_relationship:  profData.parent_relationship  ?? "",
        parent_occupation:    profData.parent_occupation    ?? "",
        parent_phone:         profData.parent_phone         ?? "",
        parent_email:         profData.parent_email         ?? "",
        parent2_name:         profData.parent2_name         ?? "",
        parent2_relationship: profData.parent2_relationship ?? "",
        parent2_occupation:   profData.parent2_occupation   ?? "",
        parent2_phone:        profData.parent2_phone        ?? "",
        parent2_email:        profData.parent2_email        ?? "",
        school_name:          profData.school_name          ?? "",
        grade:                profData.grade                ?? "",
        field_preference:     profData.field_preference     ?? "",
      });
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [userId]);

  // Haftalık istatistikler
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekTests        = testSessions.filter(t => new Date(t.created_at) >= weekAgo);
  const totalQuestionsWk = weekTests.reduce((s, t) => s + (t.question_count || 0), 0);
  const totalCorrectWk   = weekTests.reduce((s, t) => s + (t.correct_count  || 0), 0);
  const accuracyWk       = totalQuestionsWk > 0 ? Math.round((totalCorrectWk / totalQuestionsWk) * 100) : null;

  const pendingTasks = tasks.filter(t => !t.is_done);
  const doneTasks    = tasks.filter(t =>  t.is_done);
  const pendingCount = pendingTasks.length;

  // Konu ilerlemesi: görevlerden otomatik hesaplanır (elle giriş kaldırıldı)
  const progressList = computeTopicProgress(tasks);

  // Çözülen testler takvimde kayıt günlerinde görünür
  const testsForCalendar = testSessions.map(t => ({ ...t, date: (t.created_at ?? "").split("T")[0] }));

  const handleTestSave = async () => {
    const serbest = testForm.subject === "__diger";
    const ders = (serbest ? testForm.custom_subject : testForm.subject).trim();
    const konu = (serbest ? testForm.custom_topic   : testForm.topic).trim();
    if (!ders || !testForm.question_count) return;
    setSavingTest(true);
    try {
      // Çözüm görseli seçildiyse önce storage'a yükle
      let fileUrl = null;
      if (testFile) {
        const path = `${userId}/test_${Date.now()}`;
        const { error: uploadError } = await supabase.storage
          .from("homework")
          .upload(path, testFile, { upsert: true, contentType: testFile.type });
        if (uploadError) throw uploadError;
        fileUrl = supabase.storage.from("homework").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase.from("test_sessions").insert({
        student_id:     userId,
        subject:        ders,
        topic:          konu || null,
        question_count: parseInt(testForm.question_count),
        correct_count:  parseInt(testForm.correct_count) || 0,
        file_url:       fileUrl,
        file_name:      testFile?.name ?? null,
      });
      if (error) throw error;

      setTestForm({ exam_type: "TYT", subject: "", topic: "", custom_subject: "", custom_topic: "", question_count: "", correct_count: "" });
      setTestFile(null);
      setShowTestForm(false);
      loadAll();
    } catch (err) {
      console.error("Test kaydetme hatası:", err);
      alert("Test kaydedilemedi: " + err.message);
    } finally {
      setSavingTest(false);
    }
  };

  const handleProfileSave = async () => {
    setSavingProfile(true);
    const { error } = await supabase.from("student_profiles").upsert({
      id:                  userId,
      birth_date:          profileForm.birth_date          || null,
      phone:               profileForm.phone               || null,
      parent_name:          profileForm.parent_name          || null,
      parent_relationship:  profileForm.parent_relationship  || null,
      parent_occupation:    profileForm.parent_occupation    || null,
      parent_phone:         profileForm.parent_phone         || null,
      parent_email:         profileForm.parent_email         || null,
      parent2_name:         profileForm.parent2_name         || null,
      parent2_relationship: profileForm.parent2_relationship || null,
      parent2_occupation:   profileForm.parent2_occupation   || null,
      parent2_phone:        profileForm.parent2_phone        || null,
      parent2_email:        profileForm.parent2_email        || null,
      school_name:          profileForm.school_name          || null,
      grade:               profileForm.grade               || null,
      field_preference:    profileForm.field_preference    || null,
      updated_at:          new Date().toISOString(),
    });
    setSavingProfile(false);
    if (error) {
      console.error("Profil kaydetme hatası:", error);
      alert("Profil kaydedilemedi: " + error.message);
      return;
    }
    setShowProfileForm(false);
    loadAll();
  };

  const handleHomeworkUpload = async (taskId, file) => {
    setUploadingTaskId(taskId);
    try {
      const path = `${userId}/${taskId}`;
      const { error: uploadError } = await supabase.storage
        .from("homework")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("homework").getPublicUrl(path);

      await supabase.from("homework_submissions").upsert({
        task_id:      taskId,
        student_id:   userId,
        file_url:     publicUrl,
        file_name:    file.name,
        status:       "beklemede",
        teacher_note: null,
        submitted_at: new Date().toISOString(),
        reviewed_at:  null,
      }, { onConflict: "task_id" });

      loadAll();
    } catch (err) {
      console.error("Ödev yükleme hatası:", err);
      alert("Yükleme sırasında bir hata oluştu. Konsolu kontrol et.");
    } finally {
      setUploadingTaskId(null);
    }
  };

  // Profil yeterince doluysa "tamamlandı" sayılır
  const profileComplete = !!(profile?.school_name && profile?.grade && profile?.field_preference);

  const fieldLabel = { sayisal: "Sayısal", esit_agirlik: "Eşit Ağırlık", sozel: "Sözel" };
  const relLabel   = { anne: "Anne", baba: "Baba", vasi: "Vasi/Diğer" };
  const initials   = (name = "") => name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const inputStyle = { padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13, boxSizing: "border-box" };

  return (
    <div style={{ padding: "20px 16px", maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Hero */}
      <div style={{ background: c.bg, borderRadius: 18, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Merhaba, {userName}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.2 }}>
            {pendingCount > 0 ? <>{pendingCount} görev<br />seni bekliyor!</> : <>Tüm görevler<br />tamamlandı! 🎉</>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <AlertChip type="success" text={`${tasks.filter(t => t.is_done).length} görev tamamlandı`} />
            {examResults.length > 0 && <AlertChip type="success" text={`${examResults.length} sınav kaydı`} />}
            {!profileComplete && <AlertChip type="warn" text="Profilini tamamla 👤" />}
          </div>
        </div>
        <button onClick={() => { setShowProfileForm(false); setShowProfileModal(true); }} title="Profilim" style={{
          width: 64, height: 64, borderRadius: 16, background: "rgba(255,255,255,0.18)",
          border: "none", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
        }}>
          <span style={{ fontSize: profile ? 22 : 26, fontWeight: 800, color: "#fff", letterSpacing: 1, lineHeight: 1 }}>
            {profile ? initials(userName) : "👤"}
          </span>
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.85)", fontWeight: 700, letterSpacing: 0.5 }}>PROFİL</span>
        </button>
      </div>

      {/* Profil Modalı — hero'daki avatar butonuna basınca açılır */}
      {showProfileModal && (
        <Modal title="Profilim" onClose={() => { setShowProfileModal(false); setShowProfileForm(false); }}>
        {!showProfileForm ? (
          /* Görüntüleme modu */
          !profile ? (
            /* Hiç kaydedilmemiş — "ekle" butonu */
            <button onClick={() => setShowProfileForm(true)} style={{
              width: "100%", padding: "11px 0", borderRadius: 12,
              border: `1.5px dashed ${c.mid}`, background: "transparent",
              color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>+ Profil bilgilerini ekle</button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Avatar kartı — tıklayınca düzenleme açılır */}
              <div onClick={() => setShowProfileForm(true)} style={{
                display: "flex", alignItems: "center", gap: 14,
                cursor: "pointer", padding: "14px 16px", borderRadius: 14,
                background: c.light, border: `1px solid ${c.mid}22`,
              }}>
                {/* Avatar dairesi */}
                <div style={{
                  width: 54, height: 54, borderRadius: 16, flexShrink: 0,
                  background: c.bg, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff",
                  letterSpacing: 1,
                }}>
                  {initials(userName)}
                </div>
                {/* İsim + eğitim bilgileri */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#222", marginBottom: 3 }}>{userName}</div>
                  {(profile.grade || profile.field_preference) && (
                    <div style={{ fontSize: 12, color: c.text, fontWeight: 600, marginBottom: 2 }}>
                      {[
                        profile.grade ? (profile.grade === "Mezun" ? "Mezun" : `${profile.grade}. Sınıf`) : null,
                        fieldLabel[profile.field_preference] ?? null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {profile.school_name && (
                    <div style={{ fontSize: 11, color: "#888" }}>🏫 {profile.school_name}</div>
                  )}
                </div>
                {/* Düzenle ipucu */}
                <span style={{ fontSize: 11, color: c.mid, fontWeight: 600, flexShrink: 0 }}>✏️ düzenle</span>
              </div>
              {/* Kişisel */}
              {(profile.birth_date || profile.phone) && (
                <div style={{ display: "flex", gap: 8 }}>
                  {profile.birth_date && (
                    <div style={{ flex: 1, background: "#fafaf8", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, color: "#aaa", marginBottom: 2 }}>DOĞUM TARİHİ</div>
                      <div style={{ fontSize: 13, color: "#333" }}>
                        📅 {new Date(profile.birth_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                      </div>
                    </div>
                  )}
                  {profile.phone && (
                    <div style={{ flex: 1, background: "#fafaf8", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, color: "#aaa", marginBottom: 2 }}>TELEFON</div>
                      <div style={{ fontSize: 13, color: "#333" }}>📞 {profile.phone}</div>
                    </div>
                  )}
                </div>
              )}
              {/* 1. Veli */}
              {profile.parent_name && (
                <div style={{ background: "#fafaf8", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", marginBottom: 5 }}>1. VELİ</div>
                  <div style={{ fontSize: 13, color: "#333", marginBottom: 3 }}>
                    👤 {profile.parent_name}
                    {relLabel[profile.parent_relationship] ? ` (${relLabel[profile.parent_relationship]})` : ""}
                    {profile.parent_occupation ? ` · ${profile.parent_occupation}` : ""}
                  </div>
                  {profile.parent_phone && <div style={{ fontSize: 12, color: "#666" }}>📞 {profile.parent_phone}</div>}
                  {profile.parent_email && <div style={{ fontSize: 12, color: "#666" }}>✉️ {profile.parent_email}</div>}
                </div>
              )}
              {/* 2. Veli */}
              {profile.parent2_name && (
                <div style={{ background: "#fafaf8", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", marginBottom: 5 }}>2. VELİ</div>
                  <div style={{ fontSize: 13, color: "#333", marginBottom: 3 }}>
                    👤 {profile.parent2_name}
                    {relLabel[profile.parent2_relationship] ? ` (${relLabel[profile.parent2_relationship]})` : ""}
                    {profile.parent2_occupation ? ` · ${profile.parent2_occupation}` : ""}
                  </div>
                  {profile.parent2_phone && <div style={{ fontSize: 12, color: "#666" }}>📞 {profile.parent2_phone}</div>}
                  {profile.parent2_email && <div style={{ fontSize: 12, color: "#666" }}>✉️ {profile.parent2_email}</div>}
                </div>
              )}
            </div>
          )
        ) : (
          /* Düzenleme modu */
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>KİŞİSEL</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Doğum tarihi</div>
                <input type="date" value={profileForm.birth_date}
                  onChange={e => setProfileForm(f => ({ ...f, birth_date: e.target.value }))}
                  style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Telefon</div>
                <input placeholder="05xx xxx xx xx" value={profileForm.phone}
                  onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                  style={{ ...inputStyle, width: "100%" }} />
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>EĞİTİM</div>
            <input placeholder="Okul adı" value={profileForm.school_name}
              onChange={e => setProfileForm(f => ({ ...f, school_name: e.target.value }))}
              style={{ ...inputStyle, width: "100%" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={profileForm.grade}
                onChange={e => setProfileForm(f => ({ ...f, grade: e.target.value }))}
                style={{ flex: 1, ...inputStyle, color: profileForm.grade ? "#222" : "#aaa" }}>
                <option value="">Sınıf seç...</option>
                {["5","6","7","8","9","10","11","12","Mezun"].map(g => (
                  <option key={g} value={g}>{g !== "Mezun" ? `${g}. Sınıf` : "Mezun"}</option>
                ))}
              </select>
              <select value={profileForm.field_preference}
                onChange={e => setProfileForm(f => ({ ...f, field_preference: e.target.value }))}
                style={{ flex: 1, ...inputStyle, color: profileForm.field_preference ? "#222" : "#aaa" }}>
                <option value="">Alan seç...</option>
                <option value="sayisal">Sayısal</option>
                <option value="esit_agirlik">Eşit Ağırlık</option>
                <option value="sozel">Sözel</option>
              </select>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>1. VELİ BİLGİLERİ</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Veli adı soyadı" value={profileForm.parent_name}
                onChange={e => setProfileForm(f => ({ ...f, parent_name: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }} />
              <select value={profileForm.parent_relationship}
                onChange={e => setProfileForm(f => ({ ...f, parent_relationship: e.target.value }))}
                style={{ flex: 1, ...inputStyle, color: profileForm.parent_relationship ? "#222" : "#aaa" }}>
                <option value="">Yakınlık...</option>
                <option value="anne">Anne</option>
                <option value="baba">Baba</option>
                <option value="vasi">Vasi/Diğer</option>
              </select>
            </div>
            <input placeholder="Veli mesleği" value={profileForm.parent_occupation}
              onChange={e => setProfileForm(f => ({ ...f, parent_occupation: e.target.value }))}
              style={{ ...inputStyle, width: "100%" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Veli telefonu" value={profileForm.parent_phone}
                onChange={e => setProfileForm(f => ({ ...f, parent_phone: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="Veli e-postası" value={profileForm.parent_email}
                onChange={e => setProfileForm(f => ({ ...f, parent_email: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }} />
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>2. VELİ BİLGİLERİ</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="2. Veli adı soyadı" value={profileForm.parent2_name}
                onChange={e => setProfileForm(f => ({ ...f, parent2_name: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }} />
              <select value={profileForm.parent2_relationship}
                onChange={e => setProfileForm(f => ({ ...f, parent2_relationship: e.target.value }))}
                style={{ flex: 1, ...inputStyle, color: profileForm.parent2_relationship ? "#222" : "#aaa" }}>
                <option value="">Yakınlık...</option>
                <option value="anne">Anne</option>
                <option value="baba">Baba</option>
                <option value="vasi">Vasi/Diğer</option>
              </select>
            </div>
            <input placeholder="2. Veli mesleği" value={profileForm.parent2_occupation}
              onChange={e => setProfileForm(f => ({ ...f, parent2_occupation: e.target.value }))}
              style={{ ...inputStyle, width: "100%" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="2. Veli telefonu" value={profileForm.parent2_phone}
                onChange={e => setProfileForm(f => ({ ...f, parent2_phone: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="2. Veli e-postası" value={profileForm.parent2_email}
                onChange={e => setProfileForm(f => ({ ...f, parent2_email: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleProfileSave} disabled={savingProfile} style={{
                flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                background: c.bg, color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: "pointer", opacity: savingProfile ? 0.7 : 1,
              }}>{savingProfile ? "Kaydediliyor..." : "Kaydet"}</button>
              <button onClick={() => setShowProfileForm(false)} style={{
                padding: "11px 16px", borderRadius: 12,
                border: "1.5px solid #f0ede8", background: "#fff",
                color: "#888", fontSize: 13, cursor: "pointer",
              }}>İptal</button>
            </div>
          </div>
        )}
        </Modal>
      )}

      {/* İstatistikler */}
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Bu hafta soru" value={totalQuestionsWk || "—"} sub="çözüldü"    color={c.mid} />
        <StatCard label="Doğruluk"      value={accuracyWk != null ? `%${accuracyWk}` : "—"} sub="bu hafta" color={c.mid} />
        <StatCard label="Sınav kaydı"   value={examResults.length || "—"} sub="toplam"   color={c.mid} />
      </div>

      {/* Seviye + avatar + rozetler */}
      <SeviyeAvatar studentId={userId} color={c} />
      <Rozetler studentId={userId} color={c} />

      {/* Görevler — bekleyenler görünür, tamamlananlar modalda */}
      <Card id="bolum-gorevler">
        <SectionTitle title="Görevlerim" color={c.mid} />
        {loading ? <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0" }}>Yükleniyor...</div>
          : tasks.length === 0 ? <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0", textAlign: "center" }}>Henüz görev atanmadı 📭</div>
          : pendingTasks.length === 0 ? <div style={{ fontSize: 13, color: "#888", padding: "12px 0", textAlign: "center" }}>Bekleyen görev yok, tümü tamamlandı 🎉</div>
          : pendingTasks.map(t => (
            <TaskItem
              key={t.id} id={t.id} color={c.bg} done={t.is_done} label={t.title}
              sub={[t.subject, t.estimated_minutes ? `${t.estimated_minutes} dk` : null,
                t.due_date ? new Date(t.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : null].filter(Boolean).join(" · ")}
              submission={submissions[t.id] ?? null}
              uploading={uploadingTaskId === t.id}
              onFileSelect={handleHomeworkUpload}
            />
          ))}
        {doneTasks.length > 0 && (
          <button onClick={() => setShowTasksModal(true)} style={{
            width: "100%", padding: "10px 0", borderRadius: 12, marginTop: 10,
            border: "1px solid #f0ede8", background: "#fafaf8",
            color: c.text, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>✓ Tamamlanan görevler ({doneTasks.length})</button>
        )}
      </Card>

      {showTasksModal && (
        <Modal title="Tamamlanan Görevler" onClose={() => setShowTasksModal(false)}>
          {doneTasks.map(t => (
            <TaskItem
              key={t.id} id={t.id} color={c.bg} done={t.is_done} label={t.title}
              sub={[t.subject, t.estimated_minutes ? `${t.estimated_minutes} dk` : null,
                t.due_date ? new Date(t.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : null].filter(Boolean).join(" · ")}
              submission={submissions[t.id] ?? null}
              uploading={uploadingTaskId === t.id}
              onFileSelect={handleHomeworkUpload}
            />
          ))}
        </Modal>
      )}

      {/* Öğretmen bağlantıları (çift onaylı) */}
      <div id="bolum-baglanti"><BaglantiYonetimi userId={userId} rol="student" color={c} onDegisti={loadAll} /></div>

      {/* Takvim + Ders Planlama (dersler + görevler + çözülen testler) */}
      <div id="bolum-ders"><LessonPlanner
        userId={userId} role="student" counterparts={teachers} color={c}
        tasks={tasks} tests={testsForCalendar}
        programItems={programOgeleri}
        onProgramCevir={programCevir}
        programOzet={programOzetSeridi}
      /></div>

      {/* Test Ekle */}
      <Card id="bolum-test">
        <SectionTitle title="Test Çözdüm" color={c.mid} />
        {!showTestForm ? (
          <button onClick={() => setShowTestForm(true)} style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: `1.5px dashed ${c.mid}`, background: "transparent", color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Test Ekle
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {/* Sınav türü (müfredat seçimi için) */}
            <div style={{ display: "flex", gap: 8 }}>
              {["TYT", "AYT"].map(tip => (
                <button key={tip} onClick={() => setTestForm(f => ({ ...f, exam_type: tip, subject: "", topic: "" }))} style={{
                  flex: 1, padding: "7px 0", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${testForm.exam_type === tip ? c.bg : "#f0ede8"}`,
                  background: testForm.exam_type === tip ? c.bg : "#fff",
                  color: testForm.exam_type === tip ? "#fff" : "#888", cursor: "pointer",
                }}>{tip}</button>
              ))}
            </div>

            {/* Ders (müfredattan) */}
            <select value={testForm.subject}
              onChange={e => setTestForm(f => ({ ...f, subject: e.target.value, topic: "" }))}
              style={{ ...inputStyle, color: testForm.subject ? "#222" : "#aaa" }}>
              <option value="">Ders seç...</option>
              {examSubjectsOf(testForm.exam_type).map(d => <option key={d} value={d}>{d}</option>)}
              <option value="__diger">Diğer (elle yaz)</option>
            </select>

            {/* Konu (müfredattan) veya serbest ders+konu */}
            {testForm.subject === "__diger" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input placeholder="Ders adı" value={testForm.custom_subject}
                  onChange={e => setTestForm(f => ({ ...f, custom_subject: e.target.value }))}
                  style={{ ...inputStyle, flex: 1 }} />
                <input placeholder="Konu adı" value={testForm.custom_topic}
                  onChange={e => setTestForm(f => ({ ...f, custom_topic: e.target.value }))}
                  style={{ ...inputStyle, flex: 1 }} />
              </div>
            ) : testForm.subject && (
              <select value={testForm.topic}
                onChange={e => setTestForm(f => ({ ...f, topic: e.target.value }))}
                style={{ ...inputStyle, color: testForm.topic ? "#222" : "#aaa" }}>
                <option value="">Konu seç...</option>
                {topicsOf(testForm.exam_type, testForm.subject).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Toplam soru" type="number" value={testForm.question_count}
                onChange={e => setTestForm(f => ({ ...f, question_count: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="Doğru sayısı" type="number" value={testForm.correct_count}
                onChange={e => setTestForm(f => ({ ...f, correct_count: e.target.value }))}
                style={{ ...inputStyle, flex: 1 }} />
            </div>

            {/* Çözüm görseli (opsiyonel) */}
            <button onClick={() => testFileInputRef.current?.click()} style={{
              width: "100%", padding: "9px 0", borderRadius: 10,
              border: `1.5px dashed ${testFile ? c.mid : "#d8d4cd"}`,
              background: testFile ? c.light : "transparent",
              color: testFile ? c.text : "#999", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              {testFile ? `📎 ${testFile.name} ✓` : "📎 Çözüm görseli ekle (opsiyonel)"}
            </button>
            <input ref={testFileInputRef} type="file" accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={e => { setTestFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />

            {testForm.question_count > 0 && testForm.correct_count !== "" && (
              <div style={{ fontSize: 12, color: c.text, background: c.light, padding: "8px 12px", borderRadius: 8 }}>
                Doğruluk oranı: %{Math.round((parseInt(testForm.correct_count) / parseInt(testForm.question_count)) * 100)}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleTestSave} disabled={savingTest} style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", background: c.bg, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: savingTest ? 0.7 : 1 }}>
                {savingTest ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button onClick={() => setShowTestForm(false)} style={{ padding: "11px 16px", borderRadius: 12, border: "1.5px solid #f0ede8", background: "#fff", color: "#888", fontSize: 13, cursor: "pointer" }}>İptal</button>
            </div>
          </div>
        )}
        {testSessions.slice(0, 4).map((t, i) => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #f5f2ee" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>{t.subject}</span>
              {t.topic && <span style={{ fontSize: 11, color: "#aaa", marginLeft: 6 }}>{t.topic}</span>}
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 1 }}>{new Date(t.created_at).toLocaleDateString("tr-TR")}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {t.file_url && (
                <a href={t.file_url} target="_blank" rel="noreferrer" style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 99,
                  background: "#f5f2ee", color: "#555", textDecoration: "none",
                }}>📎</a>
              )}
              <span style={{ fontSize: 12, color: "#888" }}>{t.correct_count}/{t.question_count} doğru</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 99,
                background: Math.round((t.correct_count / t.question_count) * 100) >= 70 ? c.light : "#FFF7E6",
                color:      Math.round((t.correct_count / t.question_count) * 100) >= 70 ? c.text  : "#854F0B",
              }}>%{Math.round((t.correct_count / t.question_count) * 100)}</span>
            </div>
          </div>
        ))}
      </Card>

      {/* Konu ilerlemesi — açılır pencere tetikleyici */}
      <Card>
        <div onClick={() => setShowProgressModal(true)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Konu İlerlemesi</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
              {loading ? "Yükleniyor..."
                : progressList.length > 0 ? `${progressList.length} konu kaydı`
                : "Henüz ilerleme kaydedilmedi 📊"}
            </div>
          </div>
          <span style={{ fontSize: 20, color: c.mid, fontWeight: 700 }}>›</span>
        </div>
      </Card>

      {showProgressModal && (
        <Modal title="Konu İlerlemesi" onClose={() => setShowProgressModal(false)}>
          {loading ? <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0" }}>Yükleniyor...</div>
            : progressList.length === 0 ? <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0", textAlign: "center" }}>Henüz ilerleme kaydedilmedi 📊</div>
            : progressList.map(p => (
              <ProgressBar key={`${p.subject}||${p.topic}`} pct={p.percentage}
                color={p.percentage >= 80 ? "#0F6E56" : p.percentage >= 50 ? c.mid : "#ccc"}
                label={`${p.subject} — ${p.topic}`}
                sub={`${p.done}/${p.total} görev · %${p.percentage}${p.percentage >= 80 ? " ✓" : ""}`} />
            ))}
        </Modal>
      )}

      {/* Sınav Analizi (net gelişimi + odak konular) */}
      <div id="bolum-sinav"><SinavAnalizi studentId={userId} color={c} /></div>


      {/* Analiz & Öneriler (Python backend) */}
      {analiz && (
        <Card>
          <SectionTitle title="Akıllı Analiz" color={c.mid} />

          {/* Genel değerlendirme: çaba (görev tamamlama) + sonuç (sınav trendi) birleşimi */}
          {analiz.genel_degerlendirme && (() => {
            const gd = analiz.genel_degerlendirme;
            const stil = genelDegerlendirmeStil(gd.durum);
            return (
              <div style={{
                padding: "14px 16px", borderRadius: 12, marginBottom: 12,
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
            );
          })()}

          {/* Sınav trendi */}
          {analiz.sinav_trend?.mesaj && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 10, marginBottom: 8,
              background: analiz.sinav_trend.durum === "artis" ? c.light
                : analiz.sinav_trend.durum === "dusus" ? "#FFF0F0" : "#FFF7E6",
            }}>
              <span style={{ fontSize: 14 }}>
                {analiz.sinav_trend.durum === "artis" ? "📈" : analiz.sinav_trend.durum === "dusus" ? "📉" : "💡"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>
                {analiz.sinav_trend.mesaj}
              </span>
            </div>
          )}

          {/* En güçlü / en zayıf */}
          {(analiz.en_guclu_ders || analiz.en_zayif_ders) && (
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {analiz.en_guclu_ders && (
                <div style={{ flex: 1, background: c.light, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: c.text, fontWeight: 600, marginBottom: 2 }}>EN GÜÇLÜ</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{analiz.en_guclu_ders.ders}</div>
                  <div style={{ fontSize: 12, color: c.mid }}>{analiz.en_guclu_ders.net} net</div>
                </div>
              )}
              {analiz.en_zayif_ders && (
                <div style={{ flex: 1, background: "#FFF0F0", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: "#A32D2D", fontWeight: 600, marginBottom: 2 }}>GELİŞİM ALANI</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#A32D2D" }}>{analiz.en_zayif_ders.ders}</div>
                  <div style={{ fontSize: 12, color: "#E24B4A" }}>{analiz.en_zayif_ders.net} net</div>
                </div>
              )}
            </div>
          )}

          {/* Öncelikli konular */}
          {oneriler.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 8, marginTop: 4 }}>
                ÖNCELİKLİ KONULAR
              </div>
              {oneriler.map((o, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid #f5f2ee",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>{o.oneri}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{o.aciklama}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99,
                    background: o.oncelik === "yuksek" ? "#FFF0F0" : "#FFF7E6",
                    color:      o.oncelik === "yuksek" ? "#A32D2D"  : "#854F0B",
                  }}>{o.oncelik === "yuksek" ? "Acil" : "Orta"}</span>
                </div>
              ))}
            </>
          )}

          {/* Görev tamamlanma */}
          {analiz.gorev_istatistik?.toplam > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#fafaf8", borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Görev tamamlanma oranı</div>
              <div style={{ height: 6, borderRadius: 99, background: "#f0ede8", overflow: "hidden" }}>
                <div style={{ width: `${analiz.gorev_istatistik.oran}%`, height: "100%", borderRadius: 99, background: c.mid, transition: "width .6s ease" }} />
              </div>
              <div style={{ fontSize: 12, color: c.text, marginTop: 4, fontWeight: 600 }}>
                {analiz.gorev_istatistik.tamamlanan}/{analiz.gorev_istatistik.toplam} görev · %{analiz.gorev_istatistik.oran}
              </div>
            </div>
          )}
        </Card>
      )}

    </div>
  );
}
