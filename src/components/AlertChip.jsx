export default function AlertChip({ type, text }) {
  const map = {
    warn:    { bg: "#FFF7E6", color: "#854F0B", dot: "#EF9F27" },
    danger:  { bg: "#FFF0F0", color: "#A32D2D", dot: "#E24B4A" },
    success: { bg: "#E8F8F2", color: "#0F6E56", dot: "#1D9E75" },
  };
  const s = map[type] || map.warn;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 99,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: s.dot, flexShrink: 0 }} />
      {text}
    </span>
  );
}
