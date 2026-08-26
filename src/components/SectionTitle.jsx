import { useBolumIcinde } from "../lib/bolumBaglam";
import { RENK, BOSLUK, YAZI } from "../lib/tasarim";

// Kart başlığı.
//
// Bir Bolum'un sekmesi içindeyse KÜÇÜK ve SOLUK çiziliyor: sekmenin adı
// zaten başlığı söylüyor, aynı boyutta ikinci bir başlık iki katmanlı
// bir hiyerarşi izlenimi verirdi. Tamamen gizlemedik çünkü başlıkların
// çoğu sayaç taşıyor — "Program Kütüphanesi (7)" gibi — ve o sayı
// sekme adında yok.
export default function SectionTitle({ title, action, onAction, color }) {
  const icerde = useBolumIcinde();

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: icerde ? BOSLUK.s : 14,
    }}>
      <h3 style={{
        margin: 0,
        fontSize: icerde ? YAZI.kucuk : YAZI.vurgu,
        fontWeight: icerde ? 600 : 700,
        color: icerde ? RENK.metinCokSoluk : RENK.metinBaslik,
        letterSpacing: icerde ? 0.3 : 0,
        textTransform: icerde ? "uppercase" : "none",
      }}>{title}</h3>

      {action && (
        <button onClick={onAction} style={{
          fontSize: YAZI.kucuk, color, background: "none",
          border: "none", cursor: "pointer", fontWeight: 600,
        }}>{action}</button>
      )}
    </div>
  );
}
