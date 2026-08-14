export default function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #f0ede8",
      borderRadius: 14, padding: "16px 20px", flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
