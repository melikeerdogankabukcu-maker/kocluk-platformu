import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { SIKLIK, envanterBul, envanterDegerlendir } from "../lib/envanterler";
import { kocEnvanteriOzeti } from "../lib/envanterSablonu";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import Modal from "./Modal";
import EnvanterIceAktar from "./EnvanterIceAktar";

// Koçun envanter ekranı: öğrencilerinin doldurdukları + kendi
// yüklediği envanterler.
//
// ── KOÇUN DEĞERLENDİRMESİ TEK ÇIKIŞ KAPISI ──────────────────────
// Veli ham cevapları ve eğilimleri GÖRMÜYOR; gördüğü tek şey koçun
// buraya yazdığı metin. Bu yüzden değerlendirme alanı ekranın merkezi
// ve "veli bunu görecek" uyarısı yanında duruyor — koç ne yazdığını
// bilerek yazsın.
//
// ── KOÇ ENVANTERİNDE SİSTEM YORUM YAPMIYOR ──────────────────────
// Hazır envanterde öneriler çıkıyor (yorum metinlerini biz yazdık).
// Koçun kendi envanterinde yorum metni yok; sistem uydurmuyor, boyut
// ortalamasını gösterip bırakıyor.
export default function EnvanterYonetimi({ userId, students = [], color: c, baslik = "Gelişim Envanterleri" }) {
  const [sonuclar, setSonuclar] = useState([]);
  const [kocEnvanterleri, setKocEnvanterleri] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [iceAktar, setIceAktar] = useState(false);
  const [acik, setAcik] = useState(null);        // incelenen sonuç

  const ogrenciIdleri = useMemo(() => students.map(s => s.id).join(","), [students]);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const idler = ogrenciIdleri ? ogrenciIdleri.split(",") : [];
    const [{ veri: kocLar }, { veri: gelen }] = await Promise.all([
      calistir(supabase.from("koc_envanterleri")
        .select("id, ad, aciklama, tanim, created_at")
        .eq("sahip_id", userId).order("created_at", { ascending: false }),
        "Kendi envanterleri", { sessiz: true }),
      idler.length === 0 ? Promise.resolve({ veri: [] }) :
        calistir(supabase.from("envanter_sonuclari").select("*")
          .in("student_id", idler).order("created_at", { ascending: false }),
          "Envanter sonuclari", { sessiz: true }),
    ]);
    setKocEnvanterleri(kocLar ?? []);
    setSonuclar(gelen ?? []);
    setYukleniyor(false);
  }, [userId, ogrenciIdleri]);

  useEffect(() => { yukle(); }, [yukle]);

  const adBul = (id) => students.find(s => s.id === id)?.full_name ?? "—";
  const tarih = (t) => t ? new Date(t).toLocaleDateString("tr-TR",
    { day: "numeric", month: "long", year: "numeric" }) : "";

  const envanterAdi = (s) =>
    envanterBul(s.envanter_kod)?.ad
    ?? kocEnvanterleri.find(k => k.id === s.koc_envanteri_id)?.ad
    ?? "Envanter";

  const envanteriSil = async (k) => {
    if (!confirm(`"${k.ad}" envanteri ve doldurulmuş bütün cevapları silinsin mi?`)) return;
    const { hata } = await calistir(
      supabase.from("koc_envanterleri").delete().eq("id", k.id), "Envanter silme");
    if (!hata) await yukle();
  };

  const bekleyen = sonuclar.filter(s => !s.koc_degerlendirmesi).length;

  return (
    <>
      <Card id="bolum-envanter">
        <SectionTitle title={baslik} color={c.mid} />

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: BOSLUK.s, marginBottom: BOSLUK.m,
        }}>
          <span style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil }}>
            {sonuclar.length} doldurulmuş
            {bekleyen > 0 && <> · <b style={{ color: RENK.uyari.metin }}>
              {bekleyen} değerlendirme bekliyor</b></>}
          </span>
          {!iceAktar && (
            <button onClick={() => setIceAktar(true)} style={{
              flexShrink: 0, padding: "6px 14px", borderRadius: KOSE.tam, border: "none",
              background: c.bg, color: "#fff", fontSize: YAZI.mikro, fontWeight: 700, cursor: "pointer",
            }}>+ Kendi envanterim</button>
          )}
        </div>

        {iceAktar && (
          <EnvanterIceAktar userId={userId} color={c}
            onKapat={() => setIceAktar(false)}
            onEklendi={async () => { setIceAktar(false); await yukle(); }} />
        )}

        {/* Kendi envanterleri */}
        {kocEnvanterleri.length > 0 && (
          <div style={{ marginBottom: BOSLUK.m }}>
            <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
              KENDİ ENVANTERLERİM
            </div>
            {kocEnvanterleri.map(k => (
              <div key={k.id} style={{
                display: "flex", alignItems: "center", gap: BOSLUK.s,
                padding: "6px 2px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
                fontSize: YAZI.kucuk,
              }}>
                <span style={{ flex: 1, minWidth: 0, color: RENK.metin }}>{k.ad}</span>
                <span style={{ flexShrink: 0, fontSize: YAZI.mikro, color: RENK.metinSilik }}>
                  {k.tanim?.sorular?.length ?? 0} soru ·{" "}
                  {sonuclar.filter(s => s.koc_envanteri_id === k.id).length} cevap
                </span>
                <button onClick={() => envanteriSil(k)} style={{
                  flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                  color: RENK.hata.metin, fontSize: YAZI.mikro,
                }}>sil</button>
              </div>
            ))}
            <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: 5, lineHeight: 1.5 }}>
              Öğrencileriniz bu envanterleri kendi panellerinden dolduruyor.
            </div>
          </div>
        )}

        {/* Doldurulmuş envanterler */}
        {yukleniyor ? (
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
        ) : sonuclar.length === 0 ? (
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk, lineHeight: 1.5 }}>
            Henüz doldurulmuş envanter yok. Öğrencileriniz kendi
            panellerindeki "Gelişim Envanterleri" kartından dolduruyor.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 320, overflowY: "auto" }}>
            {sonuclar.map(s => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: BOSLUK.s,
                padding: "8px 2px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: YAZI.kucuk, fontWeight: 600, color: RENK.metin }}>
                    {adBul(s.student_id)}
                  </div>
                  <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>
                    {envanterAdi(s)} · {tarih(s.created_at)}
                  </div>
                </div>
                {!s.koc_degerlendirmesi && (
                  <span style={{
                    flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: "2px 7px",
                    borderRadius: KOSE.tam, background: RENK.uyari.zemin, color: RENK.uyari.metin,
                  }}>değerlendirilmedi</span>
                )}
                <button onClick={() => setAcik(s)} style={{
                  flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                  color: c.mid, fontSize: YAZI.mikro, fontWeight: 600,
                }}>incele</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {acik && (
        <SonucPenceresi sonuc={acik} ad={adBul(acik.student_id)}
          kocEnvanteri={kocEnvanterleri.find(k => k.id === acik.koc_envanteri_id)}
          color={c}
          onKapat={() => setAcik(null)}
          onKaydedildi={async () => { setAcik(null); await yukle(); }} />
      )}
    </>
  );
}

