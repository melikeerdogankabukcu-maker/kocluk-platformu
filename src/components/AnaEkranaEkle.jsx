import { useState } from "react";
import { useTercih } from "../lib/TercihContext";

// iPhone'da "ana ekrana ekle" yönlendirmesi.
//
// ── NEDEN GEREKLİ: SERVİS ÇALIŞANI iOS'TA SİLİNİYOR ─────────────
// 5 Kasım'da servis çalışanına "ağ düşerse önbellekteki uygulamayı
// ver" davranışı eklendi. Ama iOS Safari'de o önbellek kalıcı değil:
//
//   • siteye 7 gün girilmezse Safari bütün site verisini SİLİYOR
//     (servis çalışanı ve önbellek dâhil),
//   • bağlantı WhatsApp'ın kendi içindeki tarayıcıda açılırsa servis
//     çalışanı HİÇ çalışmıyor.
//
// Yani haftada bir açan bir öğrenci her seferinde "önbellek yok"
// durumunda olabiliyor ve bağlantı bir saniye koptuğunda yine
// tarayıcının ham hata sayfasını görüyor.
//
// Uygulama ana ekrana eklenince iOS bu veriyi silmiyor ve uygulama
// kendi penceresinde açılıyor — WhatsApp'tan geçmiyor. Önbellek
// kalıcı olunca 5 Kasım'daki düzeltme gerçekten işe yarıyor.
//
// ── NEDEN OTOMATİK DEĞİL ────────────────────────────────────────
// iOS'ta "kur" düğmesi YOK; Android'deki beforeinstallprompt iOS'ta
// bulunmuyor. Kullanıcının Paylaş menüsünden kendisi eklemesi
// gerekiyor, o yüzden tek yol anlatmak.
//
// ── RAHATSIZ ETMİYOR ────────────────────────────────────────────
// Yalnız iPhone/iPad Safari'de ve yalnız uygulama ana ekrandan
// açılmamışsa çıkıyor. Kapatılınca bir daha gösterilmiyor (cihazda
// işaretleniyor); depolama kapalıysa kapatma yine çalışıyor, sadece
// sonraki açılışta tekrar görünüyor.

const ANAHTAR = "ustad.anaekran.kapatildi";

// Safari'de mi, iOS'ta mı, zaten kurulu mu?
export function iosSafariMi() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ kendini Mac gibi tanıtıyor; dokunma noktası sayısı ayırıyor.
  const ios = /iPhone|iPod|iPad/.test(ua)
    || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  if (!ios) return false;
  // iOS'ta her tarayıcı WebKit; CriOS/FxiOS gibi kabuklarda Paylaş
  // menüsündeki adım farklı, o yüzden yalnız Safari'ye anlatılıyor.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return false;
  return true;
}

export function anaEkrandanMi() {
  if (typeof window === "undefined") return false;
  return window.navigator.standalone === true
    || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

export default function AnaEkranaEkle() {
  // Kancalar erken dönüşten ÖNCE: koşullu kanca çağrısı React'i bozar.
  const { palet: c } = useTercih();
  const [kapali, setKapali] = useState(() => {
    try { return localStorage.getItem(ANAHTAR) === "1"; } catch { return false; }
  });

  if (kapali || !iosSafariMi() || anaEkrandanMi()) return null;

  const kapat = () => {
    setKapali(true);
    try { localStorage.setItem(ANAHTAR, "1"); } catch { /* yok sayılıyor */ }
  };

  return (
    <div style={{
      margin: "10px 12px 0", padding: "11px 13px", borderRadius: 12,
      background: c?.light ?? "#EAF4F0", color: c?.text ?? "#0F6E56",
      display: "flex", alignItems: "flex-start", gap: 10,
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }} aria-hidden="true">📲</span>
      <div style={{ flex: "1 1 180px", minWidth: 180, fontSize: 12.5, lineHeight: 1.55 }}>
        <b>Uygulamayı ana ekranına ekle.</b> Bağlantın bir an koptuğunda
        sayfa yine açılır. Safari'de alttaki <b>Paylaş</b> simgesine
        (kutudan çıkan ok) dokun, listeden <b>Ana Ekrana Ekle</b>'yi seç.
      </div>
      <button onClick={kapat} aria-label="Kapat" style={{
        flexShrink: 0, background: "none", border: "none", cursor: "pointer",
        color: "inherit", opacity: 0.6, fontSize: 15, padding: "0 2px", lineHeight: 1,
      }}>✕</button>
    </div>
  );
}
