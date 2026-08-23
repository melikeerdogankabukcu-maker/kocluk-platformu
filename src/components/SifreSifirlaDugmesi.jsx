import { useState } from "react";
import { sifreSifirla } from "../lib/servisApi";

// Koç/yönetici için "Şifre sıfırla" düğmesi. Hem Kullanıcı Yönetimi'nde
// hem öğrenci listesinde kullanılıyor, o yüzden ayrı bileşen.
//
// Üretilen şifre EKRANDA gösteriliyor ve hiçbir yere kaydedilmiyor;
// koç kullanıcıya kendi iletiyor. Alert yerine satır içinde gösteriliyor
// çünkü kopyalanması gerekiyor — alert'ten metin seçmek zordur ve
// yanlışlıkla kapatılınca şifre geri getirilemez, sıfırlama tekrar
// yapılmak zorunda kalırdı.
export default function SifreSifirlaDugmesi({ kisi, kompakt = false }) {
  const [sifre,   setSifre]   = useState(null);
  const [hata,    setHata]    = useState("");
  const [islemde, setIslemde] = useState(false);

  const calistir = async () => {
    if (!window.confirm(
      `${kisi.full_name} için yeni bir geçici şifre üretilsin mi?\n\n` +
      `Eski şifresi ÇALIŞMAYI DURDURACAK. Yeni şifreyi ekranda görecek ` +
      `ve kendisine iletmeniz gerekecek.`
    )) return;
    setIslemde(true); setHata("");
    try {
      setSifre(await sifreSifirla(kisi.id));
    } catch (e) {
      setHata(e.message);
    }
    setIslemde(false);
  };

  if (sifre) {
    return (
      <div style={{
        background: "#E8F9F0", border: "1px solid #BCE7D0", borderRadius: 9,
        padding: "8px 10px", marginTop: 6, fontSize: 11.5, lineHeight: 1.6,
        // Esnek satır içinde kullanıldığında kendi satırına insin; yan yana
        // sıkışırsa şifre okunamaz hale gelir.
        flexBasis: "100%", width: "100%", boxSizing: "border-box",
      }}>
        <div style={{ color: "#1A6B3C", fontWeight: 700, marginBottom: 4 }}>
          Geçici şifre — {kisi.full_name}
        </div>
        <div style={{
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 16, fontWeight: 700, letterSpacing: 1,
          color: "#111", background: "#fff", padding: "6px 10px",
          borderRadius: 7, display: "inline-block", userSelect: "all",
        }}>{sifre}</div>
        <div style={{ color: "#3B7355", marginTop: 5 }}>
          Bu şifreyi kullanıcıya iletin. <b>Bu ekranı kapattığınızda bir daha
          göremezsiniz</b> — kaybederseniz yeniden sıfırlayın. Kullanıcı giriş
          yapınca kendi şifresini belirlemek zorunda kalacak.
        </div>
      </div>
    );
  }

  return (
    <>
      <button onClick={calistir} disabled={islemde} title="Geçici şifre üret" style={{
        flexShrink: 0, fontSize: kompakt ? 10 : 10.5,
        padding: kompakt ? "3px 8px" : "4px 10px", borderRadius: 99,
        border: "1px solid #f0ede8", background: "#fff", color: "#888",
        cursor: islemde ? "default" : "pointer", fontWeight: 600,
      }}>{islemde ? "..." : "🔑 Şifre"}</button>
      {hata && (
        <span style={{ fontSize: 10, color: "#A32D2D", marginLeft: 6 }}>{hata}</span>
      )}
    </>
  );
}
