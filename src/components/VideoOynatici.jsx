import { videoCoz } from "../lib/calismaPlani";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";

// Bloktaki videoyu gösterir.
//
// YouTube ve Vimeo uygulamanın içinde oynatılıyor; öğrenci konu
// anlatımını dinlerken planından çıkmıyor. Tanınmayan adresler (bir kurs
// platformu, okulun sistemi) yeni sekmede açılıyor — uygulamanın her
// video sağlayıcısını tanıması gerekmiyor.
//
// Oynatıcı yalnızca bu bileşen çizildiğinde yükleniyor, yani öğrenci
// ▶'ye basınca. Plan açılır açılmaz her video bloğu için bir iframe
// kurmak hem sayfayı ağırlaştırır hem de hiç izlenmeyen videolar için
// üçüncü tarafa istek gönderirdi.
export default function VideoOynatici({ adres, color: c }) {
  const v = videoCoz(adres);

  if (v.tur === "youtube" || v.tur === "vimeo") {
    return (
      <div>
        {/* 16:9 kutu. padding-top oranı, iframe'in genişliğe göre
            yüksekliğini koruması için. */}
        <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: KOSE.l, overflow: "hidden", background: "#000" }}>
          <iframe
            src={v.gomme}
            title="Konu videosu"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <a href={v.adres} target="_blank" rel="noopener noreferrer" style={{
          display: "inline-block", marginTop: BOSLUK.s, fontSize: YAZI.kucuk,
          color: RENK.metinSoluk, textDecoration: "none",
        }}>↗ {v.tur === "youtube" ? "YouTube'da" : "Vimeo'da"} aç</a>
      </div>
    );
  }

  if (v.tur === "baglanti") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, lineHeight: 1.5 }}>
          Bu video <b>{v.host}</b> üzerinde. Uygulama içinde oynatılamıyor, yeni sekmede açılacak.
        </div>
        <a href={v.adres} target="_blank" rel="noopener noreferrer" style={{
          padding: "11px 0", borderRadius: KOSE.m, background: c.bg, color: "#fff",
          textAlign: "center", fontSize: YAZI.govde, fontWeight: 700, textDecoration: "none",
        }}>Videoyu aç ↗</a>
      </div>
    );
  }

  return (
    <div style={{ fontSize: YAZI.ikincil, color: RENK.hata.metin, background: RENK.hata.zemin, padding: BOSLUK.m, borderRadius: KOSE.m }}>
      Bu blokta geçerli bir video adresi yok.
    </div>
  );
}
