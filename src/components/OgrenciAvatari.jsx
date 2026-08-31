// Öğrenci avatarı: fotoğraf varsa fotoğraf, yoksa baş harfler.
//
// Üç yerde aynı daire çiziliyordu (öğrencinin hero'su, profil kartı, koçun
// öğrenci listesi) ve fotoğraf eklenince üçünün de aynı davranması
// gerekiyor. Tek yerde tutuluyor ki biri baş harflerde kalmasın.
//
// Fotoğraf yüklenemezse (dosya silinmiş, ağ yok) sessizce baş harflere
// düşüyor: kırık görsel simgesi göstermek, fotoğrafı hiç olmayan
// öğrencininkinden daha kötü görünürdü.
import { useState } from "react";

export const basHarfler = (ad = "") =>
  ad.trim().split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toLocaleUpperCase("tr");

export default function OgrenciAvatari({
  ad, fotoUrl, boyut = 36, kose = 10,
  zemin = "#eee", yazi = "#555", yaziBoyut,
}) {
  const [bozuk, setBozuk] = useState(false);
  const goster = fotoUrl && !bozuk;

  return (
    <div style={{
      width: boyut, height: boyut, borderRadius: kose, flexShrink: 0,
      background: zemin, overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {goster ? (
        <img src={fotoUrl} alt={ad ?? "Profil fotoğrafı"} onError={() => setBozuk(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span style={{
          fontSize: yaziBoyut ?? Math.round(boyut * 0.34),
          fontWeight: 800, color: yazi, letterSpacing: 0.5,
        }}>{basHarfler(ad)}</span>
      )}
    </div>
  );
}
