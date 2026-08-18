import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { useTopics } from "../lib/TopicsContext";
import { useStudyPrograms, icerikSatirSayisi, icerikHaftaSatirlari } from "../hooks/useStudyPrograms";
import { useGruplar } from "../hooks/useGruplar";
import { programGorevSatirlari } from "../lib/studyPrograms";
import { calistir } from "../lib/db";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import Modal from "./Modal";

const GUNLER = ["PAZARTESİ", "SALI", "ÇARŞAMBA", "PERŞEMBE", "CUMA", "CUMARTESİ", "PAZAR"];
const ONCELIKLER = [
  { e: "🔴", ad: "Kritik" }, { e: "🟠", ad: "Önemli" },
  { e: "🟡", ad: "Orta" },   { e: "⚪", ad: "Destek" },
];
// baslik: gorevin metni. Program goreve donusturuldugunde tasks.title bu
// olur. Bos birakilirsa konuya, o da bossa derse dusulur. Gorev Ata
// formundaki "Gorev basligi" alaninin karsiligi.
const BOS_SATIR = { ders: "", konu: "", baslik: "", sure: "", oncelik: "🟠", aciklama: "" };

const bosHafta = (no) => ({
  week: no, title: "",
  days: GUNLER.map(g => ({ gun: g, dersler: [] })),
});

