import { useState } from "react";
import { useLessons } from "../hooks/useLessons";
import { fmtTime, lessonStatusStyle, lessonTypeLabel, toDateStr } from "../lib/lessonHelpers";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import CalendarMonth from "./CalendarMonth";

// Ortak ders planlama bloğu (öğretmen + öğrenci).
// props:
//  - userId, role: 'teacher' | 'student'
//  - counterparts: karşı taraf listesi [{ id, full_name }]
//      (öğretmen için öğrenciler, öğrenci için öğretmenler)
//  - color: tema renk objesi (c)
export default function LessonPlanner({ userId, role, counterparts, color: c,
  tasks = [], tests = [], programItems = [], onProgramCevir, programOzet }) {
  const { lessons, createLesson, respondLesson, cancelLesson, markCompleted, confirmPaid } = useLessons(userId);

  // Ödeme durumu rozeti
  const paymentBadge = (ps) => {
    switch (ps) {
      case "odendi":     return { label: "Ödendi ✓",        bg: "#E8F9F0", color: "#1A6B3C" };
      case "bildirildi": return { label: "Ödeme bildirildi", bg: "#FFF7E6", color: "#854F0B" };
      default:           return { label: "Ödenmedi",         bg: "#FFF0F0", color: "#A32D2D" };
    }
  };

  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({
    counterpart_id: "", lesson_type: "yuzyuze",
    location: "", meeting_link: "",
    lesson_date: "", start_time: "", end_time: "",
    title: "", note: "",
  });

  const counterpartLabel = role === "teacher" ? "Öğrenci" : "Öğretmen";
  const isOnline = form.lesson_type === "online";
  const todayStr = toDateStr(new Date());

  const inputStyle = { padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8", fontSize: 13, boxSizing: "border-box" };

  const handleCreate = async () => {
    if (!form.counterpart_id || !form.lesson_date || !form.start_time) return;
    setSaving(true);
    const payload = {
      teacher_id: role === "teacher" ? userId : form.counterpart_id,
      student_id: role === "student" ? userId : form.counterpart_id,
      lesson_type:  form.lesson_type,
      location:     isOnline ? null : (form.location || null),
      meeting_link: isOnline ? (form.meeting_link || null) : null,
      lesson_date:  form.lesson_date,
      start_time:   form.start_time,
      end_time:     form.end_time || null,
      title:        form.title || null,
      note:         form.note || null,
    };
    const { error } = await createLesson(payload);
    setSaving(false);
    if (error) { alert("Ders oluşturulamadı: " + error.message); return; }
    setForm({ counterpart_id: "", lesson_type: "yuzyuze", location: "", meeting_link: "",
      lesson_date: "", start_time: "", end_time: "", title: "", note: "" });
    setShowForm(false);
  };

  // Karşı tarafın oluşturduğu, benim onayımı bekleyen teklifler
  const pendingForMe = lessons.filter(l => l.status === "beklemede" && l.created_by !== userId);

  // Öğretmen için: velinin ödeme bildirdiği, onay bekleyen dersler
  const paymentToConfirm = lessons.filter(l => l.completed && l.payment_status === "bildirildi");

  // Bir dersin karşı taraf adını verir
  const otherName = (l) => role === "teacher" ? (l.student?.full_name ?? "—") : (l.teacher?.full_name ?? "—");

  // Takvimde bir görevin (yapılacak) gösterimi
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

  // Takvimde çözülen bir testin gösterimi
  const renderTest = (t) => (
    <div key={"test-" + t.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#F8F3FC", border: "1px solid #EAD9F5" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>
            🧪 {t.subject}{t.topic ? ` · ${t.topic}` : ""}
          </div>
          <div style={{ fontSize: 11, color: "#9b7fb0", marginTop: 1 }}>
            {t.correct_count}/{t.question_count} doğru
            {t.question_count > 0 ? ` · %${Math.round((t.correct_count / t.question_count) * 100)}` : ""}
          </div>
        </div>
        {t.file_url && (
          <a href={t.file_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 99, flexShrink: 0,
            background: "#fff", color: "#7B4FA0", textDecoration: "none", border: "1px solid #EAD9F5",
          }}>📎 Görüntüle</a>
        )}
      </div>
    </div>
  );

  // Takvimde bir çalışma programı adımı — tıklayınca tamamlandı olarak işaretlenir
  const renderProgram = (o) => (
    <div key={o.id} onClick={() => onProgramCevir?.(o.atamaId, o.anahtar)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 9,
        padding: "10px 12px", borderRadius: 10,
        background: o.tamamlandi ? "#F4FBF7" : "#FFFAF0",
        border: `1px solid ${o.tamamlandi ? "#D5EBDE" : "#F0E2C4"}`,
        cursor: onProgramCevir ? "pointer" : "default",
      }}>
      <div style={{
        width: 17, height: 17, borderRadius: 5, flexShrink: 0, marginTop: 1,
        border: o.tamamlandi ? "none" : "2px solid #E0A526",
        background: o.tamamlandi ? "#1A6B3C" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {o.tamamlandi && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600,
          color: o.tamamlandi ? "#9bb0a5" : "#222",
          textDecoration: o.tamamlandi ? "line-through" : "none",
        }}>
          <span style={{ marginRight: 4 }}>{o.oncelik}</span>{o.ders} — {o.konu}
        </div>
        <div style={{ fontSize: 10.5, color: "#a08c6a", marginTop: 1 }}>
          {o.hafta}. hafta · {o.sure}{o.aciklama ? ` · ${o.aciklama}` : ""}
        </div>
      </div>
    </div>
  );

  // Takvimde bir dersin gösterimi
  const renderLesson = (l) => {
    const st = lessonStatusStyle(l.status);
    const mine = l.created_by === userId;
    return (
      <div key={l.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#fafaf8", border: "1px solid #f0ede8" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>
              {fmtTime(l.start_time)}{l.end_time ? `–${fmtTime(l.end_time)}` : ""} · {otherName(l)}
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              {lessonTypeLabel(l.lesson_type)}
              {l.lesson_type === "yuzyuze" && l.location ? ` · 📍 ${l.location}` : ""}
              {l.title ? ` · ${l.title}` : ""}
            </div>
            {l.lesson_type === "online" && l.meeting_link && l.status === "onaylandi" && (
              <a href={l.meeting_link} target="_blank" rel="noreferrer" style={{
                display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 600,
                padding: "3px 10px", borderRadius: 99, background: c.light, color: c.text, textDecoration: "none",
              }}>🎥 Derse Katıl</a>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: st.bg, color: st.color, flexShrink: 0 }}>
            {st.label}
          </span>
        </div>
        {/* Onay bekleyen ve karşı tarafın oluşturduğu ise onayla/reddet */}
        {l.status === "beklemede" && !mine && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={() => respondLesson(l, true)} style={{
              fontSize: 11, padding: "4px 12px", borderRadius: 99, border: "none",
              background: "#E8F9F0", color: "#1A6B3C", cursor: "pointer", fontWeight: 600,
            }}>✓ Onayla</button>
            <button onClick={() => respondLesson(l, false)} style={{
              fontSize: 11, padding: "4px 12px", borderRadius: 99, border: "none",
              background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600,
            }}>✕ Reddet</button>
          </div>
        )}
        {/* Öğretmen: onaylı & yapılmamış dersi 'yapıldı' işaretle — sadece günü gelince */}
        {role === "teacher" && l.status === "onaylandi" && !l.completed && (
          l.lesson_date <= todayStr ? (
            <button onClick={() => markCompleted(l.id)} style={{
              fontSize: 11, padding: "4px 12px", borderRadius: 99, marginTop: 8,
              border: "none", background: c.light, color: c.text, cursor: "pointer", fontWeight: 600,
            }}>✓ Ders yapıldı</button>
          ) : (
            <div style={{ fontSize: 10, color: "#bbb", marginTop: 8 }}>
              Ders günü gelince "yapıldı" işaretlenebilir
            </div>
          )
        )}
        {/* Tamamlanan ders → yapıldı + ödeme rozeti */}
        {l.completed && (() => {
          const pb = paymentBadge(l.payment_status);
          return (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: c.light, color: c.text }}>Yapıldı ✓</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: pb.bg, color: pb.color }}>{pb.label}</span>
            </div>
          );
        })()}
        {/* İptal — yapılmamış onaylı ders veya kendi bekleyen teklifim */}
        {((l.status === "onaylandi" && !l.completed) || (l.status === "beklemede" && mine)) && (
          <button onClick={() => cancelLesson(l.id)} style={{
            fontSize: 10, padding: "3px 10px", borderRadius: 99, marginTop: 8, marginLeft: 6,
            border: "1px solid #f0ede8", background: "#fff", color: "#999", cursor: "pointer",
          }}>İptal et</button>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Ders Planla */}
      <Card>
        <SectionTitle title="Ders Planla" color={c.mid} />
        {!showForm ? (
          <button onClick={() => setShowForm(true)} style={{
            width: "100%", padding: "11px 0", borderRadius: 12,
            border: `1.5px dashed ${c.mid}`, background: "transparent",
            color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>+ Yeni Ders Planla</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={form.counterpart_id}
              onChange={e => setForm(f => ({ ...f, counterpart_id: e.target.value }))}
              style={{ ...inputStyle, color: form.counterpart_id ? "#222" : "#aaa" }}>
              <option value="">{counterpartLabel} seç...</option>
              {counterparts.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>

            {/* Ders türü */}
            <div style={{ display: "flex", gap: 8 }}>
              {[["yuzyuze", "Yüz yüze"], ["online", "Online"]].map(([val, label]) => (
                <button key={val} onClick={() => setForm(f => ({ ...f, lesson_type: val }))} style={{
                  flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${form.lesson_type === val ? c.bg : "#f0ede8"}`,
                  background: form.lesson_type === val ? c.bg : "#fff",
                  color: form.lesson_type === val ? "#fff" : "#888", cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>

            {/* Yer / link */}
            {isOnline ? (
              <input placeholder="Toplantı linki (Google Meet / Zoom)" value={form.meeting_link}
                onChange={e => setForm(f => ({ ...f, meeting_link: e.target.value }))}
                style={{ ...inputStyle, width: "100%" }} />
            ) : (
              <input placeholder="Yer (ör. Merkez şube, 2. kat)" value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                style={{ ...inputStyle, width: "100%" }} />
            )}

            {/* Tarih + saatler */}
            <input type="date" value={form.lesson_date}
              onChange={e => setForm(f => ({ ...f, lesson_date: e.target.value }))}
              style={{ ...inputStyle, width: "100%" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Başlangıç</div>
                <input type="time" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Bitiş (opsiyonel)</div>
                <input type="time" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  style={{ ...inputStyle, width: "100%" }} />
              </div>
            </div>

            <input placeholder="Ders konusu (opsiyonel)" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ ...inputStyle, width: "100%" }} />
            <input placeholder="Not (opsiyonel)" value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              style={{ ...inputStyle, width: "100%" }} />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCreate} disabled={saving} style={{
                flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                background: c.bg, color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: "pointer", opacity: saving ? 0.7 : 1,
              }}>{saving ? "Gönderiliyor..." : "Teklif Gönder"}</button>
              <button onClick={() => setShowForm(false)} style={{
                padding: "11px 16px", borderRadius: 12, border: "1.5px solid #f0ede8",
                background: "#fff", color: "#888", fontSize: 13, cursor: "pointer",
              }}>İptal</button>
            </div>
            <div style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>
              Teklif, {counterpartLabel.toLowerCase()} onayladıktan sonra takvimde görünür.
            </div>
          </div>
        )}
      </Card>

      {/* Onay bekleyen teklifler */}
      {pendingForMe.length > 0 && (
        <Card>
          <SectionTitle title={`Onayını Bekleyen Teklifler (${pendingForMe.length})`} color={c.mid} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingForMe.map(renderLesson)}
          </div>
        </Card>
      )}

      {/* Öğretmen: veli ödeme bildirimlerini onayla */}
      {role === "teacher" && paymentToConfirm.length > 0 && (
        <Card>
          <SectionTitle title={`Ödeme Onayları (${paymentToConfirm.length})`} color={c.mid} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {paymentToConfirm.map(l => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "#fafaf8" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{otherName(l)}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {new Date(l.lesson_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}
                    {l.title ? ` · ${l.title}` : ""} · Veli "ödedim" dedi
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => confirmPaid(l.id, true)} style={{
                    fontSize: 11, padding: "4px 12px", borderRadius: 99, border: "none",
                    background: "#E8F9F0", color: "#1A6B3C", cursor: "pointer", fontWeight: 600,
                  }}>✓ Onayla</button>
                  <button onClick={() => confirmPaid(l.id, false)} style={{
                    fontSize: 11, padding: "4px 12px", borderRadius: 99, border: "none",
                    background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600,
                  }}>✕ Geri al</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Takvim */}
      <Card>
        <SectionTitle title="Takvimim" color={c.mid} />
        {programOzet}
        <CalendarMonth
          lessons={lessons} tasks={tasks} tests={tests} programItems={programItems}
          color={c}
          renderLesson={renderLesson} renderTask={renderTask}
          renderTest={renderTest} renderProgram={renderProgram}
        />
      </Card>
    </>
  );
}
