import { useEffect, useRef, useState } from "react";
import { taramaBaslat, taramaVarMi } from "../lib/kodOkuyucu";
import { isbnCoz, isbnYaz } from "../lib/isbn";
import { RENK, BOSLUK, KOSE } from "../lib/tasarim";
import Modal from "./Modal";

// Kitap barkodunu kamerayla okuyan pencere.
//
// ── OKUNAN HER KOD KABUL EDİLMİYOR ──────────────────────────────
// Kamera bulanık karede yanlış rakam üretebiliyor. Okunan numara
// ISBN sağlamasından geçmezse tarama DURMUYOR, devam ediyor: durup
// "geçersiz" demek, kullanıcıyı elindeki sağlam kitabın barkodu
// bozukmuş gibi hissettirirdi. Sağlaması tutan ilk numarada duruyor.
//
// Sonuç yine de onaya sunuluyor — kullanıcı numarayı görüp "ekle"
// diyor. Sessizce forma yazmak, yanlış kitabı fark etmeden
// kaydetmenin yolu olurdu.
export default function BarkodTarayici({ onSecildi, onKapat }) {
  const videoRef = useRef(null);
  const durdurRef = useRef(null);
  const [hata, setHata] = useState(null);
  const [bulunan, setBulunan] = useState(null);
  const [deneme, setDeneme] = useState(0);   // kaç kod okundu ama tutmadı

  useEffect(() => {
    let iptal = false;
    (async () => {
      const durdur = await taramaBaslat(videoRef.current, {
        onHata: (m) => !iptal && setHata(m),
        onKod: (ham) => {
          const { isbn } = isbnCoz(ham);
          if (!isbn) { setDeneme(d => d + 1); return false; }  // okumaya devam
          setBulunan(isbn);
          return true;                                        // tarama bitsin
        },
      });
      if (iptal) durdur(); else durdurRef.current = durdur;
    })();

    return () => { iptal = true; durdurRef.current?.(); };
  }, []);

  const kapat = () => { durdurRef.current?.(); onKapat(); };

  return (
    <Modal title="Barkod tara" onClose={kapat} maxWidth={420}>
      {!taramaVarMi() ? (
        <div style={{
          background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 12.5,
          padding: "10px 12px", borderRadius: KOSE.s, lineHeight: 1.55,
        }}>
          Bu tarayıcı barkod taramayı desteklemiyor. iPhone'da tarama
          şu an mümkün değil; ISBN'i elle yazabilirsiniz.
        </div>
      ) : hata ? (
        <div style={{
          background: RENK.hata.zemin, color: RENK.hata.metin, fontSize: 12.5,
          padding: "10px 12px", borderRadius: KOSE.s,
        }}>{hata}</div>
      ) : bulunan ? (
        <div>
          <div style={{
            background: RENK.basari.zemin, color: RENK.basari.metin,
            padding: "12px 14px", borderRadius: KOSE.m, textAlign: "center",
          }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Okunan ISBN</div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5, marginTop: 2 }}>
              {isbnYaz(bulunan)}
            </div>
          </div>
          <div style={{ display: "flex", gap: BOSLUK.s, marginTop: BOSLUK.m }}>
            <button onClick={() => { onSecildi(bulunan); kapat(); }} style={{
              flex: 1, padding: "10px 0", borderRadius: KOSE.m, border: "none",
              background: RENK.basari.metin, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>Kullan</button>
            <button onClick={kapat} style={{
              padding: "10px 16px", borderRadius: KOSE.m, cursor: "pointer",
              border: `1.5px solid ${RENK.cizgi}`, background: RENK.kart,
              fontSize: 13, color: RENK.metinIkincil,
            }}>Vazgeç</button>
          </div>
        </div>
      ) : (
        <div>
          {/* Kamera görüntüsü; okuma karelerden yapılıyor. */}
          <video ref={videoRef} muted playsInline style={{
            width: "100%", borderRadius: KOSE.m, background: "#000",
            aspectRatio: "4 / 3", objectFit: "cover", display: "block",
          }} />
          <div style={{ fontSize: 11.5, color: RENK.metinSoluk, marginTop: BOSLUK.s, lineHeight: 1.5 }}>
            Kitabın arka kapağındaki barkodu çerçeveye alın.
            {deneme > 0 && ` ${deneme} okuma denendi, sağlama tutmadı — barkoda biraz daha yaklaşın.`}
          </div>
        </div>
      )}
    </Modal>
  );
}
