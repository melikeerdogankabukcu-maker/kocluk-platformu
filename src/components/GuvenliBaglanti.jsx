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
// hareketine bağlayamaz ve engellenmiş açılır pencere sayardı.
//
// ── "noopener" BAYRAĞI VERİLMİYOR ───────────────────────────────
// window.open'a noopener verildiğinde tarayıcı sekmeyi açıyor ama
// PENCERE REFERANSI DÖNDÜRMÜYOR (null). O zaman elimizde adresini
// dolduracağımız bir sekme kalmıyordu: boş bir sekme açılıyor,
// uygulamanın açık olduğu sayfa da dosyaya gidiyordu. Bağlantı
// koparma işini bayrakla değil, sekme açıldıktan sonra
// `opener = null` diyerek yapıyoruz — aynı korumayı verir, referansı
// kaybettirmez.
//
// ── ENGELLENİRSE SAYFA KAÇIRILMIYOR ─────────────────────────────
// Açılır pencere engelliyse referans yine null geliyor. O durumda
// mevcut sekmeyi dosyaya yönlendirmek, kullanıcının açık işini
// kaybettirir. Onun yerine hazır adres yerinde bir bağlantı olarak
// gösteriliyor; ikinci tık dosyayı açıyor.
export default function GuvenliBaglanti({ url, children, style, baslik }) {
  const [bekliyor, setBekliyor] = useState(false);
  const [hazirUrl, setHazirUrl] = useState(null);

  const ac = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (bekliyor) return;

    const sekme = window.open("", "_blank");
    setBekliyor(true);
    try {
      const imzali = await imzaliUrl(url);
      if (!imzali) {
        sekme?.close();
        alert("Dosya açılamadı. Bu dosyayı görme yetkiniz olmayabilir ya da dosya silinmiş olabilir.");
        return;
      }
      if (sekme) {
        sekme.opener = null;
        // replace: yeni sekmenin geçmişinde about:blank kalmasın,
        // geri düğmesi boş sayfaya takılmasın.
        sekme.location.replace(imzali);
      } else {
        setHazirUrl(imzali);
      }
    } finally {
      setBekliyor(false);
    }
  };

  if (hazirUrl) {
    return (
      <a href={hazirUrl} target="_blank" rel="noopener noreferrer" title={baslik}
        onClick={e => e.stopPropagation()} style={style}>
        {children}
      </a>
    );
  }

  return (
    <a href="#" onClick={ac} title={baslik}
      style={{ cursor: bekliyor ? "progress" : "pointer", ...style }}>
      {bekliyor ? "…" : children}
    </a>
  );
}
