import { useState, useEffect, useRef } from "react";
import { useMesajlar } from "../hooks/useMesajlar";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Mesajlaşma ekranı: solda kişiler, seçilince yazışma açılır.
//
// kisiler: [{ id, full_name, etiket? }] — kimin kiminle yazışabileceği
// veritabanında RLS ile sınırlı (mesajlasabilir_mi); buradaki liste
// yalnızca ARAYÜZ kolaylığı. Listede olmayan birine yazılmak istense
// bile insert politikası reddeder.
export default function Mesajlar({ userId, kisiler = [], color: c, baslik = "Mesajlar" }) {
  const { sohbetler, okunmamisSayisi, toplamOkunmamis, etkin, loading,
          gonder, okunduIsaretle, sil } = useMesajlar(userId);
  const [acik, setAcik]     = useState(false);
  const [secili, setSecili] = useState(null);
  const [metin, setMetin]   = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const sonRef = useRef(null);

  const konusma = secili ? (sohbetler[secili] ?? []) : [];

  // Sohbet açılınca ve yeni mesaj gelince en alta in
  useEffect(() => {
    if (secili) sonRef.current?.scrollIntoView({ block: "nearest" });
  }, [secili, konusma.length]);

  // Sohbet açıkken gelen mesajlar okundu sayılsın
  useEffect(() => {
    if (secili && acik) okunduIsaretle(secili);
    // okunduIsaretle her render'da yeniden üretiliyor; bağımlılığa
    // eklenirse döngü olur. Kasıtlı olarak dışarıda bırakıldı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secili, acik, konusma.length]);

  if (!etkin) return null;   // tablo yoksa kartı hiç gösterme

  const adBul = (id) => kisiler.find(k => k.id === id)?.full_name ?? "Bilinmeyen kişi";

  const gonderVeTemizle = async () => {
    if (!metin.trim() || !secili) return;
    setGonderiliyor(true);
    const { hata } = await gonder(secili, metin);
    setGonderiliyor(false);
    if (!hata) setMetin("");
  };

  const saat = (t) => {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? "" :
      d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // Kişileri son mesaja göre sırala: konuşulan yukarıda kalsın
  const sirali = [...kisiler].sort((a, b) => {
    const sonA = (sohbetler[a.id] ?? []).slice(-1)[0]?.created_at ?? "";
    const sonB = (sohbetler[b.id] ?? []).slice(-1)[0]?.created_at ?? "";
    return sonB.localeCompare(sonA);
  });

  return (
    <Card id="bolum-mesaj">
      <SectionTitle
        title={`${baslik}${toplamOkunmamis > 0 ? ` (${toplamOkunmamis})` : ""}`}
        color={c.mid}
      />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          💬 Mesajlar{toplamOkunmamis > 0 ? ` · ${toplamOkunmamis} okunmamış` : ""}
        </button>
      ) : loading ? (
        <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : kisiler.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center", lineHeight: 1.6 }}>
          Henüz mesajlaşabileceğiniz kimse yok.<br />
          <span style={{ fontSize: 11.5 }}>
            Mesajlaşma yalnızca onaylı bağlantılarla açılır.
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Kişi listesi */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sirali.map(k => {
              const okunmamis = okunmamisSayisi(k.id);
              const bu = secili === k.id;
              return (
                <button key={k.id} onClick={() => setSecili(bu ? null : k.id)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 11px", borderRadius: 99, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${bu ? c.bg : "#f0ede8"}`,
                  background: bu ? c.bg : "#fff",
                  color: bu ? "#fff" : "#555", cursor: "pointer",
                }}>
                  {k.full_name}
                  {k.etiket && (
                    <span style={{ fontSize: 9.5, opacity: 0.75, fontWeight: 500 }}>{k.etiket}</span>
                  )}
                  {okunmamis > 0 && (
                    <span style={{
                      minWidth: 16, height: 16, borderRadius: 99, fontSize: 10, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: bu ? "#fff" : "#E24B4A", color: bu ? c.bg : "#fff", padding: "0 4px",
                    }}>{okunmamis}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Yazışma */}
          {secili && (
            <>
              <div style={{
                display: "flex", flexDirection: "column", gap: 6,
                maxHeight: 320, overflowY: "auto",
                border: "1px solid #f0ede8", borderRadius: 10, padding: 9,
                background: "#fcfcfb",
              }}>
                {konusma.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "14px 0" }}>
                    {adBul(secili)} ile ilk mesajı siz yazın
                  </div>
                ) : konusma.map(m => {
                  const benim = m.sender_id === userId;
                  return (
                    <div key={m.id} style={{
                      alignSelf: benim ? "flex-end" : "flex-start",
                      maxWidth: "82%", minWidth: 0,
                    }}>
                      <div style={{
                        padding: "7px 11px", borderRadius: 12,
                        borderBottomRightRadius: benim ? 3 : 12,
                        borderBottomLeftRadius:  benim ? 12 : 3,
                        background: benim ? c.bg : "#fff",
                        color: benim ? "#fff" : "#222",
                        border: benim ? "none" : "1px solid #f0ede8",
                        fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>{m.content}</div>
                      <div style={{
                        fontSize: 9.5, color: "#aaa", marginTop: 2,
                        textAlign: benim ? "right" : "left",
                        display: "flex", gap: 6, justifyContent: benim ? "flex-end" : "flex-start",
                      }}>
                        <span>{saat(m.created_at)}</span>
                        {benim && <span>{m.is_read ? "okundu" : "iletildi"}</span>}
                        {benim && (
                          <button onClick={() => sil(m.id)} title="Sil" style={{
                            background: "none", border: "none", padding: 0,
                            color: "#C98A8A", fontSize: 10, cursor: "pointer",
                          }}>sil</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={sonRef} />
              </div>

              {/* Yazma alanı */}
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                <textarea
                  value={metin}
                  onChange={e => setMetin(e.target.value)}
                  onKeyDown={e => {
                    // Enter gönderir, Shift+Enter alt satıra geçer
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); gonderVeTemizle(); }
                  }}
                  placeholder={`${adBul(secili)} kişisine yazın...`}
                  rows={2}
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 10, fontSize: 12.5,
                    border: "1.5px solid #f0ede8", outline: "none", resize: "vertical",
                    boxSizing: "border-box", fontFamily: "inherit",
                  }} />
                <button onClick={gonderVeTemizle} disabled={gonderiliyor || !metin.trim()} style={{
                  padding: "10px 16px", borderRadius: 10, border: "none", flexShrink: 0,
                  background: metin.trim() ? c.bg : "#ddd", color: "#fff",
                  fontSize: 12.5, fontWeight: 700,
                  cursor: metin.trim() ? "pointer" : "not-allowed",
                }}>{gonderiliyor ? "..." : "Gönder"}</button>
              </div>
            </>
          )}

          <button onClick={() => { setAcik(false); setSecili(null); }} style={{
            padding: "9px 0", borderRadius: 10, border: "1.5px solid #f0ede8",
            background: "#fff", color: "#888", fontSize: 12.5, cursor: "pointer",
          }}>Kapat</button>
        </div>
      )}
    </Card>
  );
}
