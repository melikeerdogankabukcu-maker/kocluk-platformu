import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { useStudyPrograms, icerikSatirSayisi, icerikHaftaSatirlari } from "../hooks/useStudyPrograms";
import { useGruplar } from "../hooks/useGruplar";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Öğretmenin öğrencilere hazır çalışma programı atadığı ekran.
// toplam_satir ve hafta_satirlari atama anında yazılır; rozet ölçütleri
// (hafta/program tamamlama) veritabanı tarafında bunlara bakarak hesaplanır.
export default function ProgramAtama({ userId, students, color: c }) {
  const { programlar } = useStudyPrograms();
  const { gruplar } = useGruplar(userId);
  const [acik, setAcik]       = useState(false);
  const [atamalar, setAtamalar] = useState([]);
  const [etkin, setEtkin]     = useState(true);
  const [islemde, setIslemde] = useState(false);
  const [form, setForm] = useState({
    student_id: "", program_id: "",
    baslangic: new Date().toISOString().split("T")[0],
  });

  const yukle = useCallback(async () => {
    const ids = students.map(s => s.id);
    if (ids.length === 0) { setAtamalar([]); return; }
    const { data, error } = await supabase
      .from("program_atamalari").select("*")
      .in("student_id", ids).eq("aktif", true);
    if (error) { setEtkin(false); return; }
    setAtamalar(data ?? []);
  }, [students]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!etkin) return null;

  // Seçili hedefin öğrenci id'leri — tek öğrenci ya da bir grubun tamamı
  const hedefOgrenciler = () => {
    if (form.student_id.startsWith("grup:")) {
      const g = gruplar.find(x => x.id === form.student_id.slice(5));
      return g ? g.uyeler : [];
    }
    return form.student_id ? [form.student_id] : [];
  };

  const ata = async () => {
    const hedefler = hedefOgrenciler();
    if (hedefler.length === 0 || !form.program_id) return;
    const p = programlar.find(x => x.kod === form.program_id);
    if (!p?.icerik?.weeks?.length) { alert("Seçilen programda hafta yok."); return; }
    setIslemde(true);

    // Hedeflerin önceki aktif programlarını pasife al
    await supabase.from("program_atamalari")
      .update({ aktif: false }).in("student_id", hedefler).eq("aktif", true);

    // İçeriğin KOPYASI atamayla saklanır: program sonradan düzenlense bile
    // öğrencinin planı ve işaretlediği adımlar kaymaz.
    const ortak = {
      teacher_id: userId,
      program_id: p.kod,
      program_adi: p.title,
      program_icerik: p.icerik,
      baslangic:  form.baslangic,
      toplam_satir: icerikSatirSayisi(p.icerik),
      hafta_satirlari: icerikHaftaSatirlari(p.icerik),
      tamamlananlar: [],
    };
    const { error } = await supabase.from("program_atamalari")
      .insert(hedefler.map(sid => ({ ...ortak, student_id: sid })));
    setIslemde(false);
    if (error) { alert("Program atanamadı: " + error.message); return; }
    setForm(f => ({ ...f, student_id: "" }));
    yukle();
  };

  const kaldir = async (atama, ad) => {
    if (!window.confirm(`${ad} için program kaldırılsın mı?\n\nİlerleme kaydı korunur, program pasife alınır.`)) return;
    setIslemde(true);
    await supabase.from("program_atamalari").update({ aktif: false }).eq("id", atama.id);
    setIslemde(false);
    yukle();
  };

  const inputStyle = {
    padding: "8px 11px", borderRadius: 9, border: "1.5px solid #f0ede8",
    fontSize: 12.5, boxSizing: "border-box",
  };
  const adBul = (id) => students.find(s => s.id === id)?.full_name ?? "—";

  return (
    <Card id="bolum-program">
      <SectionTitle title={`Çalışma Programları${atamalar.length ? ` (${atamalar.length})` : ""}`} color={c.mid} />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>+ Çalışma programı ata</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Mevcut atamalar */}
          {atamalar.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {atamalar.map(a => {
                const p = programlar.find(x => x.kod === a.program_id);
                const yapilan = (a.tamamlananlar ?? []).length;
                const oran = a.toplam_satir ? Math.round((yapilan / a.toplam_satir) * 100) : 0;
                return (
                  <div key={a.id} style={{ padding: "8px 10px", borderRadius: 9, background: "#fafaf8" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#333" }}>{adBul(a.student_id)}</div>
                        <div style={{ fontSize: 10.5, color: "#999", marginTop: 1 }}>
                          {a.program_adi ?? p?.title ?? a.program_id} · başlangıç{" "}
                          {new Date(a.baslangic).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>%{oran}</span>
                        <button onClick={() => kaldir(a, adBul(a.student_id))} disabled={islemde} style={{
                          fontSize: 10.5, padding: "3px 9px", borderRadius: 99, border: "none",
                          background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600,
                        }}>Kaldır</button>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: "#f0ede8", overflow: "hidden", marginTop: 6 }}>
                      <div style={{ width: `${oran}%`, height: "100%", background: c.mid }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Yeni atama */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: atamalar.length ? 4 : 0 }}>
            <select value={form.student_id}
              onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
              style={{ ...inputStyle, color: form.student_id ? "#222" : "#aaa" }}>
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

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {programlar.map(p => {
                const secili = form.program_id === p.kod;
                return (
                  <div key={p.kod} onClick={() => setForm(f => ({ ...f, program_id: p.kod }))} style={{
                    padding: "9px 11px", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${secili ? c.bg : "#f0ede8"}`,
                    background: secili ? c.light : "#fff",
                  }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#222" }}>
                      {p.title} <span style={{ fontWeight: 500, color: "#888", fontSize: 11 }}>· {p.subtitle}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "#888", marginTop: 3, lineHeight: 1.45 }}>
                      {p.description}
                    </div>
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 3 }}>
                      {(p.icerik?.weeks ?? []).length} hafta · {icerikSatirSayisi(p.icerik)} çalışma adımı
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>Başlangıç tarihi</div>
              <input type="date" value={form.baslangic}
                onChange={e => setForm(f => ({ ...f, baslangic: e.target.value }))}
                style={{ ...inputStyle, width: "100%" }} />
            </div>

            <button onClick={ata} disabled={islemde || !form.student_id || !form.program_id} style={{
              padding: "10px 0", borderRadius: 10, border: "none",
              background: (form.student_id && form.program_id) ? c.bg : "#ddd", color: "#fff",
              fontSize: 12.5, fontWeight: 700,
              cursor: (form.student_id && form.program_id) ? "pointer" : "not-allowed",
            }}>{islemde ? "Atanıyor..." : "Programı Ata"}</button>

            <div style={{ fontSize: 10.5, color: "#aaa", lineHeight: 1.5 }}>
              Öğrencinin önceki aktif programı varsa pasife alınır. Haftalar aralıklı hedef
              olarak işler; hafta tamamlandığında öğrenci rozet kazanır.
            </div>
          </div>

          <button onClick={() => setAcik(false)} style={{
            padding: "9px 0", borderRadius: 10, border: "1.5px solid #f0ede8",
            background: "#fff", color: "#888", fontSize: 12.5, cursor: "pointer",
          }}>Kapat</button>
        </div>
      )}
    </Card>
  );
}
