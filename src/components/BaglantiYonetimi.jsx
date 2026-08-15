import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Öğretmen ↔ öğrenci bağlarını yönetir. Aynı bileşen iki panelde de kullanılır;
// rol yalnızca "karşı tarafın" kim olduğunu belirler.
// Bağı iki taraf da teklif edebilir, karşı taraf onaylar (ders planlamayla aynı mantık).
export default function BaglantiYonetimi({ userId, rol, color: c, onDegisti }) {
  const ogretmenMiyim = rol === "teacher";
  const benimAlan     = ogretmenMiyim ? "teacher_id" : "student_id";
  const karsiAlan     = ogretmenMiyim ? "student_id" : "teacher_id";
  const karsiRol      = ogretmenMiyim ? "student" : "teacher";
  const karsiEtiket   = ogretmenMiyim ? "Öğrenci" : "Öğretmen";
  const baslik        = ogretmenMiyim ? "Öğrencilerim" : "Öğretmenlerim";

  const [acik, setAcik]       = useState(false);
  const [baglar, setBaglar]   = useState([]);   // teacher_students satırları
  const [kisiler, setKisiler] = useState({});   // id -> {full_name, email}
  const [adaylar, setAdaylar] = useState([]);   // teklif gönderilebilecek kişiler
  const [secilen, setSecilen] = useState("");
  const [islemde, setIslemde] = useState(false);

  const yukle = useCallback(async () => {
    const { data: satirlar, error } = await supabase
      .from("teacher_students").select("*").eq(benimAlan, userId);
    if (error) { setBaglar([]); return; }
    setBaglar(satirlar ?? []);

    // Karşı taraftaki herkesin adı (aday listesi + görünen ad için)
    const { data: kisilerData, error: kisiHatasi } = await supabase
      .from("users").select("id, full_name, email").eq("role", karsiRol);
    if (kisiHatasi) console.error("[Aday kisi listesi]", kisiHatasi);
    const harita = {};
    (kisilerData ?? []).forEach(k => { harita[k.id] = k; });
    setKisiler(harita);

    const mevcut = new Set((satirlar ?? []).map(b => b[karsiAlan]));
    setAdaylar((kisilerData ?? []).filter(k => !mevcut.has(k.id)));
  }, [userId, benimAlan, karsiAlan, karsiRol]);

  useEffect(() => { if (acik) yukle(); }, [acik, yukle]);

  const tazele = async () => { await yukle(); onDegisti?.(); };

  const teklifGonder = async () => {
    if (!secilen) return;
    setIslemde(true);
    const { error } = await supabase.from("teacher_students").insert({
      [benimAlan]: userId, [karsiAlan]: secilen,
      created_by: userId, durum: "beklemede",
    });
    setIslemde(false);
    if (error) { alert("Teklif gönderilemedi: " + error.message); return; }
    setSecilen("");
    tazele();
  };

  const yanitla = async (bag, onay) => {
    setIslemde(true);
    const { error } = await supabase.from("teacher_students")
      .update({ durum: onay ? "onaylandi" : "reddedildi" })
      .eq("teacher_id", bag.teacher_id).eq("student_id", bag.student_id);
    setIslemde(false);
    if (error) { alert("İşlem başarısız: " + error.message); return; }
    tazele();
  };

  const kaldir = async (bag, ad) => {
    if (!window.confirm(`${ad} bağlantısı kaldırılsın mı?\n\nVeriler silinmez, yalnızca erişim kalkar.`)) return;
    setIslemde(true);
    const { error } = await supabase.from("teacher_students")
      .delete().eq("teacher_id", bag.teacher_id).eq("student_id", bag.student_id);
    setIslemde(false);
    if (error) { alert("Kaldırılamadı: " + error.message); return; }
    tazele();
  };

  const ad = (bag) => kisiler[bag[karsiAlan]]?.full_name ?? "—";

  const onayli   = baglar.filter(b => b.durum === "onaylandi");
  const gelen    = baglar.filter(b => b.durum === "beklemede" && b.created_by !== userId);
  const giden    = baglar.filter(b => b.durum === "beklemede" && b.created_by === userId);
  const reddedilen = baglar.filter(b => b.durum === "reddedildi");

  const inputStyle = {
    padding: "8px 11px", borderRadius: 9, border: "1.5px solid #f0ede8",
    fontSize: 12.5, boxSizing: "border-box",
  };
  const satirStil = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "7px 9px", borderRadius: 8,
  };

  return (
    <Card>
      <SectionTitle
        title={`${baslik}${onayli.length ? ` (${onayli.length})` : ""}${gelen.length ? ` · ${gelen.length} istek` : ""}`}
        color={c.mid}
      />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${gelen.length ? "#EF9F27" : c.mid}`, background: "transparent",
          color: gelen.length ? "#854F0B" : c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          {gelen.length > 0 ? `${gelen.length} bağlantı isteği bekliyor` : `${baslik.toLowerCase()} listesini düzenle`}
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Onayımı bekleyen istekler */}
          {gelen.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#854F0B", marginBottom: 6 }}>
                ONAYINIZI BEKLEYEN ({gelen.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {gelen.map(b => (
                  <div key={b[karsiAlan]} style={{ ...satirStil, background: "#FFF7E6" }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: "#333", minWidth: 0 }}>{ad(b)}</span>
                    <button onClick={() => yanitla(b, true)} disabled={islemde} style={{
                      fontSize: 11, padding: "4px 11px", borderRadius: 99, border: "none",
                      background: "#E8F9F0", color: "#1A6B3C", cursor: "pointer", fontWeight: 700,
                    }}>✓ Onayla</button>
                    <button onClick={() => yanitla(b, false)} disabled={islemde} style={{
                      fontSize: 11, padding: "4px 11px", borderRadius: 99, border: "none",
                      background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600,
                    }}>✕ Reddet</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Onaylı bağlantılar */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 6 }}>
              BAĞLANTILAR ({onayli.length})
            </div>
            {onayli.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "#aaa", textAlign: "center", padding: "10px 0" }}>
                Henüz onaylı bağlantı yok — aşağıdan teklif gönderin
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {onayli.map(b => {
                  const k = kisiler[b[karsiAlan]];
                  return (
                    <div key={b[karsiAlan]} style={{ ...satirStil, background: "#fafaf8" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: "#333", fontWeight: 500 }}>{ad(b)}</div>
                        {k?.email && <div style={{ fontSize: 10.5, color: "#aaa" }}>{k.email}</div>}
                      </div>
                      <button onClick={() => kaldir(b, ad(b))} disabled={islemde} style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 99, border: "none",
                        background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600, flexShrink: 0,
                      }}>Kaldır</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Gönderdiğim, yanıt bekleyen teklifler */}
          {giden.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 6 }}>
                YANIT BEKLEYEN TEKLİFLERİM ({giden.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {giden.map(b => (
                  <div key={b[karsiAlan]} style={{ ...satirStil, background: "#fafaf8" }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: "#666", minWidth: 0 }}>{ad(b)}</span>
                    <span style={{ fontSize: 10.5, color: "#854F0B", background: "#FFF7E6",
                      padding: "2px 9px", borderRadius: 99, fontWeight: 600 }}>Onay bekleniyor</span>
                    <button onClick={() => kaldir(b, ad(b))} disabled={islemde} style={{
                      fontSize: 11, padding: "4px 9px", borderRadius: 99,
                      border: "1px solid #f0ede8", background: "#fff", color: "#999", cursor: "pointer",
                    }}>İptal</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reddedilenler — tekrar denenebilsin diye kaldırılabilir */}
          {reddedilen.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa", marginBottom: 6 }}>
                REDDEDİLEN ({reddedilen.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {reddedilen.map(b => (
                  <div key={b[karsiAlan]} style={{ ...satirStil, background: "#fafaf8" }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: "#aaa", minWidth: 0 }}>{ad(b)}</span>
                    <button onClick={() => kaldir(b, ad(b))} disabled={islemde} style={{
                      fontSize: 11, padding: "4px 9px", borderRadius: 99,
                      border: "1px solid #f0ede8", background: "#fff", color: "#999", cursor: "pointer",
                    }}>Kaydı sil</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yeni teklif */}
          <div style={{ display: "flex", gap: 6 }}>
            <select value={secilen} onChange={e => setSecilen(e.target.value)}
              style={{ ...inputStyle, flex: 1, color: secilen ? "#222" : "#aaa" }}>
              <option value="">
                {adaylar.length > 0 ? `${karsiEtiket} seç...` : `Eklenebilecek ${karsiEtiket.toLowerCase()} yok`}
              </option>
              {adaylar.map(k => <option key={k.id} value={k.id}>{k.full_name}</option>)}
            </select>
            <button onClick={teklifGonder} disabled={islemde || !secilen} style={{
              padding: "8px 16px", borderRadius: 9, border: "none",
              background: secilen ? c.bg : "#ddd", color: "#fff",
              fontSize: 12.5, fontWeight: 700, cursor: secilen ? "pointer" : "not-allowed",
            }}>Teklif Gönder</button>
          </div>

          <div style={{ fontSize: 10.5, color: "#aaa", lineHeight: 1.5 }}>
            {ogretmenMiyim
              ? "Yalnızca onaylı öğrencilerinizin profil, sınav, test ve ödev verilerine erişebilirsiniz."
              : "Onayladığınız öğretmen profilinizi, sınav ve ödev verilerinizi görebilir."}
            {" "}Bağlantı kaldırıldığında veriler silinmez.
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
