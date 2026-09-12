import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Haftalık öğrenci özeti — ogrenci_haftalik tablosundan okur.
//
// Tablo türetilmiş veri: kaynak tablolardan hesaplanıp saklanıyor.
// Burada YENİDEN HESAPLANMIYOR, olduğu gibi gösteriliyor; iki ayrı
// hesaplama zamanla ayrışır ve hangisinin doğru olduğu belirsizleşirdi.
//
// yenilenebilir: koç/yönetici için "Yenile" düğmesi. Öğrenci ve veli
// yalnızca okuyor (RPC zaten onlara kapalı).
const hafta = (d) =>
  new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

const sayi = (v, bos = "—") =>
  v === null || v === undefined ? bos : String(v).replace(".", ",");

// students verilirse (koç paneli) bir seçici çıkıyor; verilmezse
// (öğrenci/veli paneli) doğrudan studentId kullanılıyor.
// "95" -> "1 sa 35 dk". Tablo dar; saat üstü süreleri dakika olarak
// yazmak (ör. "340") okunmuyordu.
const dakikaMetni = (dk) => {
  if (!dk) return "0";
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60), kalan = dk % 60;
  return kalan ? `${sa} sa ${kalan} dk` : `${sa} sa`;
};

export default function HaftalikOzet({ studentId, students = null, color: c,
  yenilenebilir = false, baslik = "Haftalık Özet" }) {
  const [secili,   setSecili]   = useState(studentId ?? students?.[0]?.id ?? "");
  const [acik,     setAcik]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [satirlar, setSatirlar] = useState([]);
  const [yenileniyor, setYenileniyor] = useState(false);

  const kim = students ? secili : studentId;

  const yukle = useCallback(async () => {
    if (!kim) { setSatirlar([]); return; }
    setLoading(true);
    const { veri } = await calistir(
      supabase.from("ogrenci_haftalik").select("*")
        .eq("student_id", kim)
        .order("hafta", { ascending: false })
        .limit(14),
      "Haftalik ozet", { sessiz: true }
    );
    setSatirlar(veri ?? []);
    setLoading(false);
  }, [kim]);

  useEffect(() => { if (acik) yukle(); }, [acik, yukle]);

  const yenile = async () => {
    setYenileniyor(true);
    const { hata } = await calistir(
      supabase.rpc("haftalik_ozet_yenile", { p_hafta_sayisi: 12 }),
      "Ozet yenileme"
    );
    setYenileniyor(false);
    if (hata) return;
    yukle();
  };

  // En yüksek soru sayısı — çubukları ona göre ölçekliyoruz.
  // Sabit bir ölçek kullanılsaydı az çalışan öğrencide tüm çubuklar
  // görünmez, çok çalışanda hepsi dolu görünürdü.
  const enYuksek = Math.max(1, ...satirlar.map(s => s.soru_toplam ?? 0));

  const hucre = { padding: "5px 6px", fontSize: 11, textAlign: "right", whiteSpace: "nowrap" };
  const baslikHucre = { ...hucre, fontSize: 9.5, fontWeight: 700, color: "#aaa", textAlign: "right" };

  return (
    <Card id="bolum-haftalik">
      <SectionTitle title={baslik} color={c.mid}
        acik={acik} onToggle={() => setAcik(v => !v)} />

      {!acik ? null : loading ? (
        <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : satirlar.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {students && students.length > 0 && (
            <select value={secili} onChange={e => setSecili(e.target.value)} style={{
              width: "100%", padding: "8px 11px", borderRadius: 9,
              border: "1.5px solid #f0ede8", fontSize: 12.5, boxSizing: "border-box",
            }}>
              {students.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          )}

          <div style={{ fontSize: 12.5, color: "#aaa", padding: "10px 0", textAlign: "center" }}>
            Henüz özet yok.{yenilenebilir ? " Aşağıdan oluşturabilirsiniz." : ""}
          </div>
          {yenilenebilir && (
            <button onClick={yenile} disabled={yenileniyor} style={{
              padding: "9px 0", borderRadius: 10, border: "none",
              background: c.bg, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}>{yenileniyor ? "Hesaplanıyor..." : "Özeti oluştur"}</button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {students && students.length > 0 && (
            <select value={secili} onChange={e => setSecili(e.target.value)} style={{
              width: "100%", padding: "8px 11px", borderRadius: 9,
              border: "1.5px solid #f0ede8", fontSize: 12.5, boxSizing: "border-box",
            }}>
              {students.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          )}

          {/* Geniş tablo dar ekranda taşmasın */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
              <thead>
                <tr>
                  <th style={{ ...baslikHucre, textAlign: "left" }}>HAFTA</th>
                  <th style={baslikHucre} title="Bu hafta fiilen yapılan / bu haftanın görevleri">GÖREV</th>
                  <th style={baslikHucre} title="Çalışma planında yapılan blok / planlanan blok">PLAN</th>
                  <th style={baslikHucre} title="Öğrencinin bildirdiği çalışma süresi (sayaçla ölçülen kısmı parantezde)">SÜRE</th>
                  <th style={baslikHucre}>SORU</th>
                  <th style={baslikHucre} title="Yalnızca yanlış sayısı girilmiş testlerden">NET</th>
                  <th style={baslikHucre} title="Deneme sınavı net ortalaması">DENEME</th>
                  <th style={baslikHucre}>DERS</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map(s => {
                  const oran = s.gorev_verilen > 0
                    ? Math.round((s.gorev_tamamlanan / s.gorev_verilen) * 100) : null;
                  return (
                    <tr key={s.hafta} style={{ borderTop: "1px solid #f5f2ee" }}>
                      <td style={{ ...hucre, textAlign: "left", color: "#666", fontWeight: 600 }}>
                        {hafta(s.hafta)}
                      </td>
                      <td style={hucre}>
                        <span style={{ color: s.gorev_yapilan > 0 ? "#1A6B3C" : "#bbb", fontWeight: 700 }}>
                          {s.gorev_yapilan}
                        </span>
                        <span style={{ color: "#ccc" }}> / </span>
                        <span style={{ color: "#888" }}>{s.gorev_verilen}</span>
                        {oran !== null && (
                          <span style={{ fontSize: 9.5, color: "#bbb" }}> %{oran}</span>
                        )}
                      </td>
                      {/* Plan uyumu. Planı olmayan hafta "—": 0/0'ı %0 göstermek
                          "plan vardı, hiç yapılmadı" ile karışırdı. */}
                      <td style={hucre}>
                        {(s.plan_blok ?? 0) > 0 ? (
                          <>
                            <span style={{ color: s.plan_yapilan > 0 ? "#1A6B3C" : "#bbb", fontWeight: 700 }}>
                              {s.plan_yapilan}
                            </span>
                            <span style={{ color: "#ccc" }}> / </span>
                            <span style={{ color: "#888" }}>{s.plan_blok}</span>
                            <span style={{ fontSize: 9.5, color: "#bbb" }}> %{Math.round((s.plan_yapilan / s.plan_blok) * 100)}</span>
                          </>
                        ) : <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                      <td style={hucre}
                        title={(s.plan_dk ?? 0) > 0 ? `Planlanan ${s.plan_dk} dk` : undefined}>
                        {(s.calisilan_dk ?? 0) > 0 ? (
                          <>
                            <span style={{ color: "#333" }}>{dakikaMetni(s.calisilan_dk)}</span>
                            {(s.sayac_dk ?? 0) > 0 && (
                              <span style={{ fontSize: 9.5, color: "#bbb" }}> ({dakikaMetni(s.sayac_dk)})</span>
                            )}
                          </>
                        ) : <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                      <td style={hucre}>
                        {/* Çubuk, sayıyı okumadan haftalar arası farkı gösteriyor */}
                        <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                          <div style={{ width: 34, height: 5, borderRadius: 99, background: "#f0ede8", overflow: "hidden" }}>
                            <div style={{
                              width: `${Math.round(((s.soru_toplam ?? 0) / enYuksek) * 100)}%`,
                              height: "100%", background: c.mid,
                            }} />
                          </div>
                          <span style={{ color: s.soru_toplam > 0 ? "#333" : "#ccc", minWidth: 22 }}>
                            {s.soru_toplam}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...hucre, color: s.test_net !== null ? "#333" : "#ccc" }}
                        title={s.test_ayrintili < s.test_sayisi
                          ? `${s.test_sayisi} testin ${s.test_ayrintili} tanesinde yanlış sayısı girilmiş`
                          : undefined}>
                        {sayi(s.test_net)}
                        {s.test_sayisi > 0 && s.test_ayrintili < s.test_sayisi && (
                          <span style={{ fontSize: 9, color: "#C9A227" }}> *</span>
                        )}
                      </td>
                      <td style={{ ...hucre, color: s.sinav_net_ort !== null ? "#333" : "#ccc" }}>
                        {sayi(s.sinav_net_ort)}
                      </td>
                      <td style={hucre}>
                        {s.ders_geldi > 0 && <span style={{ color: "#1A6B3C" }}>{s.ders_geldi}</span>}
                        {s.ders_gelmedi > 0 && (
                          <span style={{ color: "#A32D2D" }}>
                            {s.ders_geldi > 0 ? " / " : ""}{s.ders_gelmedi}
                          </span>
                        )}
                        {s.ders_geldi === 0 && s.ders_gelmedi === 0 && (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.5 }}>
            <b>Görev</b>: bu hafta fiilen yapılan / bu haftanın görevleri.{" "}
            <b>Plan</b>: çalışma planında yapılan / planlanan blok.{" "}
            <b>Süre</b>: öğrencinin bildirdiği; parantezdeki kısmı sayaçla ölçülen.{" "}
            <b>Net</b> yalnızca yanlış sayısı girilmiş testlerden hesaplanır;
            <span style={{ color: "#C9A227" }}> *</span> işareti o haftanın
            testlerinin bir kısmında ayrım girilmediğini gösterir.
          </div>

          {yenilenebilir && (
            <button onClick={yenile} disabled={yenileniyor} style={{
              padding: "9px 0", borderRadius: 10, border: "1.5px solid #f0ede8",
              background: "#fff", color: c.mid, fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>{yenileniyor ? "Hesaplanıyor..." : "↻ Son 12 haftayı yenile"}</button>
          )}
        </div>
      )}
    </Card>
  );
}
