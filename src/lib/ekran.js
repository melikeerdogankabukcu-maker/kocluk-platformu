import { useState, useEffect } from "react";

// Ekran genişliğini dinler.
//
// Stiller satır içi yazıldığı için @media kullanılamıyor; genişliğe göre
// değişmesi gereken yerler bu kancayı okuyor. PanelDuzen aynı işi kendi
// içinde yapıyordu, ikinci bir yer gerekince ortaklaştırıldı.
//
// İlk değer window'dan okunuyor: false'la başlayıp effect'te düzeltmek
// dar ekranda bir kare boyunca geniş yerleşimi çizerdi.
export function useDarEkran(esik = 560) {
  const [dar, setDar] = useState(
    typeof window !== "undefined" && window.innerWidth < esik
  );

  useEffect(() => {
    const olc = () => setDar(window.innerWidth < esik);
    olc();
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, [esik]);

  return dar;
}
