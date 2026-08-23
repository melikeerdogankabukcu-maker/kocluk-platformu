import { useState, useCallback, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Kurum yönetimi — yalnızca platform yöneticisi.
//
// Varsayılan kurgu "her koç kendi kurumu": bir koç öğretmen yapıldığında
// kendi kurumu otomatik açılıyor. Çok üyeli kurum (okul) buradan
// kuruluyor — sisteme bir okul dahil olduğunda kurumu 'okul' yapıp
// öğretmenleri o kuruma taşıyorsunuz.
const TUR_ADI = { bireysel: "Bireysel koç", okul: "Okul / kurum" };

export default function KurumYonetimi({ color: c }) {
  const [acik,     setAcik]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [kurumlar, setKurumlar] = useState([]);
  const [sayilar,  setSayilar]  = useState({});
  const [islemde,  setIslemde]  = useState(null);
  const [yeniAd,   setYeniAd]   = useState("");

  const yukle = useCallback(async () => {
    setLoading(true);
    const [{ veri: kl }, { veri: uyeler }] = await Promise.all([
      calistir(supabase.from("kurumlar").select("*").order("ad"),
        "Kurum listesi", { sessiz: true }),
      calistir(supabase.from("users").select("kurum_id"),
        "Uye sayilari", { sessiz: true }),
    ]);
    setKurumlar(kl ?? []);
    const s = {};
    (uyeler ?? []).forEach(u => { if (u.kurum_id) s[u.kurum_id] = (s[u.kurum_id] ?? 0) + 1; });
    setSayilar(s);
    setLoading(false);
  }, []);

  useEffect(() => { if (acik) yukle(); }, [acik, yukle]);

  const olustur = async () => {
    const ad = yeniAd.trim();
    if (!ad) return;
    setIslemde("yeni");
    const { hata } = await calistir(
      supabase.from("kurumlar").insert({ ad, tur: "okul" }),
      "Kurum olusturma"
    );
    setIslemde(null);
    if (hata) return;
    setYeniAd("");
    yukle();
  };

  const guncelle = async (kurum, alanlar) => {
    setIslemde(kurum.id);
    const { hata } = await calistir(
      supabase.from("kurumlar").update(alanlar).eq("id", kurum.id),
      "Kurum guncelleme"
    );
    setIslemde(null);
    if (hata) return;
    yukle();
  };

  const adDegistir = (kurum) => {
    const ad = window.prompt("Kurum adı:", kurum.ad);
    if (ad === null) return;
    if (!ad.trim() || ad.trim() === kurum.ad) return;
    guncelle(kurum, { ad: ad.trim() });
  };

  const turDegistir = (kurum) => {
    const yeni = kurum.tur === "okul" ? "bireysel" : "okul";
    if (!window.confirm(
      `"${kurum.ad}" kurumu "${TUR_ADI[yeni]}" olarak işaretlensin mi?\n\n` +
      `Bu yalnızca bir etiket — erişim kuralları değişmez. Kurumun kaç ` +
      `üyesi olacağını sizin ataması belirler.`
    )) return;
    guncelle(kurum, { tur: yeni });
  };

  const inputStil = {
    flex: 1, minWidth: 0, padding: "8px 11px", borderRadius: 9,
    border: "1.5px solid #f0ede8", fontSize: 12.5, boxSizing: "border-box",
  };

  return (
    <Card id="bolum-kurum">
      <SectionTitle title={`Kurumlar${kurumlar.length ? ` (${kurumlar.length})` : ""}`} color={c.mid} />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>🏫 Kurumları yönet</button>
      ) : loading ? (
        <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {kurumlar.map(k => (
              <div key={k.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 9, background: "#fafaf8",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#333" }}>{k.ad}</div>
                  <div style={{ fontSize: 10.5, color: "#aaa" }}>
                    {TUR_ADI[k.tur] ?? k.tur} · {sayilar[k.id] ?? 0} kişi
                  </div>
                </div>
                <button onClick={() => adDegistir(k)} disabled={islemde === k.id} style={{
                  flexShrink: 0, fontSize: 10.5, padding: "4px 10px", borderRadius: 99,
                  border: "1px solid #f0ede8", background: "#fff", color: "#888", cursor: "pointer",
                }}>Adı</button>
                <button onClick={() => turDegistir(k)} disabled={islemde === k.id} style={{
                  flexShrink: 0, fontSize: 10.5, padding: "4px 10px", borderRadius: 99,
                  border: "none", fontWeight: 600, cursor: "pointer",
                  background: k.tur === "okul" ? c.light : "#f2f2f0",
                  color:      k.tur === "okul" ? c.text  : "#777",
                }}>{k.tur === "okul" ? "Okul" : "Bireysel"}</button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <input value={yeniAd} onChange={e => setYeniAd(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") olustur(); }}
              placeholder="Yeni kurum adı (okul, dershane...)" style={inputStil} />
            <button onClick={olustur} disabled={islemde === "yeni" || !yeniAd.trim()} style={{
              padding: "8px 16px", borderRadius: 9, border: "none",
              background: yeniAd.trim() ? c.bg : "#ddd", color: "#fff",
              fontSize: 12.5, fontWeight: 700,
              cursor: yeniAd.trim() ? "pointer" : "not-allowed",
            }}>Ekle</button>
          </div>

          <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.5 }}>
            Her koç öğretmen yapıldığında kendi kurumu otomatik açılır. Buradan
            yeni bir kurum açıp <b>Kullanıcı Yönetimi</b>'nden öğretmenleri o
            kuruma taşıyarak çok öğretmenli bir okul kurabilirsiniz. Müfredatın
            gömülü kısmı her kuruma açıktır; koçların kendi yazdığı konular
            yalnızca kendi kurumlarında görünür.
          </div>

          <button onClick={() => setAcik(false)} style={{
            padding: "9px 0", borderRadius: 10, border: "1.5px solid #f0ede8",
            background: "#fff", color: "#888", fontSize: 12.5, cursor: "pointer",
          }}>Kapat</button>
        </div>
      )}
    </Card>
  );
}
