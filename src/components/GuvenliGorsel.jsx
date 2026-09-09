import { useState, useEffect } from "react";
import { imzaliUrl } from "../lib/depo";

// Depodaki bir görseli gösterir.
//
// Bağlantının aksine görsel TIKLAMAYI BEKLEYEMEZ: ekranda görünmesi
// için adresin baştan hazır olması gerekiyor. Bu yüzden imza bileşen
// yüklenirken üretiliyor.
//
// Yetki yoksa ya da dosya silinmişse `yedek` çiziliyor — kırık görsel
// simgesi göstermek, dosyası hiç olmayan durumdan daha kötü görünürdü.
export default function GuvenliGorsel({ url, alt, style, yedek = null }) {
  const [adres, setAdres] = useState(null);
  const [bozuk, setBozuk] = useState(false);

  useEffect(() => {
    let gecerli = true;
    setAdres(null);
    setBozuk(false);
    if (!url) { setBozuk(true); return; }

    imzaliUrl(url).then(imzali => {
      if (!gecerli) return;
      if (imzali) setAdres(imzali);
      else setBozuk(true);
    });

    // Bileşen sökülünce geç gelen yanıt state yazmasın
    return () => { gecerli = false; };
  }, [url]);

  if (bozuk) return yedek;
  if (!adres) return yedek;          // imza gelene kadar da yedek duruyor

  return <img src={adres} alt={alt} style={style} onError={() => setBozuk(true)} />;
}
