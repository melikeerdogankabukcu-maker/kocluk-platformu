import { useState } from "react";
import { MONTHS_TR, DAYS_TR, buildMonthGrid, toDateStr } from "../lib/lessonHelpers";

// Aylık takvim ızgarası. Dersleri, görevleri ve (opsiyonel) çözülen testleri gösterir.
// props:
//  - lessons: [{ lesson_date: "YYYY-MM-DD", status, ... }]
//  - tasks:   [{ due_date: "YYYY-MM-DD", is_done, ... }]  (tarihi olmayanlar takvimde görünmez)
//  - tests:   [{ date: "YYYY-MM-DD", ... }]                (çözülen testler, kayıt günü)
//  - programItems: [{ tarih: "YYYY-MM-DD", ... }]          (çalışma programı adımları)
//  - color: tema renk objesi (c)
//  - renderLesson / renderTask / renderTest / renderProgram: seçili günün öğeleri için JSX
export default function CalendarMonth({
  lessons = [], tasks = [], tests = [], programItems = [],
  color, renderLesson, renderTask, renderTest, renderProgram,
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(toDateStr(today));

  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const weeks = buildMonthGrid(year, month);
  const todayStr = toDateStr(today);

  // Gün → dersler / görevler
  const lessonsByDay = {};
  lessons.forEach(l => {
    if (!l.lesson_date) return;
    (lessonsByDay[l.lesson_date] ??= []).push(l);
  });
  const tasksByDay = {};
  tasks.forEach(t => {
    if (!t.due_date) return;
    (tasksByDay[t.due_date] ??= []).push(t);
  });
  const testsByDay = {};
  tests.forEach(t => {
    if (!t.date) return;
    (testsByDay[t.date] ??= []).push(t);
  });
  const programByDay = {};
  programItems.forEach(o => {
    if (!o.tarih) return;
    (programByDay[o.tarih] ??= []).push(o);
  });

  const selectedLessons = (lessonsByDay[selected] ?? [])
    .slice().sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const selectedTasks = tasksByDay[selected] ?? [];
  const selectedTests   = testsByDay[selected] ?? [];
  const selectedProgram = programByDay[selected] ?? [];

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));

  const navBtn = {
    width: 30, height: 30, borderRadius: 8, border: "1px solid #f0ede8",
    background: "#fff", color: color.mid, fontSize: 15, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  return (
    <div>
      {/* Ay başlığı + navigasyon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={goPrev} style={navBtn}>‹</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#222" }}>{MONTHS_TR[month]} {year}</div>
        <button onClick={goNext} style={navBtn}>›</button>
      </div>

      {/* Gün başlıkları */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DAYS_TR.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: "#aaa", fontWeight: 600, padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      {/* Izgara */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {weeks.flat().map((cell, i) => {
          if (!cell.date) return <div key={i} />;
          const dayLessons = lessonsByDay[cell.dateStr] ?? [];
          const dayTasks   = tasksByDay[cell.dateStr] ?? [];
          const dayTests   = testsByDay[cell.dateStr] ?? [];
          const dayProgram = programByDay[cell.dateStr] ?? [];
          const isToday    = cell.dateStr === todayStr;
          const isSelected = cell.dateStr === selected;
          const hasApproved = dayLessons.some(l => l.status === "onaylandi");
          const hasPending  = dayLessons.some(l => l.status === "beklemede");
          const hasTask     = dayTasks.some(t => !t.is_done);
          const hasDoneTask = dayTasks.length > 0 && dayTasks.every(t => t.is_done);
          const hasProgram  = dayProgram.some(o => !o.tamamlandi);
          const programBitti = dayProgram.length > 0 && dayProgram.every(o => o.tamamlandi);

          return (
            <button
              key={i}
              onClick={() => setSelected(cell.dateStr)}
              style={{
                aspectRatio: "1", borderRadius: 10, cursor: "pointer", position: "relative",
                border: isSelected ? `2px solid ${color.bg}` : "1px solid #f0ede8",
                background: isSelected ? color.light : isToday ? "#fafaf8" : "#fff",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 3, padding: 0,
              }}
            >
              <span style={{
                fontSize: 12,
                fontWeight: isToday || isSelected ? 700 : 500,
                color: isSelected ? color.text : isToday ? color.mid : "#444",
              }}>{cell.date.getDate()}</span>
              {/* Noktalar: yeşil=onaylı ders · turuncu=bekleyen ders · mavi=görev
                  mor=çözülen test · sarı=program adımı */}
              {(dayLessons.length > 0 || dayTasks.length > 0 || dayTests.length > 0 || dayProgram.length > 0) && (
                <span style={{ display: "flex", gap: 2 }}>
                  {hasApproved && <span style={{ width: 5, height: 5, borderRadius: 99, background: color.mid }} />}
                  {hasPending  && <span style={{ width: 5, height: 5, borderRadius: 99, background: "#EF9F27" }} />}
                  {hasTask     && <span style={{ width: 5, height: 5, borderRadius: 99, background: "#5B8DEF" }} />}
                  {!hasTask && hasDoneTask && <span style={{ width: 5, height: 5, borderRadius: 99, background: "#c7d6f5" }} />}
                  {dayTests.length > 0 && <span style={{ width: 5, height: 5, borderRadius: 99, background: "#9B59B6" }} />}
                  {hasProgram && <span style={{ width: 5, height: 5, borderRadius: 99, background: "#E0A526" }} />}
                  {!hasProgram && programBitti && <span style={{ width: 5, height: 5, borderRadius: 99, background: "#cfe6d6" }} />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Seçili günün dersleri + görevleri */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>
          {new Date(selected).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }).toUpperCase()}
        </div>
        {selectedLessons.length === 0 && selectedTasks.length === 0
          && selectedTests.length === 0 && selectedProgram.length === 0 ? (
          <div style={{ fontSize: 12, color: "#bbb", padding: "8px 0", textAlign: "center" }}>Bu gün kayıt yok</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedLessons.map(l => renderLesson?.(l))}
            {renderTask && selectedTasks.map(t => renderTask(t))}
            {renderTest && selectedTests.map(t => renderTest(t))}
            {renderProgram && selectedProgram.map(o => renderProgram(o))}
          </div>
        )}
      </div>
    </div>
  );
}
