import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { rozetBilgi, tumRozetler } from "../lib/badges";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Kazanılan rozetler. Kazanılmayanlar da soluk gösterilir ki hedef görünsün.
// Rozetler veritabanında otomatik veriliyor; burası salt gösterim.
export default function Rozetler({ studentId, color: c, baslik = "Rozetlerim" }) {
  const [kazanilan, setKazanilan] = useState([]);
  const [etkin, setEtkin] = useState(true);
  const [hepsiniGoster, setHepsiniGoster] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    let iptal = false;
    supabase.from("badges").select("rozet_kod, kazanildi_at")
      .eq("user_id", studentId)
      .order("kazanildi_at", { ascending: false })
      .then(({ data, error }) => {
        if (iptal) return;
        if (error) { setEtkin(false); return; }
        setKazanilan(data ?? []);
      });
    return () => { iptal = true; };
  }, [studentId]);

  if (!etkin) return null;   // tablo yoksa kartı hiç gösterme

  const kazanilanKodlar = new Set(kazanilan.map(r => r.rozet_kod));
  const tumu = tumRozetler();
  const kilitli = tumu.filter(r => !kazanilanKodlar.has(r.kod));

  const kutu = (kod, kazanildiMi, tarih) => {
    const r = rozetBilgi(kod);
    return (
      <div key={kod} title={r.aciklama} style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        padding: "10px 6px", borderRadius: 12, minWidth: 78, flex: "1 1 78px",
        background: kazanildiMi ? c.light : "#fafaf8",
        border: `1px solid ${kazanildiMi ? c.mid + "44" : "#f0ede8"}`,
        opacity: kazanildiMi ? 1 : 0.55,
      }}>
        <span style={{ fontSize: 22, filter: kazanildiMi ? "none" : "grayscale(1)" }}>{r.emoji}</span>
        <span style={{
          fontSize: 10.5, fontWeight: 700, textAlign: "center", lineHeight: 1.25,
          color: kazanildiMi ? c.text : "#999",
        }}>{r.ad}</span>
        {kazanildiMi && tarih && (
          <span style={{ fontSize: 8.5, color: "#aaa" }}>
            {new Date(tarih).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    );
  };

  return (
    <Card id="bolum-rozet">
      <SectionTitle title={`${baslik} (${kazanilan.length}/${tumu.length})`} color={c.mid} />

      {kazanilan.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#aaa", textAlign: "center", padding: "6px 0 12px" }}>
          Henüz rozet yok — görev tamamladıkça, test çözdükçe kazanmaya başlayacaksın
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {kazanilan.map(r => kutu(r.rozet_kod, true, r.kazanildi_at))}
        </div>
      )}

      {kilitli.length > 0 && (
        <>
          <button onClick={() => setHepsiniGoster(v => !v)} style={{
            marginTop: 10, fontSize: 11, fontWeight: 600, cursor: "pointer",
            background: "none", border: "none", padding: 0, color: "#888",
          }}>
            {hepsiniGoster ? "▾" : "▸"} Kazanılmayı bekleyen {kilitli.length} rozet
          </button>
          {hepsiniGoster && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {kilitli.map(r => kutu(r.kod, false))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
