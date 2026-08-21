import { useState, useCallback, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Rol yönetimi — yalnızca admin.
//
// Kayıt ekranında "Öğretmen" seçilebiliyor ama güvenlik gereği hesap
// öğrenci olarak açılıyor (kendine öğretmen yetkisi verebilmek tüm
// öğrencilerin kişisel verisini açardı). Talep users.talep_rol'de
// saklanıyor, onay buradan veriliyor.
//
// Promosyon artık UYGULAMADAN yapılıyor; SQL Editor'den yapılsaydı
// denetim kaydına "sistem" diye düşerdi, buradan gerçek kişi yazılıyor.

const ROL_ADI = { student: "Öğrenci", teacher: "Öğretmen", parent: "Veli", admin: "Yönetici" };

export default function RolYonetimi({ userId, color: c }) {
  const [kisiler, setKisiler] = useState([]);
  const [acik,    setAcik]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [islemde, setIslemde] = useState(null);

  const yukle = useCallback(async () => {
    setLoading(true);
    const { veri } = await calistir(
      supabase.from("users").select("id, full_name, email, role, talep_rol, created_at")
        .order("created_at", { ascending: false }),
      "Kullanici listesi", { sessiz: true }
    );
    setKisiler(veri ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (acik) yukle(); }, [acik, yukle]);

  const rolVer = async (kisi, yeniRol) => {
    if (!window.confirm(
      `${kisi.full_name} rolü "${ROL_ADI[yeniRol]}" olarak değiştirilsin mi?` +
      (yeniRol === "teacher"
        ? "\n\nÖğretmen, bağlantı kurduğu öğrencilerin kişisel bilgilerini görebilir."
        : "")
    )) return;
    setIslemde(kisi.id);
    const { hata } = await calistir(
      supabase.from("users")
        .update({ role: yeniRol, talep_rol: null })
        .eq("id", kisi.id),
      "Rol degistirme"
    );
    setIslemde(null);
    if (hata) return;
    yukle();
  };

  // Öğretmen talebi olanlar üstte
  const bekleyen = kisiler.filter(k => k.talep_rol && k.talep_rol !== k.role);
  const digerleri = kisiler.filter(k => !(k.talep_rol && k.talep_rol !== k.role));

  const satir = (k, vurgulu) => (
    <div key={k.id} style={{
      display: "flex", alignItems: "center", gap: 8, fontSize: 11.5,
      padding: vurgulu ? "7px 9px" : "5px 2px",
      borderRadius: vurgulu ? 8 : 0,
      background: vurgulu ? "#FFF7E6" : "transparent",
      borderBottom: vurgulu ? "none" : "1px solid #fafaf8",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#333", fontWeight: vurgulu ? 600 : 400 }}>{k.full_name}</div>
        <div style={{ fontSize: 10, color: "#aaa" }}>{k.email}</div>
      </div>
      <span style={{
        flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
        background: k.role === "admin" ? c.light : "#f2f2f0",
        color: k.role === "admin" ? c.text : "#777",
      }}>{ROL_ADI[k.role] ?? k.role}</span>

      {vurgulu && (
        <span style={{ flexShrink: 0, fontSize: 10, color: "#854F0B", fontWeight: 600 }}>
          {ROL_ADI[k.talep_rol] ?? k.talep_rol} istedi
        </span>
      )}

      {/* Kendi rolünü değiştiremesin: admin kendini düşürürse paneli kaybeder */}
      {k.id !== userId && k.role !== "admin" && (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {["teacher", "student", "parent"].filter(r => r !== k.role).map(r => (
            <button key={r} onClick={() => rolVer(k, r)} disabled={islemde === k.id} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 99, border: "none", cursor: "pointer",
              fontWeight: 600,
              background: r === "teacher" ? c.light : "#f2f2f0",
              color:      r === "teacher" ? c.text  : "#777",
            }}>{ROL_ADI[r]} yap</button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card id="bolum-rol">
      <SectionTitle
        title={`Rol Yönetimi${bekleyen.length > 0 ? ` (${bekleyen.length} talep)` : ""}`}
        color={c.mid}
      />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          👤 Kullanıcı rolleri{bekleyen.length > 0 ? ` · ${bekleyen.length} bekleyen talep` : ""}
        </button>
      ) : loading ? (
        <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {bekleyen.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#854F0B", marginBottom: 5 }}>
                BEKLEYEN TALEPLER
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {bekleyen.map(k => satir(k, true))}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", marginBottom: 5 }}>
              TÜM KULLANICILAR ({kisiler.length})
            </div>
            <div style={{
              display: "flex", flexDirection: "column",
              maxHeight: 300, overflowY: "auto",
              border: "1px solid #f0ede8", borderRadius: 9, padding: 7,
            }}>
              {digerleri.map(k => satir(k, false))}
            </div>
          </div>

          <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.5 }}>
            Yönetici rolü buradan verilemez — ikinci bir yönetici açmak bilinçli
            bir karar olmalı ve SQL'den yapılmalı. Kendi rolünüzü de
            değiştiremezsiniz. Her değişiklik denetim kaydına yazılır.
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
