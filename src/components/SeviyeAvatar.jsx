import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import {
  seviyeHesapla, avatarDurumu, AVATAR_TURLERI, XP_ETIKET,
} from "../lib/gamification";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Öğrencinin seviyesi, XP'si ve büyüttüğü avatarı.
// XP veritabanında hesaplanır (ogrenci_puan RPC) — burada yalnızca gösterilir,
// böylece sayaç kayması olmaz ve öğrenci kendine puan yazamaz.
export default function SeviyeAvatar({ studentId, color: c, salt = false, baslik = "Seviyem" }) {
  const [puan, setPuan]         = useState(null);   // { xp, kirilim }
  const [avatarTur, setAvatar]  = useState("agac");
  const [etkin, setEtkin]       = useState(true);
  const [secimAcik, setSecim]   = useState(false);
  const [kirilimAcik, setKirilim] = useState(false);

  const yukle = useCallback(async () => {
    if (!studentId) return;
    const [{ data: p, error: pHata }, { data: prof }] = await Promise.all([
      supabase.rpc("ogrenci_puan", { p_user: studentId }),
      supabase.from("student_profiles").select("avatar_tur").eq("id", studentId).maybeSingle(),
    ]);
    if (pHata) { setEtkin(false); return; }
    setPuan(p);
    if (prof?.avatar_tur) setAvatar(prof.avatar_tur);
  }, [studentId]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!etkin || !puan) return null;   // fonksiyon yoksa kartı hiç gösterme

  const s = seviyeHesapla(puan.xp ?? 0);
  const a = avatarDurumu(avatarTur, s.seviye);

  const avatarSec = async (tur) => {
    setAvatar(tur);
    setSecim(false);
    const { error } = await supabase.from("student_profiles")
      .update({ avatar_tur: tur }).eq("id", studentId);
    if (error) alert("Avatar kaydedilemedi: " + error.message);
  };

  const kirilim = Object.entries(puan.kirilim ?? {})
    .filter(([, adet]) => adet > 0)
    .map(([k, adet]) => ({ k, adet, ...(XP_ETIKET[k] ?? { ad: k, puan: 0 }) }))
    .sort((x, y) => y.adet * y.puan - x.adet * x.puan);

  return (
    <Card id="bolum-seviye">
      <SectionTitle title={baslik} color={c.mid} />

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Avatar */}
        <div
          onClick={() => !salt && setSecim(v => !v)}
          title={salt ? a.asama.ad : "Avatarını değiştir"}
          style={{
            width: 68, height: 68, borderRadius: 20, flexShrink: 0,
            background: c.light, border: `2px solid ${c.mid}44`,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            cursor: salt ? "default" : "pointer",
          }}>
          <span style={{ fontSize: 30, lineHeight: 1 }}>{a.asama.emoji}</span>
          <span style={{ fontSize: 8.5, color: c.text, fontWeight: 700, marginTop: 2 }}>
            {a.asama.ad}
          </span>
        </div>

        {/* Seviye + XP çubuğu */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>
              Seviye {s.seviye}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{s.xp} XP</span>
          </div>

          <div style={{ height: 8, borderRadius: 99, background: "#f0ede8", overflow: "hidden", marginTop: 7 }}>
            <div style={{
              width: `${s.ilerleme}%`, height: "100%", borderRadius: 99,
              background: c.mid, transition: "width .6s ease",
            }} />
          </div>

          <div style={{ fontSize: 10.5, color: "#999", marginTop: 4 }}>
            Seviye {s.seviye + 1} için {s.kalan} XP daha
            {a.sonrakiEvrim && (
              <> · <span style={{ color: c.text, fontWeight: 600 }}>
                Seviye {a.sonrakiEvrim}'de evrilecek
              </span></>
            )}
            {a.sonAsama && <> · <span style={{ color: c.text, fontWeight: 600 }}>son aşama 🎉</span></>}
          </div>
        </div>
      </div>

      {/* Avatar seçimi */}
      {secimAcik && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "#fafaf8", border: "1px solid #f0ede8" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#888", marginBottom: 8 }}>
            AVATARINI SEÇ <span style={{ fontWeight: 500 }}>· ilerlemen korunur, yalnızca görünüm değişir</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {Object.entries(AVATAR_TURLERI).map(([kod, t]) => {
              const secili = kod === avatarTur;
              const mevcut = t.asamalar[a.asamaIndeks];
              return (
                <div key={kod} onClick={() => avatarSec(kod)} style={{
                  flex: 1, padding: "9px 6px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                  border: `2px solid ${secili ? c.bg : "#f0ede8"}`,
                  background: secili ? c.light : "#fff",
                }}>
                  <div style={{ fontSize: 22 }}>{mevcut.emoji}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#333", marginTop: 2 }}>{t.ad}</div>
                  <div style={{ fontSize: 9, color: "#aaa", marginTop: 1 }}>{t.aciklama}</div>
                </div>
              );
            })}
          </div>
          {/* Seçili türün evrim yolu */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 10 }}>
            {a.tur.asamalar.map((as, i) => (
              <span key={i} style={{
                fontSize: i === a.asamaIndeks ? 19 : 14,
                opacity: i <= a.asamaIndeks ? 1 : 0.3,
                filter: i <= a.asamaIndeks ? "none" : "grayscale(1)",
              }} title={`${as.ad} · Seviye ${i * 2 + 1}+`}>{as.emoji}</span>
            ))}
          </div>
        </div>
      )}

      {/* XP kırılımı */}
      {kirilim.length > 0 && (
        <>
          <button onClick={() => setKirilim(v => !v)} style={{
            marginTop: 10, fontSize: 11, fontWeight: 600, cursor: "pointer",
            background: "none", border: "none", padding: 0, color: "#888",
          }}>
            {kirilimAcik ? "▾" : "▸"} XP nereden geldi?
          </button>
          {kirilimAcik && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 7 }}>
              {kirilim.map(x => (
                <div key={x.k} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  fontSize: 11.5, padding: "4px 8px", borderRadius: 7, background: "#fafaf8",
                }}>
                  <span style={{ color: "#555" }}>{x.ad} <span style={{ color: "#aaa" }}>×{x.adet}</span></span>
                  <span style={{ color: c.text, fontWeight: 700 }}>+{x.adet * x.puan} XP</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
