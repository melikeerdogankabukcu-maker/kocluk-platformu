import { useState, useCallback, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Denetim kaydı görüntüleyici — yalnızca admin.
//
// Kayıtları veritabanı tetikleyicisi yazıyor; buradan yalnızca OKUNUYOR.
// RLS'te audit_log için INSERT/UPDATE/DELETE politikası yok, yani bu ekran
// üzerinden bir şey değiştirmek mümkün değil — kasıtlı.

const TABLO_ADI = {
  users:            "Kullanıcı",
  teacher_students: "Öğrenci bağlantısı",
  exam_results:     "Sınav sonucu",
  lessons:          "Ders",
  tasks:            "Görev",
  messages:         "Mesaj",
  exam_topics:      "Müfredat konusu",
};

const ISLEM = {
  INSERT: { ad: "eklendi",     bg: "#E8F9F0", color: "#1A6B3C" },
  UPDATE: { ad: "değiştirildi", bg: "#FFF7E6", color: "#854F0B" },
  DELETE: { ad: "silindi",     bg: "#FFF0F0", color: "#A32D2D" },
};

// Kaydın ne olduğunu tek satırda anlatan özet. Tabloya göre anlamlı alanı
// seçiyor; jsonb'nin tamamını basmak okunmaz olurdu.
function ozet(kayit) {
  const v = kayit.yeni_veri ?? kayit.eski_veri ?? {};
  switch (kayit.tablo) {
    case "users":            return `${v.full_name ?? v.email ?? ""} → ${v.role ?? ""}`;
    case "exam_results":     return `${v.exam_type ?? ""} · ${v.exam_name ?? ""}`;
    case "lessons":          return `${v.lesson_date ?? ""} · ${v.title ?? "ders"}`;
    case "tasks":            return v.title ?? "";
    case "messages":         return (v.content ?? "").slice(0, 60);
    case "exam_topics":      return `${v.exam_type ?? ""} · ${v.subject ?? ""} · ${v.topic ?? ""}`;
    case "teacher_students": return `durum: ${v.durum ?? ""}`;
    default:                 return "";
  }
}

// UPDATE kayıtlarında hangi alanların değiştiğini çıkarır
function degisenAlanlar(kayit) {
  if (kayit.islem !== "UPDATE" || !kayit.eski_veri || !kayit.yeni_veri) return [];
  return Object.keys(kayit.yeni_veri).filter(
    k => JSON.stringify(kayit.eski_veri[k]) !== JSON.stringify(kayit.yeni_veri[k])
  );
}

export default function DenetimKaydi({ color: c }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [adlar,    setAdlar]    = useState({});   // { userId: full_name }
  const [acik,     setAcik]     = useState(false);
  const [etkin,    setEtkin]    = useState(true);
  const [loading,  setLoading]  = useState(false);
  const [suzgec,   setSuzgec]   = useState("");   // tablo adı ya da boş

  const yukle = useCallback(async () => {
    setLoading(true);
    let sorgu = supabase.from("audit_log").select("*")
      .order("created_at", { ascending: false }).limit(100);
    if (suzgec) sorgu = sorgu.eq("tablo", suzgec);

    const { veri, hata } = await calistir(sorgu, "Denetim kaydi", { sessiz: true });
    if (hata) { setEtkin(false); setLoading(false); return; }
    setKayitlar(veri ?? []);

    // İşlemi yapanların adları — kim alanı yalnızca uuid tutuyor
    const idler = [...new Set((veri ?? []).map(k => k.kim).filter(Boolean))];
    if (idler.length > 0) {
      const { veri: kisiler } = await calistir(
        supabase.from("users").select("id, full_name").in("id", idler),
        "Denetim kaydi adlari", { sessiz: true }
      );
      setAdlar(Object.fromEntries((kisiler ?? []).map(u => [u.id, u.full_name])));
    }
    setLoading(false);
  }, [suzgec]);

  useEffect(() => { if (acik) yukle(); }, [acik, yukle]);

  if (!etkin) return null;   // tablo yoksa ya da admin değilse kartı gösterme

  const zaman = (t) => {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? "" :
      d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card id="bolum-denetim">
      <SectionTitle title="Denetim Kaydı" color={c.mid} />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>🔎 Kim ne yaptı — son işlemler</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>

          {/* Tablo süzgeci */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["", ...Object.keys(TABLO_ADI)].map(t => (
              <button key={t || "hepsi"} onClick={() => setSuzgec(t)} style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 99, cursor: "pointer",
                border: `1.5px solid ${suzgec === t ? c.bg : "#f0ede8"}`,
                background: suzgec === t ? c.bg : "#fff",
                color: suzgec === t ? "#fff" : "#888", fontWeight: 600,
              }}>{t ? TABLO_ADI[t] : "Hepsi"}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
              Yükleniyor...
            </div>
          ) : kayitlar.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
              Kayıt yok
            </div>
          ) : (
            <div style={{
              display: "flex", flexDirection: "column", gap: 4,
              maxHeight: 380, overflowY: "auto",
              border: "1px solid #f0ede8", borderRadius: 9, padding: 7,
            }}>
              {kayitlar.map(k => {
                const i = ISLEM[k.islem] ?? { ad: k.islem, bg: "#f5f5f5", color: "#666" };
                const alanlar = degisenAlanlar(k);
                return (
                  <div key={k.id} style={{
                    display: "flex", alignItems: "baseline", gap: 7,
                    fontSize: 11.5, padding: "4px 2px",
                    borderBottom: "1px solid #fafaf8",
                  }}>
                    <span style={{ flexShrink: 0, color: "#999", minWidth: 78 }}>
                      {zaman(k.created_at)}
                    </span>
                    <span style={{
                      flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: "1px 6px",
                      borderRadius: 99, background: i.bg, color: i.color,
                    }}>{i.ad}</span>
                    <span style={{ flex: 1, minWidth: 0, color: "#333" }}>
                      <b style={{ fontWeight: 600 }}>{TABLO_ADI[k.tablo] ?? k.tablo}</b>
                      {ozet(k) && <span style={{ color: "#777" }}> · {ozet(k)}</span>}
                      {alanlar.length > 0 && (
                        <span style={{ color: "#aaa", fontSize: 10.5 }}>
                          {" "}({alanlar.join(", ")})
                        </span>
                      )}
                    </span>
                    <span style={{ flexShrink: 0, color: "#888", maxWidth: 110,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {k.kim ? (adlar[k.kim] ?? "—") : "sistem"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.5 }}>
            Son 100 işlem. Kayıtlar veritabanı tetikleyicisiyle tutuluyor ve
            uygulamadan değiştirilemiyor. "sistem" yazan satırlar SQL Editor'den
            yapılan işlemlerdir.
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
