import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { calistir, hatalariBildir } from "../lib/db";
import { branslariEkle, kocEtiketi } from "../lib/branslar";
import { odevDosyalari, yeniDosyaYolu, DOSYA_SINIRI, BOYUT_SINIRI_MB } from "../lib/odevDosyalari";
import { COLORS } from "../lib/theme";
import { useTopics } from "../lib/TopicsContext";
import { genelDegerlendirmeStil } from "../lib/analizHelpers";
import { computeTopicProgress } from "../lib/progressHelpers";
import { testOzeti, testOzetMetni } from "../lib/testHelpers";
import { useAnaliz } from "../hooks/useAnaliz";
import Card from "../components/Card";
import SectionTitle from "../components/SectionTitle";
import StatCard from "../components/StatCard";
import TaskItem from "../components/TaskItem";
import ProgressBar from "../components/ProgressBar";
import AlertChip from "../components/AlertChip";
import LessonPlanner from "../components/LessonPlanner";
import HaftalikProgram from "../components/HaftalikProgram";
import Mesajlar from "../components/Mesajlar";
import Modal from "../components/Modal";
import SinavAnalizi from "../components/SinavAnalizi";
import HaftalikOzet from "../components/HaftalikOzet";
import BaglantiYonetimi from "../components/BaglantiYonetimi";
import Rozetler from "../components/Rozetler";
import SeviyeAvatar from "../components/SeviyeAvatar";
import { useProgramAtama } from "../hooks/useProgramAtama";
import { programTakvimOgeleri, atamaProgrami } from "../lib/studyPrograms";

