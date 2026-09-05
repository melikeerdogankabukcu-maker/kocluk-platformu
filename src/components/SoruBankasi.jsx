import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { useTopics } from "../lib/TopicsContext";
import { sayfaSayisi } from "../lib/icindekiler";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import IcindekilerAktar from "./IcindekilerAktar";

// Koçun soru bankası kitaplığı.
//
// Kitap bir kez ekleniyor ve koçun bütün öğrencileri için kullanılıyor:
// aynı kitabı beş öğrenci çözüyorsa içindekiler beş kez ayrıştırılmasın.
// Öğrenci ve veli kitabı GÖRÜYOR ama değiştiremiyor (RLS); kitaplık
// koçun ders malzemesi.
//
// Bölümlerin müfredat konusuna bağlanması ödev önerisinin temeli:
// "öğrenci şu konuda zayıf" bilgisi zaten var, eksik olan o konunun
// hangi kitabın hangi sayfalarında olduğuydu.
export default function SoruBankasi({ userId, color: c }) {
  const { sinavTurleri, examSubjectsOf, topicsOf } = useTopics();

  const [acik,     setAcik]     = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [bankalar, setBankalar] = useState([]);
  const [bolumMap, setBolumMap] = useState({});      // banka_id -> bölümler
  const [secili,   setSecili]   = useState(null);    // açık kitabın id'si
  const [yeniForm, setYeniForm] = useState(null);    // null = form kapalı
  const [aktaran,  setAktaran]  = useState(null);    // içindekiler aktarılan kitabın id'si
  const [islemde,  setIslemde]  = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const { veri } = await calistir(
      supabase.from("soru_bankalari").select("*").order("created_at", { ascending: false }),
      "Soru bankalari"
    );
    const liste = veri ?? [];
    setBankalar(liste);

    if (liste.length > 0) {
      // Bölümler tek sorguda: kitap başına ayrı istek, on kitaplı bir
      // kütüphanede on tur demekti.
      const { veri: bolumler } = await calistir(
        supabase.from("soru_bankasi_bolumleri").select("*")
          .in("banka_id", liste.map(b => b.id))
          .order("sira", { ascending: true }),
        "Soru bankasi bolumleri", { sessiz: true }
      );
      const harita = {};
      (bolumler ?? []).forEach(b => { (harita[b.banka_id] ??= []).push(b); });
      setBolumMap(harita);
    } else setBolumMap({});

    setYukleniyor(false);
  }, []);

  useEffect(() => { if (acik) yukle(); }, [acik, yukle]);

  const kitapEkle = async () => {
    if (!yeniForm?.ad?.trim()) return;
    setIslemde(true);
    const { hata } = await calistir(
      supabase.from("soru_bankalari").insert({
        sahip_id:   userId,
        ad:         yeniForm.ad.trim(),
        yayinevi:   yeniForm.yayinevi?.trim() || null,
        sinav_turu: yeniForm.sinav_turu || null,
        ders:       yeniForm.ders || null,
      }),
      "Kitap ekleme"
    );
    setIslemde(false);
    if (hata) return;
    setYeniForm(null);
    yukle();
  };

  const kitapSil = async (b) => {
    const adet = (bolumMap[b.id] ?? []).length;
    if (!window.confirm(
      `"${b.ad}" kitaplıktan silinsin mi?\n\n` +
      (adet > 0 ? `${adet} bölüm de silinecek. ` : "") +
      `Bu kitaptan verilmiş görevler silinmez, kaynak bağı kopar.`
    )) return;
    setIslemde(true);
    const { hata } = await calistir(
      supabase.from("soru_bankalari").delete().eq("id", b.id),
      "Kitap silme"
    );
    setIslemde(false);
    if (hata) return;
    if (secili === b.id) setSecili(null);
    yukle();
  };

  // İçindekiler kaydı: önce eski bölümler siliniyor, sonra yenileri
  // yazılıyor. Üstüne eklemek, ikinci kez aktaran koçta her bölümü iki
  // kez gösterirdi ve hangisinin güncel olduğu belli olmazdı.
  const bolumleriKaydet = async (banka, bolumler) => {
    setIslemde(true);
    const { hata: silmeHatasi } = await calistir(
      supabase.from("soru_bankasi_bolumleri").delete().eq("banka_id", banka.id),
      "Eski bolumleri silme"
    );
    if (silmeHatasi) { setIslemde(false); return; }

    const { hata } = await calistir(
      supabase.from("soru_bankasi_bolumleri").insert(
        bolumler.map(b => ({
          banka_id:  banka.id,
          sira:      b.sira,
          baslik:    b.baslik,
          konu:      b.konu || null,
          sayfa_bas: b.sayfaBas ?? null,
          sayfa_son: b.sayfaSon ?? null,
        }))
      ),
      "Bolum kaydetme"
    );
    setIslemde(false);
    if (hata) return;
    setAktaran(null);
    setSecili(banka.id);
    yukle();
  };

  // Kitabın dersine ait müfredat konuları. Ders seçilmemişse o sınavın
  // tüm dersleri birleştiriliyor — eşleştirme yine çalışsın.
  const kitabinKonulari = (banka) => {
    const tur = banka.sinav_turu || sinavTurleri[0];
    if (banka.ders) return topicsOf(tur, banka.ders);
    return examSubjectsOf(tur).flatMap(d => topicsOf(tur, d));
  };

  const girdiStil = {
    width: "100%", boxSizing: "border-box", padding: "9px 12px",
    borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil,
  };

  const aktarilanKitap = bankalar.find(b => b.id === aktaran);

  return (
    <Card id="bolum-soru-bankasi">
      <SectionTitle title={`Soru Bankası${bankalar.length ? ` (${bankalar.length})` : ""}`}
        color={c.mid} acik={acik} onToggle={() => setAcik(v => !v)} />

      {!acik ? null : yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinCokSoluk, padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : aktarilanKitap ? (
        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>
          <div style={{ fontSize: YAZI.govde, fontWeight: 700, color: RENK.metinBaslik }}>
            {aktarilanKitap.ad} — içindekiler
          </div>
          <IcindekilerAktar
            konular={kitabinKonulari(aktarilanKitap)}
            color={c}
            kaydediliyor={islemde}
            onKaydet={(bolumler) => bolumleriKaydet(aktarilanKitap, bolumler)}
            onVazgec={() => setAktaran(null)}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
          {/* Kitap listesi */}
          {bankalar.length === 0 && !yeniForm && (
            <div style={{ fontSize: YAZI.ikincil, color: RENK.metinCokSoluk, padding: "10px 0", textAlign: "center", lineHeight: 1.55 }}>
              Henüz kitap yok. Kullandığınız soru bankalarını ekleyip
              içindekilerini aktarın; ödev önerileri bu kitapların
              sayfalarından çıkacak.
            </div>
          )}

          {bankalar.map(b => {
            const bolumler = bolumMap[b.id] ?? [];
            const bagli = bolumler.filter(x => x.konu).length;
            const isOpen = secili === b.id;
            return (
              <div key={b.id} style={{
                borderRadius: KOSE.m, border: `1px solid ${RENK.cizgi}`,
                background: RENK.yuzey, overflow: "hidden",
              }}>
                <div onClick={() => setSecili(isOpen ? null : b.id)} style={{
                  display: "flex", alignItems: "center", gap: BOSLUK.s,
                  padding: `${BOSLUK.s}px ${BOSLUK.m}px`, cursor: "pointer",
                }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>📕</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: YAZI.ikincil, fontWeight: 600, color: RENK.metin }}>{b.ad}</div>
                    <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: 1 }}>
                      {[b.yayinevi, b.sinav_turu, b.ders].filter(Boolean).join(" · ") || "bilgi girilmedi"}
                    </div>
                  </div>
                  <span style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk, flexShrink: 0 }}>
                    {bolumler.length === 0 ? "içindekiler yok" : `${bagli}/${bolumler.length} bölüm bağlı`}
                  </span>
                  <span style={{ fontSize: YAZI.kucuk, color: c.mid, fontWeight: 700, flexShrink: 0 }}>
                    {isOpen ? "▴" : "▾"}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ padding: `0 ${BOSLUK.m}px ${BOSLUK.m}px`, display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
                    {bolumler.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 260, overflowY: "auto" }}>
                        {bolumler.map(x => (
                          <div key={x.id} style={{
                            display: "flex", gap: BOSLUK.s, alignItems: "baseline",
                            fontSize: YAZI.kucuk, padding: "3px 0",
                            borderBottom: `1px solid ${RENK.cizgiSolgun}`,
                          }}>
                            <span style={{ color: RENK.metinSilik, flexShrink: 0, minWidth: 54 }}>
                              {x.sayfa_bas}–{x.sayfa_son ?? "?"}
                            </span>
                            <span style={{ flex: 1, minWidth: 0, color: RENK.metin }}>{x.baslik}</span>
                            <span style={{
                              flexShrink: 0, fontSize: YAZI.mikro,
                              color: x.konu ? c.text : RENK.uyari.metin,
                            }}>{x.konu ?? "bağlanmadı"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: BOSLUK.s }}>
                      <button onClick={() => setAktaran(b.id)} style={{
                        flex: 1, padding: "8px 0", borderRadius: KOSE.m,
                        border: `1.5px dashed ${c.mid}`, background: "transparent",
                        color: c.mid, fontSize: YAZI.ikincil, fontWeight: 600, cursor: "pointer",
                      }}>
                        {bolumler.length === 0 ? "İçindekileri aktar" : "İçindekileri yeniden aktar"}
                      </button>
                      <button onClick={() => kitapSil(b)} disabled={islemde} style={{
                        padding: "8px 14px", borderRadius: KOSE.m,
                        border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
                        color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
                      }}>Sil</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Yeni kitap */}
          {yeniForm ? (
            <div style={{
              display: "flex", flexDirection: "column", gap: BOSLUK.s,
              padding: BOSLUK.m, borderRadius: KOSE.m, border: `1.5px solid ${c.mid}`,
            }}>
              <input autoFocus placeholder="Kitap adı (ör. TYT Matematik Soru Bankası)"
                value={yeniForm.ad}
                onChange={e => setYeniForm(f => ({ ...f, ad: e.target.value }))}
                style={girdiStil} />
              <input placeholder="Yayınevi (isteğe bağlı)" value={yeniForm.yayinevi}
                onChange={e => setYeniForm(f => ({ ...f, yayinevi: e.target.value }))}
                style={girdiStil} />
              <div style={{ display: "flex", gap: BOSLUK.s }}>
                <select value={yeniForm.sinav_turu}
                  onChange={e => setYeniForm(f => ({ ...f, sinav_turu: e.target.value, ders: "" }))}
                  style={{ ...girdiStil, flex: 1 }}>
                  <option value="">Sınav türü...</option>
                  {sinavTurleri.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={yeniForm.ders}
                  onChange={e => setYeniForm(f => ({ ...f, ders: e.target.value }))}
                  style={{ ...girdiStil, flex: 1 }}>
                  <option value="">Ders...</option>
                  {(yeniForm.sinav_turu ? examSubjectsOf(yeniForm.sinav_turu) : []).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
                Ders seçmek eşleştirmeyi belirgin biçimde iyileştirir: konu
                yalnızca o dersin müfredatında aranır.
              </div>
              <div style={{ display: "flex", gap: BOSLUK.s }}>
                <button onClick={kitapEkle} disabled={islemde || !yeniForm.ad.trim()} style={{
                  flex: 1, padding: "10px 0", borderRadius: KOSE.m, border: "none",
                  background: yeniForm.ad.trim() ? c.bg : "#ddd", color: "#fff",
                  fontSize: YAZI.ikincil, fontWeight: 700, cursor: "pointer",
                }}>{islemde ? "Ekleniyor..." : "Kitabı ekle"}</button>
                <button onClick={() => setYeniForm(null)} style={{
                  padding: "10px 16px", borderRadius: KOSE.m,
                  border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
                  color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
                }}>Vazgeç</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setYeniForm({ ad: "", yayinevi: "", sinav_turu: "", ders: "" })} style={{
              padding: "10px 0", borderRadius: KOSE.m,
              border: `1.5px dashed ${c.mid}`, background: "transparent",
              color: c.mid, fontSize: YAZI.ikincil, fontWeight: 600, cursor: "pointer",
            }}>+ Kitap ekle</button>
          )}
        </div>
      )}
    </Card>
  );
}
