export default function ProgressBar({ pct, color, label, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>{label}</span>
        <span style={{ fontSize: 12, color: "#888" }}>{sub}</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "#f0ede8", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}
