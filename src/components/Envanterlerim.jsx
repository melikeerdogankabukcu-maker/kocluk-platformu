import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { ENVANTERLER, envanterBul } from "../lib/envanterler";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import EnvanterDoldur from "./EnvanterDoldur";

// Öğrencinin envanterleri: platformun hazır envanterleri + koçunun
// kendi yüklediği envanterler, altında geçmiş sonuçlar.
//
// ── TEKRAR DOLDURULABİLİYOR ─────────────────────────────────────
// Benzersizlik kısıtı yok: aynı envanter üç ay sonra tekrar
// doldurulunca değişim görünüyor. Bu yüzden "doldurdun" diye
// kilitlemek yerine "son: 12 Kasım" yazıp yeniden doldurmaya izin
// veriyor.
export default function Envanterlerim({ userId, color: c, baslik = "Gelişim Envanterleri" }) {
  const [kocEnvanterleri, setKocEnvanterleri] = useState([]);
  const [sonuclar, setSonuclar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState(null);        // { envanter } | { kocEnvanteri }

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const [{ veri: kocLar }, { veri: gecmis }] = await Promise.all([
      // Politika yalnız KOÇUNUN envanterlerini geçiriyor; süzgece
      // gerek yok, RLS zaten daraltıyor.
      calistir(supabase.from("koc_envanterleri")
        .select("id, ad, aciklama, tanim").order("created_at", { ascending: false }),
        "Koc envanterleri", { sessiz: true }),
      calistir(supabase.from("envanter_sonuclari")
        .select("id, envanter_kod, koc_envanteri_id, created_at, koc_degerlendirmesi")
        .eq("student_id", userId).order("created_at", { ascending: false }),
        "Envanter sonuclari", { sessiz: true }),
    ]);
    setKocEnvanterleri(kocLar ?? []);
    setSonuclar(gecmis ?? []);
    setYukleniyor(false);
  }, [userId]);

  useEffect(() => { yukle(); }, [yukle]);

  const sonDoldurma = (kod, kocId) => sonuclar.find(s =>
    kod ? s.envanter_kod === kod : s.koc_envanteri_id === kocId);

  const tarih = (t) => t ? new Date(t).toLocaleDateString("tr-TR",
    { day: "numeric", month: "long" }) : "";

  const satir = (ad, aciklama, son, onBasla, anahtar) => (
    <div key={anahtar} style={{
      display: "flex", alignItems: "center", gap: BOSLUK.s,
      padding: "10px 12px", borderRadius: KOSE.m,
      border: `1px solid ${RENK.cizgi}`, background: RENK.yuzey,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: YAZI.ikincil, fontWeight: 600, color: RENK.metin }}>{ad}</div>
        <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk, lineHeight: 1.45 }}>
          {son
            ? `Son: ${tarih(son.created_at)}${son.koc_degerlendirmesi ? " · koçun değerlendirdi" : " · koçun değerlendirmesi bekleniyor"}`
            : aciklama}
        </div>
      </div>
      <button onClick={onBasla} style={{
        flexShrink: 0, padding: "7px 15px", borderRadius: KOSE.tam, border: "none",
        background: son ? "#fff" : c.bg, color: son ? c.text : "#fff",
        boxShadow: son ? `inset 0 0 0 1.5px ${c.mid}` : "none",
        fontSize: YAZI.mikro, fontWeight: 700, cursor: "pointer",
      }}>{son ? "Tekrar doldur" : "Doldur"}</button>
    </div>
  );

  // Hiç envanter yoksa kart görünmesin — ama hazır envanter her zaman
  // en az bir tane var, yani bu yalnız yükleme anında geçerli.
  if (!yukleniyor && ENVANTERLER.length === 0 && kocEnvanterleri.length === 0) return null;

  return (
    <>
      <Card id="bolum-envanter">
        <SectionTitle title={baslik} color={c.mid} />

        {yukleniyor ? (
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
            {ENVANTERLER.map(e => satir(
              e.ad, `${e.sure} · puan yok, öneri çıkıyor`,
              sonDoldurma(e.kod, null),
              () => setAcik({ envanter: e }), `h-${e.kod}`))}

            {kocEnvanterleri.map(k => satir(
              k.ad, k.aciklama || `Koçunun hazırladığı envanter · ${k.tanim?.sorular?.length ?? 0} soru`,
              sonDoldurma(null, k.id),
              () => setAcik({ kocEnvanteri: k }), `k-${k.id}`))}
          </div>
        )}

        {/* Koçun değerlendirmeleri. Öğrenci kendi önerilerini doldurma
            sonunda görüyor; burada koçun yazdığı duruyor. */}
        {sonuclar.some(s => s.koc_degerlendirmesi) && (
          <div style={{ marginTop: BOSLUK.m }}>
            <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
              KOÇUNUN DEĞERLENDİRMESİ
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sonuclar.filter(s => s.koc_degerlendirmesi).map(s => (
                <div key={s.id} style={{
                  padding: "10px 12px", borderRadius: KOSE.m,
                  background: c.light, color: c.text, fontSize: YAZI.kucuk, lineHeight: 1.55,
                }}>
                  <div style={{ fontSize: YAZI.mikro, color: c.mid, marginBottom: 3 }}>
                    {envanterBul(s.envanter_kod)?.ad
                      ?? kocEnvanterleri.find(k => k.id === s.koc_envanteri_id)?.ad
                      ?? "Envanter"} · {tarih(s.created_at)}
                  </div>
                  {s.koc_degerlendirmesi}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {acik && (
        <EnvanterDoldur
          envanter={acik.envanter} kocEnvanteri={acik.kocEnvanteri}
          studentId={userId} color={c}
          onKapat={() => { setAcik(null); yukle(); }}
          onKaydedildi={yukle}
        />
      )}
    </>
  );
}
