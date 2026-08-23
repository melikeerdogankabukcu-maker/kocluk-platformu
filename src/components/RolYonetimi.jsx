import { useState, useCallback, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import SifreSifirlaDugmesi from "./SifreSifirlaDugmesi";

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
  // Veli id -> onayda bağlanacak öğrenci id. Velinin kayıtta yazdığı
  // e-postadan ön-doldurulur ama BAĞLAYAN ŞEY buradaki seçimdir:
  // sunucu o an users'tan okusaydı, veli ekranı gördüğümüzle tıkladığımız
  // an arasında değeri değiştirip başka öğrenciye bağlanabilirdi.
  const [secilenOgrenci, setSecilenOgrenci] = useState({});

  const yukle = useCallback(async () => {
    setLoading(true);
    const { veri } = await calistir(
      supabase.from("users")
        .select("id, full_name, email, role, talep_rol, onay_durumu, talep_ogrenci_email, created_at")
        .order("created_at", { ascending: false }),
      "Kullanici listesi", { sessiz: true }
    );
    const liste = veri ?? [];
    setKisiler(liste);

    // Bildirilen e-postayı öğrenciyle eşleştir (büyük/küçük harf ve
    // baştaki-sondaki boşluk farkı yüzünden eşleşme kaçmasın)
    const ogrenciler = liste.filter(k => k.role === "student");
    const epostaHarita = {};
    ogrenciler.forEach(o => {
      if (o.email) epostaHarita[o.email.trim().toLowerCase()] = o.id;
    });
    const onDolu = {};
    liste.filter(k => k.role === "parent" && k.talep_ogrenci_email).forEach(v => {
      const eslesen = epostaHarita[v.talep_ogrenci_email.trim().toLowerCase()];
      if (eslesen) onDolu[v.id] = eslesen;
    });
    setSecilenOgrenci(onceki => ({ ...onDolu, ...onceki }));

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

  const onayVer = async (kisi, durum) => {
    const reddet = durum === "reddedildi";

    // Veli onayında çocuk da bağlanıyor. İkisi TEK çağrıda: ayrı iki istek
    // olsaydı biri tutup diğeri düşebilir, veli onaylı ama çocuksuz
    // kalırdı — tam da kaçınmak istediğimiz durum.
    const ogrenciId = !reddet && kisi.role === "parent"
      ? (secilenOgrenci[kisi.id] || null)
      : null;
    const ogrenciAdi = ogrenciId
      ? kisiler.find(k => k.id === ogrenciId)?.full_name
      : null;

    if (!window.confirm(
      reddet
        ? `${kisi.full_name} hesabı reddedilsin mi?\n\nKullanıcı uygulamaya giremez; karar sonradan değiştirilebilir.`
        : `${kisi.full_name} hesabı onaylansın mı?` + (
            kisi.role === "parent"
              ? ogrenciAdi
                ? `\n\nAynı anda ${ogrenciAdi} öğrencisine bağlanacak.`
                : "\n\nÖĞRENCİ SEÇİLMEDİ — veli onaylanır ama hiçbir öğrenciye bağlanmaz. Bağlantıyı sonra \"Veli Bağlantıları\" kartından kurabilirsiniz."
              : ""
          )
    )) return;

    setIslemde(kisi.id);
    const { hata } = reddet
      ? await calistir(
          supabase.from("users").update({ onay_durumu: "reddedildi" }).eq("id", kisi.id),
          "Hesap reddi"
        )
      : await calistir(
          supabase.rpc("hesap_onayla", { p_kisi: kisi.id, p_ogrenci: ogrenciId }),
          "Hesap onayi"
        );
    setIslemde(null);
    if (hata) return;
    yukle();
  };

  // İşlem bekleyenler üstte: onay bekleyen hesaplar ve öğretmen talepleri
  const islemBekler = (k) =>
    k.onay_durumu === "beklemede" || (k.talep_rol && k.talep_rol !== k.role);
  const bekleyen  = kisiler.filter(islemBekler);
  const digerleri = kisiler.filter(k => !islemBekler(k));
  const onayBekleyen = kisiler.filter(k => k.onay_durumu === "beklemede").length;
  const ogrenciListesi = kisiler.filter(k => k.role === "student");

  const satir = (k, vurgulu) => {
    // Onay bekleyen velide, öğrenci seçimi satırın hemen altında çıkıyor:
    // yönetici onaylamadan önce kimi bağladığını görmeli.
    const veliSecimi = k.role === "parent" && k.onay_durumu === "beklemede";
    return (
    <div key={k.id} style={{
      padding: vurgulu ? "7px 9px" : "5px 2px",
      borderRadius: vurgulu ? 8 : 0,
      background: vurgulu ? "#FFF7E6" : "transparent",
      borderBottom: vurgulu ? "none" : "1px solid #fafaf8",
    }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#333", fontWeight: vurgulu ? 600 : 400 }}>{k.full_name}</div>
        <div style={{ fontSize: 10, color: "#aaa" }}>{k.email}</div>
      </div>
      <span style={{
        flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
        background: k.role === "admin" ? c.light : "#f2f2f0",
        color: k.role === "admin" ? c.text : "#777",
      }}>{ROL_ADI[k.role] ?? k.role}</span>

      {k.talep_rol && k.talep_rol !== k.role && (
        <span style={{ flexShrink: 0, fontSize: 10, color: "#854F0B", fontWeight: 600 }}>
          {ROL_ADI[k.talep_rol] ?? k.talep_rol} istedi
        </span>
      )}

      {/* Onay durumu — onaylı hesaplarda rozet gösterilmiyor, gürültü olurdu */}
      {k.onay_durumu !== "onaylandi" && (
        <span style={{
          flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
          background: k.onay_durumu === "reddedildi" ? "#FFF0F0" : "#FFF7E6",
          color:      k.onay_durumu === "reddedildi" ? "#A32D2D" : "#854F0B",
        }}>{k.onay_durumu === "reddedildi" ? "reddedildi" : "onay bekliyor"}</span>
      )}

      {/* Onay/ret — kendi hesabı ve diğer yöneticiler hariç */}
      {k.id !== userId && k.role !== "admin" && k.onay_durumu !== "onaylandi" && (
        <button onClick={() => onayVer(k, "onaylandi")} disabled={islemde === k.id} style={{
          flexShrink: 0, fontSize: 10, padding: "3px 9px", borderRadius: 99, border: "none",
          background: "#E8F9F0", color: "#1A6B3C", cursor: "pointer", fontWeight: 700,
        }}>Onayla</button>
      )}
      {k.id !== userId && k.role !== "admin" && k.onay_durumu !== "reddedildi" && (
        <button onClick={() => onayVer(k, "reddedildi")} disabled={islemde === k.id} style={{
          flexShrink: 0, fontSize: 10, padding: "3px 9px", borderRadius: 99, border: "none",
          background: "#FFF0F0", color: "#A32D2D", cursor: "pointer", fontWeight: 600,
        }}>Reddet</button>
      )}

      {/* Şifre sıfırlama — yönetici hesapları hedef olamaz (hesap devralma
          olurdu), kendi hesabı da listede değil */}
      {k.id !== userId && k.role !== "admin" && <SifreSifirlaDugmesi kisi={k} kompakt />}

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

      {veliSecimi && (
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px dashed #EFD9A8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 10.5, color: "#854F0B", fontWeight: 700, flexShrink: 0 }}>
              Bağlanacak öğrenci
            </span>
            <select
              value={secilenOgrenci[k.id] ?? ""}
              onChange={e => setSecilenOgrenci(o => ({ ...o, [k.id]: e.target.value }))}
              style={{
                flex: 1, minWidth: 0, fontSize: 11.5, padding: "5px 8px",
                borderRadius: 8, border: "1.5px solid #EFD9A8", background: "#fff",
                color: secilenOgrenci[k.id] ? "#222" : "#aaa",
              }}
            >
              <option value="">Bağlama (sonra kurulacak)</option>
              {ogrenciListesi.map(o => (
                <option key={o.id} value={o.id}>{o.full_name} · {o.email}</option>
              ))}
            </select>
          </div>

          {/* Velinin yazdığı e-posta hiçbir öğrenciye denk gelmiyorsa
              sessizce boş bırakmak yerine söyle: adres yanlış yazılmış
              olabilir ve yönetici bunu ancak görürse fark eder. */}
          {k.talep_ogrenci_email && !secilenOgrenci[k.id] && (
            <div style={{ fontSize: 10, color: "#A32D2D", marginTop: 5, lineHeight: 1.4 }}>
              Velinin bildirdiği <b>{k.talep_ogrenci_email}</b> adresiyle kayıtlı
              öğrenci yok. Doğru öğrenciyi listeden seçin.
            </div>
          )}
          {!k.talep_ogrenci_email && (
            <div style={{ fontSize: 10, color: "#999", marginTop: 5 }}>
              Veli kayıtta çocuk e-postası bildirmemiş.
            </div>
          )}
        </div>
      )}
    </div>
    );
  };

  return (
    <Card id="bolum-rol">
      <SectionTitle
        title={`Kullanıcı Yönetimi${bekleyen.length > 0 ? ` (${bekleyen.length})` : ""}`}
        color={c.mid}
      />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: 12,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          👤 Kullanıcılar{onayBekleyen > 0
            ? ` · ${onayBekleyen} hesap onay bekliyor`
            : bekleyen.length > 0 ? ` · ${bekleyen.length} bekleyen talep` : ""}
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
                İŞLEM BEKLEYENLER
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
