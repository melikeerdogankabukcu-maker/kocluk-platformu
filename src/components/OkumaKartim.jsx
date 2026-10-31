import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { imzaliUrlListesi } from "../lib/depo";
import { sureMetni, kalanGun, ilerlemeYuzdesi, gunlukHedef } from "../lib/okuma";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import GuvenliGorsel from "./GuvenliGorsel";

// Öğrencinin okuma kartı: koçunun verdiği kitaplar, kalan gün ve
// sayfa ilerlemesi.
//
// ── GÜNLÜK HEDEF EN ÖNEMLİ SAYI ─────────────────────────────────
// "12 gün kaldı" tek başına ne yapılacağını söylemiyor. Kalan sayfa
// kalan güne bölününce öğrencinin BUGÜN ne yapacağı çıkıyor —
// kartın en belirgin sayısı o.
//
// ── SÜRE DOLUNCA GÖREV KAYBOLMUYOR ──────────────────────────────
// Gecikmiş atama listede kalıyor ve "başarısız" denmiyor; okuma
// sürekliliği olan bir iş, bir günlük gecikmeyi başarısızlık saymak
// öğrenciyi bırakmaya iter. Koç gün ekleyebiliyor.
export default function OkumaKartim({ userId, color: c, baslik = "Okuma" }) {
  const [atamalar, setAtamalar] = useState([]);
  const [imzalar, setImzalar] = useState({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState(null);     // güncellenen atama id'si

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const { veri } = await calistir(
      supabase.from("okuma_atamalari")
        .select("*, kitap:okuma_kitaplari(id, ad, yazar, toplam_sayfa, kapak_url)")
        .eq("student_id", userId)
        .order("durum")                    // devam önce ('bitti' alfabetik sonra)
        .order("baslangic", { ascending: false }),
      "Okuma atamalari", { sessiz: true }
    );
    const liste = veri ?? [];
    setAtamalar(liste);
    setYukleniyor(false);

    const yollar = [...new Set(liste.map(a => a.kitap?.kapak_url).filter(Boolean))];
    setImzalar(yollar.length > 0 ? await imzaliUrlListesi(yollar) : {});
  }, [userId]);

  useEffect(() => { yukle(); }, [yukle]);

  const sayfaYaz = async (atama, yeni) => {
    const toplam = atama.kitap?.toplam_sayfa;
    const deger = Math.max(0, Math.min(Number(yeni) || 0, toplam ?? 99999));
    setIslemde(atama.id);
    const { hata } = await calistir(
      supabase.from("okuma_atamalari").update({ okunan_sayfa: deger }).eq("id", atama.id),
      "Okuma ilerlemesi");
    setIslemde(null);
    if (!hata) await yukle();
  };

  const durumDegistir = async (atama) => {
    const yeni = atama.durum === "bitti" ? "devam" : "bitti";
    setIslemde(atama.id);
    const { hata } = await calistir(
      supabase.from("okuma_atamalari").update({ durum: yeni }).eq("id", atama.id),
      "Okuma durumu");
    setIslemde(null);
    if (!hata) await yukle();
  };

  // Atama yoksa kart hiç çıkmıyor: koçu kitap vermemiş öğrenciye boş
  // bir "Okuma" kartı göstermenin bir faydası yok.
  if (!yukleniyor && atamalar.length === 0) return null;

  return (
    <Card id="bolum-okuma">
      <SectionTitle title={baslik} color={c.mid} />

      {yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
          {atamalar.map(a => {
            const k = a.kitap ?? {};
            const bitti = a.durum === "bitti";
            const kalan = kalanGun(a.baslangic, a.gun_sayisi);
            const gecikti = !bitti && kalan != null && kalan <= 0;
            const yuzde = ilerlemeYuzdesi(a.okunan_sayfa, k.toplam_sayfa);
            const hedef = bitti ? null : gunlukHedef(k.toplam_sayfa, a.okunan_sayfa, a.baslangic, a.gun_sayisi);

            return (
              <div key={a.id} style={{
                display: "flex", gap: BOSLUK.s,
                padding: "11px 12px", borderRadius: KOSE.m,
                border: `1px solid ${gecikti ? RENK.hata.metin + "44" : RENK.cizgi}`,
                background: bitti ? RENK.yuzey : gecikti ? RENK.hata.zemin : "#fff",
              }}>
                {/* Kapak */}
                <div style={{
                  width: 48, height: 68, borderRadius: KOSE.s, flexShrink: 0,
                  background: RENK.yuzey, overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {k.kapak_url && imzalar[k.kapak_url] ? (
                    <GuvenliGorsel url={k.kapak_url} alt={k.ad}
                      yedek={<span style={{ fontSize: 20 }}>📖</span>}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : <span style={{ fontSize: 20 }}>📖</span>}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: YAZI.ikincil, fontWeight: 600, color: RENK.metin,
                    textDecoration: bitti ? "line-through" : "none",
                  }}>{k.ad}</div>
                  {k.yazar && (
                    <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>{k.yazar}</div>
                  )}

                  {/* Süre ve günlük hedef */}
                  <div style={{
                    fontSize: YAZI.mikro, marginTop: 4,
                    color: bitti ? RENK.basari.metin : gecikti ? RENK.hata.metin : RENK.metinIkincil,
                    fontWeight: gecikti ? 700 : 500,
                  }}>
                    {bitti
                      ? "✓ bitirdin"
                      : <>
                          {sureMetni(a.baslangic, a.gun_sayisi)}
                          {hedef > 0 && <> · <b>günde {hedef} sayfa</b></>}
                        </>}
                  </div>

                  {/* İlerleme çubuğu — toplam sayfa girilmişse */}
                  {yuzde != null && !bitti && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ height: 6, borderRadius: 99, background: RENK.yuzey }}>
                        <div style={{
                          width: `${yuzde}%`, height: "100%", borderRadius: 99,
                          background: gecikti ? RENK.hata.metin : c.bg,
                        }} />
                      </div>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5, marginTop: 5,
                      }}>
                        <input type="number" min={0} max={k.toplam_sayfa}
                          defaultValue={a.okunan_sayfa}
                          disabled={islemde === a.id}
                          onBlur={e => {
                            if (Number(e.target.value) !== a.okunan_sayfa) sayfaYaz(a, e.target.value);
                          }}
                          style={{
                            width: 64, padding: "4px 7px", borderRadius: KOSE.s,
                            border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.mikro,
                            fontFamily: "inherit", boxSizing: "border-box",
                          }} />
                        <span style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>
                          / {k.toplam_sayfa} sayfa · %{yuzde}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={() => durumDegistir(a)} disabled={islemde === a.id} style={{
                  flexShrink: 0, alignSelf: "flex-start",
                  padding: "5px 11px", borderRadius: KOSE.tam, cursor: "pointer",
                  border: `1.5px solid ${bitti ? RENK.cizgi : c.mid}`,
                  background: bitti ? "#fff" : c.light,
                  color: bitti ? RENK.metinSoluk : c.text,
                  fontSize: YAZI.mikro, fontWeight: 600,
                }}>{islemde === a.id ? "..." : bitti ? "geri al" : "bitirdim"}</button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
