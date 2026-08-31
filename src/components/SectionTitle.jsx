import { useBolumIcinde } from "../lib/bolumBaglam";
import { RENK, BOSLUK, YAZI } from "../lib/tasarim";

// Kart başlığı.
//
// Bir Bolum'un sekmesi içindeyse KÜÇÜK ve SOLUK çiziliyor: sekmenin adı
// zaten başlığı söylüyor, aynı boyutta ikinci bir başlık iki katmanlı
// bir hiyerarşi izlenimi verirdi. Tamamen gizlemedik çünkü başlıkların
// çoğu sayaç taşıyor — "Program Kütüphanesi (7)" gibi — ve o sayı
// sekme adında yok.
// ── KATLAMA ─────────────────────────────────────────────────────
// onToggle verilirse başlık aynı zamanda aç/kapa düğmesi oluyor: sağında
// ▾/▸ oku çıkıyor ve başlığın tamamı tıklanabiliyor.
//
// Önceden her kart kendi içinde iki ayrı düğmeyle açılıp kapanıyordu:
// kapalıyken kart genişliğinde kesikli bir "+ Aç", açıkken en altta bir
// "Kapat". İkisi de kartın içeriğiyle ilgisi olmayan, yalnızca yer kaplayan
// öğelerdi; kapatmak için ayrıca kartın sonuna kadar kaydırmak gerekiyordu.
// Kontrol artık zaten var olan başlığın üstünde.
export default function SectionTitle({ title, action, onAction, color, acik, onToggle }) {
  const icerde = useBolumIcinde();
  const katlanir = typeof onToggle === "function";

  const baslik = (
    <h3 style={{
      margin: 0,
      fontSize: icerde ? YAZI.kucuk : YAZI.vurgu,
      fontWeight: icerde ? 600 : 700,
      color: icerde ? RENK.metinCokSoluk : RENK.metinBaslik,
      letterSpacing: icerde ? 0.3 : 0,
      textTransform: icerde ? "uppercase" : "none",
    }}>{title}</h3>
  );

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: BOSLUK.s,
      // Kapalı kartta başlık tek başına kalıyor; alttaki boşluk gereksiz.
      marginBottom: katlanir && !acik ? 0 : (icerde ? BOSLUK.s : 14),
    }}>
      {katlanir ? (
        <button onClick={onToggle} aria-expanded={!!acik} style={{
          display: "flex", alignItems: "center", gap: BOSLUK.s,
          flex: 1, minWidth: 0, padding: 0, textAlign: "left",
          background: "none", border: "none", cursor: "pointer",
        }}>
          <span style={{
            fontSize: YAZI.kucuk, color: color ?? RENK.metinCokSoluk,
            fontWeight: 700, flexShrink: 0, width: 12,
          }}>{acik ? "▾" : "▸"}</span>
          {baslik}
        </button>
      ) : baslik}

      {action && (
        <button onClick={onAction} style={{
          fontSize: YAZI.kucuk, color, background: "none", flexShrink: 0,
          border: "none", cursor: "pointer", fontWeight: 600,
        }}>{action}</button>
      )}
    </div>
  );
}
