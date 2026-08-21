import { useState } from "react";
import { supabase } from "../supabase";
import { useTopics } from "../lib/TopicsContext";
import { soruLimiti, alanaGoreSuz } from "../lib/examLimits";
import { netHesapla, netKuraliMetni } from "../lib/netHelpers";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Sınav türleri müfredattan geliyor (TYT/AYT/LGS/KPSS/DGS); "Okul Sınavı"
// müfredatı olmayan serbest tür olduğu için sona elle ekleniyor. Sabit liste
// tutulsaydı KPSS/DGS müfredata eklendiği hâlde sınav girişinde çıkmazdı.
const SERBEST_TUR = "Okul Sınavı";

// Öğretmenin sınav sonucu girdiği form.
// Her ders için yalnızca doğru/yanlış girilir; net ve boş otomatik hesaplanır
// (boş = dersin soru sayısı − doğru − yanlış).
// Hem yanlış hem boş sorular için ayrı ayrı konu eşleştirilir: aynı konudan
// birden fazla soru olabileceği için konular adetli tutulur ve toplam,
// o kategorinin soru sayısını AŞAMAZ.
export default function SinavGirisFormu({ students, profileMap = {}, color: c, onKaydedildi }) {
  const { sinavTurleri, dersleriGetir, topicsOf } = useTopics();
  const sinavSecenekleri = [...sinavTurleri, SERBEST_TUR];
  const [acik,   setAcik]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [examType, setExamType] = useState("TYT");
  const [acikPanel, setAcikPanel] = useState(null);   // { ders, tip: 'yanlis' | 'bos' }
  const [dersler,  setDersler]  = useState({});       // { ders: {dogru, yanlis, yanlisKonular:{}, bosKonular:{}} }
  const [form, setForm] = useState({
    student_id: "", exam_name: "", exam_date: new Date().toISOString().split("T")[0], notes: "",
  });

  const inputStyle = {
    padding: "9px 12px", borderRadius: 10, border: "1.5px solid #f0ede8",
    fontSize: 13, boxSizing: "border-box",
  };

  const BOS_DERS = { dogru: "", yanlis: "", yanlisKonular: {}, bosKonular: {} };
  const dersAl   = (ders) => dersler[ders] ?? BOS_DERS;
  const alanAdi  = (tip) => (tip === "yanlis" ? "yanlisKonular" : "bosKonular");
  const toplam   = (m) => Object.values(m).reduce((s, n) => s + n, 0);

  const dersGuncelle = (ders, alan, deger) =>
    setDersler(d => ({ ...d, [ders]: { ...dersAl(ders), [alan]: deger } }));

  // Konu adedini değiştirir. Ekleme, o kategorinin soru sayısını aşamaz.
  const konuAdetDegistir = (ders, tip, konu, fark, ustSinir) => {
    const alan = alanAdi(tip);
    const mevcut = dersAl(ders)[alan];
    if (fark > 0 && toplam(mevcut) >= ustSinir) return;   // sınır dolu
    const yeniAdet = (mevcut[konu] ?? 0) + fark;
    const yeni = { ...mevcut };
    if (yeniAdet > 0) yeni[konu] = yeniAdet; else delete yeni[konu];
    dersGuncelle(ders, alan, yeni);
  };

  const turDegistir = (tur) => { setExamType(tur); setDersler({}); setAcikPanel(null); };

  const sifirla = () => {
    setForm({ student_id: "", exam_name: "", exam_date: new Date().toISOString().split("T")[0], notes: "" });
    setDersler({}); setAcikPanel(null); setAcik(false);
  };

  // Girilen derslerden net / toplam / kayıt verisi hesapla
  const dersNetleri = {};
  const dersDetaylari = {};
  const limitAsanlar = [];
  Object.entries(dersler).forEach(([ders, v]) => {
    if (v.dogru === "" && v.yanlis === "") return;
    const d = parseInt(v.dogru) || 0, y = parseInt(v.yanlis) || 0;
    const limit = soruLimiti(examType, ders);
    if (limit != null && d + y > limit) limitAsanlar.push(`${ders} (${d + y}/${limit})`);
    const b = limit != null ? Math.max(limit - d - y, 0) : 0;

    const net = netHesapla(v.dogru, v.yanlis, examType);
    dersNetleri[ders] = net;
    // Adetli haritalar diziye açılır: {Türev:2} → ["Türev","Türev"]
    const ac = (m) => Object.entries(m).flatMap(([konu, adet]) => Array(adet).fill(konu));
    dersDetaylari[ders] = {
      dogru: d, yanlis: y, bos: b, net,
      yanlis_konular: ac(v.yanlisKonular),
      bos_konular:    ac(v.bosKonular),
    };
  });
  const toplamNet = Object.values(dersNetleri).reduce((s, n) => s + n, 0);
  const doluDersSayisi = Object.keys(dersNetleri).length;

  const kaydet = async () => {
    if (!form.student_id || !form.exam_name.trim()) return;
    if (limitAsanlar.length > 0) {
      alert("Soru sayısı limiti aşıldı:\n" + limitAsanlar.join("\n"));
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("exam_results").insert({
      student_id:      form.student_id,
      exam_name:       form.exam_name.trim(),
      exam_type:       examType,
      exam_date:       form.exam_date,
      subject_nets:    doluDersSayisi > 0 ? dersNetleri   : null,
      subject_details: doluDersSayisi > 0 ? dersDetaylari : null,
      total_net:       doluDersSayisi > 0 ? parseFloat(toplamNet.toFixed(2)) : null,
      notes:           form.notes || null,
    });
    setSaving(false);
    if (error) {
      console.error("Sınav kaydetme hatası:", error);
      alert("Sınav sonucu kaydedilemedi: " + error.message);
      return;
    }
    sifirla();
    onKaydedildi?.();
  };

  // Seçili öğrencinin alanı — AYT'de yalnızca o alanın dersleri sorulur
  const alan = profileMap[form.student_id]?.field_preference ?? null;
  const dersListesi = alanaGoreSuz(examType, dersleriGetir(examType), alan);

  // Yanlış / boş soruların konu eşleştirme bloğu (ikisi de aynı mantık)
  const konuBlogu = (ders, tip, adet, konular) => {
    const v = dersAl(ders);
    const harita  = v[alanAdi(tip)];
    const eslesen = toplam(harita);
    const kalan   = adet - eslesen;
    const dolu    = kalan <= 0;
    const panelAcik = acikPanel?.ders === ders && acikPanel?.tip === tip;
    const etiket = tip === "yanlis" ? "Yanlış" : "Boş";
    const renk   = tip === "yanlis" ? { bg: "#FFF0F0", fg: "#A32D2D", kenar: "#E8C4C4" }
                                    : { bg: "#F1F4F9", fg: "#4A5B73", kenar: "#D3DBE6" };

    return (
      <div key={tip} style={{ marginTop: 7 }}>
        <button onClick={() => setAcikPanel(panelAcik ? null : { ders, tip })} style={{
          fontSize: 11, fontWeight: 600, cursor: "pointer",
          background: "none", border: "none", padding: 0,
          color: dolu ? "#1A6B3C" : eslesen > 0 ? "#854F0B" : "#999",
        }}>
          {panelAcik ? "▾" : "▸"} {etiket} soruların konuları ({eslesen}/{adet}){dolu ? " ✓" : ""}
        </button>

        {eslesen > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
            {Object.entries(harita).map(([konu, n]) => (
              <span key={konu} style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 99,
                background: renk.bg, color: renk.fg, fontWeight: 600,
              }}>{konu}{n > 1 ? ` ×${n}` : ""}</span>
            ))}
          </div>
        )}

        {panelAcik && (
          <div style={{ marginTop: 7, background: "#fff", borderRadius: 8, border: "1px solid #f0ede8", padding: 8 }}>
            {eslesen > 0 && (
              <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(harita).map(([konu, n]) => (
                  <div key={konu} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 11.5,
                  }}>
                    <span style={{ color: "#444", minWidth: 0 }}>{konu}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => konuAdetDegistir(ders, tip, konu, -1, adet)} style={{
                        width: 28, height: 28, borderRadius: 8, cursor: "pointer", flexShrink: 0,
                        border: "1px solid #f0ede8", background: "#fff", color: "#888", fontSize: 13, lineHeight: 1,
                      }}>−</button>
                      <span style={{ fontSize: 12, fontWeight: 700, color: renk.fg, minWidth: 14, textAlign: "center" }}>{n}</span>
                      <button onClick={() => konuAdetDegistir(ders, tip, konu, +1, adet)} disabled={dolu} style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        cursor: dolu ? "not-allowed" : "pointer", opacity: dolu ? 0.4 : 1,
                        border: "1px solid #f0ede8", background: "#fff", color: "#888", fontSize: 13, lineHeight: 1,
                      }}>+</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 9.5, color: dolu ? "#1A6B3C" : "#aaa", marginBottom: 5 }}>
              {dolu
                ? `Tüm ${etiket.toLowerCase()} sorular eşleştirildi ✓`
                : `${kalan} ${etiket.toLowerCase()} soru için konu seçin (konuya tıkla = 1 soru)`}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 170, overflowY: "auto" }}>
              {konular.map(k => {
                const n = harita[k] ?? 0;
                return (
                  <button key={k} onClick={() => konuAdetDegistir(ders, tip, k, +1, adet)} disabled={dolu}
                    title={dolu ? `${etiket} soru sayısı kadar konu seçildi` : undefined}
                    style={{
                      fontSize: 10.5, padding: "3px 9px", borderRadius: 99,
                      cursor: dolu ? "not-allowed" : "pointer",
                      opacity: dolu && n === 0 ? 0.45 : 1,
                      border: `1px solid ${n > 0 ? renk.kenar : "#f0ede8"}`,
                      background: n > 0 ? renk.bg : "#fff",
                      color: n > 0 ? renk.fg : "#888",
                      fontWeight: n > 0 ? 700 : 500,
                    }}>{k}{n > 0 ? ` ×${n}` : ""}</button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <SectionTitle title="Sınav Sonucu Gir" color={c.mid} />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>+ Sınav Sonucu Ekle</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <select value={form.student_id}
            onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
            style={{ ...inputStyle, color: form.student_id ? "#222" : "#aaa" }}>
            <option value="">Öğrenci seç...</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sinavSecenekleri.map(tur => (
              <button key={tur} onClick={() => turDegistir(tur)} style={{
                flex: 1, padding: "7px 0", borderRadius: 10, fontSize: 11, fontWeight: 600,
                border: `2px solid ${examType === tur ? c.bg : "#f0ede8"}`,
                background: examType === tur ? c.bg : "#fff",
                color: examType === tur ? "#fff" : "#888", cursor: "pointer",
              }}>{tur}</button>
            ))}
          </div>

          <input placeholder="Sınav adı (ör. TYT Deneme #3)" value={form.exam_name}
            onChange={e => setForm(f => ({ ...f, exam_name: e.target.value }))}
            style={inputStyle} />
          <input type="date" value={form.exam_date}
            onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))}
            style={inputStyle} />

          {dersListesi.length > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>DERS SONUÇLARI</span>
                <span style={{ fontSize: 10.5, color: "#bbb" }}>{netKuraliMetni(examType)}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dersListesi.map(ders => {
                  const v = dersAl(ders);
                  const doldu = v.dogru !== "" || v.yanlis !== "";
                  const d = parseInt(v.dogru) || 0, y = parseInt(v.yanlis) || 0;
                  const girilen = d + y;
                  const limit = soruLimiti(examType, ders);
                  const asildi = limit != null && girilen > limit;
                  const bosSayisi = limit != null ? Math.max(limit - girilen, 0) : 0;
                  const net = doldu ? netHesapla(v.dogru, v.yanlis, examType) : null;
                  const konular = topicsOf(examType, ders);

                  return (
                    <div key={ders} style={{
                      padding: "9px 11px", borderRadius: 10,
                      background: doldu ? c.light : "#fafaf8",
                      border: `1px solid ${asildi ? "#E8C4C4" : doldu ? c.mid + "33" : "#f0ede8"}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#333" }}>{ders}</span>
                        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {limit != null && (
                            <span style={{
                              fontSize: 10.5, fontWeight: asildi ? 700 : 500,
                              color: asildi ? "#A32D2D" : "#aaa",
                            }}>{girilen}/{limit} soru</span>
                          )}
                          {net != null && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{net} net</span>
                          )}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        {[["dogru", "Doğru"], ["yanlis", "Yanlış"]].map(([alan, etiket]) => (
                          <div key={alan} style={{ flex: 1 }}>
                            <div style={{ fontSize: 9.5, color: "#999", marginBottom: 2 }}>{etiket}</div>
                            <input type="number" min="0" placeholder="0"
                              value={v[alan]}
                              onChange={e => dersGuncelle(ders, alan, e.target.value)}
                              style={{ ...inputStyle, width: "100%", padding: "6px 8px", fontSize: 12.5, background: "#fff" }} />
                          </div>
                        ))}
                      </div>

                      {asildi && (
                        <div style={{ fontSize: 10.5, color: "#A32D2D", marginTop: 5, fontWeight: 600 }}>
                          Toplam {girilen} soru — bu derste {limit} soru var
                        </div>
                      )}

                      {/* Yanlış ve boş soruların konuları */}
                      {konular.length > 0 && !asildi && doldu && (
                        <>
                          {y > 0          && konuBlogu(ders, "yanlis", y, konular)}
                          {bosSayisi > 0  && konuBlogu(ders, "bos", bosSayisi, konular)}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Toplam net</div>
              <input type="number" step="0.25" placeholder="Toplam net"
                value={dersAl("Toplam").dogru}
                onChange={e => dersGuncelle("Toplam", "dogru", e.target.value)}
                style={{ ...inputStyle, width: "100%" }} />
            </div>
          )}

          {doluDersSayisi > 0 && (
            <div style={{
              fontSize: 12.5, fontWeight: 700, color: c.text,
              background: c.light, padding: "10px 12px", borderRadius: 8,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>Toplam net</span>
              <span>{parseFloat(toplamNet.toFixed(2))} <span style={{ fontWeight: 500, color: c.mid, fontSize: 11 }}>· {doluDersSayisi} ders</span></span>
            </div>
          )}

          {limitAsanlar.length > 0 && (
            <div style={{
              fontSize: 11.5, color: "#A32D2D", background: "#FFF0F0",
              padding: "9px 12px", borderRadius: 8, fontWeight: 600,
            }}>
              Soru sayısı limiti aşıldı: {limitAsanlar.join(", ")}
            </div>
          )}

          <input placeholder="Not (isteğe bağlı)" value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={inputStyle} />

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={kaydet} disabled={saving || limitAsanlar.length > 0} style={{
              flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
              background: limitAsanlar.length > 0 ? "#ccc" : c.bg,
              color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: limitAsanlar.length > 0 ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}>{saving ? "Kaydediliyor..." : "Sınavı Kaydet"}</button>
            <button onClick={sifirla} style={{
              padding: "11px 16px", borderRadius: 12, border: "1.5px solid #f0ede8",
              background: "#fff", color: "#888", fontSize: 13, cursor: "pointer",
            }}>İptal</button>
          </div>
        </div>
      )}
    </Card>
  );
}
