import { useState } from "react";
import { useGruplar } from "../hooks/useGruplar";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

const RENKLER = ["#5B8DEF", "#E0A526", "#9B59B6", "#1A6B3C", "#E24B4A", "#4A5B73"];

// Öğretmenin öğrencilerini sınıf/gruba ayırdığı ekran.
// Gruplar toplu görev ve program atamasında kullanılır.
export default function GrupYonetimi({ userId, students, color: c, onDegisti }) {
  const { gruplar, etkin, grupEkle, grupSil, uyeEkle, uyeCikar } = useGruplar(userId);
  const [acik, setAcik]         = useState(false);
  const [acikGrup, setAcikGrup] = useState(null);
  const [islemde, setIslemde]   = useState(false);
  const [yeni, setYeni] = useState({ ad: "", aciklama: "", renk: RENKLER[0] });

  if (!etkin) return null;   // tablo yoksa kartı hiç gösterme

  const adBul = (id) => students.find(s => s.id === id)?.full_name ?? "—";

  const sarmala = async (fn) => {
    setIslemde(true);
    const { error } = await fn();
    setIslemde(false);
    if (error) alert("İşlem başarısız: " + error.message);
    else onDegisti?.();
  };

  const ekle = async () => {
    if (!yeni.ad.trim()) return;
    await sarmala(() => grupEkle(yeni.ad, yeni.aciklama, yeni.renk));
    setYeni({ ad: "", aciklama: "", renk: RENKLER[0] });
  };

  const sil = async (g) => {
    if (!window.confirm(`"${g.ad}" grubu silinsin mi?\n\nÖğrenciler ve verileri silinmez, yalnızca grup kalkar.`)) return;
    await sarmala(() => grupSil(g.id));
  };

  const inputStyle = {
    padding: "8px 11px", borderRadius: 9, border: "1.5px solid #f0ede8",
    fontSize: 12.5, boxSizing: "border-box",
  };

  return (
    <Card id="bolum-grup">
      <SectionTitle title={`Gruplar${gruplar.length ? ` (${gruplar.length})` : ""}`} color={c.mid} />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Sınıf / grup düzenle</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Mevcut gruplar */}
          {gruplar.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#aaa", textAlign: "center", padding: "8px 0" }}>
              Henüz grup yok — aşağıdan oluşturun
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {gruplar.map(g => {
                const grupAcik = acikGrup === g.id;
                const disaridakiler = students.filter(s => !g.uyeler.includes(s.id));
                return (
                  <div key={g.id} style={{
                    borderRadius: 10, overflow: "hidden",
                    border: `1px solid ${grupAcik ? g.renk + "66" : "#f0ede8"}`,
                  }}>
                    <div onClick={() => setAcikGrup(grupAcik ? null : g.id)} style={{
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "9px 11px", cursor: "pointer",
                      background: grupAcik ? g.renk + "11" : "#fafaf8",
                    }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 99, flexShrink: 0, background: g.renk,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#222" }}>{g.ad}</div>
                        <div style={{ fontSize: 10.5, color: "#999", marginTop: 1 }}>
                          {g.uyeler.length} öğrenci{g.aciklama ? ` · ${g.aciklama}` : ""}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); sil(g); }} disabled={islemde} style={{
                        fontSize: 10.5, padding: "3px 9px", borderRadius: 99, border: "none",
                        background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600, flexShrink: 0,
                      }}>Sil</button>
                      <span style={{ fontSize: 10, color: g.renk, fontWeight: 700 }}>{grupAcik ? "▾" : "▸"}</span>
                    </div>

                    {grupAcik && (
                      <div style={{ padding: "8px 11px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {g.uyeler.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {g.uyeler.map(sid => (
                              <span key={sid} style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                fontSize: 11, padding: "3px 5px 3px 9px", borderRadius: 99,
                                background: g.renk + "18", color: "#333", fontWeight: 600,
                              }}>
                                {adBul(sid)}
                                <button onClick={() => sarmala(() => uyeCikar(g.id, sid))} disabled={islemde}
                                  title="Gruptan çıkar" style={{
                                    border: "none", background: "none", cursor: "pointer",
                                    color: "#999", fontSize: 12, padding: "0 2px", lineHeight: 1,
                                  }}>✕</button>
                              </span>
                            ))}
                          </div>
                        )}
                        {disaridakiler.length > 0 ? (
                          <select value="" onChange={e => e.target.value && sarmala(() => uyeEkle(g.id, e.target.value))}
                            style={{ ...inputStyle, color: "#888" }}>
                            <option value="">+ Öğrenci ekle...</option>
                            {disaridakiler.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                          </select>
                        ) : (
                          <div style={{ fontSize: 10.5, color: "#bbb" }}>Tüm öğrenciler bu grupta</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Yeni grup */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>YENİ GRUP</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input placeholder="Grup adı (ör. 12-A Sayısal)" value={yeni.ad}
                onChange={e => setYeni(y => ({ ...y, ad: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") ekle(); }}
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={ekle} disabled={islemde || !yeni.ad.trim()} style={{
                padding: "8px 16px", borderRadius: 9, border: "none",
                background: yeni.ad.trim() ? c.bg : "#ddd", color: "#fff",
                fontSize: 12.5, fontWeight: 700,
                cursor: yeni.ad.trim() ? "pointer" : "not-allowed",
              }}>Oluştur</button>
            </div>
            <input placeholder="Açıklama (isteğe bağlı)" value={yeni.aciklama}
              onChange={e => setYeni(y => ({ ...y, aciklama: e.target.value }))}
              style={inputStyle} />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10.5, color: "#888" }}>Renk:</span>
              {RENKLER.map(r => (
                <button key={r} onClick={() => setYeni(y => ({ ...y, renk: r }))} style={{
                  width: 22, height: 22, borderRadius: 99, cursor: "pointer", background: r,
                  border: yeni.renk === r ? "3px solid #222" : "1px solid #f0ede8",
                }} />
              ))}
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: "#aaa", lineHeight: 1.5 }}>
            Gruplara yalnızca onaylı öğrencileriniz eklenebilir. Görev ve program atarken
            tek tek seçmek yerine grubu seçerek toplu atama yapabilirsiniz.
          </div>

          <button onClick={() => { setAcik(false); setAcikGrup(null); }} style={{
            padding: "9px 0", borderRadius: 10, border: "1.5px solid #f0ede8",
            background: "#fff", color: "#888", fontSize: 12.5, cursor: "pointer",
          }}>Kapat</button>
        </div>
      )}
    </Card>
  );
}
