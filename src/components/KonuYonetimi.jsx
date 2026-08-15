import { useState } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { useTopics } from "../lib/TopicsContext";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Öğretmenin müfredat konularını yönettiği ekran (exam_topics tablosu).
// Konu silmek yerine pasife alınır: eski kayıtlar (görev/test/sınav) bozulmaz,
// konu yalnızca yeni girişlerde seçilemez hale gelir.
export default function KonuYonetimi({ color: c }) {
  const { EXAM_TOPICS, examSubjectsOf, veritabanindan, reload } = useTopics();

  const [acik, setAcik]         = useState(false);
  const [examType, setExamType] = useState("TYT");
  const [ders, setDers]         = useState("");
  const [pasifler, setPasifler] = useState([]);       // pasife alınmış konular
  const [pasifGoster, setPasifGoster] = useState(false);
  const [yeniKonu, setYeniKonu] = useState("");
  const [duzenlenen, setDuzenlenen] = useState(null); // { konu, yeniAd }
  const [islemde, setIslemde]   = useState(false);

  const dersler = examSubjectsOf(examType);
  const konular = ders ? (EXAM_TOPICS[examType]?.[ders] ?? []) : [];

  const inputStyle = {
    padding: "8px 11px", borderRadius: 9, border: "1.5px solid #f0ede8",
    fontSize: 12.5, boxSizing: "border-box",
  };

  const pasifleriYukle = async (tur, d) => {
    if (!d) return setPasifler([]);
    const { veri } = await calistir(
      supabase.from("exam_topics")
        .select("topic").eq("exam_type", tur).eq("subject", d).eq("aktif", false).order("sira"),
      "Pasif konulari yukleme", { sessiz: true }
    );
    setPasifler((veri ?? []).map(r => r.topic));
  };

  const dersSec = (d) => { setDers(d); setDuzenlenen(null); pasifleriYukle(examType, d); };
  const turSec  = (t) => { setExamType(t); setDers(""); setPasifler([]); setDuzenlenen(null); };

  const tazele = async (d = ders) => { await reload(); await pasifleriYukle(examType, d); };

  const konuEkle = async () => {
    const ad = yeniKonu.trim();
    if (!ad || !ders) return;
    setIslemde(true);
    const { error } = await supabase.from("exam_topics").insert({
      exam_type: examType, subject: ders, topic: ad, sira: konular.length,
    });
    setIslemde(false);
    if (error) { alert("Konu eklenemedi: " + error.message); return; }
    setYeniKonu("");
    tazele();
  };

  const aktiflikDegistir = async (konu, aktif) => {
    setIslemde(true);
    const { error } = await supabase.from("exam_topics")
      .update({ aktif }).eq("exam_type", examType).eq("subject", ders).eq("topic", konu);
    setIslemde(false);
    if (error) { alert("İşlem başarısız: " + error.message); return; }
    tazele();
  };

  const adDegistir = async () => {
    const eski = duzenlenen?.konu;
    const yeni = (duzenlenen?.yeniAd ?? "").trim();
    if (!eski || !yeni || eski === yeni) { setDuzenlenen(null); return; }
    setIslemde(true);
    // Eski görev/test/sınav kayıtlarını da güncelleyen SQL fonksiyonu
    const { error } = await supabase.rpc("konu_yeniden_adlandir", {
      p_ders: ders, p_eski: eski, p_yeni: yeni,
    });
    setIslemde(false);
    if (error) { alert("Ad değiştirilemedi: " + error.message); return; }
    setDuzenlenen(null);
    tazele();
  };

  return (
    <Card>
      <SectionTitle title="Konu Yönetimi" color={c.mid} />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Müfredat konularını düzenle</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {!veritabanindan && (
            <div style={{
              fontSize: 11.5, color: "#854F0B", background: "#FFF7E6",
              padding: "9px 12px", borderRadius: 8, lineHeight: 1.5,
            }}>
              Konular henüz veritabanına aktarılmamış — şu an koddaki sabit liste kullanılıyor.
              Düzenleme yapabilmek için <b>exam_topics_migration.sql</b> çalıştırılmalı.
            </div>
          )}

          {/* Sınav türü */}
          <div style={{ display: "flex", gap: 6 }}>
            {["TYT", "AYT"].map(t => (
              <button key={t} onClick={() => turSec(t)} style={{
                flex: 1, padding: "7px 0", borderRadius: 10, fontSize: 12, fontWeight: 600,
                border: `2px solid ${examType === t ? c.bg : "#f0ede8"}`,
                background: examType === t ? c.bg : "#fff",
                color: examType === t ? "#fff" : "#888", cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Ders */}
          <select value={ders} onChange={e => dersSec(e.target.value)}
            style={{ ...inputStyle, color: ders ? "#222" : "#aaa" }}>
            <option value="">Ders seç...</option>
            {dersler.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {ders && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>
                {ders.toLocaleUpperCase("tr")} — {konular.length} KONU
              </div>

              {/* Konu listesi */}
              <div style={{
                display: "flex", flexDirection: "column", gap: 3,
                maxHeight: 300, overflowY: "auto",
                border: "1px solid #f0ede8", borderRadius: 9, padding: 6,
              }}>
                {konular.length === 0 && (
                  <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "10px 0" }}>
                    Bu derste aktif konu yok
                  </div>
                )}
                {konular.map(k => {
                  const duzenle = duzenlenen?.konu === k;
                  return (
                    <div key={k} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 6px", borderRadius: 7,
                      background: duzenle ? c.light : "transparent",
                    }}>
                      {duzenle ? (
                        <>
                          <input autoFocus value={duzenlenen.yeniAd}
                            onChange={e => setDuzenlenen(d => ({ ...d, yeniAd: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") adDegistir(); if (e.key === "Escape") setDuzenlenen(null); }}
                            style={{ ...inputStyle, flex: 1, padding: "5px 8px", background: "#fff" }} />
                          <button onClick={adDegistir} disabled={islemde} style={{
                            fontSize: 11, padding: "4px 10px", borderRadius: 99, border: "none",
                            background: "#E8F9F0", color: "#1A6B3C", cursor: "pointer", fontWeight: 700,
                          }}>Kaydet</button>
                          <button onClick={() => setDuzenlenen(null)} style={{
                            fontSize: 11, padding: "4px 8px", borderRadius: 99,
                            border: "1px solid #f0ede8", background: "#fff", color: "#999", cursor: "pointer",
                          }}>Vazgeç</button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 12, color: "#333", minWidth: 0 }}>{k}</span>
                          <button onClick={() => setDuzenlenen({ konu: k, yeniAd: k })} title="Adını değiştir" style={{
                            fontSize: 11, padding: "3px 9px", borderRadius: 99,
                            border: "1px solid #f0ede8", background: "#fff", color: "#888", cursor: "pointer",
                          }}>✏️</button>
                          <button onClick={() => aktiflikDegistir(k, false)} disabled={islemde} title="Pasife al" style={{
                            fontSize: 11, padding: "3px 9px", borderRadius: 99, border: "none",
                            background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600,
                          }}>Pasife al</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Yeni konu */}
              <div style={{ display: "flex", gap: 6 }}>
                <input placeholder="Yeni konu adı" value={yeniKonu}
                  onChange={e => setYeniKonu(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") konuEkle(); }}
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={konuEkle} disabled={islemde || !yeniKonu.trim()} style={{
                  padding: "8px 16px", borderRadius: 9, border: "none",
                  background: yeniKonu.trim() ? c.bg : "#ddd", color: "#fff",
                  fontSize: 12.5, fontWeight: 700, cursor: yeniKonu.trim() ? "pointer" : "not-allowed",
                }}>Ekle</button>
              </div>

              {/* Pasif konular */}
              {pasifler.length > 0 && (
                <div>
                  <button onClick={() => setPasifGoster(v => !v)} style={{
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: "none", border: "none", padding: 0, color: "#888",
                  }}>{pasifGoster ? "▾" : "▸"} Pasif konular ({pasifler.length})</button>

                  {pasifGoster && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                      {pasifler.map(k => (
                        <div key={k} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "5px 6px", borderRadius: 7, background: "#fafaf8",
                        }}>
                          <span style={{ flex: 1, fontSize: 12, color: "#aaa", textDecoration: "line-through", minWidth: 0 }}>{k}</span>
                          <button onClick={() => aktiflikDegistir(k, true)} disabled={islemde} style={{
                            fontSize: 11, padding: "3px 9px", borderRadius: 99, border: "none",
                            background: "#E8F9F0", color: "#1A6B3C", cursor: "pointer", fontWeight: 600,
                          }}>Geri al</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: 10.5, color: "#aaa", lineHeight: 1.5 }}>
                Konu adını değiştirdiğinizde geçmiş görev, test ve sınav kayıtları da otomatik güncellenir.
                Pasife alınan konu eski kayıtlarda görünmeye devam eder, yalnızca yeni girişlerde seçilemez.
              </div>
            </>
          )}

          <button onClick={() => { setAcik(false); setDuzenlenen(null); }} style={{
            padding: "9px 0", borderRadius: 10, border: "1.5px solid #f0ede8",
            background: "#fff", color: "#888", fontSize: 12.5, cursor: "pointer",
          }}>Kapat</button>
        </div>
      )}
    </Card>
  );
}
