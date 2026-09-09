import { useState } from "react";
import { imzaliUrl } from "../lib/depo";

// Depodaki bir dosyaya açılan bağlantı.
//
// ── ADRES TIKLAMA ANINDA ÜRETİLİYOR ─────────────────────────────
// Kova kapalı olduğu için dosyalar yalnızca imzalı, süreli bir adresle
// açılıyor. Sayfadaki her dosya için önceden imza üretmek, kimsenin
// açmayacağı onlarca dosya için istek atmak demekti; imzanın ömrü de
// kullanıcı tıklayana kadar boşa akardı.
//
// ── AÇILAN BOŞ SEKME ŞART ───────────────────────────────────────
// window.open ÖNCE, imza sonra. Ters sırada yapsaydık — önce imzayı
// bekleyip sonra pencere açsaydık — tarayıcı o açılışı kullanıcı
// hareketine bağlayamaz ve engellenmiş açılır pencere sayardı. Bu
// yüzden boş sekme tıklamayla aynı anda açılıyor, adresi sonra
// dolduruluyor.
export default function GuvenliBaglanti({ url, children, style, baslik }) {
  const [bekliyor, setBekliyor] = useState(false);

  const ac = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (bekliyor) return;

    const sekme = window.open("", "_blank", "noopener,noreferrer");
    setBekliyor(true);
    try {
      const imzali = await imzaliUrl(url);
      if (!imzali) {
        sekme?.close();
        alert("Dosya açılamadı. Bu dosyayı görme yetkiniz olmayabilir ya da dosya silinmiş olabilir.");
        return;
      }
      if (sekme) sekme.location.href = imzali;
      else window.location.href = imzali;   // açılır pencere engellendiyse
    } finally {
      setBekliyor(false);
    }
  };

  return (
    <a href="#" onClick={ac} title={baslik}
      style={{ cursor: bekliyor ? "progress" : "pointer", ...style }}>
      {bekliyor ? "…" : children}
    </a>
  );
}
