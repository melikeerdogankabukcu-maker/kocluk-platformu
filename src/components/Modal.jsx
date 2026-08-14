// Basit modal (açılır pencere). Arka plana veya ✕'e tıklayınca kapanır.
export default function Modal({ title, onClose, children, maxWidth = 560 }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "24px 16px", overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 18, padding: "20px 22px",
        width: "100%", maxWidth, border: "1px solid #f0ede8",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: "1px solid #f0ede8",
            background: "#fff", color: "#888", fontSize: 15, cursor: "pointer",
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
