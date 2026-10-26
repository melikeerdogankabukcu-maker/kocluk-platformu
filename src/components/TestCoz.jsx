import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { SIKLAR, sayfalaraBol } from "../lib/soruSayfasi";
import { imzaliUrlListesi } from "../lib/depo";
import SayfaKaralama from "./SayfaKaralama";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Öğrencinin testi çözdüğü ekran.
//
// ── DOĞRU CEVAP BU EKRANA HİÇ GELMİYOR ──────────────────────────
// Sorular `test_sorulari` RPC'sinden geliyor ve o RPC doğru cevabı
// DÖNDÜRMÜYOR. Puanlama da burada değil `testi_bitir` RPC'sinde,
// sunucuda yapılıyor. Yani tarayıcıdaki hiçbir veriden testin
// cevapları çıkarılamıyor — "doğrulanmış çalışma kaydı" iddiasının
// gereği bu.
//
// ── SAYFA SAYFA İLERLİYOR ───────────────────────────────────────
// Sorular tek tek değil SAYFA olarak geliyor: bir fotoğraf, üstünde
// 10-20 soru. Bu yüzden ekran soru soru değil sayfa sayfa ilerliyor
// ve fotoğrafın altında o sayfanın bütün soruları için harf satırları
// duruyor. Her soruda fotoğrafı yeniden göstermek, öğrenciyi her
// seferinde sayfanın başına atardı.
//
// Koçun kendi yazdığı metin soruları (şıkları girilmiş olanlar) eskisi
// gibi tek başına bir adım; ikisi aynı testte karışabiliyor.
//
// ── FOTOĞRAFIN ÜSTÜNE YAZILIYOR ─────────────────────────────────
// Kâğıt kitapta öğrenci sayfanın üstünde işlem yapıyor; ekranda da
// yapabiliyor (SayfaKaralama). Karalama şimdilik yalnız bu pencerede
// duruyor, sunucuya gitmiyor.
//
// ── CEVAP ANINDA KAYDEDİLİYOR ───────────────────────────────────
// Her işaretleme doğrudan veritabanına yazılıyor. Telefon kapanırsa,
// sayfa yenilenirse ya da öğrenci yarıda bırakırsa işaretlediği yerden
// devam ediyor. "Bitir"e basmadan hiçbir şey kaybolmuyor.
//
// ── BİTİNCE DOĞRU ŞIK GÖSTERİLMİYOR ─────────────────────────────
// Sonuçta soru soru doğru/yanlış/boş görünüyor ama doğru şık
// görünmüyor; sunucu da göndermiyor. Gönderseydi öğrenci boş bir
// testi hemen bitirip bütün anahtarı okuyabilirdi. Öğrencinin elinde
// kitabın kendisi zaten var.
export default function TestCoz({ oturumId, baslik, color: c, onKapat, onBitti }) {
  const [sorular, setSorular] = useState([]);
  const [imzalar, setImzalar] = useState({});        // yol -> imzalı adres
  const [cevaplar, setCevaplar] = useState({});      // soru_id -> harf
  const [sira, setSira] = useState(0);               // kaçıncı SAYFA
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState(false);
  const [sonuc, setSonuc] = useState(null);          // [{soru_id, numara, sonuc}]
  // Sayfa fotoğrafı üzerindeki karalama: görsel yolu -> çizgiler.
  // Burada (bellekte) tutuluyor ki sayfalar arasında gidip gelmek
  // çizimi silmesin. Sunucuya KAYDEDİLMİYOR; yayına almadan önce
  // kaydedilecek (YOL_HARITASI.md).
  const [karalamalar, setKaralamalar] = useState({});
  const [hata, setHata] = useState(null);

  useEffect(() => {
    let iptal = false;
    calistir(supabase.rpc("test_sorulari", { p_oturum: oturumId }), "Test sorulari")
      .then(async ({ veri, hata: h }) => {
        if (iptal) return;
        if (h) { setHata("Sorular yüklenemedi."); setYukleniyor(false); return; }
        const liste = veri ?? [];
        setSorular(liste);
        // Yarıda bırakılmış test: daha önce verilen cevaplar geri geliyor
        const onceki = {};
        liste.forEach(s => { if (s.verilen_cevap) onceki[s.soru_id] = s.verilen_cevap; });
        setCevaplar(onceki);
        // İlk cevapsız sorunun bulunduğu sayfaya atlıyor; baştan
        // başlatmak, testi yarıda bırakan öğrenciyi gereksiz yere
        // ileri bastırırdı.
        const bolunmus = sayfalaraBol(liste);
        const ilkBos = bolunmus.findIndex(g => g.sorular.some(s => !s.verilen_cevap));
        setSira(ilkBos === -1 ? 0 : ilkBos);
        setYukleniyor(false);

        // Kova kapalı: sayfa fotoğrafı ancak süreli imzalı adresle
        // açılıyor. Aynı sayfayı paylaşan sorular için tek imza yetiyor.
        const yollar = [...new Set(liste.map(s => s.gorsel_url).filter(Boolean))];
        if (yollar.length > 0) {
          const h2 = await imzaliUrlListesi(yollar);
          if (!iptal) setImzalar(h2);
        }
      });
    return () => { iptal = true; };
  }, [oturumId]);

  const gruplar = useMemo(() => sayfalaraBol(sorular), [sorular]);

  // SayfaKaralama hem değer hem güncelleyici fonksiyon gönderebiliyor
  // (parmak kalkınca [...prev, aktif]); ikisi de karşılanıyor.
  const karalamaYaz = useCallback((yol) => (yeni) => setKaralamalar(o => ({
    ...o,
    [yol]: typeof yeni === "function" ? yeni(o[yol] ?? []) : yeni,
  })), []);

  const isaretle = useCallback(async (soruId, harf) => {
    // Aynı şıkka tekrar basmak işareti kaldırıyor (boş bırakmak da
    // bir cevap; net hesabında yanlıştan farklı).
    const yeni = cevaplar[soruId] === harf ? null : harf;
    setCevaplar(o => ({ ...o, [soruId]: yeni }));

    const { hata: h } = await calistir(
      supabase.from("oturum_cevaplari")
        .upsert({ oturum_id: oturumId, soru_id: soruId, cevap: yeni },
                { onConflict: "oturum_id,soru_id" }),
      "Cevap kaydetme", { sessiz: true }
    );
    // Yazılamadıysa ekrandaki işaret geri alınıyor: öğrenci cevabının
    // kaydedildiğini sanıp devam etmesin.
    if (h) {
      setCevaplar(o => ({ ...o, [soruId]: cevaplar[soruId] ?? null }));
      setHata("Cevap kaydedilemedi. Bağlantınızı kontrol edin.");
    } else setHata(null);
  }, [cevaplar, oturumId]);

  const bitir = async () => {
    const bosSayisi = sorular.filter(s => !cevaplar[s.soru_id]).length;
    if (bosSayisi > 0 && !confirm(`${bosSayisi} soru boş. Testi bitirmek istiyor musunuz?`)) return;
    setIslemde(true);
    const { veri, hata: h } = await calistir(
      supabase.rpc("testi_bitir", { p_oturum: oturumId }), "Testi bitirme");
    setIslemde(false);
    if (h) { setHata("Test bitirilemedi."); return; }
    setSonuc(veri ?? []);
    onBitti?.();
  };

  if (yukleniyor) {
    return (
      <Modal title={baslik} onClose={onKapat} maxWidth={560}>
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      </Modal>
    );
  }

  // ── Sonuç ekranı ──────────────────────────────────────────────
  if (sonuc) {
    const d = sonuc.filter(x => x.sonuc === "dogru").length;
    const y = sonuc.filter(x => x.sonuc === "yanlis").length;
    const b = sonuc.filter(x => x.sonuc === "bos").length;
    const net = Math.round((d - y / 4) * 100) / 100;
    const kutuRenk = { dogru: RENK.basari, yanlis: RENK.hata, bos: RENK.uyari,
                       iptal: { zemin: RENK.yuzey, metin: RENK.metinSoluk } };
    return (
      <Modal title="Test sonucu" onClose={onKapat} maxWidth={560}>
        <div style={{ display: "flex", gap: BOSLUK.s, marginBottom: BOSLUK.m }}>
          {[["Doğru", d, RENK.basari], ["Yanlış", y, RENK.hata], ["Boş", b, RENK.uyari]].map(([ad, v, r]) => (
            <div key={ad} style={{
              flex: 1, textAlign: "center", padding: "10px 0", borderRadius: KOSE.m,
              background: r.zemin, color: r.metin,
            }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: YAZI.mikro }}>{ad}</div>
            </div>
          ))}
          <div style={{
            flex: 1, textAlign: "center", padding: "10px 0", borderRadius: KOSE.m,
            background: c.light, color: c.text,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{net}</div>
            <div style={{ fontSize: YAZI.mikro }}>Net</div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: BOSLUK.m }}>
          {sonuc.map(x => (
            <span key={x.soru_id} title={x.sonuc} style={{
              width: 30, height: 26, borderRadius: KOSE.s,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              background: kutuRenk[x.sonuc].zemin, color: kutuRenk[x.sonuc].metin,
            }}>{x.numara}</span>
          ))}
        </div>

        <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
          Doğru cevaplar burada gösterilmiyor; kitabınızın kendi cevap
          anahtarından bakabilirsiniz. Koçunuz soru soru sonucu görüyor.
        </div>

        <button onClick={onKapat} style={{
          width: "100%", marginTop: BOSLUK.m, padding: "11px 0", borderRadius: KOSE.m,
          border: "none", background: c.bg, color: "#fff",
          fontSize: YAZI.ikincil, fontWeight: 700, cursor: "pointer",
        }}>Kapat</button>
      </Modal>
    );
  }

  // ── Çözme ekranı ──────────────────────────────────────────────
  const g = gruplar[sira];
  const isaretli = sorular.filter(x => cevaplar[x.soru_id]).length;
  // Şeritteki soruya basınca o sorunun bulunduğu sayfaya gidiyor.
  const sayfasi = (soruId) => gruplar.findIndex(x => x.sorular.some(s => s.soru_id === soruId));

  return (
    <Modal title={baslik} onClose={onKapat} maxWidth={560}>
      {hata && (
        <div style={{
          background: RENK.hata.zemin, color: RENK.hata.metin, fontSize: 12,
          padding: "8px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.s,
        }}>{hata}</div>
      )}

      {/* Soru şeridi: nerede kalındığı ve hangileri boş tek bakışta */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: BOSLUK.m }}>
        {sorular.map(x => {
          const buSayfa = sayfasi(x.soru_id) === sira;
          return (
            <button key={x.soru_id} onClick={() => setSira(sayfasi(x.soru_id))} style={{
              width: 26, height: 24, borderRadius: KOSE.s, cursor: "pointer", padding: 0,
              fontSize: 10.5, fontWeight: buSayfa ? 800 : 500,
              border: `1.5px solid ${buSayfa ? c.bg : RENK.cizgi}`,
              background: cevaplar[x.soru_id] ? c.light : "#fff",
              color: cevaplar[x.soru_id] ? c.text : RENK.metinSilik,
            }}>{x.numara}</button>
          );
        })}
      </div>

      {g && (
        <>
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginBottom: 4 }}>
            {g.gorsel_url
              ? `Sayfa ${sira + 1}/${gruplar.length} · ${g.sorular[0].numara}–${g.sorular.at(-1).numara}. sorular`
              : `Soru ${g.sorular[0].numara} · ${sira + 1}/${gruplar.length}`}
          </div>

          {g.gorsel_url && (
            imzalar[g.gorsel_url] ? (
              <>
                <SayfaKaralama
                  src={imzalar[g.gorsel_url]}
                  cizgiler={karalamalar[g.gorsel_url] ?? []}
                  onCizgiler={karalamaYaz(g.gorsel_url)}
                  color={c}
                />
                <a href={imzalar[g.gorsel_url]} target="_blank" rel="noreferrer" style={{
                  display: "inline-block", marginTop: 4, marginBottom: BOSLUK.s,
                  fontSize: YAZI.mikro, color: c.text,
                }}>Tam boy aç ↗</a>
              </>
            ) : (
              <div style={{
                padding: "18px 0", textAlign: "center", borderRadius: KOSE.s,
                background: RENK.yuzey, color: RENK.metinSoluk, fontSize: YAZI.mikro,
                marginBottom: BOSLUK.s,
              }}>Sayfa yükleniyor...</div>
            )
          )}

          {g.sorular[0].metin && (
            <div style={{
              fontSize: 14, lineHeight: 1.6, color: RENK.metin,
              marginBottom: BOSLUK.m, whiteSpace: "pre-wrap",
            }}>{g.sorular[0].metin}</div>
          )}

          {/* Şık metinleri girilmişse metinli düğmeler, girilmemişse
              (fotoğraftan okunan sayfa) yalnız harfler. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: BOSLUK.m }}>
            {g.sorular.map(s => (s.siklar ?? []).length > 0 ? (
              (s.siklar ?? []).map(sik => {
                const secili = cevaplar[s.soru_id] === sik.harf;
                return (
                  <button key={sik.harf} onClick={() => isaretle(s.soru_id, sik.harf)} style={{
                    display: "flex", alignItems: "center", gap: BOSLUK.s, textAlign: "left",
                    padding: "10px 12px", borderRadius: KOSE.m, cursor: "pointer",
                    border: `2px solid ${secili ? c.bg : RENK.cizgi}`,
                    background: secili ? c.light : "#fff",
                    fontSize: 13.5, color: RENK.metin, fontFamily: "inherit",
                  }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: secili ? c.bg : RENK.yuzey,
                      color: secili ? "#fff" : RENK.metinSoluk,
                      fontWeight: 800, fontSize: 12,
                    }}>{sik.harf}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{sik.metin}</span>
                  </button>
                );
              })
            ) : (
              <div key={s.soru_id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 28, flexShrink: 0, fontSize: YAZI.kucuk, fontWeight: 700,
                  color: cevaplar[s.soru_id] ? RENK.metin : RENK.metinSilik,
                }}>{s.numara}.</span>
                {SIKLAR.slice(0, s.sik_sayisi).map(harf => {
                  const secili = cevaplar[s.soru_id] === harf;
                  return (
                    <button key={harf} onClick={() => isaretle(s.soru_id, harf)} style={{
                      flex: 1, padding: "9px 0", borderRadius: KOSE.m, cursor: "pointer",
                      border: `2px solid ${secili ? c.bg : RENK.cizgi}`,
                      background: secili ? c.bg : "#fff",
                      color: secili ? "#fff" : RENK.metinSoluk,
                      fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                    }}>{harf}</button>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: BOSLUK.s, marginBottom: BOSLUK.s }}>
            <button onClick={() => setSira(i => Math.max(0, i - 1))} disabled={sira === 0} style={{
              padding: "9px 16px", borderRadius: KOSE.m, cursor: sira === 0 ? "default" : "pointer",
              border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
              color: sira === 0 ? RENK.metinSilik : RENK.metinIkincil, fontSize: YAZI.ikincil,
            }}>← Önceki</button>
            <button onClick={() => setSira(i => Math.min(gruplar.length - 1, i + 1))}
              disabled={sira >= gruplar.length - 1} style={{
                flex: 1, padding: "9px 16px", borderRadius: KOSE.m,
                cursor: sira >= gruplar.length - 1 ? "default" : "pointer",
                border: "none", background: sira >= gruplar.length - 1 ? "#ddd" : c.bg,
                color: "#fff", fontSize: YAZI.ikincil, fontWeight: 700,
              }}>Sonraki →</button>
          </div>
        </>
      )}

      <button onClick={bitir} disabled={islemde} style={{
        width: "100%", padding: "11px 0", borderRadius: KOSE.m, cursor: "pointer",
        border: `1.5px solid ${c.bg}`, background: "#fff", color: c.text,
        fontSize: YAZI.ikincil, fontWeight: 700,
      }}>{islemde ? "Değerlendiriliyor..." : `Testi bitir (${isaretli}/${sorular.length} işaretli)`}</button>
    </Modal>
  );
}
