import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { useTopics } from "../lib/TopicsContext";
import { sayfaSayisi } from "../lib/icindekiler";
import { sadelestir } from "../lib/konuEslestir";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import IcindekilerAktar from "./IcindekilerAktar";

// Soru bankası kitaplığı — hem koçta hem öğrencide.
//
// Koçun eklediği kitap bütün öğrencileri için ortak: aynı kitabı beş
// öğrenci çözüyorsa içindekiler beş kez ayrıştırılmasın. Öğrenci de
// KENDİ elindeki kaynağı ekleyebiliyor; koç onu görüyor, çünkü
// öğrencinin elinde olmayan bir kitaptan ödev veremez.
//
// ── EKLEYEN YÖNETİR ─────────────────────────────────────────────
// Herkes yalnızca kendi eklediği kaynağı düzenleyip silebiliyor (RLS).
// Karşı tarafın kitabı listede salt okunur duruyor: kimin ne eklediği
// belli olsun ve kimse ötekinin kaynağını sessizce değiştirmesin.
//
// Bölümlerin müfredat konusuna bağlanması ödev önerisinin temeli:
// "öğrenci şu konuda zayıf" bilgisi zaten var, eksik olan o konunun
// hangi kitabın hangi sayfalarında olduğuydu.
export default function SoruBankasi({ userId, students = [], color: c, rol = "teacher" }) {
  const { sinavTurleri, examSubjectsOf, topicsOf } = useTopics();

  const [acik,     setAcik]     = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [bankalar, setBankalar] = useState([]);
  const [bolumMap, setBolumMap] = useState({});      // banka_id -> bölümler
  const [secili,   setSecili]   = useState(null);    // açık kitabın id'si
  const [yeniForm, setYeniForm] = useState(null);    // null = form kapalı
  const [aktaran,  setAktaran]  = useState(null);    // içindekiler aktarılan kitabın id'si
  const [duzenlenen, setDuzenlenen] = useState(null); // { id, ad, yayinevi, sinav_turu, ders }
  const [islemde,  setIslemde]  = useState(false);
  const [bilgi,    setBilgi]    = useState(null);   // son işlemin sonucu
  // banka_id -> Set(student_id). Boş küme = tüm öğrencilere açık.
  const [atamalar, setAtamalar] = useState({});

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const { veri } = await calistir(
      supabase.from("soru_bankalari")
        .select("*, sahip:users!soru_bankalari_sahip_id_fkey(full_name)")
        .order("created_at", { ascending: false }),
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

      // Tablo yoksa (migration çalışmadıysa) sessizce boş geçiyor:
      // tanımlama olmadan da kitaplık eskisi gibi çalışıyor.
      const { veri: atama } = await calistir(
        supabase.from("soru_bankasi_atamalari").select("*")
          .in("banka_id", liste.map(b => b.id)),
        "Kaynak atamalari", { sessiz: true }
      );
      const aHarita = {};
      (atama ?? []).forEach(a => { (aHarita[a.banka_id] ??= new Set()).add(a.student_id); });
      setAtamalar(aHarita);
    } else { setBolumMap({}); setAtamalar({}); }

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

  // Kaynak bilgilerini güncelle. Bölümlere DOKUNMUYOR: kitabın adını
  // düzeltmek içindekileri yeniden aktarmayı gerektirmemeli.
  const kitapGuncelle = async () => {
    if (!duzenlenen?.ad?.trim()) return;
    setIslemde(true);
    const { hata } = await calistir(
      supabase.from("soru_bankalari").update({
        ad:         duzenlenen.ad.trim(),
        yayinevi:   duzenlenen.yayinevi?.trim() || null,
        sinav_turu: duzenlenen.sinav_turu || null,
        ders:       duzenlenen.ders || null,
      }).eq("id", duzenlenen.id),
      "Kaynak guncelleme"
    );
    setIslemde(false);
    if (hata) return;
    setDuzenlenen(null);
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

  // İçindekiler kaydı — ÜSTÜNE YAZMIYOR, EKLİYOR.
  //
  // Önceki sürüm önce bütün bölümleri siliyordu. Sonucu şuydu: bir
  // kitabın içindekileri iki sayfaysa, ikinci sayfayı aktaran koç
  // birinciyi kaybediyordu — üstelik bunu ancak kaydettikten sonra
  // fark ediyordu. İçindekiler çoğu kitapta birden fazla sayfa ve
  // fotoğraf fotoğraf aktarılıyor; doğal akış eklemek.
  //
  // ── TEKRAR EDENLER ATLANIYOR ──────────────────────────────────
  // Ekleme, aynı sayfayı iki kez aktaran koçta her bölümü iki kez
  // gösterme riski taşıyor. Aynı başlık + aynı başlangıç sayfası
  // zaten varsa o satır yazılmıyor ve koça kaç tanesinin atlandığı
  // söyleniyor.
  const bolumleriKaydet = async (banka, bolumler) => {
    setIslemde(true);
    const mevcut = bolumMap[banka.id] ?? [];
    const anahtar = (baslik, sayfa) => `${sadelestir(baslik)}#${sayfa ?? ""}`;
    const varolan = new Set(mevcut.map(b => anahtar(b.baslik, b.sayfa_bas)));

    const yeniler = bolumler.filter(b => !varolan.has(anahtar(b.baslik, b.sayfaBas)));
    const atlanan = bolumler.length - yeniler.length;

    if (yeniler.length === 0) {
      setIslemde(false);
      setBilgi(`Bu bölümlerin hepsi kitapta zaten var (${atlanan} satır atlandı).`);
      setAktaran(null);
      setSecili(banka.id);
      return;
    }

    // Sıra mevcutların devamından: yeni satırlar listenin sonuna
    // eklensin, araya karışmasın.
    const enBuyukSira = mevcut.reduce((m, b) => Math.max(m, b.sira ?? 0), 0);

    const { hata } = await calistir(
      supabase.from("soru_bankasi_bolumleri").insert(
        yeniler.map((b, i) => ({
          banka_id:  banka.id,
          sira:      enBuyukSira + i + 1,
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
    setBilgi(`${yeniler.length} bölüm eklendi.` +
      (atlanan > 0 ? ` ${atlanan} satır zaten vardı, atlandı.` : ""));
    setAktaran(null);
    setSecili(banka.id);
    yukle();
  };

  // İçindekileri tamamen temizle.
  //
  // Ekleme varsayılan olunca, baştan almak isteyen koçun elinde bir yol
  // kalmıyordu: eskiden yeniden aktarmak sessizce siliyordu, artık
  // silmiyor. Bu düğme o işi AÇIKÇA ve onay alarak yapıyor.
  const bolumleriTemizle = async (banka) => {
    const adet = (bolumMap[banka.id] ?? []).length;
    if (adet === 0) return;
    if (!window.confirm(
      `"${banka.ad}" kitabının ${adet} bölümü silinsin mi?

` +
      `İçindekileri baştan aktarmak için kullanın. Bu kitaptan verilmiş ` +
      `görevler silinmez.`
    )) return;
    setIslemde(true);
    const { hata } = await calistir(
      supabase.from("soru_bankasi_bolumleri").delete().eq("banka_id", banka.id),
      "Bolumleri temizleme"
    );
    setIslemde(false);
    if (hata) return;
    setBilgi(`${adet} bölüm silindi.`);
    yukle();
  };

  // Bir öğrenciyi kaynağa ekle / çıkar.
  //
  // Liste BOŞKEN kaynak tüm öğrencilere açık; ilk öğrenci eklendiği an
  // kural daralıyor. Bu, mevcut kaynakların bu özellik eklenince
  // birdenbire görünmez olmasını engelliyor.
  const atamaDegistir = async (banka, ogrenciId, ekle) => {
    setIslemde(true);
    const { hata } = ekle
      ? await calistir(
          supabase.from("soru_bankasi_atamalari")
            .upsert({ banka_id: banka.id, student_id: ogrenciId },
                    { onConflict: "banka_id,student_id" }),
          "Kaynak atama")
      : await calistir(
          supabase.from("soru_bankasi_atamalari").delete()
            .eq("banka_id", banka.id).eq("student_id", ogrenciId),
          "Kaynak atamasi kaldirma");
    setIslemde(false);
    if (hata) return;
    setAtamalar(a => {
      const kume = new Set(a[banka.id] ?? []);
      if (ekle) kume.add(ogrenciId); else kume.delete(ogrenciId);
      return { ...a, [banka.id]: kume };
    });
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
          {bilgi && (
            <div style={{
              fontSize: YAZI.ikincil, color: RENK.basari.metin, background: RENK.basari.zemin,
              padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.m, lineHeight: 1.5,
            }}>{bilgi}</div>
          )}
          {/* Kitap listesi */}
          {bankalar.length === 0 && !yeniForm && (
            <div style={{ fontSize: YAZI.ikincil, color: RENK.metinCokSoluk, padding: "10px 0", textAlign: "center", lineHeight: 1.55 }}>
              {rol === "student"
                ? "Henüz kaynak yok. Elindeki soru bankalarını ekleyip içindekilerini aktarırsan koçun onlardan ödev verebilir."
                : "Henüz kitap yok. Kullandığınız soru bankalarını ekleyip içindekilerini aktarın; ödev önerileri bu kitapların sayfalarından çıkacak."}
            </div>
          )}

          {bankalar.map(b => {
            const bolumler = bolumMap[b.id] ?? [];
            const bagli = bolumler.filter(x => x.konu).length;
            const isOpen = secili === b.id;
            const benim  = b.sahip_id === userId;
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
                      {[
                        b.yayinevi, b.sinav_turu, b.ders,
                        // Kimin eklediği görünüyor: karşı tarafın kaynağı
                        // salt okunur ve bunun nedeni belli olsun.
                        benim ? null : (b.sahip?.full_name ?? "başkası") + " ekledi",
                      ].filter(Boolean).join(" · ") || "bilgi girilmedi"}
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

                    {/* ── BU KAYNAĞI KİMLER KULLANIYOR ──────────────
                        Kitap fiziksel bir nesne: öğrencinin elinde
                        olmayan kaynaktan ödev vermek anlamsız. Liste
                        BOŞKEN kaynak tüm öğrencilere açık kalıyor —
                        aksi hâlde bu özellik eklendiği anda mevcut
                        kaynaklar hiç kimseye görünmez olurdu. */}
                    {benim && rol !== "student" && students.length > 0 && (() => {
                      const secilenler = atamalar[b.id] ?? new Set();
                      const hepsi = secilenler.size === 0;
                      return (
                        <div style={{
                          padding: BOSLUK.m, borderRadius: KOSE.m,
                          background: RENK.yuzey, border: `1px solid ${RENK.cizgi}`,
                        }}>
                          <div style={{
                            fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinCokSoluk,
                            letterSpacing: 0.3, marginBottom: BOSLUK.s,
                          }}>
                            BU KAYNAK KİMDE VAR — {hepsi
                              ? "tüm öğrencileriniz"
                              : `${secilenler.size} öğrenci`}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: BOSLUK.xs }}>
                            {students.map(o => {
                              const secili2 = secilenler.has(o.id);
                              return (
                                <button key={o.id} disabled={islemde}
                                  onClick={() => atamaDegistir(b, o.id, !secili2)} style={{
                                    padding: "5px 11px", borderRadius: KOSE.tam,
                                    fontSize: YAZI.kucuk, fontWeight: 600, cursor: "pointer",
                                    border: `1.5px solid ${secili2 ? c.bg : RENK.cizgi}`,
                                    background: secili2 ? c.bg : "#fff",
                                    color: secili2 ? "#fff" : RENK.metinSoluk,
                                  }}>{o.full_name}</button>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: BOSLUK.s, lineHeight: 1.5 }}>
                            {hepsi
                              ? "Kimse seçilmediği için bu kaynak tüm öğrencilerinize açık. Bir öğrenci seçtiğinizde yalnızca seçtikleriniz görür ve ödev önerisi yalnızca onlara bu kaynaktan çıkar."
                              : "Yalnızca seçili öğrenciler bu kaynağı görüyor. Hepsinin seçimini kaldırırsanız kaynak yine tüm öğrencilerinize açılır."}
                          </div>
                        </div>
                      );
                    })()}

                    {!benim && (
                      <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
                        Bu kaynağı {b.sahip?.full_name ?? "başka biri"} ekledi; yalnızca ekleyen düzenleyebilir.
                      </div>
                    )}
                    {/* Düzenleme formu — yalnızca ekleyende */}
                    {benim && duzenlenen?.id === b.id && (
                      <div style={{
                        display: "flex", flexDirection: "column", gap: BOSLUK.s,
                        padding: BOSLUK.m, borderRadius: KOSE.m,
                        background: "#fff", border: `1.5px solid ${c.mid}`,
                      }}>
                        <input autoFocus value={duzenlenen.ad} placeholder="Kaynak adı"
                          onChange={e => setDuzenlenen(d => ({ ...d, ad: e.target.value }))}
                          style={girdiStil} />
                        <input value={duzenlenen.yayinevi} placeholder="Yayınevi"
                          onChange={e => setDuzenlenen(d => ({ ...d, yayinevi: e.target.value }))}
                          style={girdiStil} />
                        <div style={{ display: "flex", gap: BOSLUK.s }}>
                          <select value={duzenlenen.sinav_turu}
                            onChange={e => setDuzenlenen(d => ({ ...d, sinav_turu: e.target.value, ders: "" }))}
                            style={{ ...girdiStil, flex: 1 }}>
                            <option value="">Sınav türü...</option>
                            {sinavTurleri.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select value={duzenlenen.ders}
                            onChange={e => setDuzenlenen(d => ({ ...d, ders: e.target.value }))}
                            style={{ ...girdiStil, flex: 1 }}>
                            <option value="">Ders...</option>
                            {(duzenlenen.sinav_turu ? examSubjectsOf(duzenlenen.sinav_turu) : []).map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                        {/* Ders değişikliği kayıtlı bölümlerin konu bağını
                            OTOMATİK yenilemiyor: sessizce yeniden eşleştirseydik
                            koçun elle düzelttiği bağlar da silinirdi. */}
                        {bolumler.length > 0 && duzenlenen.ders !== (b.ders ?? "") && (
                          <div style={{
                            fontSize: YAZI.mikro, color: RENK.uyari.metin, background: RENK.uyari.zemin,
                            padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.s, lineHeight: 1.5,
                          }}>
                            Ders değişiyor. Kayıtlı {bolumler.length} bölümün konu bağı olduğu gibi
                            kalır; yeni derse göre eşleştirmek için içindekileri yeniden aktarın.
                          </div>
                        )}
                        <div style={{ display: "flex", gap: BOSLUK.s }}>
                          <button onClick={kitapGuncelle} disabled={islemde || !duzenlenen.ad.trim()} style={{
                            flex: 1, padding: "9px 0", borderRadius: KOSE.m, border: "none",
                            background: duzenlenen.ad.trim() ? c.bg : "#ddd", color: "#fff",
                            fontSize: YAZI.ikincil, fontWeight: 700, cursor: "pointer",
                          }}>{islemde ? "Kaydediliyor..." : "Kaydet"}</button>
                          <button onClick={() => setDuzenlenen(null)} style={{
                            padding: "9px 14px", borderRadius: KOSE.m,
                            border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
                            color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
                          }}>Vazgeç</button>
                        </div>
                      </div>
                    )}

                    {benim && duzenlenen?.id !== b.id && (
                    <div style={{ display: "flex", gap: BOSLUK.s }}>
                      <button onClick={() => { setBilgi(null); setAktaran(b.id); }} style={{
                        flex: 1, padding: "8px 0", borderRadius: KOSE.m,
                        border: `1.5px dashed ${c.mid}`, background: "transparent",
                        color: c.mid, fontSize: YAZI.ikincil, fontWeight: 600, cursor: "pointer",
                      }}>
                        {bolumler.length === 0 ? "İçindekileri aktar" : "+ İçindekiler ekle"}
                      </button>
                      <button onClick={() => kitapSil(b)} disabled={islemde} style={{
                        padding: "8px 14px", borderRadius: KOSE.m,
                        border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
                        color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
                      }}>Sil</button>
                    </div>
                    )}
                    {benim && bolumler.length > 0 && duzenlenen?.id !== b.id && (
                      <button onClick={() => bolumleriTemizle(b)} disabled={islemde} style={{
                        alignSelf: "flex-start", background: "none", border: "none", padding: 0,
                        color: RENK.metinSoluk, fontSize: YAZI.kucuk, cursor: "pointer",
                      }}>İçindekileri temizle ({bolumler.length} bölüm)</button>
                    )}
                    {benim && duzenlenen?.id !== b.id && (
                      <button onClick={() => setDuzenlenen({
                        id: b.id, ad: b.ad ?? "", yayinevi: b.yayinevi ?? "",
                        sinav_turu: b.sinav_turu ?? "", ders: b.ders ?? "",
                      })} style={{
                        alignSelf: "flex-start", background: "none", border: "none", padding: 0,
                        color: c.mid, fontSize: YAZI.kucuk, fontWeight: 600, cursor: "pointer",
                      }}>✏️ Kaynak bilgilerini düzenle</button>
                    )}
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
