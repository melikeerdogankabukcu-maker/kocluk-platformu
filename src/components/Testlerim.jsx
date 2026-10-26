import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import TestCoz from "./TestCoz";

// Öğrencinin çözebileceği dijital testler.
//
// Liste `acik_testlerim()` RPC'sinden geliyor; öğrenci `sorular`
// tablosunu okuyamadığı için onaylı soru sayısını kendisi sayamıyor.
// RPC hak durumunu da denetliyor: izni olmayan kitap listeye hiç
// düşmüyor.
//
// ── BİRİM KONU ──────────────────────────────────────────────────
// Bir satır = bir kitabın bir KONUSU. Bölüm değil: koç sayfaları
// konuyla eşleştiriyor ve analiz de konu kırılımını okuyor. Konusu
// girilmemiş sorular "Konusuz sorular" diye ayrı bir satır — gizlenseydi
// öğrenci onları hiç çözemezdi.
export default function Testlerim({ color: c, baslik = "Testler" }) {
  const [testler, setTestler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acilan, setAcilan] = useState(null);   // { oturumId, baslik }
  const [islemde, setIslemde] = useState(null); // başlatılan testin anahtarı
  const [hata, setHata] = useState(null);
  const [yuklemeHatasi, setYuklemeHatasi] = useState(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    // Hata SESSİZ geçerse liste boş kalıyor ve ekran "test yok" diyor —
    // oysa sebep izin ya da eksik bir fonksiyon olabilir. İkisi
    // birbirinden ayırt edilemediği için hata ayrıca gösteriliyor.
    const { veri, hata: h } = await calistir(
      supabase.rpc("acik_testlerim"), "Acik testler", { sessiz: true });
    setYuklemeHatasi(h ? (h.message ?? "Test listesi alınamadı.") : null);
    setTestler(veri ?? []);
    setYukleniyor(false);
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  const basla = async (t) => {
    const anahtar = `${t.banka_id}|${t.konu ?? ""}`;
    setIslemde(anahtar); setHata(null);
    // Yarıda kalmış oturum varsa RPC onu döndürüyor; yeni oturum
    // açmak öğrencinin önceki cevaplarını çöpe atardı.
    const { veri, hata: h } = await calistir(
      supabase.rpc("test_basla", { p_banka: t.banka_id, p_konu: t.konu }),
      "Test baslatma");
    setIslemde(null);
    if (h) { setHata(h.message ?? "Test başlatılamadı."); return; }
    setAcilan({ oturumId: veri, baslik: t.konu ? `${t.ad} — ${t.konu}` : t.ad });
  };

  return (
    <>
      <Card id="bolum-testler">
        <SectionTitle title={baslik} color={c.mid} />
        {yuklemeHatasi && (
          <div style={{
            background: RENK.hata.zemin, color: RENK.hata.metin, fontSize: 12,
            padding: "8px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.s, lineHeight: 1.5,
          }}>Test listesi alınamadı: {yuklemeHatasi}</div>
        )}
        {hata && (
          <div style={{
            background: RENK.hata.zemin, color: RENK.hata.metin, fontSize: 12,
            padding: "8px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.s,
          }}>{hata}</div>
        )}
        {yukleniyor ? (
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
        ) : testler.length === 0 ? (
          // Eskiden burada hiçbir şey çizilmiyordu (bileşen null
          // dönüyordu). Tek başına duran bir kart için doğruydu, sekme
          // içinde değil: "Testler" sekmesi tıklanınca bomboş açılıyor
          // ve bozuk görünüyordu.
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk, lineHeight: 1.55 }}>
            Şu an çözebileceğiniz bir test yok. Koçunuz bir kaynağın
            sorularını onaylayıp öğrencilere açtığında testler burada
            çıkıyor.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
            {testler.map(t => {
              const anahtar = `${t.banka_id}|${t.konu ?? ""}`;
              return (
                <div key={anahtar} style={{
                  display: "flex", alignItems: "center", gap: BOSLUK.s,
                  padding: "10px 12px", borderRadius: KOSE.m,
                  border: `1px solid ${RENK.cizgi}`, background: RENK.yuzey,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: YAZI.ikincil, fontWeight: 600, color: RENK.metin }}>
                      {t.konu ?? "Konusuz sorular"}
                    </div>
                    <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>
                      {[t.ad, t.ders, `${t.soru_sayisi} soru`]
                        .filter(Boolean).join(" · ")}
                      {t.devam_eden && " · yarıda kaldı"}
                    </div>
                  </div>
                  <button onClick={() => basla(t)} disabled={islemde === anahtar} style={{
                    flexShrink: 0, padding: "7px 16px", borderRadius: KOSE.tam, border: "none",
                    background: c.bg, color: "#fff", fontSize: YAZI.mikro, fontWeight: 700,
                    cursor: "pointer",
                  }}>{islemde === anahtar ? "..." : t.devam_eden ? "Devam et" : "Çöz"}</button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {acilan && (
        <TestCoz
          oturumId={acilan.oturumId} baslik={acilan.baslik} color={c}
          onBitti={yukle}
          onKapat={() => { setAcilan(null); yukle(); }}
        />
      )}
    </>
  );
}
