import { useState, useRef, useEffect } from "react";
import { useNotifications } from "../hooks/useNotifications";
import { bildirimHedefi, bolumeGit } from "../lib/bildirimHedef";

const TUR_IKON = {
  gorev: "📋", odev: "📎", ders: "🗓️", sinav: "📊",
  odeme: "💳", baglanti: "🔗", test: "🧪", rozet: "🏅",
};

// Üst bardaki bildirim zili: okunmamış sayacı + açılır liste.
// Bildirimler canlı gelir (Supabase Realtime).
export default function BildirimZili({ userId, rol }) {
  const { bildirimler, okunmamis, etkin, okunduIsaretle, hepsiniOkunduYap, sil } =
    useNotifications(userId);
  const [acik, setAcik] = useState(false);
  const sarmalRef = useRef(null);

  // Dışarı tıklayınca kapan
  useEffect(() => {
    if (!acik) return;
    const disaTikla = (e) => {
      if (sarmalRef.current && !sarmalRef.current.contains(e.target)) setAcik(false);
    };
    document.addEventListener("mousedown", disaTikla);
    return () => document.removeEventListener("mousedown", disaTikla);
  }, [acik]);

  if (!etkin) return null;   // tablo yoksa zili hiç gösterme

  const zamanFarki = (t) => {
    const dk = Math.floor((Date.now() - new Date(t).getTime()) / 60000);
    if (dk < 1)   return "az önce";
    if (dk < 60)  return `${dk} dk önce`;
    const sa = Math.floor(dk / 60);
    if (sa < 24)  return `${sa} sa önce`;
    const g = Math.floor(sa / 24);
    if (g < 7)    return `${g} gün önce`;
    return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  };

  return (
    <div ref={sarmalRef} style={{ position: "relative" }}>
      <button onClick={() => setAcik(a => !a)} title="Bildirimler" style={{
        position: "relative", width: 34, height: 34, borderRadius: 20,
        border: "1.5px solid rgba(255,255,255,0.4)", background: "transparent",
        color: "#fff", fontSize: 15, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        🔔
        {okunmamis > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, minWidth: 17, height: 17,
            borderRadius: 99, background: "#E24B4A", color: "#fff",
            fontSize: 10, fontWeight: 700, display: "flex",
            alignItems: "center", justifyContent: "center", padding: "0 4px",
          }}>{okunmamis > 9 ? "9+" : okunmamis}</span>
        )}
      </button>

      {acik && (
        <div style={{
          position: "absolute", right: 0, top: 42, width: 320, maxWidth: "90vw",
          background: "#fff", borderRadius: 14, border: "1px solid #f0ede8",
          boxShadow: "0 8px 28px rgba(0,0,0,0.14)", zIndex: 200, overflow: "hidden",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "11px 14px", borderBottom: "1px solid #f5f2ee",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>Bildirimler</span>
            {okunmamis > 0 && (
              <button onClick={hepsiniOkunduYap} style={{
                fontSize: 11, background: "none", border: "none", cursor: "pointer",
                color: "#0F6E56", fontWeight: 600, padding: 0,
              }}>Tümünü okundu yap</button>
            )}
          </div>

          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {bildirimler.length === 0 ? (
              <div style={{ padding: "26px 14px", textAlign: "center", color: "#bbb", fontSize: 12.5 }}>
                Henüz bildirim yok
              </div>
            ) : bildirimler.map(b => (
              <div key={b.id}
                onClick={() => {
                  if (!b.okundu) okunduIsaretle(b.id);
                  // İlgili bölüme kaydır; hedef yoksa panel yine de kapanır
                  const gidildi = bolumeGit(bildirimHedefi(b.tur, rol));
                  if (gidildi) setAcik(false);
                }}
                style={{
                  display: "flex", gap: 9, padding: "10px 14px",
                  borderBottom: "1px solid #f8f6f3",
                  background: b.okundu ? "#fff" : "#F7FBF9",
                  cursor: "pointer",
                }}>
                <span style={{ fontSize: 15, lineHeight: 1.3, flexShrink: 0 }}>
                  {TUR_IKON[b.tur] ?? "🔔"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, color: "#222", lineHeight: 1.35,
                    fontWeight: b.okundu ? 500 : 700,
                  }}>{b.baslik}</div>
                  {b.mesaj && (
                    <div style={{ fontSize: 11.5, color: "#777", marginTop: 2, lineHeight: 1.4 }}>
                      {b.mesaj}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>
                    {zamanFarki(b.created_at)}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); sil(b.id); }} title="Sil" style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "#ccc", fontSize: 13, padding: 0, flexShrink: 0, alignSelf: "flex-start",
                }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