export default function StudentDashboard({ userId, userName }) {
  const c = COLORS.student;
  const { sinavTurleri, examSubjectsOf, topicsOf, dersinTuru } = useTopics();

  const [tasks,        setTasks]        = useState([]);
  const [testSessions, setTestSessions] = useState([]);
  const [examResults,  setExamResults]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [submissions,     setSubmissions]     = useState({});  // { task_id: submission }
  const [teachers,        setTeachers]        = useState([]);
  // Velisi — mesajlaşma kişi listesinde çıkıyor. loadAll içinde
  // doldurulduğu için tanımı yukarıda olmak zorunda.
  const [veliler,         setVeliler]         = useState([]);
  const [profile,      setProfile]      = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [savingProfile,   setSavingProfile]   = useState(false);
  const [tamamlananlarAcik, setTamamlananlarAcik] = useState(false);
  // Test listesi varsayılan olarak kısa; düzenleme eklendiği için eski
  // testlere de ulaşılabilmeli, yoksa yalnızca son 4'ü düzeltilebilirdi.
  const [tumTestlerAcik, setTumTestlerAcik] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [profileForm,  setProfileForm]  = useState({
    birth_date: "", phone: "",
    parent_name: "", parent_relationship: "", parent_occupation: "",
    parent_phone: "", parent_email: "",
    parent2_name: "", parent2_relationship: "", parent2_occupation: "",
    parent2_phone: "", parent2_email: "",
    school_name: "", grade: "", field_preference: "",
  });

  // Çalışma programları — ayrı kart yok, adımlar takvime işleniyor.
  // Birden fazla program aynı anda aktif olabilir: yeni atama artık öncekini
  // pasife almıyor, hepsinin adımları takvimde birlikte görünüyor.
  const { atamalar: programAtamalari, satirCevir: programCevir } = useProgramAtama(userId);
  const programOgeleri = programAtamalari.flatMap(a => programTakvimOgeleri(a));

  // Takvimin üstünde duran kompakt program şeridi — her aktif program için bir tane
  const programSeridi = (atama) => {
    const p = atamaProgrami(atama);
    if (!p?.weeks) return null;
    const yapilan = (atama.tamamlananlar ?? []).length;
    const toplam  = atama.toplam_satir || 1;
    const oran    = Math.round((yapilan / toplam) * 100);
    const gecen   = Math.floor((Date.now() - new Date(atama.baslangic).getTime()) / 86400000);
    const hafta   = Math.min(Math.max(Math.floor(gecen / 7) + 1, 1), p.weeks.length);
    const buHafta = p.weeks.find(w => w.week === hafta);
    return (
      <div key={atama.id} style={{
        padding: "10px 12px", borderRadius: 10, marginBottom: 12,
        background: "#FFFAF0", border: "1px solid #F0E2C4",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#222", minWidth: 0 }}>{p.title ?? atama.program_adi ?? "Çalışma programı"}</span>
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
  };
  const programOzetSeridi = programAtamalari.map(programSeridi).filter(Boolean);

  // Akıllı analiz (Python backend) — kendi analiz ve önerilerimiz
  const { analiz, oneriler } = useAnaliz(userId);

  // Test formu
  const [showTestForm,  setShowTestForm]  = useState(false);
  const [savingTest,    setSavingTest]    = useState(false);
  const [testForm,      setTestForm]      = useState({
    exam_type: "TYT", subject: "", topic: "",
    custom_subject: "", custom_topic: "",
    question_count: "", correct_count: "", wrong_count: "",
    task_id: "",                     // hangi görevi yerine getiriyor (boş olabilir)
  });
  // Formdaki sayıların özeti — boş ve net anlık görünsün
  const testOzet = testOzeti(testForm);

  // Teste eklenecek çözüm görselleri. Tek dosyaydı; ödevdeki gibi birden
  // fazla sayfa yüklenebilmeli.
  const [testFiles, setTestFiles] = useState([]);
  // Düzenlenen testin id'si (null = yeni kayıt) ve o testte ZATEN duran
  // görseller. Yeni seçilenlerden ayrı tutuluyor: birinciler yüklenmiş,
  // ikincilerin daha yüklenmesi gerekiyor.
  const [duzenlenenTest, setDuzenlenenTest] = useState(null);
  const [mevcutDosyalar, setMevcutDosyalar] = useState([]);
  const testFileInputRef = useRef(null);

  const loadAll = async () => {
    const [t, ts, er, prof, sub, tch, vel] = await Promise.all([
      supabase.from("tasks").select("*").eq("student_id", userId).order("created_at", { ascending: false }),
      supabase.from("test_sessions").select("*").eq("student_id", userId).order("created_at", { ascending: false }),
      supabase.from("exam_results").select("*").eq("student_id", userId).order("exam_date", { ascending: false }),
      supabase.from("student_profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("homework_submissions").select("*").eq("student_id", userId),
      supabase.from("teacher_students").select("teacher_id")
        .eq("student_id", userId).eq("durum", "onaylandi"),
      // Velisi — mesajlaşma kişi listesi için
      supabase.from("family_links").select("parent_id").eq("student_id", userId),
    ]);
    hatalariBildir([t, ts, er, prof, sub, tch, vel],
      ["gorevler", "testler", "sinavlar", "profil", "odev gonderimleri",
       "bagli ogretmenler", "veli baglantisi"]);
    setTasks(t.data ?? []);
    setTestSessions(ts.data ?? []);
    setExamResults(er.data ?? []);
    // Gönderimleri task_id → submission şeklinde map'e çevir
    const subMap = {};
    (sub.data ?? []).forEach(s => { subMap[s.task_id] = s; });
    setSubmissions(subMap);
    // Bağlı öğretmenler; tablo yoksa (migration çalışmadıysa) hepsine düşülür
    if (tch.error) {
      const { veri } = await calistir(
        supabase.from("users").select("id, full_name").eq("role", "teacher").eq("onay_durumu", "onaylandi"),
        "Ogretmen listesi", { sessiz: true }
      );
      setTeachers(veri ?? []);
    } else {
      const ids = (tch.data ?? []).map(b => b.teacher_id);
      const { veri } = ids.length
        ? await calistir(
            supabase.from("users").select("id, full_name").in("id", ids),
            "Bagli ogretmenler", { sessiz: true }
          )
        : { veri: [] };
      setTeachers(await branslariEkle(veri ?? []));
    }

    // Veli adları
    const veliIdleri = (vel.data ?? []).map(v => v.parent_id);
    if (veliIdleri.length > 0) {
      const { veri } = await calistir(
        supabase.from("users").select("id, full_name").in("id", veliIdleri),
        "Veli listesi", { sessiz: true }
      );
      setVeliler(veri ?? []);
    } else setVeliler([]);

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
  // Tarihi olmayan bekleyen görevler takvimde hiçbir güne düşmez; ayrı bir
  // görev kartı da kalmadığı için takvimin altında gösterilmezlerse
  // öğrenciye tamamen görünmez olurlar.
  const tarihsizBekleyen = pendingTasks.filter(t => !t.due_date);

  // Test formundaki görev listesi: koçun henüz kapatmadığı görevler.
  // Tarihi yakın olan üstte olsun; tarihsizler en sona.
  const bekleyenGorevler = tasks
    .filter(t => !t.is_done && t.ogretmen_onayi !== "onaylandi")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  // Görev seçilince ders ve konu kendiliğinden dolsun.
  //
  // Görevdeki ders/konu hangi sınav türüne aitse form o türe geçiyor —
  // görev TYT konusuysa AYT sekmesinde açık kalması hem yanlış hem de
  // konu listesini boş bırakırdı.
  //
  // Ders müfredatta yoksa (koç serbest metinle yazmış olabilir) form
  // "Diğer"e düşüp adları elle yazılan alanlara koyuyor. Sessizce boş
  // bırakmak, öğrencinin kendi görevinin dersini yeniden seçmesi
  // demekti — kolaylık olsun diye eklenen şey zahmete dönerdi.
  const gorevSec = (taskId) => {
    const gorev = bekleyenGorevler.find(t => t.id === taskId);
    setTestForm(f => {
      const temel = { ...f, task_id: taskId };
      if (!gorev?.subject) return temel;

      const tur = dersinTuru(gorev.subject, gorev.topic);
      if (tur) {
        const konular = topicsOf(tur, gorev.subject);
        return {
          ...temel,
          exam_type: tur,
          subject:   gorev.subject,
          // Konu müfredatta yoksa boş bırakılıyor: olmayan bir seçeneği
          // seçili göstermek açılır listeyi bozar
          topic:     konular.includes(gorev.topic) ? gorev.topic : "",
          custom_subject: "", custom_topic: "",
        };
      }
      // dersinTuru harf büyüklüğüne duyarlı; görevlerde "MATEMATİK" ve
      // "kimya" gibi varyantlar var (103 görevin 3'ü). Bunları "Diğer"e
      // düşürmek, öğrenciye müfredatta zaten duran dersi elle yazdırmak
      // olurdu. Türkçe küçültme ŞART: düz toLowerCase "İ" harfini
      // birleşik noktalı i'ye çeviriyor ve "matematik" ile eşleşmiyor.
      const kucult = (x) => (x ?? "").toLocaleLowerCase("tr").trim();
      for (const t of sinavTurleri) {
        const ders = examSubjectsOf(t).find(d => kucult(d) === kucult(gorev.subject));
        if (!ders) continue;
        const konu = topicsOf(t, ders).find(k => kucult(k) === kucult(gorev.topic));
        return {
          ...temel,
          exam_type: t, subject: ders, topic: konu ?? "",
          custom_subject: "", custom_topic: "",
        };
      }

      return {
        ...temel,
        subject: "__diger",
        custom_subject: gorev.subject,
        custom_topic:   gorev.topic ?? "",
      };
    });
  };

  // Göreve bağlanmış testler — kanıt artık buradan geliyor
  const gorevinTestleri = (taskId) => testSessions.filter(ts => ts.task_id === taskId);

  // Görev satırı: durum + koç doğrulaması. Hem takvimde seçili günde
  // hem takvim altındaki listelerde aynı bileşen kullanılıyor.
  const gorevSatiri = (t) => (
    <TaskItem
      key={t.id} id={t.id} color={c.bg} done={t.is_done} label={t.title}
      sub={[t.subject, t.topic, t.estimated_minutes ? `${t.estimated_minutes} dk` : null,
        t.due_date ? new Date(t.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : null,
        t.description].filter(Boolean).join(" · ")}
      submission={submissions[t.id] ?? null}
      testler={gorevinTestleri(t.id)}
      ogretmenOnayi={t.ogretmen_onayi} onayNotu={t.onay_notu}
    />
  );

  const takvimAltiBolum = (
    <>
      {tarihsizBekleyen.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>
            TARİHSİZ GÖREVLER ({tarihsizBekleyen.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tarihsizBekleyen.map(gorevSatiri)}
          </div>
        </div>
      )}

      {doneTasks.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setTamamlananlarAcik(v => !v)} style={{
            width: "100%", padding: "10px 0", borderRadius: 12,
            border: "1px solid #f0ede8", background: "#fafaf8",
            color: c.text, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            {tamamlananlarAcik ? "▾" : "▸"} Tamamlanan görevler ({doneTasks.length})
          </button>
          {tamamlananlarAcik && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {doneTasks.map(gorevSatiri)}
            </div>
          )}
        </div>
      )}
    </>
  );

  // Konu ilerlemesi: görevlerden otomatik hesaplanır (elle giriş kaldırıldı)
  const progressList = computeTopicProgress(tasks);

  // Çözülen testler takvimde kayıt günlerinde görünür
  const testsForCalendar = testSessions.map(t => ({ ...t, date: (t.created_at ?? "").split("T")[0] }));

  // Bir testi düzenlemeye al. exam_type test kaydında TUTULMUYOR (yalnız
  // ders/konu var), o yüzden müfredattan geri türetiliyor; bulunamazsa
  // form "Diğer"e düşüp adları serbest alanlara koyuyor — testin dersi
  // kaybolmasın.
  // Koç görevi onayladıysa test kilitli: onaylanan kanıt sonradan
  // değişmemeli. Kural sunucuda da var (RLS), buradaki yalnızca
  // çalışmayacak bir düğmeyi göstermemek için.
  const testDuzenlenebilir = (t) => {
    if (!t.task_id) return true;
    return tasks.find(x => x.id === t.task_id)?.ogretmen_onayi !== "onaylandi";
  };

  const testiDuzenle = (t) => {
    const tur = dersinTuru(t.subject, t.topic);
    const mufredatta = tur && examSubjectsOf(tur).includes(t.subject);
    setTestForm({
      exam_type:      tur ?? "TYT",
      subject:        mufredatta ? t.subject : "__diger",
      topic:          mufredatta && topicsOf(tur, t.subject).includes(t.topic) ? t.topic : "",
      custom_subject: mufredatta ? "" : (t.subject ?? ""),
      custom_topic:   mufredatta ? "" : (t.topic ?? ""),
      question_count: t.question_count ?? "",
      correct_count:  t.correct_count ?? "",
      wrong_count:    t.yanlis_count === null || t.yanlis_count === undefined ? "" : t.yanlis_count,
      task_id:        t.task_id ?? "",
    });
    setMevcutDosyalar(odevDosyalari(t));
    setTestFiles([]);
    setDuzenlenenTest(t.id);
    setShowTestForm(true);
  };

  const testiSil = async (t) => {
    if (!window.confirm(
      `"${t.subject}${t.topic ? " · " + t.topic : ""}" testi silinsin mi?

` +
      `Bu işlem geri alınamaz; analiz ve haftalık özetten de düşer.`
    )) return;
    const { hata } = await calistir(
      supabase.from("test_sessions").delete().eq("id", t.id),
      "Test silme"
    );
    if (hata) return;
    if (duzenlenenTest === t.id) testFormuKapat();
    loadAll();
  };

  // Formu kapatırken düzenleme durumu da temizlenmeli; yoksa bir sonraki
  // "Test Ekle" eski testin üstüne yazardı.
  const testFormuKapat = () => {
    setShowTestForm(false);
    setDuzenlenenTest(null);
    setMevcutDosyalar([]);
    setTestFiles([]);
    setTestForm({ exam_type: "TYT", subject: "", topic: "", custom_subject: "",
      custom_topic: "", question_count: "", correct_count: "", wrong_count: "", task_id: "" });
  };

  const handleTestSave = async () => {
    const serbest = testForm.subject === "__diger";
    const ders = (serbest ? testForm.custom_subject : testForm.subject).trim();
    const konu = (serbest ? testForm.custom_topic   : testForm.topic).trim();
    if (!ders || !testForm.question_count) return;
    setSavingTest(true);
    try {
      // Çözüm görselleri — ödevdeki yol üretimiyle aynı. Eskiden yol
      // `{ogrenci}/test_{damga}` idi ve tek dosya alıyordu; her dosya
      // kendi anahtarına yazılmalı, yoksa üst üste binerler.
      const damga = Date.now();
      const yuklenen = [];
      for (let i = 0; i < testFiles.length; i++) {
        const dosya = testFiles[i];
        const yol = yeniDosyaYolu(userId, `test`, dosya.name, i, damga);
        const { error: yuklemeHatasi } = await supabase.storage
          .from("homework").upload(yol, dosya, { upsert: true, contentType: dosya.type });
        if (yuklemeHatasi) throw yuklemeHatasi;
        const { data: { publicUrl } } = supabase.storage.from("homework").getPublicUrl(yol);
        yuklenen.push({ url: publicUrl, ad: dosya.name });
      }

      // Düzenlemede duran görseller korunuyor, yeniler sonuna ekleniyor
      const tumDosyalar = [...mevcutDosyalar, ...yuklenen];
      const satir = {
        student_id:     userId,
        subject:        ders,
        topic:          konu || null,
        question_count: parseInt(testForm.question_count),
        correct_count:  parseInt(testForm.correct_count) || 0,
        yanlis_count:   testForm.wrong_count === "" ? null : (parseInt(testForm.wrong_count) || 0),
        task_id:        testForm.task_id || null,
        dosyalar:       tumDosyalar,
        // Eski kod yolları ve raporlar yalnızca file_url'i biliyor
        file_url:       tumDosyalar[0]?.url ?? null,
        file_name:      tumDosyalar[0]?.ad  ?? null,
      };
      const { error } = duzenlenenTest
        ? await supabase.from("test_sessions").update(satir).eq("id", duzenlenenTest)
        : await supabase.from("test_sessions").insert(satir);
      if (error) throw error;

      setTestForm({ exam_type: "TYT", subject: "", topic: "", custom_subject: "", custom_topic: "", question_count: "", correct_count: "", wrong_count: "", task_id: "" });
      setTestFiles([]);
      setMevcutDosyalar([]);
      setDuzenlenenTest(null);
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

      {/* Öğretmen bağlantıları (çift onaylı) */}
      <div id="bolum-baglanti"><BaglantiYonetimi userId={userId} rol="student" color={c} onDegisti={loadAll} /></div>

      {/* Takvim + Ders Planlama (dersler + görevler + çözülen testler) */}
      <div id="bolum-ders"><LessonPlanner
        userId={userId} role="student" counterparts={teachers} color={c}
        tasks={tasks} tests={testsForCalendar}
        programItems={programOgeleri}
        onProgramCevir={programCevir}
        programOzet={programOzetSeridi}
        renderTask={gorevSatiri}
        takvimAlti={takvimAltiBolum}
      /></div>

      {/* Koçları ve velisiyle mesajlaşma */}
      <Mesajlar userId={userId} color={c} baslik="Mesajlar" kisiler={[
        ...teachers.map(t => ({ ...t, etiket: kocEtiketi(t) })),
        ...veliler.map(v => ({ ...v, etiket: "· veliniz" })),
      ]} />

      {/* Haftalık programın yazdırılabilir hali — takvimin hemen ardında */}
      <HaftalikProgram tasks={tasks} programOgeleri={programOgeleri} ogrenciAdi={userName} color={c} variant="kart" />

      {/* Test Ekle */}
      <HaftalikOzet studentId={userId} color={c} baslik="Haftalık Gelişimim" />

      <Card id="bolum-test">
        <SectionTitle title="Test Çözdüm" color={c.mid} />
        {!showTestForm ? (
          <button onClick={() => { testFormuKapat(); setShowTestForm(true); }} style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: `1.5px dashed ${c.mid}`, background: "transparent", color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Test Ekle
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {/* Görev bağı — zorunlu değil. Bir görevi yerine getirmek için
                çözülüyorsa görev seçiliyor, koç bunu görüp doğruluyor.
                Kendi isteğiyle çözülen test boş bırakılıyor. */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "#555", display: "block", marginBottom: 5 }}>
                Bir görev için mi çözdün?
              </label>
              <select value={testForm.task_id}
                onChange={e => gorevSec(e.target.value)}
                style={{ ...inputStyle, width: "100%", color: testForm.task_id ? "#222" : "#aaa" }}>
                <option value="">Hayır, kendim çözdüm</option>
                {bekleyenGorevler.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title}{t.subject ? ` · ${t.subject}` : ""}
                    {t.due_date ? ` · ${new Date(t.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}` : ""}
                  </option>
                ))}
              </select>
              {testForm.task_id && (
                <div style={{
                  fontSize: 10.5, color: c.text, background: c.light,
                  padding: "7px 10px", borderRadius: 8, marginTop: 6, lineHeight: 1.45,
                }}>
                  Bu test koçuna gönderilecek. Görevi <b>koçun doğrulamasıyla</b> kapanır.
                </div>
              )}
            </div>

            {/* Sınav türü (müfredat seçimi için) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sinavTurleri.map(tip => (
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
              <input placeholder="Toplam" type="number" min="0" value={testForm.question_count}
                onChange={e => setTestForm(f => ({ ...f, question_count: e.target.value }))}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <input placeholder="Doğru" type="number" min="0" value={testForm.correct_count}
                onChange={e => setTestForm(f => ({ ...f, correct_count: e.target.value }))}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <input placeholder="Yanlış" type="number" min="0" value={testForm.wrong_count}
                onChange={e => setTestForm(f => ({ ...f, wrong_count: e.target.value }))}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
            </div>

            {/* Testte zaten duran görseller (düzenlemede) */}
            {mevcutDosyalar.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {mevcutDosyalar.map((d, i) => (
                  <span key={d.url} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 11, padding: "3px 5px 3px 10px", borderRadius: 99,
                    background: "#f5f2ee", color: "#555", maxWidth: 200,
                  }}>
                    <a href={d.url} target="_blank" rel="noreferrer" title={d.ad}
                      style={{ color: "#555", textDecoration: "none", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {d.ad}</a>
                    <button onClick={() => setMevcutDosyalar(l => l.filter((_, j) => j !== i))}
                      title="Kaldır" style={{
                        border: "none", background: "transparent", cursor: "pointer",
                        color: "#a99", fontSize: 12, lineHeight: 1, padding: "0 3px",
                      }}>✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* Çözüm görselleri — birden fazla sayfa yüklenebiliyor */}
            {testFiles.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {testFiles.map((f, i) => (
                  <span key={`${f.name}-${i}`} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 11, padding: "3px 5px 3px 10px", borderRadius: 99,
                    background: c.light, color: c.text, maxWidth: 200,
                  }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📎 {f.name}
                    </span>
                    <button onClick={() => setTestFiles(l => l.filter((_, j) => j !== i))}
                      title="Kaldır" style={{
                        border: "none", background: "transparent", cursor: "pointer",
                        color: c.text, fontSize: 12, lineHeight: 1, padding: "0 3px",
                      }}>✕</button>
                  </span>
                ))}
              </div>
            )}
            {mevcutDosyalar.length + testFiles.length < DOSYA_SINIRI && (
              <button onClick={() => testFileInputRef.current?.click()} style={{
                width: "100%", padding: "9px 0", borderRadius: 10,
                border: `1.5px dashed ${testFiles.length ? c.mid : "#d8d4cd"}`,
                background: "transparent",
                color: testFiles.length ? c.text : "#999", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
                {testFiles.length
                  ? `📎 Görsel ekle (${testFiles.length}/${DOSYA_SINIRI})`
                  : "📎 Çözüm görseli ekle"}
              </button>
            )}
            <input ref={testFileInputRef} type="file" multiple accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={e => {
                const secilenler = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (secilenler.length === 0) return;
                if (mevcutDosyalar.length + testFiles.length + secilenler.length > DOSYA_SINIRI) {
                  alert(`En fazla ${DOSYA_SINIRI} görsel eklenebilir.`);
                  return;
                }
                const buyuk = secilenler.find(f => f.size > BOYUT_SINIRI_MB * 1024 * 1024);
                if (buyuk) {
                  alert(`"${buyuk.name}" çok büyük. Dosya başına sınır ${BOYUT_SINIRI_MB} MB.`);
                  return;
                }
                setTestFiles(l => [...l, ...secilenler]);
              }} />

            {/* Boş sayısı hesaplanıyor, ayrı bir alan olarak SORULMUYOR:
                üçü de elle girilseydi birbiriyle çelişebilirdi. Toplamı
                aşan giriş burada anında görünüyor. */}
            {testOzet && (
              <div style={{
                fontSize: 12, padding: "8px 12px", borderRadius: 8,
                background: testOzet.gecersiz ? "#FFF0F0" : c.light,
                color:      testOzet.gecersiz ? "#A32D2D" : c.text,
              }}>
                {testOzet.gecersiz
                  ? `Doğru + yanlış (${testOzet.dogru + testOzet.yanlis}) toplam soruyu (${testOzet.toplam}) aşıyor.`
                  : <>
                      Boş: <b>{testOzet.bos}</b>
                      {" · "}Net: <b>{testOzet.net}</b>
                      {" · "}Doğruluk: %{testOzet.oran}
                    </>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleTestSave} disabled={savingTest} style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", background: c.bg, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: savingTest ? 0.7 : 1 }}>
                {savingTest ? "Kaydediliyor..." : duzenlenenTest ? "Değişikliği kaydet" : "Kaydet"}
              </button>
              <button onClick={testFormuKapat} style={{ padding: "11px 16px", borderRadius: 12, border: "1.5px solid #f0ede8", background: "#fff", color: "#888", fontSize: 13, cursor: "pointer" }}>İptal</button>
            </div>
          </div>
        )}
        {(tumTestlerAcik ? testSessions : testSessions.slice(0, 4)).map((t) => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #f5f2ee" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>{t.subject}</span>
              {t.topic && <span style={{ fontSize: 11, color: "#aaa", marginLeft: 6 }}>{t.topic}</span>}
              <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>{testOzetMetni(t)}</div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 1 }}>{new Date(t.created_at).toLocaleDateString("tr-TR")}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              {odevDosyalari(t).map((d, i, hepsi) => (
                <a key={d.url} href={d.url} target="_blank" rel="noreferrer" title={d.ad} style={{
                  fontSize: 11, padding: "2px 7px", borderRadius: 99,
                  background: "#f5f2ee", color: "#555", textDecoration: "none",
                }}>📎{hepsi.length > 1 ? i + 1 : ""}</a>
              ))}
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 99,
                background: Math.round((t.correct_count / t.question_count) * 100) >= 70 ? c.light : "#FFF7E6",
                color:      Math.round((t.correct_count / t.question_count) * 100) >= 70 ? c.text  : "#854F0B",
              }}>%{Math.round((t.correct_count / t.question_count) * 100)}</span>

              {/* Koç onayladıysa düğmeler hiç çıkmıyor: tıklanıp
                  reddedilen bir düğme, olmayandan daha kafa karıştırıcı */}
              {testDuzenlenebilir(t) ? (
                <>
                  <button onClick={() => testiDuzenle(t)} title="Düzenle" style={{
                    background: "none", border: "none", padding: "0 2px",
                    color: c.mid, fontSize: 13, cursor: "pointer",
                  }}>✎</button>
                  <button onClick={() => testiSil(t)} title="Sil" style={{
                    background: "none", border: "none", padding: "0 2px",
                    color: "#C98A8A", fontSize: 13, cursor: "pointer",
                  }}>✕</button>
                </>
              ) : (
                <span title="Koç bu görevi onayladı, test artık değiştirilemez"
                  style={{ fontSize: 11, color: "#bbb" }}>🔒</span>
              )}
            </div>
          </div>
        ))}
        {testSessions.length > 4 && (
          <button onClick={() => setTumTestlerAcik(a => !a)} style={{
            marginTop: 8, width: "100%", background: "none", border: "none",
            color: c.mid, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>
            {tumTestlerAcik ? "▴ daha az" : `▾ tümünü göster (${testSessions.length})`}
          </button>
        )}
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
