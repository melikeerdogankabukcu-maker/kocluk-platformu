import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useAnaliz } from "../hooks/useAnaliz";
import { useSinavAnalizi } from "../hooks/useSinavAnalizi";
import { useProgramAtama } from "../hooks/useProgramAtama";
import { genelDegerlendirmeStil } from "../lib/analizHelpers";
import { seviyeHesapla } from "../lib/gamification";
import { rozetBilgi } from "../lib/badges";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import Modal from "./Modal";

const gunStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Hazır dönem seçenekleri
const HAZIR_ARALIKLAR = [
  { ad: "Son 1 ay",  ay: 1 },
  { ad: "Son 3 ay",  ay: 3 },
  { ad: "Son 6 ay",  ay: 6 },
  { ad: "Tüm zaman", ay: null },
];

// Veli için dönem raporu — yazdırılabilir / PDF olarak kaydedilebilir.
//
// PDF üretimi için harici kütüphane KULLANILMIYOR: jsPDF'in gömülü fontları
// Türkçe karakterleri (ş/ğ/ı/İ) bozuyor ve düzeltmek ~300KB font gömmeyi
// gerektiriyor. Tarayıcının yazdırma motoru hem Türkçe'yi doğru basıyor hem de
// kullanıcıya "PDF olarak kaydet" seçeneğini zaten veriyor.
export default function VeliRaporu({ studentId, studentName, color: c, baslik = "Veli Raporu", variant = "kart" }) {
  const [acik, setAcik] = useState(false);
  const [ogretmenNotu, setNot] = useState("");
  const [rozetler, setRozetler] = useState([]);
  const [puan, setPuan] = useState(null);

  // Rapor dönemi — varsayılan son 1 ay
  const [aralik, setAralik] = useState(() => {
    const bit = new Date();
    const bas = new Date(); bas.setMonth(bas.getMonth() - 1);
    return { baslangic: gunStr(bas), bitis: gunStr(bit) };
  });

  const { analiz } = useAnaliz(acik ? studentId : null, aralik);
  const { veri: sinav } = useSinavAnalizi(studentId, acik, aralik);
  const { atama } = useProgramAtama(acik ? studentId : null);

  useEffect(() => {
    if (!acik || !studentId) return;
    // Rozetler dönemde KAZANILANLAR ile sınırlanır (seviye/XP ise yaşam boyu)
    let sorgu = supabase.from("badges").select("rozet_kod, kazanildi_at").eq("user_id", studentId);
    if (aralik.baslangic) sorgu = sorgu.gte("kazanildi_at", aralik.baslangic);
    if (aralik.bitis)     sorgu = sorgu.lte("kazanildi_at", `${aralik.bitis}T23:59:59`);
    sorgu.then(({ data }) => setRozetler(data ?? []));
    supabase.rpc("ogrenci_puan", { p_user: studentId })
      .then(({ data }) => setPuan(data ?? null));
  }, [acik, studentId, aralik.baslangic, aralik.bitis]);

  const kisaTarih = (t) => t
    ? new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const donemMetni = (aralik.baslangic || aralik.bitis)
    ? `${kisaTarih(aralik.baslangic) ?? "başlangıçtan"} – ${kisaTarih(aralik.bitis) ?? "bugüne"}`
    : "Tüm zamanlar";

  const bugun = new Date().toLocaleDateString("tr-TR", {
    day: "numeric", month: "long", year: "numeric",
  });

  const gd = analiz?.genel_degerlendirme;
  const stil = gd ? genelDegerlendirmeStil(gd.durum) : null;
  const s = puan ? seviyeHesapla(puan.xp ?? 0) : null;

  // Program ilerlemesi
  const programOran = atama?.toplam_satir
    ? Math.round(((atama.tamamlananlar ?? []).length / atama.toplam_satir) * 100) : null;

  const bolum = (baslikMetni, icerik) => (
    <div style={{ marginBottom: 16, breakInside: "avoid" }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#666", letterSpacing: 0.4,
        borderBottom: "1.5px solid #e8e4dd", paddingBottom: 4, marginBottom: 8,
      }}>{baslikMetni}</div>
      {icerik}
    </div>
  );

  const kutu = (etiket, deger, alt) => (
    <div style={{
      flex: 1, minWidth: 74, padding: "8px 6px", borderRadius: 8,
      background: "#fafaf8", border: "1px solid #f0ede8", textAlign: "center",
    }}>
      <div style={{ fontSize: 9, color: "#999" }}>{etiket}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>{deger}</div>
      {alt && <div style={{ fontSize: 9, color: "#aaa" }}>{alt}</div>}
    </div>
  );

  return (
    <>
      {variant === "buton" ? (
        <button onClick={() => setAcik(true)} style={{
          fontSize: 11, padding: "4px 12px", borderRadius: 99, fontWeight: 600,
          border: `1px solid ${c.mid}55`, background: "transparent", color: c.mid, cursor: "pointer",
        }}>📄 Dönem Raporu</button>
      ) : (
        <Card id="bolum-rapor">
          <SectionTitle title={baslik} color={c.mid} />
          <button onClick={() => setAcik(true)} style={{
            width: "100%", padding: "11px 0", borderRadius: 12,
            border: `1.5px dashed ${c.mid}`, background: "transparent",
            color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>📄 Dönem raporu oluştur</button>
        </Card>
      )}

      {acik && (
        <Modal title={baslik} onClose={() => setAcik(false)} maxWidth={680}>
          {/* Yazdırmada yalnızca rapor görünsün */}
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #veli-raporu, #veli-raporu * { visibility: visible !important; }
              #veli-raporu {
                position: absolute !important; left: 0 !important; top: 0 !important;
                width: 100% !important; padding: 0 !important;
                max-height: none !important; overflow: visible !important;
              }
              .yazdirma-gizle { display: none !important; }
              @page { margin: 14mm; }
            }
          `}</style>

          {/* Rapor dönemi */}
          <div className="yazdirma-gizle" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 6 }}>RAPOR DÖNEMİ</div>
            <div style={{ display: "flex", gap: 5, marginBottom: 7, flexWrap: "wrap" }}>
              {HAZIR_ARALIKLAR.map(h => {
                const bit = new Date();
                const bas = new Date();
                if (h.ay) bas.setMonth(bas.getMonth() - h.ay);
                const hedef = h.ay
                  ? { baslangic: gunStr(bas), bitis: gunStr(bit) }
                  : { baslangic: "", bitis: "" };
                const secili = aralik.baslangic === hedef.baslangic && aralik.bitis === hedef.bitis;
                return (
                  <button key={h.ad} onClick={() => setAralik(hedef)} style={{
                    flex: 1, minWidth: 72, padding: "6px 0", borderRadius: 9,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: `2px solid ${secili ? c.bg : "#f0ede8"}`,
                    background: secili ? c.bg : "#fff",
                    color: secili ? "#fff" : "#888",
                  }}>{h.ad}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="date" value={aralik.baslangic}
                onChange={e => setAralik(a => ({ ...a, baslangic: e.target.value }))}
                style={{ flex: 1, padding: "7px 9px", borderRadius: 9, border: "1.5px solid #f0ede8", fontSize: 12, boxSizing: "border-box" }} />
              <span style={{ fontSize: 11, color: "#aaa" }}>–</span>
              <input type="date" value={aralik.bitis}
                onChange={e => setAralik(a => ({ ...a, bitis: e.target.value }))}
                style={{ flex: 1, padding: "7px 9px", borderRadius: 9, border: "1.5px solid #f0ede8", fontSize: 12, boxSizing: "border-box" }} />
            </div>
          </div>

          <div className="yazdirma-gizle" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => window.print()} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
              background: c.bg, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>🖨️ Yazdır / PDF olarak kaydet</button>
          </div>
          <div className="yazdirma-gizle" style={{ marginBottom: 12 }}>
            <textarea
              placeholder="Öğretmen notu (rapora eklenir, isteğe bağlı)"
              value={ogretmenNotu} onChange={e => setNot(e.target.value)}
              rows={3}
              style={{
                width: "100%", padding: "9px 11px", borderRadius: 10,
                border: "1.5px solid #f0ede8", fontSize: 12.5, boxSizing: "border-box",
                fontFamily: "inherit", resize: "vertical",
              }} />
          </div>

          {/* ---------- RAPOR ---------- */}
          <div id="veli-raporu" style={{ color: "#222" }}>
            {/* Başlık */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-end",
              borderBottom: "2px solid #222", paddingBottom: 8, marginBottom: 14,
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{studentName}</div>
                <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
                  Koçluk Platformu · Dönem Değerlendirme Raporu
                </div>
                <div style={{ fontSize: 10.5, color: "#999", marginTop: 3, fontWeight: 600 }}>
                  Dönem: {donemMetni}
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: "#777", textAlign: "right" }}>{bugun}</div>
            </div>

            {/* Genel değerlendirme */}
            {gd && bolum("GENEL DEĞERLENDİRME", (
              <div style={{
                padding: "11px 13px", borderRadius: 9,
                background: stil.bg, border: `1px solid ${stil.renk}33`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: stil.renk, marginBottom: 3 }}>
                  {stil.emoji} {gd.baslik}
                </div>
                <div style={{ fontSize: 11.5, lineHeight: 1.55, color: "#444" }}>{gd.aciklama}</div>
                {gd.ek_notlar?.length > 0 && (
                  <div style={{ marginTop: 7, paddingTop: 7, borderTop: `1px solid ${stil.renk}22` }}>
                    {gd.ek_notlar.map((n, i) => (
                      <div key={i} style={{ fontSize: 11, color: "#666", lineHeight: 1.45 }}>{n}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Çalışma özeti */}
            {analiz && bolum("ÇALIŞMA ÖZETİ", (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {kutu("Görev", `%${analiz.gorev_istatistik?.oran ?? 0}`,
                  `${analiz.gorev_istatistik?.tamamlanan ?? 0}/${analiz.gorev_istatistik?.toplam ?? 0}`)}
                {analiz.odev_istatistik?.oran != null &&
                  kutu("Ödev", `%${analiz.odev_istatistik.oran}`, `${analiz.odev_istatistik.teslim_edilen} teslim`)}
                {kutu("Ders", analiz.ders_istatistik?.tamamlanan ?? 0, "tamamlandı")}
                {analiz.haftalik_istatistik?.soru_sayisi > 0 &&
                  kutu("Bu hafta", analiz.haftalik_istatistik.soru_sayisi, "soru")}
                {analiz.gorev_istatistik?.geciken > 0 &&
                  kutu("Geciken", analiz.gorev_istatistik.geciken, "görev")}
              </div>
            ))}

            {/* Sınav gelişimi */}
            {sinav?.turler && Object.keys(sinav.turler).length > 0 && bolum("SINAV GELİŞİMİ", (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(sinav.turler).map(([tur, a]) => (
                  <div key={tur} style={{ fontSize: 11.5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                      <span>{tur} · {a.ozet.sinav_sayisi} deneme</span>
                      <span>
                        son {a.ozet.son_net ?? "—"} net
                        {a.ozet.degisim != null && (
                          <span style={{ color: a.ozet.degisim >= 0 ? "#1A6B3C" : "#A32D2D", marginLeft: 6 }}>
                            ({a.ozet.degisim > 0 ? "+" : ""}{a.ozet.degisim})
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "#888", marginTop: 2 }}>
                      en yüksek {a.ozet.en_yuksek ?? "—"} · ortalama {a.ozet.ortalama ?? "—"}
                      {a.seri?.length > 1 && ` · seyir: ${a.seri.map(p => p.net).join(" → ")}`}
                    </div>
                  </div>
                ))}
                {sinav.osym_puan && Object.keys(sinav.osym_puan).length > 0 && (
                  <div style={{
                    marginTop: 2, padding: "8px 11px", borderRadius: 8,
                    background: "#fafaf8", border: "1px solid #f0ede8",
                  }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>ÖSYM PUANI (son denemelere göre)</div>
                    {Object.entries(sinav.osym_puan).map(([alan, p]) => (
                      <div key={alan} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                        <span>{alan}{p.yerlestirme != null ? " (yerleştirme)" : ""}</span>
                        <span style={{ fontWeight: 700 }}>{p.yerlestirme ?? p.ham}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Odak konular */}
            {sinav?.odak_konular?.length > 0 && bolum("ODAKLANILACAK KONULAR", (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {sinav.odak_konular.slice(0, 6).map((o, i) => (
                  <div key={i} style={{ fontSize: 11.5 }}>
                    <span style={{ fontWeight: 700 }}>{i + 1}. {o.ders} — {o.konu}</span>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, marginLeft: 6, padding: "1px 6px", borderRadius: 99,
                      background: o.oncelik === "yuksek" ? "#FFF0F0" : "#FFF7E6",
                      color:      o.oncelik === "yuksek" ? "#A32D2D" : "#854F0B",
                    }}>{o.oncelik === "yuksek" ? "Acil" : "Orta"}</span>
                    <div style={{ fontSize: 10.5, color: "#777", marginTop: 1 }}>{o.sinyaller.join(" · ")}</div>
                  </div>
                ))}
              </div>
            ))}

            {/* Program + motivasyon */}
            {(programOran != null || s) && bolum("PROGRAM VE MOTİVASYON", (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {programOran != null && kutu("Program", `%${programOran}`, atama?.program_adi ?? "ilerleme")}
                {s && kutu("Seviye", s.seviye, `${s.xp} XP · güncel`)}
                {rozetler.length > 0 && kutu("Rozet", rozetler.length, "bu dönemde")}
              </div>
            ))}

            {rozetler.length > 0 && (
              <div style={{ fontSize: 10.5, color: "#777", marginTop: -8, marginBottom: 16 }}>
                {rozetler.slice(0, 10).map(r => rozetBilgi(r.rozet_kod).ad).join(" · ")}
                {rozetler.length > 10 && ` +${rozetler.length - 10}`}
              </div>
            )}

            {/* Öğretmen notu */}
            {ogretmenNotu.trim() && bolum("ÖĞRETMEN NOTU", (
              <div style={{
                fontSize: 11.5, lineHeight: 1.6, color: "#333", whiteSpace: "pre-wrap",
                padding: "10px 12px", borderRadius: 8, background: "#fafaf8", border: "1px solid #f0ede8",
              }}>{ogretmenNotu}</div>
            ))}

            <div style={{
              marginTop: 18, paddingTop: 8, borderTop: "1px solid #e8e4dd",
              fontSize: 9.5, color: "#aaa", textAlign: "center",
            }}>
              Bu rapor {donemMetni} dönemine ait verilerle {bugun} tarihinde oluşturulmuştur.
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
