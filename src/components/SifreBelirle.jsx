import { useState } from "react";
import { supabase } from "../supabase";

// Koç geçici şifre atadığında kullanıcı panele geçmeden önce buradan
// geçiyor. Aksi halde koçun bildiği bir şifre süresiz geçerli kalırdı.
//
// İşaret (users.sifre_degistirmeli) ancak şifre GERÇEKTEN değiştikten
// sonra kapatılıyor. Ters sırada yapılsaydı ve şifre değişimi patlasaydı,
// kullanıcı hem eski geçici şifresiyle kalır hem de bir daha bu ekranı
// görmezdi.
export default function SifreBelirle({ userId, userName, onTamam, onCikis }) {
  const [sifre,  setSifre]  = useState("");
  const [tekrar, setTekrar] = useState("");
  const [hata,   setHata]   = useState("");
  const [islemde, setIslemde] = useState(false);

  const kaydet = async () => {
    setHata("");
    if (sifre.length < 6)   return setHata("Şifre en az 6 karakter olmalı.");
    if (sifre !== tekrar)   return setHata("İki şifre aynı değil.");

    setIslemde(true);
    const { error } = await supabase.auth.updateUser({ password: sifre });
    if (error) {
      setIslemde(false);
      return setHata(error.message);
    }

    const { error: isaretHatasi } = await supabase
      .from("users").update({ sifre_degistirmeli: false }).eq("id", userId);
    setIslemde(false);
    if (isaretHatasi) {
      // Şifre değişti ama işaret kapanmadı: kullanıcıyı içeri almıyoruz,
      // çünkü bir sonraki girişte yine burada karşılanacak ve neden
      // olduğunu anlamayacak. Tekrar denemesi yeterli.
      return setHata("Şifreniz değişti ama kayıt güncellenemedi. Lütfen tekrar deneyin.");
    }
    onTamam();
  };

  const inputStil = {
    width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14,
    border: "1.5px solid #f0ede8", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f7f4ef",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "34px 30px",
        maxWidth: 420, width: "100%", border: "1px solid #f0ede8",
      }}>
        <div style={{ fontSize: 32, marginBottom: 10, textAlign: "center" }}>🔑</div>
        <h2 style={{ fontSize: 19, fontWeight: 700, color: "#111", marginBottom: 8, textAlign: "center" }}>
          Yeni şifrenizi belirleyin
        </h2>
        <p style={{ fontSize: 13, color: "#777", lineHeight: 1.6, marginBottom: 20, textAlign: "center" }}>
          Merhaba {userName}. Hesabınıza koçunuz tarafından geçici bir şifre
          atandı. Devam etmek için kendi şifrenizi belirleyin — <b>geçici şifre
          koçunuz tarafından da biliniyor</b>.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
            Yeni şifre
          </label>
          <input type="password" value={sifre} onChange={e => setSifre(e.target.value)}
            placeholder="En az 6 karakter" style={inputStil} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
            Yeni şifre (tekrar)
          </label>
          <input type="password" value={tekrar} onChange={e => setTekrar(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") kaydet(); }}
            placeholder="••••••••" style={inputStil} />
        </div>

        {hata && (
          <div style={{
            background: "#FFF0F0", color: "#A32D2D", fontSize: 12,
            padding: "10px 14px", borderRadius: 10, marginBottom: 14, lineHeight: 1.5,
          }}>{hata}</div>
        )}

        <button onClick={kaydet} disabled={islemde} style={{
          width: "100%", padding: "12px 0", borderRadius: 12, fontSize: 14,
          fontWeight: 700, border: "none", cursor: islemde ? "default" : "pointer",
          background: "#0F6E56", color: "#fff", opacity: islemde ? 0.7 : 1,
        }}>{islemde ? "Kaydediliyor..." : "Şifremi belirle"}</button>

        <button onClick={onCikis} style={{
          width: "100%", marginTop: 10, padding: "9px 0", borderRadius: 10,
          border: "1.5px solid #f0ede8", background: "#fff", color: "#888",
          fontSize: 12.5, cursor: "pointer",
        }}>Çıkış yap</button>
      </div>
    </div>
  );
}
