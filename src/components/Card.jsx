import { useBolumIcinde } from "../lib/bolumBaglam";
import { RENK, KOSE } from "../lib/tasarim";

// Kart çerçevesi.
//
// Bir Bolum'un sekmesi olarak çiziliyorsa çerçeve ÇİZİLMİYOR: Bolum
// zaten kendi kartını çiziyor, ikisi birden iç içe iki çerçeve verirdi.
// Bileşenlerin hiçbirini değiştirmeden çalışsın diye karar burada,
// bağlamdan okunarak alınıyor.
export default function Card({ children, style, id }) {
  const icerde = useBolumIcinde();

  if (icerde) {
    return <div id={id} style={style}>{children}</div>;
  }

  return (
    <div id={id} style={{
      background: RENK.kart,
      borderRadius: KOSE.kart,
      padding: "18px 20px",
      border: `1px solid ${RENK.cizgi}`,
      ...style,
    }}>
      {children}
    </div>
  );
}
