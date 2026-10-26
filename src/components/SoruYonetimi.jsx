import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { SIKLAR } from "../lib/cevapAnahtari";
import { sayfalaraBol } from "../lib/soruSayfasi";
import { imzaliUrlListesi } from "../lib/depo";
import { ogrenciyeAcik, hakDurumuAdi } from "../lib/hakDurumu";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";
import SayfaYukle from "./SayfaYukle";

// Koçun bir kitabın sorularını girip yönettiği ekran.
//
// ── İKİ GİRDİ YOLU ──────────────────────────────────────────────
// 1) SAYFA FOTOĞRAFI (asıl yol): bir fotoğraf + ilk soru numarası +
//    cevap anahtarı → aynı görseli paylaşan N soru. Soru metni
//    yazılmıyor; öğrenci soruyu fotoğraftan okuyor. Bir kitabı
//    soru soru yazmak kullanılabilir bir iş değil (400 soruda 2000
//    alan), kitabın kendisi zaten koçun elinde.
// 2) TEK SORU (metin): koçun kendi yazdığı sorular için duruyor.
//
// Veri modeli ikisini de taşıyor: `sorular` tablosunda `metin` boşken
// `gorsel_url` dolu olabiliyor (soru_icerik kısıtı).
//
// ── ONAYLANMADAN ÖĞRENCİYE GİTMİYOR ─────────────────────────────
// Her sorunun bir `onayli` alanı var ve test yalnız onaylı sorulardan
// kuruluyor (test_basla RPC'si). Soru sonradan DEĞİŞİRSE onay
// kendiliğinden düşüyor (veritabanı tetikleyicisi). Sayfa yüklemede
// onay bir sayfanın tamamı için tek düğme: en olası hata anahtarın
// bir kayması ve bu, sayfanın tamamını birlikte ilgilendiriyor.
export default function SoruYonetimi({ banka, bolumler, color: c, onKapat, onDegisti }) {
  const [sorular, setSorular] = useState([]);
  const [imzalar, setImzalar] = useState({});   // yol -> imzalı adres
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState(false);
  const [form, setForm] = useState(null);       // { id?, numara, metin, siklar, dogru_cevap, ... }
  const [sayfaModu, setSayfaModu] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const { veri } = await calistir(
      supabase.from("sorular").select("*").eq("banka_id", banka.id).order("numara"),
      "Sorular", { sessiz: true }
    );
    const liste = veri ?? [];
    setSorular(liste);
    setYukleniyor(false);

    // Kova kapalı: görseller ancak süreli imzalı adresle açılıyor.
    // Aynı sayfayı paylaşan 20 soru için tek imza yetiyor.
    const yollar = [...new Set(liste.map(s => s.gorsel_url).filter(Boolean))];
    setImzalar(yollar.length > 0 ? await imzaliUrlListesi(yollar) : {});
  }, [banka.id]);

  useEffect(() => { yukle(); }, [yukle]);

  const gruplar = useMemo(() => sayfalaraBol(sorular), [sorular]);

  const bosForm = () => ({
    numara: (sorular.at(-1)?.numara ?? 0) + 1,
    metin: "",
    sik_sayisi: 5,
    siklar: SIKLAR.slice(0, 5).map(h => ({ harf: h, metin: "" })),
    dogru_cevap: "",
    bolum_id: "",
    konu: "",
  });

  const sikSayisiDegistir = (n) => setForm(f => ({
    ...f,
    sik_sayisi: n,
    siklar: SIKLAR.slice(0, n).map(h => f.siklar.find(s => s.harf === h) ?? { harf: h, metin: "" }),
    // Şık sayısı düşünce aralık dışında kalan doğru cevap temizleniyor;
    // yoksa veritabanı kısıtı kaydı reddeder ve sebebi anlaşılmaz olur.
    dogru_cevap: SIKLAR.slice(0, n).includes(f.dogru_cevap) ? f.dogru_cevap : "",
  }));

  const kaydet = async () => {
    if (!gecerli) return;
    setIslemde(true);
    const satir = {
      banka_id: banka.id,
      bolum_id: form.bolum_id || null,
      numara: form.numara,
      metin: form.metin.trim(),
      sik_sayisi: form.sik_sayisi,
      siklar: form.siklar.map(s => ({ harf: s.harf, metin: s.metin.trim() })),
      dogru_cevap: form.dogru_cevap,
      konu: form.konu.trim() || null,
    };
    const { hata } = await calistir(
      form.id
        ? supabase.from("sorular").update(satir).eq("id", form.id)
        : supabase.from("sorular").insert(satir),
      form.id ? "Soru guncelleme" : "Soru ekleme"
    );
    setIslemde(false);
    if (hata) return;
    setForm(null);
    await yukle();
    onDegisti?.();
  };

  const sil = async (soru) => {
    if (!confirm(`${soru.numara}. soru silinsin mi?`)) return;
    const { hata } = await calistir(
      supabase.from("sorular").delete().eq("id", soru.id), "Soru silme");
    if (!hata) { await yukle(); onDegisti?.(); }
  };

  const onayDegistir = async (soru) => {
    const { hata } = await calistir(
      supabase.from("sorular").update({ onayli: !soru.onayli }).eq("id", soru.id),
      "Soru onayi");
    if (!hata) { await yukle(); onDegisti?.(); }
  };

  // ── Sayfa işlemleri ───────────────────────────────────────────
  const sayfaOnayla = async (grup, deger) => {
    const { hata } = await calistir(
      supabase.from("sorular").update({ onayli: deger })
        .in("id", grup.sorular.map(s => s.id)),
      "Sayfa onayi");
    if (!hata) { await yukle(); onDegisti?.(); }
  };

  const sayfaSil = async (grup) => {
    const ilk = grup.sorular[0].numara, son = grup.sorular.at(-1).numara;
    if (!confirm(`Bu sayfa ve ${grup.sorular.length} sorusu (${ilk}–${son}) silinsin mi?`)) return;
    const { hata } = await calistir(
      supabase.from("sorular").delete().in("id", grup.sorular.map(s => s.id)),
      "Sayfa silme");
    if (hata) return;
    // Satırlar gittiyse fotoğrafın depoda kalması için bir sebep yok.
    // Sıra bu: dosya önce silinip satırlar sonra kalsaydı, öğrenci
    // açılamayan bir soruyla karşılaşırdı.
    await supabase.storage.from("homework").remove([grup.gorsel_url]);
    await yukle();
    onDegisti?.();
  };

  const gecerli = form
    && form.metin.trim().length > 0
    && form.dogru_cevap
    && form.siklar.slice(0, form.sik_sayisi).every(s => s.metin.trim().length > 0);

  const onayliAdet  = sorular.filter(s => s.onayli).length;
  const konusuzAdet = sorular.filter(s => !s.konu).length;

  const girdi = {
    width: "100%", padding: "8px 10px", borderRadius: KOSE.s, boxSizing: "border-box",
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, fontFamily: "inherit",
  };

  return (
    <Modal title={`Sorular — ${banka.ad}`} onClose={onKapat} maxWidth={600}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: BOSLUK.s, marginBottom: BOSLUK.m, fontSize: YAZI.ikincil, color: RENK.metinIkincil,
      }}>
        <span>{sorular.length} soru · <b style={{ color: onayliAdet ? RENK.basari.metin : RENK.uyari.metin }}>
          {onayliAdet} onaylı
        </b></span>
        {!form && !sayfaModu && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setSayfaModu(true)} style={{
              padding: "6px 14px", borderRadius: KOSE.tam, border: "none",
              background: c.bg, color: "#fff", fontSize: YAZI.mikro, fontWeight: 700, cursor: "pointer",
            }}>+ Sayfa yükle</button>
            <button onClick={() => setForm(bosForm())} style={{
              padding: "6px 12px", borderRadius: KOSE.tam, cursor: "pointer",
              border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
              color: RENK.metinIkincil, fontSize: YAZI.mikro,
            }}>+ Tek soru</button>
          </div>
        )}
      </div>

      {onayliAdet === 0 && sorular.length > 0 && (
        <div style={{
          background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 11.5,
          padding: "9px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m, lineHeight: 1.5,
        }}>
          Hiçbir soru onaylanmamış. Test yalnız onaylı sorulardan kuruluyor;
          öğrenci şu an bu kitaptan test başlatamaz.
        </div>
      )}

      {/* Analiz `test_sessions.subject`'i kitabın dersinden okuyor.
          Ders boşsa sunucu 'Genel' yazıyor: test çözülüyor, puanlanıyor,
          ama GERÇEK dersin doğruluk oranına hiç girmiyor. Sessiz kayıp,
          bu yüzden uyarı. */}
      {!banka.ders && sorular.length > 0 && (
        <div style={{
          background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 11.5,
          padding: "9px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m, lineHeight: 1.5,
        }}>
          Kitabın <b>dersi girilmemiş</b>. Test sonucu analize "Genel" dersi
          olarak yazılıyor, gerçek dersin doğruluk oranına işlenmiyor.
          Kitaplıkta kitabı düzenleyip ders seçin.
        </div>
      )}

      {konusuzAdet > 0 && (
        <div style={{
          background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 11.5,
          padding: "9px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m, lineHeight: 1.5,
        }}>
          {konusuzAdet} sorunun <b>konusu yok</b>. Test konu başına açıldığı
          için öğrenciye "Konusuz sorular" diye tek bir yığın hâlinde
          çıkıyor ve konu analizine işlenmiyor.
        </div>
      )}

      {/* Onay ile hak durumu AYRI iki kapı ve ikisi de kapatıyor.
          Soruları onaylayıp kitabı açmayı atlamak en kolay atlanan
          adım: öğrencinin Testler sekmesi sessizce boş kalıyor, sebebi
          hiçbir yerde yazmıyordu. */}
      {onayliAdet > 0 && !ogrenciyeAcik(banka.hak_durumu) && (
        <div style={{
          background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 11.5,
          padding: "9px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m, lineHeight: 1.5,
        }}>
          {onayliAdet} soru onaylı <b>ama kitap öğrenciye kapalı</b> — hak
          durumu "{hakDurumuAdi(banka.hak_durumu)}". Kitaplıkta kitabı
          düzenleyip hak durumunu değiştirmeden test öğrencinin Testler
          sekmesinde çıkmıyor, sayfa fotoğrafı da açılmıyor.
        </div>
      )}

      {sayfaModu && (
        <SayfaYukle banka={banka} bolumler={bolumler} varOlan={sorular} color={c}
          onKapat={() => setSayfaModu(false)}
          onYuklendi={async () => { setSayfaModu(false); await yukle(); onDegisti?.(); }} />
      )}

      {form && (
        <div style={{
          display: "flex", flexDirection: "column", gap: BOSLUK.s,
          padding: BOSLUK.m, borderRadius: KOSE.m, border: `1.5px solid ${c.mid}`,
          marginBottom: BOSLUK.m,
        }}>
          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil, width: 80 }}>
              <div style={{ marginBottom: 3 }}>Soru no</div>
              <input type="number" min={1} value={form.numara} style={girdi}
                onChange={e => setForm(f => ({ ...f, numara: Number(e.target.value) || 1 }))} />
            </label>
            <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil, width: 90 }}>
              <div style={{ marginBottom: 3 }}>Şık sayısı</div>
              <select value={form.sik_sayisi} style={girdi}
                onChange={e => sikSayisiDegistir(Number(e.target.value))}>
                {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil, flex: 1 }}>
              <div style={{ marginBottom: 3 }}>Bölüm (isteğe bağlı)</div>
              <select value={form.bolum_id} style={girdi}
                onChange={e => setForm(f => ({ ...f, bolum_id: e.target.value }))}>
                <option value="">—</option>
                {bolumler.map(b => <option key={b.id} value={b.id}>{b.baslik}</option>)}
              </select>
            </label>
          </div>

          {/* Konu alanı forma sonradan eklendi: state'te vardı ama girdisi
              yoktu, yani elle yazılan her soru konusuz kalıyordu ve
              öğrenciye "Konusuz sorular" yığınında çıkıyordu. */}
          <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil }}>
            <div style={{ marginBottom: 3 }}>Konu</div>
            <input placeholder="Örn. Üslü Sayılar" value={form.konu} style={girdi}
              onChange={e => setForm(f => ({ ...f, konu: e.target.value }))} />
          </label>

          <textarea rows={3} placeholder="Soru metni" value={form.metin} style={{ ...girdi, resize: "vertical" }}
            onChange={e => setForm(f => ({ ...f, metin: e.target.value }))} />

          {form.siklar.slice(0, form.sik_sayisi).map((s, i) => (
            <div key={s.harf} style={{ display: "flex", gap: BOSLUK.s, alignItems: "center" }}>
              {/* Doğru şık buradan seçiliyor: ayrı bir açılır liste
                  yerine şıkkın kendisine basmak, yanlış şıkkı doğru
                  işaretleme ihtimalini azaltıyor. */}
              <button onClick={() => setForm(f => ({ ...f, dogru_cevap: s.harf }))} style={{
                width: 30, height: 30, borderRadius: KOSE.s, flexShrink: 0, cursor: "pointer",
                border: `2px solid ${form.dogru_cevap === s.harf ? RENK.basari.metin : RENK.cizgi}`,
                background: form.dogru_cevap === s.harf ? RENK.basari.zemin : "#fff",
                color: form.dogru_cevap === s.harf ? RENK.basari.metin : RENK.metinSoluk,
                fontWeight: 800, fontSize: 12,
              }}>{s.harf}</button>
              <input placeholder={`${s.harf} şıkkı`} value={s.metin} style={girdi}
                onChange={e => setForm(f => ({
                  ...f,
                  siklar: f.siklar.map((x, j) => j === i ? { ...x, metin: e.target.value } : x),
                }))} />
            </div>
          ))}

          <div style={{ fontSize: YAZI.mikro, color: form.dogru_cevap ? RENK.basari.metin : RENK.uyari.metin }}>
            {form.dogru_cevap ? `Doğru cevap: ${form.dogru_cevap}` : "Doğru şıkkı harfine basarak seçin."}
          </div>

          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <button onClick={kaydet} disabled={!gecerli || islemde} style={{
              flex: 1, padding: "9px 0", borderRadius: KOSE.m, border: "none",
              background: gecerli ? c.bg : "#ddd", color: "#fff",
              fontSize: YAZI.ikincil, fontWeight: 700, cursor: gecerli ? "pointer" : "default",
            }}>{islemde ? "Kaydediliyor..." : form.id ? "Güncelle" : "Ekle"}</button>
            <button onClick={() => setForm(null)} style={{
              padding: "9px 14px", borderRadius: KOSE.m, cursor: "pointer",
              border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
              fontSize: YAZI.ikincil, color: RENK.metinIkincil,
            }}>Vazgeç</button>
          </div>
        </div>
      )}

      {yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      ) : sorular.length === 0 ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk, lineHeight: 1.5 }}>
          Bu kitapta henüz soru yok. Bir sayfa fotoğrafı yükleyip cevap
          anahtarını girmek, pilot için yeterli.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 360, overflowY: "auto" }}>
          {gruplar.map(g => g.gorsel_url ? (
            <SayfaSatiri key={g.gorsel_url} grup={g} imza={imzalar[g.gorsel_url]}
              bolumler={bolumler} onOnay={sayfaOnayla} onSil={sayfaSil} />
          ) : (
            <SoruSatiri key={g.sorular[0].id} s={g.sorular[0]} c={c}
              onOnay={onayDegistir} onSil={sil}
              onDuzenle={s => setForm({
                id: s.id, numara: s.numara, metin: s.metin ?? "",
                sik_sayisi: s.sik_sayisi,
                siklar: SIKLAR.slice(0, s.sik_sayisi).map(h =>
                  (s.siklar ?? []).find(x => x.harf === h) ?? { harf: h, metin: "" }),
                dogru_cevap: s.dogru_cevap, bolum_id: s.bolum_id ?? "", konu: s.konu ?? "",
              })} />
          ))}
        </div>
      )}
    </Modal>
  );
}

