import { useState } from "react";

const COLORS = {
  student: { bg: "#0F6E56", light: "#E1F5EE", mid: "#1D9E75", text: "#085041" },
  teacher: { bg: "#534AB7", light: "#EEEDFE", mid: "#7F77DD", text: "#3C3489" },
  parent:  { bg: "#854F0B", light: "#FAEEDA", mid: "#BA7517", text: "#633806" },
};

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

// ── shared header ─────────────────────────────────────────────────────────────
function TopBar({ role, setRole }) {
  const labels = { student: "Öğrenci", teacher: "Öğretmen", parent: "Veli" };
  const color = COLORS[role];
  return (
    <div style={{
      background: color.bg,
      padding: "0 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 56,
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(255,255,255,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 14, color: "#fff",
        }}>K</div>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 15, letterSpacing: "-0.3px" }}>
          Koçluk Platformu
        </span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {["student", "teacher", "parent"].map(r => (
          <button key={r} onClick={() => setRole(r)} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
            border: "none", cursor: "pointer", transition: "all .15s",
            background: role === r ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.15)",
            color: role === r ? color.bg : "#fff",
          }}>{labels[r]}</button>
        ))}
      </div>
    </div>
  );
}

// ── stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #f0ede8",
      borderRadius: 14,
      padding: "16px 20px",
      flex: 1,
      minWidth: 110,
    }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ pct, color, label, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>{label}</span>
        <span style={{ fontSize: 12, color: "#888" }}>{sub}</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "#f0ede8", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}

// ── task item ──────────────────────────────────────────────────────────────────
function TaskItem({ done, label, sub, color }) {
  const [checked, setChecked] = useState(done);
  return (
    <div onClick={() => setChecked(c => !c)} style={{
      display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0",
      borderBottom: "1px solid #f5f2ee", cursor: "pointer",
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
        border: checked ? "none" : `2px solid ${color}`,
        background: checked ? color : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .15s",
      }}>
        {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: checked ? "#bbb" : "#222",
          textDecoration: checked ? "line-through" : "none", transition: "all .15s" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

// ── alert chip ─────────────────────────────────────────────────────────────────
function AlertChip({ type, text }) {
  const map = {
    warn:    { bg: "#FFF7E6", color: "#854F0B", dot: "#EF9F27" },
    danger:  { bg: "#FFF0F0", color: "#A32D2D", dot: "#E24B4A" },
    success: { bg: "#E8F8F2", color: "#0F6E56", dot: "#1D9E75" },
  };
  const s = map[type] || map.warn;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 99,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: s.dot, flexShrink: 0 }} />
      {text}
    </span>
  );
}