// Tek sonucun incelenmesi + koçun değerlendirmesi.
function SonucPenceresi({ sonuc, ad, kocEnvanteri, color: c, onKapat, onKaydedildi }) {
  const hazir = envanterBul(sonuc.envanter_kod);
  const [metin, setMetin] = useState(sonuc.koc_degerlendirmesi ?? "");
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState(null);

  const degerlendirme = useMemo(() => {
    if (hazir) return envanterDegerlendir(hazir, sonuc.cevaplar ?? {});
    if (kocEnvanteri) return kocEnvanteriOzeti(kocEnvanteri.tanim, sonuc.cevaplar ?? {});
    return null;
  }, [hazir, kocEnvanteri, sonuc.cevaplar]);

  const kaydet = async () => {
    setIslemde(true);
    setHata(null);
    const { hata: h } = await calistir(
      supabase.from("envanter_sonuclari")
        .update({ koc_degerlendirmesi: metin.trim() || null })
        .eq("id", sonuc.id),
      "Degerlendirme kaydetme"
    );
    setIslemde(false);
    if (h) { setHata("Kaydedilemedi."); return; }
    onKaydedildi?.();
  };

  const etiket = (deger) => SIKLIK.find(s => s.deger === Number(deger))?.etiket ?? String(deger);

  return (
    <Modal title={`${ad} — ${hazir?.ad ?? kocEnvanteri?.ad ?? "Envanter"}`}
      onClose={onKapat} maxWidth={620}>

      {/* Eğilimler (hazır envanter) ya da boyut ortalamaları (koç envanteri) */}
      {hazir && degerlendirme?.egilimler?.length > 0 && (
        <div style={{ marginBottom: BOSLUK.m }}>
          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
            EĞİLİMLER
          </div>
          {degerlendirme.egilimler.map(e => (
            <div key={e.boyut} style={{
              display: "flex", gap: BOSLUK.s, alignItems: "baseline",
              padding: "5px 0", fontSize: YAZI.kucuk,
            }}>
              <span style={{ width: 150, flexShrink: 0, color: RENK.metinIkincil }}>{e.ad}</span>
              <span style={{ flex: 1, color: RENK.metin, lineHeight: 1.45 }}>{e.metin}</span>
            </div>
          ))}
        </div>
      )}

      {!hazir && degerlendirme?.boyutlar?.length > 0 && (
        <div style={{ marginBottom: BOSLUK.m }}>
          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
            BOYUT ORTALAMALARI (1 = en düşük, 5 = en yüksek; ters sorular çevrilmiş)
          </div>
          {degerlendirme.boyutlar.map(b => (
            <div key={b.kod} style={{
              display: "flex", gap: BOSLUK.s, alignItems: "center",
              padding: "4px 0", fontSize: YAZI.kucuk,
            }}>
              <span style={{ width: 150, flexShrink: 0, color: RENK.metinIkincil }}>{b.ad}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 99, background: RENK.yuzey }}>
                <div style={{
                  width: `${(b.ortalama / 5) * 100}%`, height: "100%", borderRadius: 99,
                  background: b.ortalama < 2.5 ? RENK.hata.metin : b.ortalama > 3.5 ? RENK.basari.metin : c.mid,
                }} />
              </div>
              <span style={{ flexShrink: 0, width: 54, textAlign: "right", color: RENK.metin, fontWeight: 700 }}>
                {b.ortalama} <span style={{ fontWeight: 400, color: RENK.metinSilik }}>/{b.soruSayisi}</span>
              </span>
            </div>
          ))}
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: 5, lineHeight: 1.5 }}>
            Bu envanteri siz hazırladınız, yorum metinleri yok — sistem
            yorum üretmiyor, değerlendirme size ait.
          </div>
        </div>
      )}

      {/* Açık uçlu cevaplar */}
      {!hazir && degerlendirme?.acikCevaplar?.length > 0 && (
        <div style={{ marginBottom: BOSLUK.m }}>
          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
            AÇIK UÇLU CEVAPLAR
          </div>
          {degerlendirme.acikCevaplar.map((a, i) => (
            <div key={i} style={{ marginBottom: 7, fontSize: YAZI.kucuk }}>
              <div style={{ color: RENK.metinSoluk, fontSize: YAZI.mikro }}>{a.soru}</div>
              <div style={{ color: RENK.metin, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.cevap}</div>
            </div>
          ))}
        </div>
      )}

      {/* Öneriler (yalnız hazır envanterde) */}
      {hazir && degerlendirme?.oneriler?.length > 0 && (
        <div style={{ marginBottom: BOSLUK.m }}>
          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
            ÖĞRENCİYE GÖSTERİLEN ÖNERİLER
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {degerlendirme.oneriler.map(o => (
              <div key={o.boyut} style={{
                padding: "8px 11px", borderRadius: KOSE.s, background: RENK.yuzey,
                fontSize: YAZI.mikro, lineHeight: 1.5,
              }}>
                <b style={{ color: RENK.metin }}>{o.baslik}</b> — {o.metin}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ham cevaplar */}
      <details style={{ marginBottom: BOSLUK.m }}>
        <summary style={{ fontSize: YAZI.mikro, color: c.mid, cursor: "pointer", fontWeight: 600 }}>
          Soru soru cevapları göster
        </summary>
        <div style={{ marginTop: 7 }}>
          {((hazir ?? kocEnvanteri?.tanim)?.sorular ?? []).map((s, i) => {
            const cevap = (sonuc.cevaplar ?? {})[s.kod];
            return (
              <div key={s.kod} style={{
                display: "flex", gap: 6, alignItems: "baseline",
                padding: "4px 0", fontSize: YAZI.mikro,
                borderBottom: `1px solid ${RENK.cizgiSolgun}`,
              }}>
                <span style={{ color: RENK.metinSilik, width: 16, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, color: RENK.metinIkincil, lineHeight: 1.4 }}>
                  {s.metin}{s.ters && <span style={{ color: RENK.uyari.metin }}> (ters)</span>}
                </span>
                <span style={{ flexShrink: 0, color: cevap == null ? RENK.metinSilik : RENK.metin, fontWeight: 600 }}>
                  {cevap == null || cevap === "" ? "boş"
                    : s.tur === "siklik" ? etiket(cevap) : String(cevap)}
                </span>
              </div>
            );
          })}
        </div>
      </details>

      {/* Koçun değerlendirmesi — veliye giden tek şey */}
      <div style={{
        padding: BOSLUK.m, borderRadius: KOSE.m, border: `1.5px solid ${c.mid}`,
      }}>
        <div style={{ fontSize: YAZI.ikincil, fontWeight: 700, color: RENK.metin, marginBottom: 4 }}>
          Değerlendirmeniz
        </div>
        <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5, marginBottom: 7 }}>
          Bunu <b>öğrenci ve velisi</b> görüyor. Veli cevapları ve
          eğilimleri görmüyor; gördüğü tek şey bu metin.
        </div>
        <textarea rows={4} value={metin} onChange={e => setMetin(e.target.value)}
          placeholder="Örn. Kısa bloklarla çalışması daha verimli; akşam saatlerini tekrara ayırıyoruz."
          style={{
            width: "100%", boxSizing: "border-box", padding: "9px 11px",
            borderRadius: KOSE.s, border: `1.5px solid ${RENK.cizgi}`,
            fontSize: YAZI.ikincil, fontFamily: "inherit", resize: "vertical",
          }} />

        {hata && (
          <div style={{ fontSize: 11.5, color: RENK.hata.metin, marginTop: 5 }}>{hata}</div>
        )}

        <div style={{ display: "flex", gap: BOSLUK.s, marginTop: BOSLUK.s }}>
          <button onClick={kaydet} disabled={islemde} style={{
            flex: 1, padding: "9px 0", borderRadius: KOSE.m, border: "none",
            background: c.bg, color: "#fff", fontSize: YAZI.ikincil,
            fontWeight: 700, cursor: "pointer",
          }}>{islemde ? "Kaydediliyor..." : "Değerlendirmeyi kaydet"}</button>
          <button onClick={onKapat} style={{
            padding: "9px 14px", borderRadius: KOSE.m, cursor: "pointer",
            border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
            fontSize: YAZI.ikincil, color: RENK.metinIkincil,
          }}>Kapat</button>
        </div>
      </div>
    </Modal>
  );
}
