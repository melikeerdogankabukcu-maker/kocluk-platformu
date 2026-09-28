import { useState } from "react";
import { ilerleme, sureMetni } from "../lib/calismaPlani";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Haftalık planı sıfırlama.
//
// "Sıfırla" iki ayrı isteği anlatıyor ve ikisi tek düğmeye sığmıyor:
//
//  1) İŞARETLERİ TEMİZLE — plan doğru, hafta yeniden yaşanacak. Bloklar
//     duruyor; yapıldı işaretleri, bildirilen süreler ve koç onayları
//     kalkıyor. Yanlışlıkla toplu onaylayan koçun geri dönüşü de bu.
//  2) PLANI SİL — plan baştan kurulacak (ör. yanlış program aktarıldı).
//     Haftanın blokları tamamen siliniyor, hafta boş plana dönüyor.
//
// Ne YOK OLMUYOR: çözülen testler. Sonuçları testlerde ve analizde
// duruyor, yalnızca bloğa bağı kopuyor. Sayacın ÖLÇTÜĞÜ dakikalar da
// silinmiyor — o süre gerçekten çalışıldı; sıfırlanan şey beyan ve onay.
export default function PlanSifirla({ bloklar, haftaMetni, color: c, onTemizle, onSil, onKapat }) {
  const [islemde, setIslemde] = useState(null);   // "temizle" | "sil"
  const ozet = ilerleme(bloklar);
  const onayli = bloklar.filter(b => b.koc_onayi === "onaylandi").length;

  const calistir = async (tur, fn, soru) => {
    if (!window.confirm(soru)) return;
    setIslemde(tur);
    const { hata } = (await fn()) ?? {};
    setIslemde(null);
    if (!hata) onKapat();
  };

  const dugme = (arka, renk, kenar) => ({
    padding: "11px 0", borderRadius: KOSE.m, cursor: islemde ? "default" : "pointer",
    border: kenar ? `1.5px solid ${kenar}` : "none",
    background: arka, color: renk, fontSize: YAZI.govde, fontWeight: 700,
    opacity: islemde ? 0.7 : 1, width: "100%",
  });

  return (
    <Modal title={`Planı sıfırla · ${haftaMetni}`} onClose={onKapat} maxWidth={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>

        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, lineHeight: 1.55 }}>
          Bu haftada <b>{ozet.toplam}</b> blok var; {ozet.yapilan} tanesi yapıldı
          {onayli > 0 && `, ${onayli} tanesi onaylandı`}
          {ozet.calisilanDk > 0 && ` · bildirilen ${sureMetni(ozet.calisilanDk)}`}.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.xs }}>
          <button disabled={!!islemde} style={dugme("#fff", c.text, c.mid)}
            onClick={() => calistir("temizle", onTemizle,
              `${ozet.toplam} bloğun işaretleri temizlensin mi?\n\n` +
              "Bloklar duruyor; yapıldı işaretleri, bildirilen süreler ve koç onayları kalkıyor.\n" +
              "Çözülen testler silinmiyor.")}>
            {islemde === "temizle" ? "Temizleniyor..." : "↺ İşaretleri temizle"}
          </button>
          <div style={{ fontSize: YAZI.kucuk, color: RENK.metinSilik, lineHeight: 1.5, marginBottom: BOSLUK.s }}>
            Bloklar kalır, hafta baştan yaşanır. Yanlışlıkla verilen onayları da geri alır.
          </div>

          <button disabled={!!islemde} style={dugme(RENK.hata.zemin, RENK.hata.metin)}
            onClick={() => calistir("sil", onSil,
              `${haftaMetni} haftasının planı silinsin mi?\n\n` +
              `${ozet.toplam} blok kalıcı olarak siliniyor` +
              (onayli > 0 ? ` (${onayli} onaylanmış blok dahil)` : "") + ".\n" +
              "Çözülen testler silinmiyor, yalnızca bloğa bağı kopuyor.\n\n" +
              "Bu işlem geri alınamaz.")}>
            {islemde === "sil" ? "Siliniyor..." : "🗑 Planı sil (bloklarla birlikte)"}
          </button>
          <div style={{ fontSize: YAZI.kucuk, color: RENK.metinSilik, lineHeight: 1.5 }}>
            Hafta boşalır; sonra son plandan kalan işleri aktararak ya da programdan
            aktararak yeniden kurabilirsiniz.
          </div>
        </div>

        <button onClick={onKapat} disabled={!!islemde} style={{
          padding: "9px 0", borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`,
          background: "#fff", color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
        }}>Vazgeç</button>
      </div>
    </Modal>
  );
}
