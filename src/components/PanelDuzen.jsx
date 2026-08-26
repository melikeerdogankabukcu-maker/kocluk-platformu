import { useState, useEffect } from "react";
import { BOSLUK, IKI_BLOK_ESIGI } from "../lib/tasarim";

// Panel yerleşimi: geniş ekranda İKİ BLOK, dar ekranda tek sütun.
//
// Paneller tek sütun hâlinde çok uzuyordu; geniş ekranda sağdaki boşluk
// boşa gidiyor, kullanıcı ise aradığını bulmak için kaydırıyordu.
//
// ── CSS GRID DEĞİL, İKİ AYRI SÜTUN ──────────────────────────────
// Grid ile tek bir listeyi iki sütuna bölseydik hangi kartın nereye
// düşeceğini yükseklikler belirlerdi ve her veri değişiminde sıra
// oynardı. Burada hangi bölümün hangi blokta olduğu ÇAĞIRAN tarafından
// belirleniyor: "asıl iş solda, destek sağda" kararı kod okunurken de
// görünüyor.
//
// ── ÖLÇÜ JS'TEN, MEDIA QUERY'DEN DEĞİL ──────────────────────────
// Stiller satır içi olduğu için @media kullanılamıyor. Genişlik
// dinlenip iki yerleşimden biri seçiliyor.
export default function PanelDuzen({ ana, yan }) {
  const [genis, setGenis] = useState(
    typeof window !== "undefined" && window.innerWidth >= IKI_BLOK_ESIGI
  );

  useEffect(() => {
    const olc = () => setGenis(window.innerWidth >= IKI_BLOK_ESIGI);
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, []);

  const sutun = { display: "flex", flexDirection: "column", gap: BOSLUK.l, minWidth: 0 };

  if (!genis) {
    // Dar ekran: tek sütun. Asıl iş üstte, destek altta.
    return (
      <div style={{ ...sutun, padding: BOSLUK.l, maxWidth: 720, margin: "0 auto" }}>
        {ana}
        {yan}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      // Asıl blok daha geniş: takvim ve öğrenci listeleri orada.
      gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
      gap: BOSLUK.l,
      padding: BOSLUK.xl,
      maxWidth: 1440,
      margin: "0 auto",
      alignItems: "start",
    }}>
      <div style={sutun}>{ana}</div>
      <div style={sutun}>{yan}</div>
    </div>
  );
}
