import { haftaninSozu } from "../lib/haftaninSozu";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";

// Haftanın sözü — ince bir şerit.
//
// Kart değil bilerek: motivasyon cümlesi panelin asıl işiyle aynı görsel
// ağırlıkta durursa gürültü olur. Kendi çerçevesi olan alçak bir şerit,
// göz gezerken okunuyor ama sıranın önüne geçmiyor.
//
// Söz hafta boyunca sabit (bkz. lib/haftaninSozu.js); yenilemede
// değişmiyor.
export default function HaftaninSozu({ color: c }) {
  const s = haftaninSozu();
  if (!s) return null;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: BOSLUK.m,
      padding: `${BOSLUK.m}px ${BOSLUK.l}px`,
      background: c.light, borderRadius: KOSE.kart,
      border: `1px solid ${c.mid}22`,
      borderLeft: `4px solid ${c.mid}`,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }} aria-hidden="true">✨</span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: YAZI.mikro, fontWeight: 700, letterSpacing: 0.4,
          color: c.text, opacity: 0.75, marginBottom: 3,
        }}>HAFTANIN SÖZÜ</div>
        <div style={{
          fontSize: YAZI.govde, color: RENK.metin, lineHeight: 1.55, fontStyle: "italic",
        }}>“{s.metin}”</div>
        {s.kim && (
          <div style={{ fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginTop: 4 }}>— {s.kim}</div>
        )}
      </div>
    </div>
  );
}