// Bir sayfa: fotoğraf + o sayfanın soruları tek satırda.
function SayfaSatiri({ grup, imza, bolumler, onOnay, onSil }) {
  const ilk = grup.sorular[0], son = grup.sorular.at(-1);
  const onayli = grup.sorular.filter(s => s.onayli).length;
  const tumu   = onayli === grup.sorular.length;
  const bolum  = bolumler.find(b => b.id === ilk.bolum_id)?.baslik;

  return (
    <div style={{
      display: "flex", gap: BOSLUK.s, alignItems: "center",
      padding: "7px 4px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
    }}>
      {imza ? (
        <a href={imza} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
          <img src={imza} alt="" style={{
            width: 42, height: 42, objectFit: "cover", display: "block",
            borderRadius: KOSE.s, border: `1px solid ${RENK.cizgi}`,
          }} />
        </a>
      ) : (
        <div style={{
          width: 42, height: 42, borderRadius: KOSE.s, flexShrink: 0,
          background: RENK.yuzey, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 15,
        }}>🖼</div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: YAZI.kucuk, color: RENK.metin, fontWeight: 600 }}>
          Sayfa · {ilk.numara}–{son.numara} ({grup.sorular.length} soru)
        </div>
        <div style={{
          fontSize: YAZI.mikro, color: RENK.metinSilik,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {[ilk.konu, bolum].filter(Boolean).join(" · ") || "konu girilmemiş"}
          {" · "}
          <span style={{ letterSpacing: 0.5 }}>{grup.sorular.map(s => s.dogru_cevap).join("")}</span>
        </div>
      </div>

      <button onClick={() => onOnay(grup, !tumu)}
        title={tumu ? "Onayı kaldır" : "Sayfanın tamamını onayla"} style={{
          flexShrink: 0, fontSize: YAZI.mikro, cursor: "pointer",
          padding: "3px 9px", borderRadius: KOSE.tam,
          border: `1px solid ${tumu ? RENK.basari.metin + "55" : RENK.cizgi}`,
          background: tumu ? RENK.basari.zemin : "#fff",
          color: tumu ? RENK.basari.metin : RENK.metinSoluk,
        }}>{tumu ? "✓ onaylı" : onayli > 0 ? `${onayli}/${grup.sorular.length}` : "onayla"}</button>

      <button onClick={() => onSil(grup)} style={{
        flexShrink: 0, background: "none", border: "none", cursor: "pointer",
        color: RENK.hata.metin, fontSize: YAZI.mikro,
      }}>sil</button>
    </div>
  );
}

// Koçun kendi yazdığı tek soru.
function SoruSatiri({ s, c, onOnay, onSil, onDuzenle }) {
  return (
    <div style={{
      display: "flex", gap: BOSLUK.s, alignItems: "center",
      padding: "6px 4px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
      fontSize: YAZI.kucuk,
    }}>
      <span style={{ width: 26, color: RENK.metinSilik, flexShrink: 0 }}>{s.numara}.</span>
      <span style={{
        flex: 1, minWidth: 0, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{s.metin || "(görsel soru)"}</span>
      <span style={{
        flexShrink: 0, fontWeight: 800, color: RENK.basari.metin, width: 16,
      }}>{s.dogru_cevap}</span>
      <button onClick={() => onOnay(s)} title={s.onayli ? "Onayı kaldır" : "Onayla"} style={{
        flexShrink: 0, fontSize: YAZI.mikro, cursor: "pointer",
        padding: "2px 8px", borderRadius: KOSE.tam,
        border: `1px solid ${s.onayli ? RENK.basari.metin + "55" : RENK.cizgi}`,
        background: s.onayli ? RENK.basari.zemin : "#fff",
        color: s.onayli ? RENK.basari.metin : RENK.metinSoluk,
      }}>{s.onayli ? "✓ onaylı" : "onayla"}</button>
      <button onClick={() => onDuzenle(s)} style={{
        flexShrink: 0, background: "none", border: "none", cursor: "pointer",
        color: c.mid, fontSize: YAZI.mikro,
      }}>düzenle</button>
      <button onClick={() => onSil(s)} style={{
        flexShrink: 0, background: "none", border: "none", cursor: "pointer",
        color: RENK.hata.metin, fontSize: YAZI.mikro,
      }}>sil</button>
    </div>
  );
}
