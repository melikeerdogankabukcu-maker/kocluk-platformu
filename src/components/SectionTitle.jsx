export default function SectionTitle({ title, action, onAction, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{title}</h3>
      {action && (
        <button onClick={onAction} style={{ fontSize: 11, color: color, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
          {action}
        </button>
      )}
    </div>
  );
}
