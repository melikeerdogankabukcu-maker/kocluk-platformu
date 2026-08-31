import { useState } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { useTopics } from "../lib/TopicsContext";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Öğretmenin müfredat konularını yönettiği ekran (exam_topics tablosu).
// Konu silmek yerine pasife alınır: eski kayıtlar (görev/test/sınav) bozulmaz,
// konu yalnızca yeni girişlerde seçilemez hale gelir.
// aktif/agirlik artık KOÇ BAZLI: exam_topics'teki kolonlar global taban,
// öğretmenin gizlediği konular ogretmen_konu_tercihi tablosunda tutuluyor.
// Böylece bir koçun konuyu pasife alması diğerini etkilemiyor.
export default function KonuYonetimi({ userId, color: c }) {
  const { EXAM_TOPICS, sinavTurleri, examSubjectsOf, veritabanindan, reload } = useTopics();

  const [acik, setAcik]         = useState(false);
  const [examType, setExamType] = useState("TYT");
  const [ders, setDers]         = useState("");
  const [pasifler, setPasifler] = useState([]);       // pasife alınmış konular
  const [konuIdleri, setKonuIdleri] = useState({});   // { konuAdı: exam_topics.id }
  const [pasifGoster, setPasifGoster] = useState(false);
  const [yeniKonu, setYeniKonu] = useState("");
  const [duzenlenen, setDuzenlenen] = useState(null); // { konu, yeniAd }
  const [islemde, setIslemde]   = useState(false);
  // Yeni ders / yeni sınav türü formu. Bir ders ya da sınav türü ancak
  // en az bir konu satırı varsa "var" olur (ikisi de exam_topics'ten
  // türetiliyor, ayrı tabloları yok) — o yüzden ilk konu zorunlu.
  const [yeniForm, setYeniForm] = useState(null);   // { tur, ders, konu, turSerbest }

  const dersler = examSubjectsOf(examType);
  const konular = ders ? (EXAM_TOPICS[examType]?.[ders] ?? []) : [];

  const inputStyle = {
    padding: "8px 11px", borderRadius: 9, border: "1.5px solid #f0ede8",
    fontSize: 12.5, boxSizing: "border-box",
  };

  const pasifleriYukle = async (tur, d) => {
    if (!d) return setPasifler([]);
    // Bu ders altındaki tüm konular + bu koçun tercihleri; etkin pasifler
    // ikisinin birleşiminden çıkıyor (tercih varsa o, yoksa tablodaki taban).
    const { veri: satirlar } = await calistir(
      supabase.from("exam_topics")
        .select("id, topic, aktif").eq("exam_type", tur).eq("subject", d).order("sira"),
      "Konulari yukleme", { sessiz: true }
    );
    const { veri: tercihler } = await calistir(
      supabase.from("ogretmen_konu_tercihi")
        .select("exam_topic_id, aktif").eq("teacher_id", userId),
      "Konu tercihleri", { sessiz: true }
    );
    const harita = {};
    (tercihler ?? []).forEach(r => { if (r.aktif != null) harita[r.exam_topic_id] = r.aktif; });
    setKonuIdleri(Object.fromEntries((satirlar ?? []).map(r => [r.topic, r.id])));
    setPasifler((satirlar ?? [])
      .filter(r => (harita[r.id] ?? r.aktif) === false)
      .map(r => r.topic));
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

  const yeniKaydet = async () => {
    const tur = (yeniForm?.tur ?? "").trim();
    const d   = (yeniForm?.ders ?? "").trim();
    const k   = (yeniForm?.konu ?? "").trim();
    if (!tur || !d || !k) { alert("Sınav türü, ders adı ve ilk konu gerekli."); return; }
    setIslemde(true);
    // sahip_id kolonunun varsayılanı auth.uid(); koç kendi konusunun sahibi
    // olur ve RLS'teki "sahip_id = auth.uid()" koşulu sağlanır.
    const { hata } = await calistir(
      supabase.from("exam_topics").insert({ exam_type: tur, subject: d, topic: k, sira: 0 }),
      "Yeni ders ekleme"
    );
    setIslemde(false);
    if (hata) return;
    setYeniForm(null);
    setExamType(tur);
    setDers(d);
    setPasifler([]);
    await tazele(d);
  };

  const aktiflikDegistir = async (konu, aktif) => {
    const konuId = konuIdleri[konu];
    if (!konuId) { alert("Konu kimliği bulunamadı, sayfayı yenileyin."); return; }
    setIslemde(true);
    // exam_topics.aktif'e DOKUNULMUYOR: o global taban ve yalnızca admin'in
    // konuyu tamamen emekliye ayırma yolu. Koçun gizlemesi kendi satırına
    // yazılıyor, diğer koçları etkilemiyor.
    const { hata } = await calistir(
      supabase.from("ogretmen_konu_tercihi")
        .upsert({ teacher_id: userId, exam_topic_id: konuId, aktif, updated_at: new Date().toISOString() },
                { onConflict: "teacher_id,exam_topic_id" }),
      "Konu tercihi kaydetme"
    );
    setIslemde(false);
    if (hata) return;
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
      <SectionTitle title="Konu Yönetimi" color={c.mid}
        acik={acik} onToggle={() => setAcik(v => !v)} />

      {!acik ? null : (
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sinavTurleri.map(t => (
              <button key={t} onClick={() => turSec(t)} style={{
                flex: 1, padding: "7px 0", borderRadius: 10, fontSize: 12, fontWeight: 600,
                border: `2px solid ${examType === t ? c.bg : "#f0ede8"}`,
                background: examType === t ? c.bg : "#fff",
                color: examType === t ? "#fff" : "#888", cursor: "pointer",
              }}>{t}</button>
            ))}
            <button onClick={() => setYeniForm({ tur: "", ders: "", konu: "", turSerbest: true })}
              title="Yeni sınav türü ekle" style={{
                padding: "7px 11px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                border: `1.5px dashed ${c.mid}`, background: "transparent",
                color: c.mid, cursor: "pointer", flexShrink: 0,
              }}>+ tür</button>
          </div>

          {/* Ders */}
          <select value={ders}
            onChange={e => {
              if (e.target.value === "__yeni") {
                setYeniForm({ tur: examType, ders: "", konu: "", turSerbest: false });
              } else dersSec(e.target.value);
            }}
            style={{ ...inputStyle, color: ders ? "#222" : "#aaa" }}>
            <option value="">Ders seç...</option>
            {dersler.map(d => <option key={d} value={d}>{d}</option>)}
            <option value="__yeni">+ Yeni ders ekle...</option>
          </select>

          {yeniForm && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              padding: 10, borderRadius: 10, background: c.light,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.text }}>
                {yeniForm.turSerbest ? "YENİ SINAV TÜRÜ" : `YENİ DERS · ${yeniForm.tur}`}
              </div>
              {yeniForm.turSerbest && (
                <input autoFocus placeholder="Sınav türü (ör. ALES, YDS)"
                  value={yeniForm.tur}
                  onChange={e => setYeniForm(f => ({ ...f, tur: e.target.value }))}
                  style={{ ...inputStyle, width: "100%" }} />
              )}
              <input autoFocus={!yeniForm.turSerbest}
                placeholder="Ders adı (ör. Vatandaşlık)"
                value={yeniForm.ders}
                onChange={e => setYeniForm(f => ({ ...f, ders: e.target.value }))}
                style={{ ...inputStyle, width: "100%" }} />
              <input placeholder="İlk konu (ör. Anayasa)"
                value={yeniForm.konu}
                onChange={e => setYeniForm(f => ({ ...f, konu: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") yeniKaydet(); if (e.key === "Escape") setYeniForm(null); }}
                style={{ ...inputStyle, width: "100%" }} />
              <div style={{ fontSize: 10, color: c.text, opacity: 0.75, lineHeight: 1.5 }}>
                Ders ancak en az bir konusu varsa listede görünür, o yüzden ilk konu
                gerekli. Sonrasını normal konu ekleme ile sürdürebilirsiniz.
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setYeniForm(null)} disabled={islemde} style={{
                  flex: 1, padding: "8px 0", borderRadius: 9, border: "1px solid #f0ede8",
                  background: "#fff", color: "#888", fontSize: 12, cursor: "pointer", fontWeight: 600,
                }}>Vazgeç</button>
                <button onClick={yeniKaydet} disabled={islemde} style={{
                  flex: 1, padding: "8px 0", borderRadius: 9, border: "none",
                  background: c.bg, color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", opacity: islemde ? 0.7 : 1,
                }}>{islemde ? "..." : "Ekle"}</button>
              </div>
            </div>
          )}

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

        </div>
      )}
    </Card>
  );
}
