import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { imzaliUrlListesi } from "../lib/depo";
import { dosyaGecerli } from "../lib/soruSayfasi";
import { gorseliKucult } from "../lib/gorselKucult";
import { sureMetni, kalanGun, ilerlemeYuzdesi, geridemi } from "../lib/okuma";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import GuvenliGorsel from "./GuvenliGorsel";

// Koçun okuma yönetimi: kitap tanımlama, öğrenciye atama, ilerleme.
//
// ── KİTAP BİR KEZ, ATAMA ÇOK ────────────────────────────────────
// Kitap on öğrenciye atanabiliyor. Atama başına kapak yüklenseydi aynı
// fotoğraf on kez depoya giderdi.
//
// ── KAPAK KİTAP SATIRINDAN SONRA YÜKLENİYOR ─────────────────────
// Depo politikası izni kitap satırından okuyor (`kitaplar/<kitap_id>/`),
// yani satır olmadan yükleme reddediliyor. Sıra: satırı aç → kapağı
// yükle → kapak_url'i yaz. Ters sıra çalışmaz.
//
// ── "GERİDE" İLERLEMEDEN ÇIKIYOR ────────────────────────────────
// Geri sayım tek başına koça bir şey söylemiyor. Geçen günün oranı ile
// okunan sayfanın oranı karşılaştırılıp %15'ten fazla sapma "geride"
// sayılıyor; eşik, bir gün okumayan öğrenciyi uyarmamak için.
export default function OkumaYonetimi({ userId, students = [], color: c, baslik = "Okuma Programı" }) {
  const [kitaplar, setKitaplar] = useState([]);
  const [atamalar, setAtamalar] = useState([]);
  const [imzalar, setImzalar] = useState({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [form, setForm] = useState(null);         // yeni kitap formu
  const [acikKitap, setAcikKitap] = useState(null);
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const [{ veri: kLar }, { veri: aLar }] = await Promise.all([
      calistir(supabase.from("okuma_kitaplari").select("*")
        .eq("sahip_id", userId).order("created_at", { ascending: false }),
        "Okuma kitaplari", { sessiz: true }),
      calistir(supabase.from("okuma_atamalari").select("*")
        .order("baslangic", { ascending: false }),
        "Okuma atamalari", { sessiz: true }),
    ]);
    const liste = kLar ?? [];
    setKitaplar(liste);
    setAtamalar(aLar ?? []);
    setYukleniyor(false);

    const yollar = [...new Set(liste.map(k => k.kapak_url).filter(Boolean))];
    setImzalar(yollar.length > 0 ? await imzaliUrlListesi(yollar) : {});
  }, [userId]);

  useEffect(() => { yukle(); }, [yukle]);

  const adBul = (id) => students.find(s => s.id === id)?.full_name ?? "—";

  const kitapEkle = async () => {
    const ad = form.ad.trim();
    if (!ad) { setHata("Kitap adı girin."); return; }
    const dosyaHatasi = form.dosya ? dosyaGecerli(form.dosya) : null;
    if (dosyaHatasi) { setHata(dosyaHatasi); return; }

    setIslemde(true);
    setHata(null);

    // 1) Satır. Kapak yolu kitap kimliğini içerdiği ve depo politikası
    //    izni o satırdan okuduğu için ÖNCE satır açılıyor.
    const { veri, hata: h } = await calistir(
      supabase.from("okuma_kitaplari").insert({
        sahip_id: userId, ad,
        yazar: form.yazar.trim() || null,
        toplam_sayfa: form.toplam_sayfa ? Number(form.toplam_sayfa) : null,
      }).select("id").single(),
      "Kitap ekleme"
    );
    if (h) { setIslemde(false); return; }

    // 2) Kapak (varsa) ve 3) adresin yazılması
    if (form.dosya && veri?.id) {
      // Kapak küçük bir dikdörtgende gösteriliyor; 800 piksel fazlasıyla yeter.
      const kapak = await gorseliKucult(form.dosya, { enBuyuk: 800 });
      const uzanti = (kapak.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? ".jpg").toLowerCase();
      const yol = `kitaplar/${veri.id}/kapak${uzanti}`;
      const { error: depoHatasi } = await supabase.storage
        .from("homework").upload(yol, kapak, { upsert: true, contentType: kapak.type });
      if (depoHatasi) {
        // Kitap kaydı duruyor, yalnız kapak yok: kullanıcıya söylenip
        // bırakılıyor. Kitabı silmek, girilen bilgiyi de çöpe atardı.
        setHata("Kitap eklendi ama kapak yüklenemedi: " + depoHatasi.message);
      } else {
        await calistir(
          supabase.from("okuma_kitaplari").update({ kapak_url: yol }).eq("id", veri.id),
          "Kapak adresi", { sessiz: true });
      }
    }

    setIslemde(false);
    setForm(null);
    await yukle();
  };

  const ata = async (kitap, ogrenciIdleri, gunSayisi) => {
    if (ogrenciIdleri.length === 0) return;
    setIslemde(true);
    const { hata: h } = await calistir(
      supabase.from("okuma_atamalari").insert(ogrenciIdleri.map(sid => ({
        kitap_id: kitap.id, student_id: sid, atayan_id: userId,
        gun_sayisi: Number(gunSayisi) || 20,
      }))),
      "Okuma atama"
    );
    setIslemde(false);
    if (!h) await yukle();
  };

  const gunEkle = async (atama, ek) => {
    const { hata: h } = await calistir(
      supabase.from("okuma_atamalari")
        .update({ gun_sayisi: atama.gun_sayisi + ek }).eq("id", atama.id),
      "Sure uzatma");
    if (!h) await yukle();
  };

  const atamaSil = async (atama) => {
    if (!confirm(`${adBul(atama.student_id)} için bu atama kaldırılsın mı?`)) return;
    const { hata: h } = await calistir(
      supabase.from("okuma_atamalari").delete().eq("id", atama.id), "Atama silme");
    if (!h) await yukle();
  };

  const kitapSil = async (kitap) => {
    const adet = atamalar.filter(a => a.kitap_id === kitap.id).length;
    if (!confirm(`"${kitap.ad}" ve ${adet} atama silinsin mi?`)) return;
    const { hata: h } = await calistir(
      supabase.from("okuma_kitaplari").delete().eq("id", kitap.id), "Kitap silme");
    if (h) return;
    if (kitap.kapak_url) {
      await calistir(supabase.storage.from("homework").remove([kitap.kapak_url]),
        "Kapagi silme", { sessiz: true });
    }
    await yukle();
  };

  const girdi = {
    width: "100%", padding: "8px 10px", borderRadius: KOSE.s, boxSizing: "border-box",
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, fontFamily: "inherit",
  };

  return (
    <Card id="bolum-okuma">
      <SectionTitle title={baslik} color={c.mid} />

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: BOSLUK.s, marginBottom: BOSLUK.m,
      }}>
        <span style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil }}>
          {kitaplar.length} kitap · {atamalar.filter(a => a.durum === "devam").length} devam eden
        </span>
        {!form && (
          <button onClick={() => setForm({ ad: "", yazar: "", toplam_sayfa: "", dosya: null })} style={{
            flexShrink: 0, padding: "6px 14px", borderRadius: KOSE.tam, border: "none",
            background: c.bg, color: "#fff", fontSize: YAZI.mikro, fontWeight: 700, cursor: "pointer",
          }}>+ Kitap ekle</button>
        )}
      </div>

      {form && (
        <div style={{
          display: "flex", flexDirection: "column", gap: BOSLUK.s,
          padding: BOSLUK.m, borderRadius: KOSE.m, border: `1.5px solid ${c.mid}`,
          marginBottom: BOSLUK.m,
        }}>
          <input placeholder="Kitap adı" value={form.ad} style={girdi}
            onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} />
          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <input placeholder="Yazar (isteğe bağlı)" value={form.yazar} style={{ ...girdi, flex: 1 }}
              onChange={e => setForm(f => ({ ...f, yazar: e.target.value }))} />
            <input type="number" min={1} placeholder="Sayfa" value={form.toplam_sayfa}
              style={{ ...girdi, width: 92 }}
              onChange={e => setForm(f => ({ ...f, toplam_sayfa: e.target.value }))} />
          </div>
          <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil }}>
            <div style={{ marginBottom: 3 }}>Kapak fotoğrafı (isteğe bağlı)</div>
            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ ...girdi, padding: 7 }}
              onChange={e => setForm(f => ({ ...f, dosya: e.target.files?.[0] ?? null }))} />
          </label>
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
            Sayfa sayısı girilirse öğrenci ilerlemesini sayfa sayarak
            bildiriyor ve günlük hedefi görüyor; girilmezse yalnız
            "bitirdim" işareti kalıyor.
          </div>
          {hata && (
            <div style={{
              background: RENK.hata.zemin, color: RENK.hata.metin, fontSize: 11.5,
              padding: "8px 10px", borderRadius: KOSE.s, lineHeight: 1.5,
            }}>{hata}</div>
          )}
          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <button onClick={kitapEkle} disabled={islemde || !form.ad.trim()} style={{
              flex: 1, padding: "9px 0", borderRadius: KOSE.m, border: "none",
              background: form.ad.trim() ? c.bg : "#ddd", color: "#fff",
              fontSize: YAZI.ikincil, fontWeight: 700,
              cursor: form.ad.trim() ? "pointer" : "default",
            }}>{islemde ? "Ekleniyor..." : "Kitabı ekle"}</button>
            <button onClick={() => { setForm(null); setHata(null); }} style={{
              padding: "9px 14px", borderRadius: KOSE.m, cursor: "pointer",
              border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
              fontSize: YAZI.ikincil, color: RENK.metinIkincil,
            }}>Vazgeç</button>
          </div>
        </div>
      )}

      {yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      ) : kitaplar.length === 0 ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk, lineHeight: 1.5 }}>
          Henüz kitap yok. Kapak fotoğrafı, süre ve öğrenci seçerek okuma
          programı verebilirsiniz.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
          {kitaplar.map(k => {
            const kendi = atamalar.filter(a => a.kitap_id === k.id);
            const acik = acikKitap === k.id;
            return (
              <div key={k.id} style={{
                border: `1px solid ${RENK.cizgi}`, borderRadius: KOSE.m, overflow: "hidden",
              }}>
                <div onClick={() => setAcikKitap(acik ? null : k.id)} style={{
                  display: "flex", gap: BOSLUK.s, alignItems: "center",
                  padding: "10px 12px", cursor: "pointer",
                  background: acik ? RENK.yuzey : "#fff",
                }}>
                  <div style={{
                    width: 38, height: 54, borderRadius: KOSE.s, flexShrink: 0,
                    background: RENK.yuzey, overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {k.kapak_url && imzalar[k.kapak_url] ? (
                      <GuvenliGorsel url={k.kapak_url} alt={k.ad}
                        yedek={<span style={{ fontSize: 16 }}>📖</span>}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : <span style={{ fontSize: 16 }}>📖</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: YAZI.ikincil, fontWeight: 600, color: RENK.metin }}>{k.ad}</div>
                    <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>
                      {[k.yazar, k.toplam_sayfa ? `${k.toplam_sayfa} sayfa` : null,
                        `${kendi.length} öğrenci`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, color: RENK.metinSilik, fontSize: 12 }}>
                    {acik ? "▾" : "▸"}
                  </span>
                </div>

                {acik && (
                  <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${RENK.cizgiSolgun}` }}>
                    <AtamaFormu kitap={k} students={students} atamalar={kendi}
                      color={c} islemde={islemde} onAta={ata} />

                    {kendi.length > 0 && (
                      <div style={{ marginTop: BOSLUK.s }}>
                        {kendi.map(a => {
                          const bitti = a.durum === "bitti";
                          const kalanG = kalanGun(a.baslangic, a.gun_sayisi);
                          const gecikti = !bitti && kalanG != null && kalanG <= 0;
                          const geride = !bitti && !gecikti &&
                            geridemi(k.toplam_sayfa, a.okunan_sayfa, a.baslangic, a.gun_sayisi);
                          const yuzde = ilerlemeYuzdesi(a.okunan_sayfa, k.toplam_sayfa);
                          return (
                            <div key={a.id} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "6px 0", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
                              fontSize: YAZI.kucuk,
                            }}>
                              <span style={{ flex: 1, minWidth: 0, color: RENK.metin }}>
                                {adBul(a.student_id)}
                              </span>
                              <span style={{
                                flexShrink: 0, fontSize: YAZI.mikro,
                                color: bitti ? RENK.basari.metin
                                  : gecikti ? RENK.hata.metin
                                  : geride ? RENK.uyari.metin : RENK.metinSoluk,
                                fontWeight: (gecikti || geride) ? 700 : 500,
                              }}>
                                {bitti ? "✓ bitirdi"
                                  : <>
                                      {yuzde != null && `%${yuzde} · `}
                                      {sureMetni(a.baslangic, a.gun_sayisi)}
                                      {geride && " · geride"}
                                    </>}
                              </span>
                              {!bitti && (
                                <button onClick={() => gunEkle(a, 7)} title="7 gün ekle" style={{
                                  flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                                  color: c.mid, fontSize: YAZI.mikro,
                                }}>+7g</button>
                              )}
                              <button onClick={() => atamaSil(a)} style={{
                                flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                                color: RENK.hata.metin, fontSize: YAZI.mikro,
                              }}>kaldır</button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button onClick={() => kitapSil(k)} style={{
                      marginTop: BOSLUK.s, background: "none", border: "none", cursor: "pointer",
                      color: RENK.hata.metin, fontSize: YAZI.mikro, padding: 0,
                    }}>Kitabı sil</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// Bir kitabı öğrencilere atama. Zaten ataması olan öğrenci listede
// görünmüyor: aynı kitabı aynı öğrenciye iki kez atamak veritabanı
// kısıtına takılırdı ve hata mesajı sebebi anlatmazdı.
function AtamaFormu({ kitap, students, atamalar, color: c, islemde, onAta }) {
  const [secili, setSecili] = useState([]);
  const [gun, setGun] = useState(20);

  const atanmis = new Set(atamalar.map(a => a.student_id));
  const uygun = students.filter(s => !atanmis.has(s.id));

  if (uygun.length === 0) {
    return (
      <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, paddingTop: BOSLUK.s, lineHeight: 1.5 }}>
        Bu kitap bütün öğrencilerinize atanmış.
      </div>
    );
  }

  return (
    <div style={{ paddingTop: BOSLUK.s }}>
      <div style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil, marginBottom: 5 }}>
        Öğrenci seç ve kaç günde bitireceğini yaz:
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: BOSLUK.s }}>
        {uygun.map(s => {
          const isaretli = secili.includes(s.id);
          return (
            <button key={s.id}
              onClick={() => setSecili(v => isaretli ? v.filter(x => x !== s.id) : [...v, s.id])}
              style={{
                padding: "4px 10px", borderRadius: KOSE.tam, cursor: "pointer",
                fontSize: YAZI.mikro, fontFamily: "inherit",
                border: `1.5px solid ${isaretli ? c.bg : RENK.cizgi}`,
                background: isaretli ? c.light : "#fff",
                color: isaretli ? c.text : RENK.metinIkincil,
                fontWeight: isaretli ? 600 : 400,
              }}>{s.full_name}</button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="number" min={1} max={365} value={gun}
          onChange={e => setGun(e.target.value)}
          style={{
            width: 70, padding: "7px 9px", borderRadius: KOSE.s,
            border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil,
            fontFamily: "inherit", boxSizing: "border-box",
          }} />
        <span style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>gün</span>
        <button
          onClick={() => { onAta(kitap, secili, gun); setSecili([]); }}
          disabled={islemde || secili.length === 0} style={{
            flex: 1, padding: "7px 0", borderRadius: KOSE.m, border: "none",
            background: secili.length === 0 ? "#ddd" : c.bg, color: "#fff",
            fontSize: YAZI.mikro, fontWeight: 700,
            cursor: secili.length === 0 ? "default" : "pointer",
          }}>
          {secili.length === 0 ? "Öğrenci seçin" : `${secili.length} öğrenciye ata`}
        </button>
      </div>
    </div>
  );
}
