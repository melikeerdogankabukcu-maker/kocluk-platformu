export default function Card({ children, style, id }) {
  return (
    <div id={id} style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", border: "1px solid #f0ede8", ...style }}>
      {children}
    </div>
  );
}
