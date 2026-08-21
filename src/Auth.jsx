import { useState } from "react";
import { supabase } from "./supabase";

// Supabase hataları İngilizce ve teknik geliyor ("email rate limit exceeded").
// Kullanıcının ekranında ne yapması gerektiği yazsın diye çevriliyor.
//
// Önce error.code'a bakılıyor: metin Supabase sürümüyle değişebilir, kod
// değişmez. Kod tanınmazsa metne düşülüyor, o da tutmazsa ham mesaj
// gösteriliyor — bilinmeyen bir hatayı yutup "bir şeyler ters gitti"
// demek, sorunu bulmayı imkânsız kılardı.
const HATA_KODU = {
  over_email_send_rate_limit:
    "Çok fazla e-posta gönderildi. Lütfen bir saat sonra tekrar deneyin.",
  over_request_rate_limit:
    "Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.",
  invalid_credentials: "E-posta veya şifre hatalı.",
  email_not_confirmed:
    "E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın.",
  user_already_exists:
    "Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.",
  email_exists: "Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.",
  weak_password: "Şifre çok zayıf. En az 6 karakter kullanın.",
  validation_failed: "Bilgileri kontrol edin: e-posta veya şifre geçersiz.",
  signup_disabled: "Yeni kayıtlar şu anda kapalı.",
};

const HATA_METNI = [
  [/email rate limit exceeded/i,
    "Çok fazla e-posta gönderildi. Lütfen bir saat sonra tekrar deneyin."],
  // "...after 47 seconds" — kaç saniye kaldığı korunuyor, kullanıcı boşuna denemesin
  [/only request this after (\d+) seconds?/i,
    (m) => `Güvenlik gereği ${m[1]} saniye sonra tekrar deneyebilirsiniz.`],
  [/rate limit|too many requests/i,
    "Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin."],
  [/invalid login credentials/i, "E-posta veya şifre hatalı."],
  [/email not confirmed/i,
    "E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki bağlantıya tıklayın."],
  [/already registered|already exists/i,
    "Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin."],
  [/password should be at least (\d+)/i,
    (m) => `Şifre en az ${m[1]} karakter olmalı.`],
  [/unable to validate email|invalid format/i, "E-posta adresi geçersiz."],
  [/requires a valid password|password.*required/i, "Şifre girin."],
];

