import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { calistir } from "./lib/db";
import Auth from "./Auth";
import TopBar from "./components/TopBar";
import { servisiUyandir } from "./hooks/useAnaliz";
import { TopicsProvider } from "./lib/TopicsContext";
import StudentDashboard from "./dashboards/StudentDashboard";
import TeacherDashboard from "./dashboards/TeacherDashboard";
import ParentDashboard from "./dashboards/ParentDashboard";

async function fetchUserProfile(userId) {
  // Bu okuma sessizce basarisiz olursa rol "student"a duser ve ogretmen
  // ogrenci paneliyle karsilasir. Hatayi yutmak yerine gorunur kil.
  const { data, error } = await supabase
    .from("users")
    .select("role, full_name, onay_durumu")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("[Kullanici profili]", error);
    return null;
  }
  return data;
}

export default function App() {
  const [role, setRole] = useState(null);
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState("");
  const [onay, setOnay] = useState("onaylandi");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // Analiz servisi Render'ın ücretsiz katmanında uykuya geçiyor.
        // Kullanıcı "Akıllı Analiz"e basana kadar beklemesin diye burada,
        // panel açılırken arka planda uyandırılıyor.
        servisiUyandir();
        setUser(session.user);
        const profile = await fetchUserProfile(session.user.id);
        setRole(profile?.role ?? "student");
        setUserName(profile?.full_name ?? session.user.email);
        // Profil okunamazsa onaylı varsayılıyor: kapıyı bir okuma hatası
        // yüzünden kapatmak, mevcut kullanıcıyı haksız yere dışarıda bırakır.
        setOnay(profile?.onay_durumu ?? "onaylandi");
      }
      setLoading(false);
    });
  }, []);

  const handleLogin = async (loggedInUser) => {
    // Taze girişte getSession çalışmaz (yalnızca mount'ta); servisi burada
    // da uyandırmazsak yeni giren kullanıcı soğuk başlangıcı yiyor.
    servisiUyandir();
    setUser(loggedInUser);
    const profile = await fetchUserProfile(loggedInUser.id);
    setRole(profile?.role ?? "student");
    setUserName(profile?.full_name ?? loggedInUser.email);
    setOnay(profile?.onay_durumu ?? "onaylandi");
  };

  const handleLogout = async () => {
    await calistir(supabase.auth.signOut(), "Cikis yapma", { sessiz: true });
    setUser(null);
    setRole(null);
    setUserName("");
  };

  if (loading) return (
    <div style={{
      minHeight: "100vh", background: "#f7f4ef",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: "#0F6E56", display: "flex", alignItems: "center",
          justifyContent: "center", fontWeight: 700, fontSize: 22,
          color: "#fff", margin: "0 auto 14px",
        }}>K</div>
        <div style={{ fontSize: 14, color: "#aaa" }}>Yükleniyor...</div>
      </div>
    </div>
  );

  if (!user) return <Auth onLogin={handleLogin} />;

  // Onay kapısı: yönetici onaylayana kadar panel açılmıyor. Reddedilen de
  // aynı yerde duruyor ama farklı mesajla — hesabın ne durumda olduğunu
  // bilmeden bekleyip durmasın.
  if (onay !== "onaylandi") {
    const reddedildi = onay === "reddedildi";
    return (
      <div style={{
        minHeight: "100vh", background: "#f7f4ef",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      }}>
        <div style={{
          background: "#fff", borderRadius: 20, padding: "34px 30px",
          maxWidth: 420, width: "100%", border: "1px solid #f0ede8", textAlign: "center",
        }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>{reddedildi ? "🚫" : "⏳"}</div>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: "#111", marginBottom: 8 }}>
            {reddedildi ? "Hesabınız onaylanmadı" : "Hesabınız onay bekliyor"}
          </h2>
          <p style={{ fontSize: 13, color: "#777", lineHeight: 1.6, marginBottom: 20 }}>
            {reddedildi
              ? "Bu hesap yönetici tarafından onaylanmadı. Bir yanlışlık olduğunu düşünüyorsanız koçunuzla iletişime geçin."
              : `Merhaba ${userName}. Kaydınız alındı, yöneticinin onayından sonra panelinize erişebileceksiniz.`}
          </p>
          <button onClick={handleLogout} style={{
            padding: "10px 22px", borderRadius: 10, border: "1.5px solid #f0ede8",
            background: "#fff", color: "#888", fontSize: 13, cursor: "pointer", fontWeight: 600,
          }}>Çıkış yap</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f7f4ef",
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <TopBar role={role} userName={userName} userId={user.id} onLogout={handleLogout} />
      <TopicsProvider userId={user.id}>
        {role === "student" && <StudentDashboard userId={user.id} userName={userName} />}
        {/* Admin öğretmenin üst kümesi: aynı paneli görür */}
        {(role === "teacher" || role === "admin") && <TeacherDashboard userId={user.id} userName={userName} role={role} />}
        {role === "parent"  && <ParentDashboard  userId={user.id} userName={userName} />}
      </TopicsProvider>
    </div>
  );
}
