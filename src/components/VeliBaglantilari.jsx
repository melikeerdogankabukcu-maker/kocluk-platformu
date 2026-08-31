import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Veli ↔ öğrenci bağlarını elle yönetir.
//
// Normal yol kayıt akışı: veli çocuğunun e-postasını yazıyor, yönetici
// onaylarken bağ kuruluyor. Bu kart o yolun kapandığı durumlar için:
// e-posta yanlış yazılmış, veli ikinci çocuğunu ekleyecek, ya da hesap
// bu akış yokken açılmış.
//
// Yazma işlemleri RPC'den geçiyor (veli_bagi_kur / veli_bagi_kaldir).
// family_links'te YAZMA POLİTİKASI yok — "kim kimi bağlayabilir" kuralı
// tek yerde, sunucuda duruyor. Aşağıdaki liste daraltması yalnızca
// görgü kuralı: öğretmene seçemeyeceği ismi göstermemek için.
export default function VeliBaglantilari({ userId, rol, color: c }) {
  const adminMi = rol === "admin";

  const [acik,       setAcik]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [baglar,     setBaglar]     = useState([]);
  const [veliler,    setVeliler]    = useState([]);
  const [ogrenciler, setOgrenciler] = useState([]);
  const [secVeli,    setSecVeli]    = useState("");
  const [secOgrenci, setSecOgrenci] = useState("");
  const [islemde,    setIslemde]    = useState(false);

  const yukle = useCallback(async () => {
    setLoading(true);

    // Öğretmen yalnızca ONAYLI öğrencisine veli bağlayabilir
    let izinliIdler = null;
    if (!adminMi) {
      const { veri } = await calistir(
        supabase.from("teacher_students").select("student_id")
          .eq("teacher_id", userId).eq("durum", "onaylandi"),
        "Ogrenci listesi", { sessiz: true }
      );
      izinliIdler = (veri ?? []).map(s => s.student_id);
    }

    const ogrenciSorgusu = supabase.from("users")
      .select("id, full_name, email").eq("role", "student");
    const sonuclar = await Promise.all([
      supabase.from("family_links").select("parent_id, student_id"),
      supabase.from("users").select("id, full_name, email")
        .eq("role", "parent").eq("onay_durumu", "onaylandi"),
      izinliIdler === null
        ? ogrenciSorgusu
        : izinliIdler.length > 0
          ? ogrenciSorgusu.in("id", izinliIdler)
          : Promise.resolve({ data: [] }),
    ]);
    const [{ data: bagData }, { data: veliData }, { data: ogrData }] = sonuclar;

    setBaglar(bagData ?? []);
    setVeliler(veliData ?? []);
    setOgrenciler(ogrData ?? []);
    setLoading(false);
  }, [userId, adminMi]);

  useEffect(() => { if (acik) yukle(); }, [acik, yukle]);

  const bagla = async () => {
    if (!secVeli || !secOgrenci) return;
    setIslemde(true);
    const { hata } = await calistir(
      supabase.rpc("veli_bagi_kur", { p_veli: secVeli, p_ogrenci: secOgrenci }),
      "Veli baglama"
    );
    setIslemde(false);
    if (hata) return;
    setSecVeli(""); setSecOgrenci("");
    yukle();
  };

  const kaldir = async (bag, veliAdi, ogrenciAdi) => {
    if (!window.confirm(
      `${veliAdi} — ${ogrenciAdi} bağlantısı kaldırılsın mı?\n\n` +
      `Veli artık öğrencinin gelişim bilgilerini göremez. Veriler silinmez.`
    )) return;
    setIslemde(true);
    const { hata } = await calistir(
      supabase.rpc("veli_bagi_kaldir", { p_veli: bag.parent_id, p_ogrenci: bag.student_id }),
      "Baglanti kaldirma"
    );
    setIslemde(false);
    if (hata) return;
    yukle();
  };

  const veliAdi    = (id) => veliler.find(v => v.id === id)?.full_name ?? "—";
  const ogrenciAdi = (id) => ogrenciler.find(o => o.id === id)?.full_name ?? "—";

  // Bağı olmayan öğrenciler — asıl eksik burada görünür
  const bagliOgrenciler = new Set(baglar.map(b => b.student_id));
  const bagsizlar = ogrenciler.filter(o => !bagliOgrenciler.has(o.id));

  const selectStil = {
    flex: 1, minWidth: 0, fontSize: 12, padding: "8px 10px",
    borderRadius: 9, border: "1.5px solid #f0ede8", background: "#fff",
  };

  return (
    <Card id="bolum-veli">
      <SectionTitle title={`Veli Bağlantıları${baglar.length ? ` (${baglar.length})` : ""}`} color={c.mid}
        acik={acik} onToggle={() => setAcik(v => !v)} />

      {!acik ? null : loading ? (
        <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", marginBottom: 5 }}>
              MEVCUT BAĞLANTILAR ({baglar.length})
            </div>
            {baglar.length === 0 ? (
              <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: "10px 0" }}>
                Henüz veli bağlantısı yok
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {baglar.map(b => (
                  <div key={`${b.parent_id}-${b.student_id}`} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 9px", borderRadius: 8, background: "#fafaf8",
                  }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                      <span style={{ color: "#333", fontWeight: 600 }}>{veliAdi(b.parent_id)}</span>
                      <span style={{ color: "#bbb" }}> → </span>
                      <span style={{ color: "#333" }}>{ogrenciAdi(b.student_id)}</span>
                    </div>
                    <button
                      onClick={() => kaldir(b, veliAdi(b.parent_id), ogrenciAdi(b.student_id))}
                      disabled={islemde}
                      style={{
                        fontSize: 10.5, padding: "4px 10px", borderRadius: 99, border: "none",
                        background: "#FFF0F0", color: "#A32D2D", cursor: "pointer",
                        fontWeight: 600, flexShrink: 0,
                      }}
                    >Kaldır</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Yeni bağ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa" }}>YENİ BAĞLANTI</div>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={secVeli} onChange={e => setSecVeli(e.target.value)}
                style={{ ...selectStil, color: secVeli ? "#222" : "#aaa" }}>
                <option value="">{veliler.length ? "Veli seç..." : "Onaylı veli yok"}</option>
                {veliler.map(v => <option key={v.id} value={v.id}>{v.full_name} · {v.email}</option>)}
              </select>
              <select value={secOgrenci} onChange={e => setSecOgrenci(e.target.value)}
                style={{ ...selectStil, color: secOgrenci ? "#222" : "#aaa" }}>
                <option value="">{ogrenciler.length ? "Öğrenci seç..." : "Öğrenci yok"}</option>
                {ogrenciler.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
            </div>
            <button onClick={bagla} disabled={islemde || !secVeli || !secOgrenci} style={{
              padding: "9px 0", borderRadius: 10, border: "none",
              background: (secVeli && secOgrenci) ? c.bg : "#ddd", color: "#fff",
              fontSize: 12.5, fontWeight: 700,
              cursor: (secVeli && secOgrenci) ? "pointer" : "not-allowed",
            }}>Bağla</button>
          </div>

          {bagsizlar.length > 0 && (
            <div style={{
              fontSize: 10.5, color: "#854F0B", background: "#FFF7E6",
              padding: "8px 11px", borderRadius: 9, lineHeight: 1.5,
            }}>
              <b>Velisi bağlı olmayan öğrenciler:</b> {bagsizlar.map(o => o.full_name).join(", ")}
            </div>
          )}

          <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.5 }}>
            Bağlanan veli öğrencinin görev, sınav ve gelişim bilgilerini görebilir.
            Normalde bu bağ, veli kaydını onaylarken otomatik kurulur; bu kart
            e-posta yanlış yazıldığında veya ikinci çocuk eklenirken kullanılır.
            {!adminMi && " Yalnızca onaylı öğrencilerinizi bağlayabilirsiniz."}
          </div>

        </div>
      )}
    </Card>
  );
}
