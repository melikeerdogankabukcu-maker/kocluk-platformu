import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { imzaliUrl } from "../lib/depo";
import { gorseliKucult } from "../lib/gorselKucult";
import { dosyaGecerli } from "../lib/soruSayfasi";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Kurum yöneticisinin paneli: koçlar, öğrenciler, devir, özet.
//
// ── HER ŞEY RPC ÜZERİNDEN ───────────────────────────────────────
// Yöneticinin ihtiyaç duyduğu her iş BAŞKASININ satırına dokunuyor:
// başka koçun öğrenci bağı, başka kullanıcının kurum_id'si.
// `teacher_students` politikası yalnız tarafları geçiriyor ve
// `users` üzerinde UPDATE yalnız kendi satırına açık. Bunları RLS ile
// açmak o genişliği yalnız bu ekran için değil HER SORGU için açardı;
// onun yerine kurallar tek tek SECURITY DEFINER fonksiyonlarında.
//
// ── KOÇ E-POSTAYLA EKLENİYOR ────────────────────────────────────
// E-posta artık istemciye hiç inmiyor, dolayısıyla seçilebilecek bir
// liste yok: yönetici adresi yazıyor, SUNUCU çözüyor.
export default function KurumPaneli({ color: c, kurum, baslik }) {
  // Üye görünümü ayrı bileşende: yöneticinin RPC'lerini üye zaten
  // çağıramıyor (kurum_kapisi reddediyor) ve çağırmaya kalkmak her
  // açılışta iki başarısız istek demek olurdu.
  if (!kurum?.yonetici) {
    return <KurumUyeGorunumu color={c} kurum={kurum}
      baslik={baslik ?? "Kurumum"} />;
  }
  return <KurumYoneticiPaneli color={c} kurum={kurum} baslik={baslik ?? "Kurum Yönetimi"} />;
}