function hataMesaji(error) {
  if (!error) return "";
  if (error.code && HATA_KODU[error.code]) return HATA_KODU[error.code];
  const metin = error.message ?? "";
  for (const [kalip, karsilik] of HATA_METNI) {
    const esles = metin.match(kalip);
    if (esles) return typeof karsilik === "function" ? karsilik(esles) : karsilik;
  }
  return metin;
}

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("student");
  // Veli kaydında çocuğun e-postası. Zorunlu DEĞİL: velinin e-postayı
  // bilmediği durumda kayıt tıkanmasın. Bağı zaten yönetici onay
  // ekranındaki seçimi kuruyor, bu alan orayı ön-dolduruyor.
  const [ogrenciEmail, setOgrenciEmail] = useState("");
  const [error, setError] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [loading, setLoading] = useState(false);

  const COLORS = {
    student: "#0F6E56",
    teacher: "#534AB7",
    parent: "#854F0B",
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    setBilgi("");

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(hataMesaji(error));
      else onLogin(data.user);
    } else {
      // Ad ve rol metadata olarak gidiyor; profil satırını auth.users
      // üzerindeki tetikleyici oluşturuyor (kayit_akisi_migration.sql).
      // Buradan users tablosuna insert YAPILMIYOR: e-posta onayı açıkken
      // signUp oturum döndürmediği için o insert anon olarak çalışır ve
      // RLS tarafından reddedilirdi.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role,
            // Tetikleyici yalnızca veli kaydında okuyor
            ogrenci_email: role === "parent" ? ogrenciEmail.trim() : "",
          },
        },
      });

      if (error) {
        setError(hataMesaji(error));
      } else if (!data.session) {
        // Onay bekleniyor — kullanıcı henüz giriş yapmış değil.
        setBilgi(
          `${email} adresine bir doğrulama bağlantısı gönderdik. ` +
          `Bağlantıya tıkladıktan sonra giriş yapabilirsiniz.` +
          (role === "teacher"
            ? " Öğretmen yetkisi için yöneticinin onayı gerekiyor."
            : "")
        );
        setIsLogin(true);
        setPassword("");
      } else {
        onLogin(data.user);
      }
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f7f4ef",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "36px 32px",
        width: "100%", maxWidth: 400, border: "1px solid #f0ede8",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: COLORS[role], display: "flex",
            alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 18, color: "#fff",
          }}>K</div>
          <span style={{ fontWeight: 700, fontSize: 18, color: "#111" }}>Koçluk Platformu</span>
        </div>

        {/* Başlık */}
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 6 }}>
          {isLogin ? "Giriş Yap" : "Hesap Oluştur"}
        </h2>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
          {isLogin ? "Hesabına giriş yap" : "Yeni hesap oluştur"}
        </p>

        {/* Rol Seçimi */}
        {!isLogin && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 8 }}>
              Rol
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: "student", label: "Öğrenci" },
                { value: "teacher", label: "Öğretmen" },
                { value: "parent", label: "Veli" },
              ].map(r => (
                <button key={r.value} onClick={() => setRole(r.value)} style={{
                  flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${role === r.value ? COLORS[r.value] : "#f0ede8"}`,
                  background: role === r.value ? COLORS[r.value] : "#fff",
                  color: role === r.value ? "#fff" : "#888", cursor: "pointer",
                }}>{r.label}</button>
              ))}
            </div>
            {/* Öğretmen seçimi SESSİZCE yok sayılıyordu: güvenlik gereği hesap
                öğrenci olarak açılıyor ve yönetici onayı gerekiyor. Seçenek
                duruyor ki talep kayda geçsin, ama ne olacağı artık yazıyor. */}
            {role === "teacher" && (
              <div style={{
                fontSize: 11, color: "#854F0B", background: "#FFF7E6",
                padding: "8px 11px", borderRadius: 9, marginTop: 8, lineHeight: 1.5,
              }}>
                Öğretmen hesapları <b>yönetici onayıyla</b> açılır. Kaydınız önce
                öğrenci olarak oluşturulur; yönetici onayladıktan sonra öğretmen
                paneline geçersiniz.
              </div>
            )}

            {/* Veli, çocuğunu kayıt anında bildiriyor. Yönetici onaylarken
                bu e-postanın hangi öğrenciye denk geldiğini AD olarak
                görüyor, böylece yanlış adres onaydan önce yakalanıyor. */}
            {role === "parent" && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
                  Çocuğunuzun e-posta adresi
                  <span style={{ color: "#aaa", fontWeight: 400 }}> (biliyorsanız)</span>
                </label>
                <input
                  type="email" value={ogrenciEmail}
                  onChange={e => setOgrenciEmail(e.target.value)}
                  placeholder="ogrenci@example.com"
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14,
                    border: "1.5px solid #f0ede8", outline: "none", boxSizing: "border-box",
                  }}
                />
                <div style={{
                  fontSize: 11, color: "#854F0B", background: "#FFF7E6",
                  padding: "8px 11px", borderRadius: 9, marginTop: 8, lineHeight: 1.5,
                }}>
                  Çocuğunuzun platformdaki hesabının e-postasını yazın. Yönetici
                  kaydınızı onayladığında hesabınız <b>doğrudan çocuğunuza bağlanır</b>.
                  Bilmiyorsanız boş bırakabilirsiniz — bağlantıyı yönetici kurar.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ad Soyad */}
        {!isLogin && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
              Ad Soyad
            </label>
            <input
              type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Adınızı girin"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14,
                border: "1.5px solid #f0ede8", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
            E-posta
          </label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14,
              border: "1.5px solid #f0ede8", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Şifre */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
            Şifre
          </label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 14,
              border: "1.5px solid #f0ede8", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Hata mesajı */}
        {error && (
          <div style={{
            background: "#FFF0F0", color: "#A32D2D", fontSize: 12,
            padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          }}>{error}</div>
        )}

        {/* E-posta onayı bekleniyor */}
        {bilgi && (
          <div style={{
            background: "#EFF7F2", color: "#0F6E56", fontSize: 12,
            padding: "10px 14px", borderRadius: 10, marginBottom: 16,
            lineHeight: 1.5,
          }}>{bilgi}</div>
        )}

        {/* Buton */}
        <button onClick={handleSubmit} disabled={loading} style={{
          width: "100%", padding: "12px 0", borderRadius: 12, fontSize: 14,
          fontWeight: 700, border: "none", cursor: "pointer",
          background: COLORS[role], color: "#fff",
          opacity: loading ? 0.7 : 1,
        }}>
          {loading ? "Yükleniyor..." : isLogin ? "Giriş Yap" : "Kayıt Ol"}
        </button>

        {/* Geçiş */}
        <p style={{ textAlign: "center", fontSize: 13, color: "#888", marginTop: 20 }}>
          {isLogin ? "Hesabın yok mu?" : "Zaten hesabın var mı?"}
          <button onClick={() => setIsLogin(!isLogin)} style={{
            background: "none", border: "none", color: COLORS[role],
            fontWeight: 600, cursor: "pointer", marginLeft: 6, fontSize: 13,
          }}>
            {isLogin ? "Kayıt Ol" : "Giriş Yap"}
          </button>
        </p>
      </div>
    </div>
  );
}