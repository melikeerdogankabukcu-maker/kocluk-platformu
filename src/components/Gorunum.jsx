import { useState } from "react";
import { PALETLER } from "../lib/theme";
import { AVATARLAR } from "../lib/avatarlar";
import { useTercih } from "../lib/TercihContext";
import { RENK, BOSLUK, KOSE } from "../lib/tasarim";
import Modal from "./Modal";

// Görünüm penceresi: renk teması + hazır avatar seçimi.
//
// Üst bardan açılıyor, çünkü her rolde var ve hiçbir panele ait değil.
// Panellerin içine konsaydı üç yere üç kez yazılması gerekirdi.
//
// Seçim ANINDA uygulanıyor — "kaydet" düğmesi yok. Renk seçmek geri
// alınabilir ve sonucu gözle görülüyor; araya onay adımı koymak işi
// kendisinden uzun hale getirirdi.
export default function Gorunum({ rol, ad, onKapat }) {
  const { tercih, kaydet, palet } = useTercih(rol);
  const [hata, setHata] = useState(null);

  const sec = async (yeni) => {
    const { hata: h } = await kaydet(yeni);
    setHata(h ? "Seçim kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin." : null);
  };

  const basHarf = (ad ?? "").trim().split(/\s+/).filter(Boolean)
    .map(w => w[0]).join("").slice(0, 2).toLocaleUpperCase("tr");

  const baslik = (metin) => (
    <div style={{
      fontSize: 11, fontWeight: 700, color: RENK.metinIkincil,
      letterSpacing: 0.4, marginBottom: BOSLUK.s,
    }}>{metin}</div>
  );

  return (
    <Modal title="Görünüm" onClose={onKapat} maxWidth={420}>
      {hata && (
        <div style={{
          background: RENK.hata.zemin, color: RENK.hata.metin, fontSize: 12,
          padding: "8px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m,
        }}>{hata}</div>
      )}

      <div style={{ marginBottom: BOSLUK.xl }}>
        {baslik("RENK")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: BOSLUK.s }}>
          {Object.entries(PALETLER).map(([kod, p]) => {
            const secili = tercih.tema === kod;
            return (
              <button key={kod} onClick={() => sec({ tema: kod })} style={{
                padding: BOSLUK.s, borderRadius: KOSE.m, cursor: "pointer",
                border: `2px solid ${secili ? p.bg : RENK.cizgi}`,
                background: secili ? p.light : RENK.kart,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}>
                {/* Üç ton birden gösteriliyor: seçenek, tek bir
                    noktadan değil panelin bütününden anlaşılıyor. */}
                <div style={{ display: "flex", gap: 3 }}>
                  {[p.bg, p.mid, p.light].map(renk => (
                    <span key={renk} style={{
                      width: 16, height: 16, borderRadius: 5, background: renk,
                      border: `1px solid ${RENK.cizgi}`,
                    }} />
                  ))}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: secili ? 700 : 500,
                  color: secili ? p.text : RENK.metinSoluk,
                }}>{p.ad}</span>
              </button>
            );
          })}
        </div>
        {tercih.tema && (
          <button onClick={() => sec({ tema: null })} style={{
            marginTop: BOSLUK.s, background: "none", border: "none", cursor: "pointer",
            fontSize: 11, color: RENK.metinSoluk, textDecoration: "underline", padding: 0,
          }}>Varsayılana dön</button>
        )}
      </div>

      <div>
        {baslik("AVATAR")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: BOSLUK.s }}>
          {/* Baş harfler de bir seçenek: avatarı olanın geri dönebilmesi
              için ayrı bir "kaldır" düğmesi gerekmesin. */}
          <button onClick={() => sec({ avatar: null })} title="Baş harfler" style={{
            width: 46, height: 46, borderRadius: KOSE.m, cursor: "pointer",
            border: `2px solid ${!tercih.avatar ? palet.bg : RENK.cizgi}`,
            background: !tercih.avatar ? palet.light : RENK.kart,
            fontSize: 14, fontWeight: 800, color: RENK.metinIkincil,
          }}>{basHarf || "?"}</button>

          {AVATARLAR.map(a => {
            const secili = tercih.avatar === a.kod;
            return (
              <button key={a.kod} onClick={() => sec({ avatar: a.kod })} title={a.ad} style={{
                width: 46, height: 46, borderRadius: KOSE.m, cursor: "pointer",
                border: `2px solid ${secili ? palet.bg : RENK.cizgi}`,
                background: secili ? palet.light : RENK.kart,
                fontSize: 22, lineHeight: 1,
              }}>{a.simge}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 10.5, color: RENK.metinCokSoluk, marginTop: BOSLUK.s, lineHeight: 1.5 }}>
          Profil fotoğrafı yüklediyseniz o öncelikli görünür. Avatar,
          fotoğraf paylaşmak istemeyenler için.
        </div>
      </div>
    </Modal>
  );
}