function KurumYoneticiPaneli({ color: c, baslik, kurum }) {
  const [koclar, setKoclar] = useState([]);
  const [ogrenciler, setOgrenciler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [eposta, setEposta] = useState("");
  const [islemde, setIslemde] = useState(false);
  const [mesaj, setMesaj] = useState(null);      // { tur: 'iyi'|'kotu', metin }
  const [devir, setDevir] = useState({});        // ogrenci_id -> yeni koc id

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const [{ veri: k }, { veri: o }] = await Promise.all([
      calistir(supabase.rpc("kurum_koclari"), "Kurum koclari", { sessiz: true }),
      calistir(supabase.rpc("kurum_ogrencileri"), "Kurum ogrencileri", { sessiz: true }),
    ]);
    setKoclar(k ?? []);
    setOgrenciler(o ?? []);
    setYukleniyor(false);
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  // RPC'ler hatayı MESAJLA döndürüyor ("bu koç başka kuruma bağlı"
  // gibi); o metin kullanıcıya olduğu gibi gösteriliyor çünkü ne
  // yapması gerektiğini söyleyen tek şey o.
  const calistirIslem = async (sozPromise, basariMetni) => {
    setIslemde(true);
    setMesaj(null);
    const { veri, hata } = await calistir(sozPromise, "Kurum islemi", { sessiz: true });
    setIslemde(false);
    if (hata) {
      setMesaj({ tur: "kotu", metin: hata.message ?? "İşlem yapılamadı." });
      return false;
    }
    setMesaj({ tur: "iyi", metin: basariMetni(veri) });
    await yukle();
    return true;
  };

  const kocEkle = async () => {
    if (!eposta.trim()) return;
    const oldu = await calistirIslem(
      supabase.rpc("kuruma_koc_ekle", { p_eposta: eposta.trim() }),
      (ad) => `${ad || "Koç"} kuruma eklendi.`);
    if (oldu) setEposta("");
  };

  const kocCikar = (koc) => {
    if (!confirm(`${koc.ad} kurumdan çıkarılsın mı? Kurum içeriğine erişimi kalkar.`)) return;
    calistirIslem(
      supabase.rpc("kurumdan_koc_cikar", { p_koc: koc.koc_id }),
      () => `${koc.ad} kurumdan çıkarıldı.`);
  };

  const ogrenciDevret = (o) => {
    const yeni = devir[o.ogrenci_id];
    if (!yeni || yeni === o.koc_id) return;
    const yeniAd = koclar.find(k => k.koc_id === yeni)?.ad ?? "yeni koç";
    if (!confirm(`${o.ad}, ${o.koc_adi} yerine ${yeniAd} koçuna aktarılsın mı?`)) return;
    calistirIslem(
      supabase.rpc("ogrenci_devret", {
        p_ogrenci: o.ogrenci_id, p_eski_koc: o.koc_id, p_yeni_koc: yeni,
      }),
      () => `${o.ad} aktarıldı.`)
      .then(() => setDevir(d => ({ ...d, [o.ogrenci_id]: "" })));
  };

  const oran = (biten, toplam) =>
    toplam > 0 ? Math.round((Number(biten) / Number(toplam)) * 100) : null;

  const girdi = {
    flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: KOSE.s, boxSizing: "border-box",
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, fontFamily: "inherit",
  };

  return (
    <Card id="bolum-kurum">
      <SectionTitle title={baslik} color={c.mid} />

      {yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      ) : (
        <>
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, marginBottom: BOSLUK.m }}>
            {koclar.length} koç · {ogrenciler.length} öğrenci
          </div>

          <KurumLogosu kurumId={kurum?.kurumId} kurumAdi={kurum?.kurumAdi} color={c} />

          {/* Koç ekleme */}
          <div style={{ display: "flex", gap: BOSLUK.s, marginBottom: 6 }}>
            <input value={eposta} placeholder="Koçun e-posta adresi" type="email"
              onChange={e => { setEposta(e.target.value); setMesaj(null); }}
              onKeyDown={e => { if (e.key === "Enter") kocEkle(); }}
              style={girdi} />
            <button onClick={kocEkle} disabled={islemde || !eposta.trim()} style={{
              flexShrink: 0, padding: "0 16px", borderRadius: KOSE.s, border: "none",
              background: eposta.trim() ? c.bg : "#ddd", color: "#fff",
              fontSize: YAZI.ikincil, fontWeight: 700,
              cursor: eposta.trim() ? "pointer" : "default",
            }}>{islemde ? "..." : "Ekle"}</button>
          </div>
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5, marginBottom: BOSLUK.m }}>
            Koçun sistemde kayıtlı ve öğretmen rolünde olması gerekiyor.
            Başka bir kuruma bağlıysa önce oradan ayrılmalı.
          </div>

          {mesaj && (
            <div style={{
              background: mesaj.tur === "iyi" ? RENK.basari.zemin : RENK.hata.zemin,
              color:      mesaj.tur === "iyi" ? RENK.basari.metin : RENK.hata.metin,
              fontSize: 11.5, padding: "8px 11px", borderRadius: KOSE.s,
              marginBottom: BOSLUK.m, lineHeight: 1.5,
            }}>{mesaj.metin}</div>
          )}

          {/* Koçlar ve özet */}
          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
            KOÇLAR
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: BOSLUK.l }}>
            {koclar.map(k => {
              const o = oran(k.gorev_biten, k.gorev_toplam);
              const saat = Math.round(Number(k.calisma_dk_30g ?? 0) / 60);
              return (
                <div key={k.koc_id} style={{
                  display: "flex", alignItems: "center", gap: BOSLUK.s,
                  padding: "8px 2px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: YAZI.kucuk, fontWeight: 600, color: RENK.metin }}>
                      {k.ad}
                      {k.kurum_rolu === "yonetici" && (
                        <span style={{
                          marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: "1px 6px",
                          borderRadius: KOSE.tam, background: c.light, color: c.text,
                        }}>yönetici</span>
                      )}
                    </div>
                    <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>
                      {[
                        `${k.ogrenci_sayisi} öğrenci`,
                        o != null ? `görev %${o}` : null,
                        Number(k.test_30g) > 0 ? `${k.test_30g} test/30g` : null,
                        saat > 0 ? `${saat} sa çalışma/30g` : null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {k.kurum_rolu !== "yonetici" && (
                    <button onClick={() => kocCikar(k)} disabled={islemde} style={{
                      flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                      color: RENK.hata.metin, fontSize: YAZI.mikro,
                    }}>çıkar</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Öğrenciler ve devir */}
          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
            ÖĞRENCİLER
          </div>
          {ogrenciler.length === 0 ? (
            <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
              Kuruma bağlı koçların henüz onaylı öğrencisi yok.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 340, overflowY: "auto" }}>
              {ogrenciler.map(o => (
                <div key={`${o.ogrenci_id}-${o.koc_id}`} style={{
                  display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                  padding: "7px 2px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
                }}>
                  {/* Taban genişlik: yanındaki açılır liste daralmayınca
                      isim sıfıra ezilip harf harf kırılıyordu. */}
                  <div style={{ flex: "1 1 120px", minWidth: 120 }}>
                    <div style={{ fontSize: YAZI.kucuk, color: RENK.metin }}>{o.ad}</div>
                    <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>{o.koc_adi}</div>
                  </div>
                  {/* Devir yalnız kurumda birden fazla koç varsa anlamlı */}
                  {koclar.length > 1 && (
                    <>
                      <select value={devir[o.ogrenci_id] ?? ""}
                        onChange={e => setDevir(d => ({ ...d, [o.ogrenci_id]: e.target.value }))}
                        style={{
                          flexShrink: 1, minWidth: 96, maxWidth: 140, padding: "4px 6px", borderRadius: KOSE.s,
                          border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.mikro,
                          fontFamily: "inherit", color: devir[o.ogrenci_id] ? RENK.metin : RENK.metinSilik,
                        }}>
                        <option value="">devret…</option>
                        {koclar.filter(k => k.koc_id !== o.koc_id).map(k => (
                          <option key={k.koc_id} value={k.koc_id}>{k.ad}</option>
                        ))}
                      </select>
                      {devir[o.ogrenci_id] && (
                        <button onClick={() => ogrenciDevret(o)} disabled={islemde} style={{
                          flexShrink: 0, padding: "4px 10px", borderRadius: KOSE.tam, border: "none",
                          background: c.bg, color: "#fff", fontSize: YAZI.mikro,
                          fontWeight: 700, cursor: "pointer",
                        }}>aktar</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.55, marginTop: BOSLUK.m }}>
            Devirde öğrencinin geçmişi de yeni koça geçiyor: görev, sınav ve
            plan erişimi koça değil <b>öğrenci bağına</b> bakıyor. Öğrencisi
            olan koç kurumdan çıkarılamıyor; önce devredilmesi gerekiyor.
          </div>
        </>
      )}
    </Card>
  );
}


// Üyenin gördüğü kurum ekranı.
//
// ── NEDEN SADECE OKUMA ──────────────────────────────────────────
// Koç ekleme, çıkarma ve öğrenci devri kurum yöneticisinin işi; üye
// o RPC'leri zaten çağıramıyor. Buradaki amaç yönetmek değil
// GÖRÜNÜRLÜK: koç hangi kuruma bağlı olduğunu, kimlerle aynı kurumda
// olduğunu ve paylaşılan içeriğin ne anlama geldiğini görmeli.
//
// İlk sürümde bu ekran yoktu ve kuruma eklenen koç bağlı olduğu
// kurumun adını bile göremiyordu.
function KurumUyeGorunumu({ color: c, kurum, baslik }) {
  const [meslektaslar, setMeslektaslar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let iptal = false;
    if (!kurum?.kurumId) { setYukleniyor(false); return; }
    calistir(
      supabase.from("users")
        .select("id, full_name, role, kurum_rolu")
        .eq("kurum_id", kurum.kurumId),
      "Kurum meslektaslari", { sessiz: true }
    ).then(({ veri }) => {
      if (iptal) return;
      setMeslektaslar((veri ?? []).filter(u => u.role === "teacher" || u.role === "admin"));
      setYukleniyor(false);
    });
    return () => { iptal = true; };
  }, [kurum?.kurumId]);

  return (
    <Card id="bolum-kurum">
      <SectionTitle title={baslik} color={c.mid} />

      <div style={{
        padding: "11px 13px", borderRadius: KOSE.m, background: c.light,
        color: c.text, marginBottom: BOSLUK.m,
      }}>
        <div style={{ fontSize: YAZI.ikincil, fontWeight: 700 }}>{kurum?.kurumAdi ?? "Kurum"}</div>
        <div style={{ fontSize: YAZI.mikro, color: c.mid, marginTop: 2 }}>
          Bu kurumun üyesisiniz
        </div>
      </div>

      {!kurum?.yoneticiVar && (
        <div style={{
          background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 11.5,
          padding: "9px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m, lineHeight: 1.5,
        }}>
          Bu kurumun henüz <b>yöneticisi atanmamış</b>. Yönetici atanana kadar
          kuruma koç eklenemiyor ve öğrenci devredilemiyor; platform
          yöneticisinden atama yapmasını isteyin.
        </div>
      )}

      <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
        KURUMDAKİ KOÇLAR
      </div>
      {yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {meslektaslar.map(u => (
            <div key={u.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 2px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
              fontSize: YAZI.kucuk, color: RENK.metin,
            }}>
              <span style={{ flex: "1 1 140px", minWidth: 140 }}>{u.full_name}</span>
              {u.kurum_rolu === "yonetici" && (
                <span style={{
                  flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: "2px 7px",
                  borderRadius: KOSE.tam, background: c.light, color: c.text,
                }}>yönetici</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.55, marginTop: BOSLUK.m }}>
        Soru bankası, envanter ve okuma kitaplarınızdan <b>"kurumumdaki diğer
        koçlar da görebilsin"</b> işaretlediklerinizi buradaki koçlar
        görüyor. İşaretlemedikleriniz yalnız sizde kalıyor. Öğrencileriniz
        ve onların verileri kurumla paylaşılmıyor.
      </div>
    </Card>
  );
}

// Kurum logosu — yükleme ve kaldırma.
//
// Logo üst barda kurumun koçlarına, onların öğrencilerine ve
// velilerine görünüyor. Kurum rengi BİLEREK yok: kişiselleştirme yeni
// eklendi ve kurum rengi kullanıcının seçtiği paleti sessizce geri
// almış olurdu.
function KurumLogosu({ kurumId, kurumAdi, color: c }) {
  const [adres, setAdres] = useState(null);
  const [yol, setYol] = useState(null);
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState(null);

  const yukle = useCallback(async () => {
    if (!kurumId) return;
    const { veri } = await calistir(
      supabase.from("kurumlar").select("logo_url").eq("id", kurumId).maybeSingle(),
      "Kurum logosu", { sessiz: true });
    const l = veri?.logo_url ?? null;
    setYol(l);
    setAdres(l ? await imzaliUrl(l) : null);
  }, [kurumId]);

  useEffect(() => { yukle(); }, [yukle]);

  const sec = async (dosya) => {
    if (!dosya) return;
    const dosyaHatasi = dosyaGecerli(dosya);
    if (dosyaHatasi) { setHata(dosyaHatasi); return; }
    setIslemde(true);
    setHata(null);

    // Logo küçük bir karede duruyor; 256 piksel fazlasıyla yetiyor.
    const kucuk = await gorseliKucult(dosya, { enBuyuk: 256, esik: 0 });
    // Zaman damgası: sabit ad kullanılsaydı yeni logo yüklendiğinde
    // tarayıcı eskisini önbellekten göstermeye devam ederdi.
    const uzanti = (kucuk.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? ".jpg").toLowerCase();
    const yeniYol = `kurum/${kurumId}/logo-${Date.now()}${uzanti}`;

    const { error } = await supabase.storage
      .from("homework").upload(yeniYol, kucuk, { upsert: true, contentType: kucuk.type });
    if (error) {
      setIslemde(false);
      setHata("Logo yüklenemedi: " + error.message);
      return;
    }
    const { hata: h } = await calistir(
      supabase.from("kurumlar").update({ logo_url: yeniYol }).eq("id", kurumId),
      "Logo adresi");
    if (!h && yol) {
      // Eski dosya artık hiçbir yerden gösterilmiyor.
      await calistir(supabase.storage.from("homework").remove([yol]),
        "Eski logoyu silme", { sessiz: true });
    }
    setIslemde(false);
    if (h) { setHata("Logo kaydedilemedi."); return; }
    await yukle();
  };

  const kaldir = async () => {
    if (!confirm("Kurum logosu kaldırılsın mı? Üst barda platform markası görünür.")) return;
    setIslemde(true);
    const { hata: h } = await calistir(
      supabase.from("kurumlar").update({ logo_url: null }).eq("id", kurumId), "Logo kaldirma");
    if (!h && yol) {
      await calistir(supabase.storage.from("homework").remove([yol]),
        "Logoyu silme", { sessiz: true });
    }
    setIslemde(false);
    await yukle();
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: BOSLUK.s,
      padding: BOSLUK.m, borderRadius: KOSE.m, border: `1px solid ${RENK.cizgi}`,
      marginBottom: BOSLUK.m,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: KOSE.s, flexShrink: 0, overflow: "hidden",
        background: RENK.yuzey, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {adres
          ? <img src={adres} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          : <span style={{ fontSize: 18 }}>🏫</span>}
      </div>

      <div style={{ flex: "1 1 160px", minWidth: 160 }}>
        <div style={{ fontSize: YAZI.ikincil, fontWeight: 600, color: RENK.metin }}>
          {kurumAdi ?? "Kurum"} logosu
        </div>
        <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
          Üst barda kurumunuzun koçlarına, öğrencilerine ve velilerine
          görünür. Renk kişisel seçim olarak kalıyor.
        </div>
        {hata && (
          <div style={{ fontSize: 11.5, color: RENK.hata.metin, marginTop: 4 }}>{hata}</div>
        )}
      </div>

      <label style={{
        flexShrink: 0, padding: "6px 13px", borderRadius: KOSE.tam, cursor: "pointer",
        border: `1.5px solid ${c.mid}`, background: "#fff", color: c.text,
        fontSize: YAZI.mikro, fontWeight: 600,
      }}>
        {islemde ? "..." : adres ? "Değiştir" : "Logo yükle"}
        <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
          disabled={islemde}
          onChange={e => { const d = e.target.files?.[0]; e.target.value = ""; sec(d); }} />
      </label>
      {adres && (
        <button onClick={kaldir} disabled={islemde} style={{
          flexShrink: 0, background: "none", border: "none", cursor: "pointer",
          color: RENK.hata.metin, fontSize: YAZI.mikro,
        }}>kaldır</button>
      )}
    </div>
  );
}
