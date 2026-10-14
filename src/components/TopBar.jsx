import { useState } from "react";
import { useTercih } from "../lib/TercihContext";
import { avatarSimgesi } from "../lib/avatarlar";
import { useDarEkran } from "../lib/ekran";
import BildirimZili from "./BildirimZili";
import Gorunum from "./Gorunum";

// Üst bar.
//
// ── DAR EKRANDA TAŞMA ───────────────────────────────────────────
// Bar tek satırlık bir flex; içinde küçülmeyen üç şey vardı: marka
// yazısı, "Öğretmen · Ad Soyad" rozeti ve Çıkış. Toplamları telefon
// genişliğini aşınca bar sağa doğru taşıyor, taşan kısımda kalan
// bildirim zili ekranın dışında kalıyordu — açılan panel de onunla
// birlikte dışarı çıkıyor ve okunamıyordu.
//
// Çözüm iki parçalı: dar ekranda marka yazısı gizleniyor (logo kalıyor),
// ad rozeti kısalıp taşarsa üç noktayla kesiliyor. Zilin kendi paneli
// de artık pencereye sabitleniyor (BildirimZili).
export default function TopBar({ role, userName, userId, onLogout }) {
  const labels = { student: "Öğrenci", teacher: "Öğretmen", parent: "Veli", admin: "Yönetici" };
  // Renk kullanıcının seçiminden; seçim yoksa rolün varsayılanı.
  const { palet: color, tercih } = useTercih(role);
  const [gorunum, setGorunum] = useState(false);
  const simge = avatarSimgesi(tercih.avatar);
  const dar = useDarEkran(560);

  // Dar ekranda yalnızca ilk ad: tam ad rozeti tek başına barın yarısını
  // yiyor ve asıl işlevsel öğeleri dışarı itiyordu.
  const gosterilenAd = dar ? (userName ?? "").trim().split(" ")[0] : userName;

  return (
    <div style={{
      background: color.bg, padding: dar ? "0 12px" : "0 24px", display: "flex",
      alignItems: "center", justifyContent: "space-between",
      height: 56, position: "sticky", top: 0, zIndex: 100,
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: "rgba(255,255,255,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 14, color: "#fff",
        }}>K</div>
        {!dar && (
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15, letterSpacing: "-0.3px" }}>
            Koçluk Platformu
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: dar ? 6 : 10, minWidth: 0 }}>
        <BildirimZili userId={userId} rol={role} />
        {/* Görünüm: her rolde var ve hiçbir panele ait değil, o yüzden
            barda duruyor. Avatar seçilmişse düğme onu gösteriyor —
            seçimin nerede değiştirileceği böylece kendiliğinden belli. */}
        <button onClick={() => setGorunum(true)} title="Görünüm" aria-label="Görünüm" style={{
          width: 30, height: 30, borderRadius: 20, flexShrink: 0,
          border: "1.5px solid rgba(255,255,255,0.4)", cursor: "pointer",
          background: "transparent", color: "#fff", fontSize: simge ? 15 : 13,
          display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          padding: 0,
        }}>{simge ?? "🎨"}</button>
        <span style={{
          fontSize: 12, color: "rgba(255,255,255,0.85)",
          background: "rgba(255,255,255,0.15)",
          padding: "4px 10px", borderRadius: 20, fontWeight: 500,
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {dar ? gosterilenAd : `${labels[role]} · ${gosterilenAd}`}
        </span>
        <button onClick={onLogout} style={{
          padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0,
          border: "1.5px solid rgba(255,255,255,0.4)", cursor: "pointer",
          background: "transparent", color: "#fff", transition: "all .15s",
        }}>Çıkış</button>
      </div>

      {gorunum && <Gorunum rol={role} ad={userName} onKapat={() => setGorunum(false)} />}
    </div>
  );
}