// ── section header ─────────────────────────────────────────────────────────────
function SectionTitle({ title, action, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{title}</h3>
      {action && <button style={{ fontSize: 11, color: color, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>{action}</button>}
    </div>
  );
}

// ── card wrapper ───────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", border: "1px solid #f0ede8", ...style }}>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STUDENT DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function StudentDashboard() {
  const c = COLORS.student;
  const today = new Date().getDay();
  const streak = 7;

  return (
    <div style={{ padding: "20px 16px", maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* welcome hero */}
      <div style={{
        background: c.bg, borderRadius: 18, padding: "22px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Merhaba, Ahmet</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.2 }}>
            Bugün 3 görev<br />seni bekliyor!
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <AlertChip type="success" text={`${streak} günlük seri`} />
            <AlertChip type="success" text="9. sınıf · Sayısal" />
          </div>
        </div>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: "rgba(255,255,255,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30,
        }}>🎯</div>
      </div>

      {/* weekly strip */}
      <Card>
        <SectionTitle title="Bu hafta" color={c.mid} />
        <div style={{ display: "flex", gap: 6 }}>
          {DAYS.map((d, i) => {
            const active = i < today;
            const isToday = i === today - 1;
            return (
              <div key={d} style={{
                flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 10,
                background: isToday ? c.bg : active ? c.light : "#fafaf8",
                border: isToday ? "none" : `1px solid ${active ? c.mid + "44" : "#f0ede8"}`,
              }}>
                <div style={{ fontSize: 10, color: isToday ? "rgba(255,255,255,0.8)" : "#aaa", marginBottom: 4 }}>{d}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? "#fff" : active ? c.text : "#ddd" }}>
                  {active || isToday ? "✓" : "·"}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* stats row */}
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Bu hafta çözülen" value="124" sub="soru" color={c.mid} />
        <StatCard label="Tamamlanan konu" value="8" sub="/ 12 hedef" color={c.mid} />
        <StatCard label="Deneme neti" value="38.5" sub="TYT son deneme" color={c.mid} />
      </div>

      {/* today's tasks */}
      <Card>
        <SectionTitle title="Bugünün görevleri" action="Tümünü gör" color={c.mid} />
        <TaskItem color={c.bg} done={true} label="Türev — video anlatım (14 dk)" sub="Matematik · Konu 7/12" />
        <TaskItem color={c.bg} done={false} label="Türev sorularını çöz (20 soru)" sub="Zorlu seviye · Tahmini 25 dk" />
        <TaskItem color={c.bg} done={false} label="TYT Türkçe mini deneme" sub="15 soru · Zamanlı" />
      </Card>

      {/* konu ilerlemesi */}
      <Card>
        <SectionTitle title="Konu ilerlemesi" color={c.mid} />
        <ProgressBar pct={72} color={c.bg} label="Türev" sub="72%" />
        <ProgressBar pct={45} color={c.mid} label="İntegral" sub="45%" />
        <ProgressBar pct={88} color={c.light.replace("#E1F5EE","#0F6E56")} label="Limit" sub="88% ✓" />
        <ProgressBar pct={20} color="#ccc" label="Diziler ve Seriler" sub="20%" />
      </Card>

      {/* koç mesajı */}
      <Card style={{ borderLeft: `4px solid ${c.bg}`, borderRadius: "0 16px 16px 0" }}>
        <div style={{ fontSize: 11, color: c.text, fontWeight: 600, marginBottom: 6 }}>Koç Selim'den not</div>
        <div style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>
          Türev bölümünde harika ilerleme! İntegrale geçmeden önce türev sorularını bugün 20 tane çözürsen önümüzdeki haftaki deneme çok daha iyi gidecek.
        </div>
        <div style={{ fontSize: 11, color: "#bbb", marginTop: 8 }}>Bugün, 09:42</div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TEACHER DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function TeacherDashboard() {
  const c = COLORS.teacher;
  const students = [
    { name: "Ahmet Y.", progress: 72, alert: null,    net: 38.5, active: true },
    { name: "Fatma K.", progress: 45, alert: "warn",  net: 28.2, active: true },
    { name: "Ali R.",   progress: 20, alert: "danger", net: 18.0, active: false },
    { name: "Zeynep S.", progress: 88, alert: null,   net: 52.1, active: true },
    { name: "Mehmet D.", progress: 55, alert: "warn", net: 31.4, active: true },
  ];

  return (
    <div style={{ padding: "20px 16px", maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

      <div style={{ background: c.bg, borderRadius: 18, padding: "22px 24px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Merhaba, Selim Hoca</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.2 }}>
          9-A Matematik<br />5 öğrenci aktif bugün
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <AlertChip type="danger" text="2 acil uyarı" />
          <AlertChip type="warn" text="3 veli mesajı" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Sınıf ortalaması" value="33.6" sub="net / TYT" color={c.mid} />
        <StatCard label="Bu hafta aktif" value="5/6" sub="öğrenci" color={c.mid} />
        <StatCard label="Bekleyen ödev" value="2" sub="kontrol et" color={c.mid} />
      </div>

      <Card>
        <SectionTitle title="Öğrenci durumu" action="Tümünü gör" color={c.mid} />
        {students.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 0", borderBottom: i < students.length - 1 ? "1px solid #f5f2ee" : "none",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: s.active ? c.light : "#f5f2ee",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: s.active ? c.text : "#bbb",
            }}>{s.name.split(" ")[0][0]}{s.name.split(" ")[1][0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{s.name}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {s.alert && <AlertChip type={s.alert} text={s.alert === "danger" ? "Müdahale gerek" : "Dikkat"} />}
                  <span style={{ fontSize: 11, color: "#888" }}>{s.net} net</span>
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: "#f0ede8", overflow: "hidden" }}>
                <div style={{
                  width: `${s.progress}%`, height: "100%", borderRadius: 99,
                  background: s.alert === "danger" ? "#E24B4A" : s.alert === "warn" ? "#EF9F27" : c.mid,
                }} />
              </div>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <SectionTitle title="Ders planı — bu hafta" color={c.mid} />
        {[
          { day: "Pazartesi", topic: "Türev — Limit tanımı", status: "done" },
          { day: "Salı",      topic: "Türev — Toplam & çarpım kuralı", status: "done" },
          { day: "Çarşamba",  topic: "Türev uygulamaları", status: "today" },
          { day: "Perşembe",  topic: "Türev — Grafik yorumlama", status: "upcoming" },
          { day: "Cuma",      topic: "Mini deneme + sınıf değerlendirmesi", status: "upcoming" },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, alignItems: "center",
            padding: "9px 0", borderBottom: i < 4 ? "1px solid #f5f2ee" : "none",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: 99, flexShrink: 0,
              background: item.status === "done" ? c.mid : item.status === "today" ? c.bg : "#ddd",
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 1 }}>{item.day}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: item.status === "upcoming" ? "#bbb" : "#222" }}>{item.topic}</div>
            </div>
            {item.status === "today" && (
              <span style={{ fontSize: 11, background: c.light, color: c.text, padding: "3px 10px", borderRadius: 99, fontWeight: 600 }}>Bugün</span>
            )}
          </div>
        ))}
      </Card>

      <Card>
        <SectionTitle title="Hızlı aksiyonlar" color={c.mid} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { icon: "📋", label: "Ödev ata", sub: "Sınıfa veya kişiye" },
            { icon: "📊", label: "Deneme oluştur", sub: "Soru bankasından" },
            { icon: "💬", label: "Veli mesajı", sub: "3 okunmamış" },
            { icon: "📈", label: "Rapor gönder", sub: "Haftalık özet" },
          ].map((a, i) => (
            <div key={i} style={{
              background: "#fafaf8", borderRadius: 12, padding: "12px 14px",
              border: "1px solid #f0ede8", cursor: "pointer", transition: "background .12s",
              display: "flex", gap: 10, alignItems: "center",
            }}>
              <span style={{ fontSize: 20 }}>{a.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{a.label}</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PARENT DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function ParentDashboard() {
  const c = COLORS.parent;

  return (
    <div style={{ padding: "20px 16px", maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

      <div style={{ background: c.bg, borderRadius: 18, padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Merhaba, Ayşe Hanım</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.2 }}>
            Ahmet bu hafta<br />çok iyi çalıştı!
          </div>
          <AlertChip type="success" text="Hedefin %78'inde" />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>LGS'ye kalan</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", lineHeight: 1 }}>142</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>gün</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Aktif gün" value="5" sub="bu hafta" color={c.mid} />
        <StatCard label="Çözülen soru" value="124" sub="bu hafta" color={c.mid} />
        <StatCard label="Tamamlanan konu" value="8" sub="/ 12 hedef" color={c.mid} />
      </div>

      <Card>
        <SectionTitle title="Koç notu" color={c.mid} />
        <div style={{
          background: c.light, borderRadius: 12, padding: "14px 16px",
          borderLeft: `4px solid ${c.bg}`, borderRadius: "0 12px 12px 0",
        }}>
          <div style={{ fontSize: 12, color: c.text, fontWeight: 600, marginBottom: 6 }}>Selim Hoca · Bugün 09:42</div>
          <div style={{ fontSize: 13, color: "#444", lineHeight: 1.65 }}>
            Ahmet bu hafta matematik çalışmalarında ciddi ilerleme gösterdi. Türev konusunu %72 tamamladı. İntegral konusunda biraz daha desteğe ihtiyaç var. Salı günkü görüşmemizde bunu konuşabiliriz.
          </div>
        </div>
        <button style={{
          marginTop: 12, padding: "9px 0", width: "100%", borderRadius: 10,
          border: `1px solid ${c.mid}`, background: "transparent", color: c.bg,
          fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Selim Hoca'ya mesaj gönder</button>
      </Card>

      <Card>
        <SectionTitle title="Bu haftanın çalışma düzeni" color={c.mid} />
        {DAYS.map((d, i) => {
          const mins = [0, 45, 60, 35, 70, 20, 0][i];
          const pct = Math.round((mins / 90) * 100);
          return (
            <div key={d} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 28, fontSize: 12, color: "#888", textAlign: "right", flexShrink: 0 }}>{d}</div>
              <div style={{ flex: 1, height: 8, borderRadius: 99, background: "#f0ede8", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: mins >= 60 ? c.mid : mins > 0 ? c.light.replace("#FAEEDA","#EF9F27") : "#f0ede8" }} />
              </div>
              <div style={{ width: 36, fontSize: 11, color: "#aaa", textAlign: "right", flexShrink: 0 }}>
                {mins > 0 ? `${mins}dk` : "—"}
              </div>
            </div>
          );
        })}
      </Card>

      <Card>
        <SectionTitle title="Yaklaşan sınavlar" color={c.mid} />
        {[
          { name: "Matematik Denemesi", date: "22 Mayıs, Salı", days: 3, type: "Okulda" },
          { name: "TYT Genel Denemesi", date: "1 Haziran, Pazar", days: 13, type: "Platformda" },
          { name: "Fizik Yazılısı", date: "5 Haziran, Perşembe", days: 17, type: "Okulda" },
        ].map((s, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0", borderBottom: i < 2 ? "1px solid #f5f2ee" : "none",
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{s.name}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{s.date} · {s.type}</div>
            </div>
            <div style={{
              background: s.days <= 7 ? "#FFF0F0" : c.light,
              color: s.days <= 7 ? "#A32D2D" : c.text,
              fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 99,
            }}>{s.days} gün</div>
          </div>
        ))}
      </Card>

      <Card>
        <SectionTitle title="Veli onay bekleyenler" color={c.mid} />
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 0", borderBottom: "1px solid #f5f2ee",
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Dönemlik hedef güncelleme</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>Ahmet'in hedef neti 42'ye yükseltildi</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: c.bg, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Onayla</button>
            <button style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #e0ddd8", background: "transparent", color: "#888", fontSize: 12, cursor: "pointer" }}>İncele</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [role, setRole] = useState("student");

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f7f4ef",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <TopBar role={role} setRole={setRole} />
      {role === "student"  && <StudentDashboard />}
      {role === "teacher"  && <TeacherDashboard />}
      {role === "parent"   && <ParentDashboard />}
    </div>
  );
}
