import { COLORS } from "../lib/theme";
import BildirimZili from "./BildirimZili";

export default function TopBar({ role, userName, userId, onLogout }) {
  const labels = { student: "Öğrenci", teacher: "Öğretmen", parent: "Veli" };
  const color = COLORS[role];
  return (
    <div style={{
      background: color.bg, padding: "0 24px", display: "flex",
      alignItems: "center", justifyContent: "space-between",
      height: 56, position: "sticky", top: 0, zIndex: 100,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(255,255,255,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 14, color: "#fff",
        }}>K</div>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 15, letterSpacing: "-0.3px" }}>
          Koçluk Platformu
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <BildirimZili userId={userId} rol={role} />
        <span style={{
          fontSize: 12, color: "rgba(255,255,255,0.85)",
          background: "rgba(255,255,255,0.15)",
          padding: "4px 10px", borderRadius: 20, fontWeight: 500,
        }}>
          {labels[role]} · {userName}
        </span>
        <button onClick={onLogout} style={{
          padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
          border: "1.5px solid rgba(255,255,255,0.4)", cursor: "pointer",
          background: "transparent", color: "#fff", transition: "all .15s",
        }}>Çıkış</button>
      </div>
    </div>
  );
}
