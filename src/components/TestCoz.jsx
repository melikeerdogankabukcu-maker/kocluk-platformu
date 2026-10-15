import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
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
  const [cevaplar, setCevaplar] = useState({});      // soru_id -> harf
  const [sira, setSira] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState(false);
  const [sonuc, setSonuc] = useState(null);          // [{soru_id, numara, sonuc}]
  const [hata, setHata] = useState(null);

  useEffect(() => {
    let iptal = false;
    calistir(supabase.rpc("test_sorulari", { p_oturum: oturumId }), "Test sorulari")
      .then(({ veri, hata: h }) => {
        if (iptal) return;
        if (h) { setHata("Sorular yüklenemedi."); setYukleniyor(false); return; }
        setSorular(veri ?? []);
        // Yarıda bırakılmış test: daha önce verilen cevaplar geri geliyor
        const onceki = {};
        (veri ?? []).forEach(s => { if (s.verilen_cevap) onceki[s.soru_id] = s.verilen_cevap; });
        setCevaplar(onceki);
        // İlk cevapsız soruya atlıyor; baştan başlatmak, 30 soruluk
        // testi yarıda bırakan öğrenciyi 20 kez ileri bastırırdı.
        const ilkBos = (veri ?? []).findIndex(s => !s.verilen_cevap);
        setSira(ilkBos === -1 ? 0 : ilkBos);
        setYukleniyor(false);
      });
    return () => { iptal = true; };
  }, [oturumId]);

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
  const s = sorular[sira];
  const isaretli = sorular.filter(x => cevaplar[x.soru_id]).length;

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
        {sorular.map((x, i) => (
          <button key={x.soru_id} onClick={() => setSira(i)} style={{
            width: 26, height: 24, borderRadius: KOSE.s, cursor: "pointer", padding: 0,
            fontSize: 10.5, fontWeight: i === sira ? 800 : 500,
            border: `1.5px solid ${i === sira ? c.bg : RENK.cizgi}`,
            background: cevaplar[x.soru_id] ? c.light : "#fff",
            color: cevaplar[x.soru_id] ? c.text : RENK.metinSilik,
          }}>{x.numara}</button>
        ))}
      </div>

      {s && (
        <>
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginBottom: 4 }}>
            Soru {s.numara} · {sira + 1}/{sorular.length}
          </div>
          {s.gorsel_url && (
            <img src={s.gorsel_url} alt="" style={{
              maxWidth: "100%", borderRadius: KOSE.s, marginBottom: BOSLUK.s, display: "block",
            }} />
          )}
          <div style={{
            fontSize: 14, lineHeight: 1.6, color: RENK.metin,
            marginBottom: BOSLUK.m, whiteSpace: "pre-wrap",
          }}>{s.metin}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: BOSLUK.m }}>
            {(s.siklar ?? []).map(sik => {
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
            })}
          </div>

          <div style={{ display: "flex", gap: BOSLUK.s, marginBottom: BOSLUK.s }}>
            <button onClick={() => setSira(i => Math.max(0, i - 1))} disabled={sira === 0} style={{
              padding: "9px 16px", borderRadius: KOSE.m, cursor: sira === 0 ? "default" : "pointer",
              border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
              color: sira === 0 ? RENK.metinSilik : RENK.metinIkincil, fontSize: YAZI.ikincil,
            }}>← Önceki</button>
            <button onClick={() => setSira(i => Math.min(sorular.length - 1, i + 1))}
              disabled={sira >= sorular.length - 1} style={{
                flex: 1, padding: "9px 16px", borderRadius: KOSE.m,
                cursor: sira >= sorular.length - 1 ? "default" : "pointer",
                border: "none", background: sira >= sorular.length - 1 ? "#ddd" : c.bg,
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