// Öğretmenin kendi haftalık çalışma / tekrar programlarını yazdığı düzenleyici.
// Program kütüphanesi (study_programs) ile atanmış program ayrıdır: burada
// yapılan değişiklik, daha önce atanmış öğrencilerin planını ETKİLEMEZ
// (atama anında içeriğin kopyası alınır).
export default function ProgramDuzenleyici({ userId, students = [], color: c }) {
  const { programlar, dbden, yukle } = useStudyPrograms();
  const { examSubjectsOf, topicsOf } = useTopics();

  const [acik, setAcik]         = useState(false);
  const [duzenlenen, setDuz]    = useState(null);   // { id?, kod, title, ..., icerik }
  const [acikHafta, setHafta]   = useState(null);
  const [acikGun, setGun]       = useState(null);   // "hafta-gunIndex"
  const [kaydediliyor, setKay]  = useState(false);
  const [examType, setExamType] = useState("TYT");  // konu seçici için

  // Ders/konu seçimi görev atama formuyla aynı: müfredattan açılır liste,
  // yanında "Diğer (elle yaz)" kaçışı. Kaçış şart — programlarda ders
  // olmayan satırlar var (🔁 TEKİ, 📝 DENEME, 😴 DİNLENME) ve mevcut
  // kayıtlardaki ders adları büyük harfli (FİZİK), müfredattaki Fizik ile
  // birebir eşleşmiyor. Eşleşmeyen değer otomatik olarak elle-yazma
  // kipinde açılır, böylece hiçbir mevcut satır bozulmaz.
  const [elleDers, setElleDers] = useState(new Set());
  const satirAnahtari = (hno, gi, si) => `${hno}-${gi}-${si}`;
  const mufredattaVar = (ders) => !!ders && examSubjectsOf(examType).includes(ders);
  const elleKipte = (hno, gi, si, ders) =>
    elleDers.has(satirAnahtari(hno, gi, si)) || (!!ders && !mufredattaVar(ders));

  const inputStyle = {
    padding: "7px 10px", borderRadius: 8, border: "1.5px solid #f0ede8",
    fontSize: 12, boxSizing: "border-box", width: "100%",
  };

  // --- Atama: her programın kendi satırında, oka basınca açılır ---
  const { gruplar } = useGruplar(userId);
  const [atamalar, setAtamalar]       = useState([]);
  const [atamaAcik, setAtamaAcik]     = useState(null);   // açık olan programın kodu
  const [atamaIslemde, setAtamaIslemde] = useState(false);
  const [atamaForm, setAtamaForm] = useState({
    student_id: "", baslangic: new Date().toISOString().split("T")[0],
  });

  const atamalariYukle = useCallback(async () => {
    const ids = students.map(s => s.id);
    if (ids.length === 0) { setAtamalar([]); return; }
    const { veri } = await calistir(
      supabase.from("program_atamalari").select("*").in("student_id", ids).eq("aktif", true),
      "Program atamalari", { sessiz: true }
    );
    setAtamalar(veri ?? []);
  }, [students]);

  useEffect(() => { atamalariYukle(); }, [atamalariYukle]);

  const ogrenciAdi = (id) => students.find(s => s.id === id)?.full_name ?? "—";

  const hedefOgrenciler = () => {
    if (atamaForm.student_id.startsWith("grup:")) {
      const g = gruplar.find(x => x.id === atamaForm.student_id.slice(5));
      return g ? g.uyeler : [];
    }
    return atamaForm.student_id ? [atamaForm.student_id] : [];
  };

  const ata = async (p) => {
    const hedefler = hedefOgrenciler();
    if (hedefler.length === 0) return;
    if (!p?.icerik?.weeks?.length) { alert("Seçilen programda hafta yok."); return; }
    setAtamaIslemde(true);

    // Öğretmenin kendi yazdığı program (hazir = false) doğrudan GÖREVE dönüşür;
    // gömülü hazır programlar program kartı olarak atanır. Ayrıntılı gerekçe
    // programGorevSatirlari'nın başında.
    if (p.hazir === false) {
      const satirlar = hedefler.flatMap(sid =>
        programGorevSatirlari(p.icerik, {
          teacherId: userId, studentId: sid, baslangic: atamaForm.baslangic,
          programAdi: p.title,
        })
      );
      if (satirlar.length === 0) {
        setAtamaIslemde(false);
        alert("Bu programda göreve çevrilebilecek satır yok.");
        return;
      }
      const { hata } = await calistir(
        supabase.from("tasks").insert(satirlar), "Programi goreve cevirme"
      );
      setAtamaIslemde(false);
      if (hata) return;
      setAtamaForm(f => ({ ...f, student_id: "" }));
      alert(`${satirlar.length} görev oluşturuldu.`);
      return;
    }

    const ortak = {
      teacher_id: userId,
      program_id: p.kod,
      program_adi: p.title,
      program_icerik: p.icerik,
      baslangic: atamaForm.baslangic,
      toplam_satir: icerikSatirSayisi(p.icerik),
      hafta_satirlari: icerikHaftaSatirlari(p.icerik),
      tamamlananlar: [],
    };
    const { hata } = await calistir(
      supabase.from("program_atamalari").insert(hedefler.map(sid => ({ ...ortak, student_id: sid }))),
      "Program atama"
    );
    setAtamaIslemde(false);
    if (hata) return;
    setAtamaForm(f => ({ ...f, student_id: "" }));
    atamalariYukle();
  };

  const atamaKaldir = async (a) => {
    if (!window.confirm(`${ogrenciAdi(a.student_id)} için program kaldırılsın mı?

İlerleme kaydı korunur, program pasife alınır.`)) return;
    setAtamaIslemde(true);
    const { hata } = await calistir(
      supabase.from("program_atamalari").update({ aktif: false }).eq("id", a.id),
      "Program kaldirma"
    );
    setAtamaIslemde(false);
    if (hata) return;
    atamalariYukle();
  };

  const yeniProgram = () => {
    setDuz({
      kod: `program_${Date.now().toString(36)}`,
      title: "", subtitle: "", description: "",
      icerik: { weeks: [bosHafta(1)] },
      hazir: false,
    });
    setHafta(1); setGun(null);
  };

  const kopyala = (p) => {
    setDuz({
      kod: `${p.kod}_kopya_${Date.now().toString(36)}`,
      title: `${p.title} (kopya)`, subtitle: p.subtitle, description: p.description,
      icerik: JSON.parse(JSON.stringify(p.icerik ?? { weeks: [] })),
      hazir: false,
    });
    setHafta(1); setGun(null);
  };

  // --- İçerik güncelleme yardımcıları (hep yeni nesne üretir) ---
  const icerikGuncelle = (fn) =>
    setDuz(d => {
      const kopya = JSON.parse(JSON.stringify(d.icerik));
      fn(kopya);
      return { ...d, icerik: kopya };
    });

  const haftaEkle    = () => icerikGuncelle(i => i.weeks.push(bosHafta(i.weeks.length + 1)));
  const haftaSil     = (no) => icerikGuncelle(i => {
    i.weeks = i.weeks.filter(w => w.week !== no).map((w, idx) => ({ ...w, week: idx + 1 }));
  });
  const haftaBaslik  = (no, v) => icerikGuncelle(i => {
    const w = i.weeks.find(x => x.week === no); if (w) w.title = v;
  });
  const satirEkle    = (hno, gi) => icerikGuncelle(i => {
    i.weeks.find(w => w.week === hno)?.days[gi].dersler.push({ ...BOS_SATIR });
  });
  const satirSil     = (hno, gi, si) => icerikGuncelle(i => {
    i.weeks.find(w => w.week === hno)?.days[gi].dersler.splice(si, 1);
  });
  const satirGuncelle = (hno, gi, si, alan, v) => icerikGuncelle(i => {
    const d = i.weeks.find(w => w.week === hno)?.days[gi].dersler[si]; if (d) d[alan] = v;
  });

  // Konu seçilince başlığı öner; öğretmen elle yazdıysa dokunma.
  // Görev Ata formundaki davranışın aynısı.
  const konuSec = (hno, gi, si, konu) => icerikGuncelle(i => {
    const d = i.weeks.find(w => w.week === hno)?.days[gi].dersler[si];
    if (!d) return;
    if (!d.baslik || d.baslik === d.konu) d.baslik = konu;
    d.konu = konu;
  });

  const kaydet = async () => {
    if (!duzenlenen?.title?.trim()) { alert("Program adı gerekli"); return; }
    if (!dbden) { alert("Program kütüphanesi tablosu yok — study_programs_migration.sql çalıştırılmalı."); return; }
    setKay(true);
    const govde = {
      kod: duzenlenen.kod,
      title: duzenlenen.title.trim(),
      subtitle: duzenlenen.subtitle?.trim() || null,
      description: duzenlenen.description?.trim() || null,
      icerik: duzenlenen.icerik,
      created_by: userId,
    };
    const { error } = duzenlenen.id
      ? await supabase.from("study_programs").update(govde).eq("id", duzenlenen.id)
      : await supabase.from("study_programs").insert(govde);
    setKay(false);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setDuz(null);
    yukle();
  };

  const sil = async (p) => {
    if (p.hazir) { alert("Hazır programlar silinemez. Kopyalayıp düzenleyebilirsiniz."); return; }
    if (!window.confirm(`"${p.title}" silinsin mi?\n\nAtanmış öğrencilerin planı etkilenmez (kopyayla çalışır).`)) return;
    const { error } = await supabase.from("study_programs").delete().eq("id", p.id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    yukle();
  };

  return (
    <Card id="bolum-program-kutuphane">
      <SectionTitle title={`Program Kütüphanesi (${programlar.length})`} color={c.mid} />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Programları yönet / yeni program yaz</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!dbden && (
            <div style={{
              fontSize: 11.5, color: "#854F0B", background: "#FFF7E6",
              padding: "9px 12px", borderRadius: 8, lineHeight: 1.5,
            }}>
              Program kütüphanesi henüz veritabanına aktarılmamış — şu an koddaki hazır
              programlar gösteriliyor. Yeni program yazabilmek için
              <b> study_programs_migration.sql</b> çalıştırılmalı.
            </div>
          )}

          {/* Program listesi */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {programlar.map(p => (
              <div key={p.kod} style={{ padding: "9px 11px", borderRadius: 9, background: "#fafaf8" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#222" }}>
                      {p.title}
                      {p.hazir && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#666", background: "#eee",
                          padding: "1px 6px", borderRadius: 99, marginLeft: 6 }}>hazır</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#999", marginTop: 2 }}>
                      {p.subtitle} · {(p.icerik?.weeks ?? []).length} hafta · {icerikSatirSayisi(p.icerik)} adım
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => kopyala(p)} title="Kopyala" style={{
                      fontSize: 10.5, padding: "3px 9px", borderRadius: 99,
                      border: "1px solid #f0ede8", background: "#fff", color: "#888", cursor: "pointer",
                    }}>Kopyala</button>
                    {!p.hazir && dbden && (
                      <>
                        <button onClick={() => { setDuz({ ...p }); setHafta(1); setGun(null); }} style={{
                          fontSize: 10.5, padding: "3px 9px", borderRadius: 99, border: "none",
                          background: c.light, color: c.text, cursor: "pointer", fontWeight: 600,
                        }}>Düzenle</button>
                        <button onClick={() => sil(p)} style={{
                          fontSize: 10.5, padding: "3px 9px", borderRadius: 99, border: "none",
                          background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600,
                        }}>Sil</button>
                      </>
                    )}
                    {/* Atama paneli — öğrenci ve tarih seçimi bu okun altında */}
                    <button onClick={() => setAtamaAcik(atamaAcik === p.kod ? null : p.kod)}
                      title="Öğrenciye ata" style={{
                        fontSize: 11, padding: "3px 8px", borderRadius: 99, border: "none",
                        background: atamaAcik === p.kod ? c.bg : c.light,
                        color: atamaAcik === p.kod ? "#fff" : c.text,
                        cursor: "pointer", fontWeight: 700,
                      }}>{atamaAcik === p.kod ? "▾" : "▸"}</button>
                  </div>
                </div>

                {atamaAcik === p.kod && (
                  <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid #f0ede8",
                    display: "flex", flexDirection: "column", gap: 7 }}>

                    {/* Bu programın mevcut atamaları */}
                    {(() => {
                      const bunun = atamalar.filter(a => a.program_id === p.kod);
                      if (bunun.length === 0) return null;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#aaa" }}>ATANDIĞI ÖĞRENCİLER</div>
                          {bunun.map(a => {
                            const yapilan = (a.tamamlananlar ?? []).length;
                            const oran = a.toplam_satir ? Math.round((yapilan / a.toplam_satir) * 100) : 0;
                            return (
                              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11 }}>
                                <span style={{ flex: 1, minWidth: 0, color: "#444" }}>
                                  {ogrenciAdi(a.student_id)}
                                  <span style={{ color: "#aaa" }}>
                                    {" · "}{new Date(a.baslangic).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                                  </span>
                                </span>
                                <span style={{ color: c.text, fontWeight: 700, flexShrink: 0 }}>%{oran}</span>
                                <button onClick={() => atamaKaldir(a)} disabled={atamaIslemde} title="Kaldır" style={{
                                  background: "none", border: "none", padding: "0 2px",
                                  color: "#C98A8A", fontSize: 12, cursor: "pointer", flexShrink: 0,
                                }}>✕</button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    <select value={atamaForm.student_id}
                      onChange={e => setAtamaForm(f => ({ ...f, student_id: e.target.value }))}
                      style={{ ...inputStyle, color: atamaForm.student_id ? "#222" : "#aaa" }}>
                      <option value="">Öğrenci veya grup seç...</option>
                      {gruplar.filter(g => g.uyeler.length > 0).length > 0 && (
                        <optgroup label="Gruplar (toplu atama)">
                          {gruplar.filter(g => g.uyeler.length > 0).map(g => (
                            <option key={g.id} value={`grup:${g.id}`}>{g.ad} ({g.uyeler.length} öğrenci)</option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Öğrenciler">
                        {students.map(st => <option key={st.id} value={st.id}>{st.full_name}</option>)}
                      </optgroup>
                    </select>

                    <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "#999", marginBottom: 3 }}>Başlangıç tarihi</div>
                        <input type="date" value={atamaForm.baslangic}
                          onChange={e => setAtamaForm(f => ({ ...f, baslangic: e.target.value }))}
                          style={inputStyle} />
                      </div>
                      <button onClick={() => ata(p)} disabled={atamaIslemde || !atamaForm.student_id} style={{
                        padding: "8px 16px", borderRadius: 9, border: "none", flexShrink: 0,
                        background: atamaForm.student_id ? c.bg : "#ddd", color: "#fff",
                        fontSize: 12, fontWeight: 700,
                        cursor: atamaForm.student_id ? "pointer" : "not-allowed",
                      }}>{atamaIslemde ? "..." : "Ata"}</button>
                    </div>

                    <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.5 }}>
                      {p.hazir === false
                        ? "Bu program göreve dönüşür: her adım için öğrencide ayrı görev açılır."
                        : "Haftalar aralıklı hedef olarak işler; hafta tamamlandığında öğrenci rozet kazanır."}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {dbden && (
            <button onClick={yeniProgram} style={{
              padding: "10px 0", borderRadius: 10, border: `1.5px dashed ${c.mid}`,
              background: "transparent", color: c.mid, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            }}>+ Yeni program yaz</button>
          )}

          <div style={{ fontSize: 10.5, color: "#aaa", lineHeight: 1.5 }}>
            Programı düzenlemek, daha önce atanmış öğrencilerin planını değiştirmez —
            atama anında içeriğin kopyası alınır.
          </div>

          <button onClick={() => setAcik(false)} style={{
            padding: "9px 0", borderRadius: 10, border: "1.5px solid #f0ede8",
            background: "#fff", color: "#888", fontSize: 12.5, cursor: "pointer",
          }}>Kapat</button>
        </div>
      )}

      {/* --- Düzenleyici --- */}
      {duzenlenen && (
        <Modal title={duzenlenen.id ? "Programı Düzenle" : "Yeni Program"}
          onClose={() => setDuz(null)} maxWidth={660}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="Program adı (ör. 🎯 Matematik Sprint)" value={duzenlenen.title}
              onChange={e => setDuz(d => ({ ...d, title: e.target.value }))} style={inputStyle} />
            <input placeholder="Alt başlık (ör. 6 Haftalık Tekrar Programı)" value={duzenlenen.subtitle ?? ""}
              onChange={e => setDuz(d => ({ ...d, subtitle: e.target.value }))} style={inputStyle} />
            <textarea placeholder="Açıklama — kimin için, neye odaklanıyor" value={duzenlenen.description ?? ""}
              onChange={e => setDuz(d => ({ ...d, description: e.target.value }))}
              rows={2} style={{ ...inputStyle, resize: "vertical" }} />

            {/* Konu seçici için sınav türü */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10.5, color: "#888", fontWeight: 600 }}>Konu listesi:</span>
              {["TYT", "AYT"].map(t => (
                <button key={t} onClick={() => setExamType(t)} style={{
                  padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: `1.5px solid ${examType === t ? c.bg : "#f0ede8"}`,
                  background: examType === t ? c.bg : "#fff",
                  color: examType === t ? "#fff" : "#888",
                }}>{t}</button>
              ))}
            </div>

            {/* Haftalar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {duzenlenen.icerik.weeks.map(w => {
                const acikMi = acikHafta === w.week;
                const adim = (w.days ?? []).reduce((s, g) => s + g.dersler.length, 0);
                return (
                  <div key={w.week} style={{ border: "1px solid #f0ede8", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: acikMi ? c.light : "#fafaf8" }}>
                      <span onClick={() => { setHafta(acikMi ? null : w.week); setGun(null); }}
                        style={{ fontSize: 10, color: c.mid, fontWeight: 700, cursor: "pointer" }}>
                        {acikMi ? "▾" : "▸"}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#333", flexShrink: 0 }}>{w.week}. hafta</span>
                      <input placeholder="Hafta başlığı (ör. FİZİK TEMELİ)" value={w.title}
                        onChange={e => haftaBaslik(w.week, e.target.value)}
                        style={{ ...inputStyle, flex: 1, padding: "5px 8px", background: "#fff" }} />
                      <span style={{ fontSize: 10, color: "#aaa", flexShrink: 0 }}>{adim} adım</span>
                      <button onClick={() => haftaSil(w.week)} title="Haftayı sil" style={{
                        fontSize: 11, padding: "3px 8px", borderRadius: 99, border: "none",
                        background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", flexShrink: 0,
                      }}>✕</button>
                    </div>

                    {acikMi && (
                      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                        {w.days.map((g, gi) => {
                          const gunAnahtar = `${w.week}-${gi}`;
                          const gunAcik = acikGun === gunAnahtar;
                          return (
                            <div key={gi} style={{ border: "1px solid #f5f2ee", borderRadius: 8 }}>
                              <div onClick={() => setGun(gunAcik ? null : gunAnahtar)} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "6px 9px", cursor: "pointer",
                                background: g.dersler.length ? "#fff" : "#fcfcfb",
                              }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: g.dersler.length ? "#444" : "#bbb" }}>
                                  {gunAcik ? "▾" : "▸"} {g.gun}
                                </span>
                                <span style={{ fontSize: 10, color: "#aaa" }}>
                                  {g.dersler.length ? `${g.dersler.length} adım` : "boş"}
                                </span>
                              </div>

                              {gunAcik && (
                                <div style={{ padding: "0 9px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                                  {g.dersler.map((d, si) => (
                                    <div key={si} style={{ padding: 7, borderRadius: 7, background: "#fafaf8", display: "flex", flexDirection: "column", gap: 5 }}>
                                      <div style={{ display: "flex", gap: 5 }}>
                                        {/* Ders — görev atama formundaki seçicinin aynısı */}
                                        <select
                                          value={elleKipte(w.week, gi, si, d.ders) ? "__diger" : d.ders}
                                          onChange={e => {
                                            const v = e.target.value;
                                            const ah = satirAnahtari(w.week, gi, si);
                                            if (v === "__diger") {
                                              setElleDers(s => new Set(s).add(ah));
                                              satirGuncelle(w.week, gi, si, "ders", "");
                                            } else {
                                              setElleDers(s => { const y = new Set(s); y.delete(ah); return y; });
                                              satirGuncelle(w.week, gi, si, "ders", v);
                                              satirGuncelle(w.week, gi, si, "konu", "");
                                            }
                                          }}
                                          style={{ ...inputStyle, flex: 1, background: "#fff", color: d.ders ? "#222" : "#aaa" }}>
                                          <option value="">Ders seç...</option>
                                          {examSubjectsOf(examType).map(x => <option key={x} value={x}>{x}</option>)}
                                          <option value="__diger">Diğer (elle yaz)</option>
                                        </select>
                                        <input placeholder="Süre" value={d.sure}
                                          onChange={e => satirGuncelle(w.week, gi, si, "sure", e.target.value)}
                                          style={{ ...inputStyle, width: 70, background: "#fff" }} />
                                        <button onClick={() => { setElleDers(new Set()); satirSil(w.week, gi, si); }} style={{
                                          fontSize: 11, padding: "0 9px", borderRadius: 7, border: "none",
                                          background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", flexShrink: 0,
                                        }}>✕</button>
                                      </div>

                                      {/* Elle kipte ders adı serbest; müfredattan seçildiyse konu da müfredattan */}
                                      {elleKipte(w.week, gi, si, d.ders) ? (
                                        <input list={`dersler-${examType}`}
                                          placeholder="Ders adı (ör. 📝 DENEME)" value={d.ders}
                                          onChange={e => satirGuncelle(w.week, gi, si, "ders", e.target.value)}
                                          style={{ ...inputStyle, background: "#fff" }} />
                                      ) : null}

                                      {elleKipte(w.week, gi, si, d.ders) ? (
                                        <input placeholder="Konu / açıklama" value={d.konu}
                                          onChange={e => konuSec(w.week, gi, si, e.target.value)}
                                          style={{ ...inputStyle, background: "#fff" }} />
                                      ) : d.ders ? (
                                        <select value={d.konu}
                                          onChange={e => konuSec(w.week, gi, si, e.target.value)}
                                          style={{ ...inputStyle, background: "#fff", color: d.konu ? "#222" : "#aaa" }}>
                                          <option value="">Konu seç...</option>
                                          {topicsOf(examType, d.ders).map(k => <option key={k} value={k}>{k}</option>)}
                                        </select>
                                      ) : null}

                                      {/* Görev başlığı — öğrenciye bu metin görev olarak düşer.
                                          Görev Ata formundaki alanın karşılığı: konu seçilince
                                          otomatik dolar, öğretmen üzerine yazabilir. */}
                                      <input
                                        placeholder="Görev başlığı (ör. Matematik — 10 soru)"
                                        value={d.baslik ?? ""}
                                        onChange={e => satirGuncelle(w.week, gi, si, "baslik", e.target.value)}
                                        style={{ ...inputStyle, background: "#fff", fontWeight: 600 }} />

                                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                        {ONCELIKLER.map(o => (
                                          <button key={o.e} onClick={() => satirGuncelle(w.week, gi, si, "oncelik", o.e)}
                                            title={o.ad} style={{
                                              fontSize: 13, padding: "2px 7px", borderRadius: 99, cursor: "pointer",
                                              border: `1.5px solid ${d.oncelik === o.e ? c.mid : "#f0ede8"}`,
                                              background: d.oncelik === o.e ? c.light : "#fff",
                                            }}>{o.e}</button>
                                        ))}
                                        <input placeholder="Açıklama (opsiyonel)" value={d.aciklama}
                                          onChange={e => satirGuncelle(w.week, gi, si, "aciklama", e.target.value)}
                                          style={{ ...inputStyle, flex: 1, background: "#fff" }} />
                                      </div>
                                    </div>
                                  ))}
                                  <button onClick={() => satirEkle(w.week, gi)} style={{
                                    padding: "6px 0", borderRadius: 7, border: `1px dashed ${c.mid}`,
                                    background: "transparent", color: c.mid, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                  }}>+ adım ekle</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Ders adları için ortak liste */}
            <datalist id={`dersler-${examType}`}>
              {examSubjectsOf(examType).map(d => <option key={d} value={d} />)}
              <option value="📝 DENEME" />
              <option value="🔁 TEKRAR" />
              <option value="😴 DİNLENME" />
            </datalist>

            <button onClick={haftaEkle} style={{
              padding: "9px 0", borderRadius: 10, border: `1.5px dashed ${c.mid}`,
              background: "transparent", color: c.mid, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            }}>+ Hafta ekle</button>

            <div style={{
              fontSize: 12, fontWeight: 700, color: c.text, background: c.light,
              padding: "9px 12px", borderRadius: 8, display: "flex", justifyContent: "space-between",
            }}>
              <span>Toplam</span>
              <span>{duzenlenen.icerik.weeks.length} hafta · {icerikSatirSayisi(duzenlenen.icerik)} adım</span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={kaydet} disabled={kaydediliyor} style={{
                flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                background: c.bg, color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: "pointer", opacity: kaydediliyor ? 0.7 : 1,
              }}>{kaydediliyor ? "Kaydediliyor..." : "Programı Kaydet"}</button>
              <button onClick={() => setDuz(null)} style={{
                padding: "11px 16px", borderRadius: 12, border: "1.5px solid #f0ede8",
                background: "#fff", color: "#888", fontSize: 13, cursor: "pointer",
              }}>İptal</button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
