import { useState, useMemo } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { sablonCoz, sablonMetni, TURLER } from "../lib/envanterSablonu";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";

// Koçun kendi envanterini şablondan içe aktarma paneli.
//
// ── DOSYA DEĞİL YAPIŞTIRMA ──────────────────────────────────────
// Gerekçe src/lib/envanterSablonu.js başında: .docx ayrıştırma
// kırılgan ve sessizce yanlış envanter üretebiliyor, Google
// Dokümanlar OAuth istiyor. Word, Google Dokümanlar, Excel ve Sheets
// tablo kopyalarken sekmeyle ayrılmış metin veriyor — yapıştırma
// dördünü de kapsıyor.
//
// ── ÖNİZLEME ZORUNLU ────────────────────────────────────────────
// Okunan satırlar kaydetmeden ÖNCE gösteriliyor. İçe aktarmanın en
// olası hatası bir sütunun kayması; o zaman "ters" kolonu boyut
// sanılır ve envanter sessizce yanlış kurulur. Önizleme bunu gözle
// yakalanabilir kılıyor.
export default function EnvanterIceAktar({ userId, color: c, onKapat, onEklendi }) {
  const [ad, setAd] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [metin, setMetin] = useState("");
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState(null);

  const cozum = useMemo(() => sablonCoz(metin), [metin]);

  const engel =
    !ad.trim()            ? "Envantere bir ad verin."
    : !metin.trim()       ? "Şablon tablosunu yapıştırın."
    : cozum.hata          ? cozum.hata
    : null;

  const sablonuIndir = () => {
    // Şablon dosya olarak iniyor ama DOLDURULDUKTAN SONRA yapıştırma
    // yoluyla geri geliyor; indirme yalnız sütunları hazır vermek için.
    const bom = "﻿";              // Excel'in Türkçe karakterleri tanıması için
    const url = URL.createObjectURL(
      new Blob([bom + sablonMetni()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "envanter-sablonu.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const kaydet = async () => {
    if (engel) return;
    setIslemde(true);
    setHata(null);
    const { hata: h } = await calistir(
      supabase.from("koc_envanterleri").insert({
        sahip_id: userId,
        ad: ad.trim(),
        aciklama: aciklama.trim() || null,
        tanim: { sorular: cozum.sorular, boyutlar: cozum.boyutlar },
      }),
      "Envanter ekleme"
    );
    setIslemde(false);
    if (h) { setHata("Kaydedilemedi: " + (h.message ?? "")); return; }
    onEklendi?.();
  };

  const girdi = {
    width: "100%", padding: "8px 10px", borderRadius: KOSE.s, boxSizing: "border-box",
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, fontFamily: "inherit",
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: BOSLUK.s,
      padding: BOSLUK.m, borderRadius: KOSE.m, border: `1.5px solid ${c.mid}`,
      marginBottom: BOSLUK.m,
    }}>
      <div style={{ fontSize: YAZI.ikincil, fontWeight: 700, color: RENK.metin }}>
        Kendi envanterini yükle
      </div>

      <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.55 }}>
        Şablonu indirip Word, Google Dokümanlar, Excel ya da Sheets'te
        doldurun. Sonra <b>tabloyu seçip kopyalayın</b> ve aşağıya
        yapıştırın — dosya yüklemek gerekmiyor.
      </div>

      <button onClick={sablonuIndir} style={{
        alignSelf: "flex-start", padding: "6px 13px", borderRadius: KOSE.tam,
        border: `1.5px solid ${c.mid}`, background: "#fff", color: c.text,
        fontSize: YAZI.mikro, fontWeight: 600, cursor: "pointer",
      }}>⬇ Şablonu indir (.csv)</button>

      <div style={{
        fontSize: YAZI.mikro, color: RENK.metinIkincil, background: RENK.yuzey,
        padding: "8px 10px", borderRadius: KOSE.s, lineHeight: 1.6,
      }}>
        <b>Sütunlar:</b> soru · tür · boyut · ters<br />
        <b>tür:</b> <code>sıklık</code> (Hiç → Her zaman ölçeği) ya da{" "}
        <code>açık</code> (yazarak cevap)<br />
        <b>boyut:</b> soruların gruplandığı başlık (dikkat, planlama…).
        Koç ortalamayı boyut başına görüyor.<br />
        <b>ters:</b> yüksek cevabın OLUMSUZ olduğu sorularda{" "}
        <code>evet</code> — örn. "telefonum yanımda olur".
      </div>

      <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil }}>
        <div style={{ marginBottom: 3 }}>Envanter adı</div>
        <input value={ad} placeholder="Örn. Sınav Kaygısı Gözlem Formu"
          onChange={e => setAd(e.target.value)} style={girdi} />
      </label>

      <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil }}>
        <div style={{ marginBottom: 3 }}>Açıklama (isteğe bağlı)</div>
        <input value={aciklama} placeholder="Öğrenciye görünen kısa açıklama"
          onChange={e => setAciklama(e.target.value)} style={girdi} />
      </label>

      <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil }}>
        <div style={{ marginBottom: 3 }}>Şablon tablosu</div>
        <textarea rows={6} value={metin} placeholder={"Tabloyu buraya yapıştırın"}
          onChange={e => setMetin(e.target.value)}
          style={{ ...girdi, resize: "vertical", fontFamily: "monospace", fontSize: 11.5 }} />
      </label>

      {/* Önizleme */}
      {cozum.sorular.length > 0 && (
        <div>
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil, marginBottom: 5 }}>
            {cozum.sorular.length} soru okundu
            {Object.keys(cozum.boyutlar).length > 0 &&
              ` · boyutlar: ${Object.values(cozum.boyutlar).join(", ")}`}
          </div>
          <div style={{
            maxHeight: 190, overflowY: "auto", border: `1px solid ${RENK.cizgi}`,
            borderRadius: KOSE.s,
          }}>
            {cozum.sorular.map((s, i) => (
              <div key={s.kod} style={{
                display: "flex", gap: 6, alignItems: "baseline",
                padding: "5px 8px", fontSize: YAZI.mikro,
                borderBottom: i < cozum.sorular.length - 1 ? `1px solid ${RENK.cizgiSolgun}` : "none",
              }}>
                <span style={{ color: RENK.metinSilik, flexShrink: 0, width: 16 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, color: RENK.metin, lineHeight: 1.4 }}>{s.metin}</span>
                <span style={{ flexShrink: 0, color: RENK.metinSoluk }}>
                  {s.tur === "acik" ? TURLER.acik.ad.split(" ")[0] : (cozum.boyutlar[s.boyut] ?? "—")}
                  {s.ters && <b style={{ color: RENK.uyari.metin }}> ters</b>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cozum.uyarilar.length > 0 && (
        <div style={{
          background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 11.5,
          padding: "8px 10px", borderRadius: KOSE.s, lineHeight: 1.5,
        }}>
          {cozum.uyarilar.map((u, i) => <div key={i}>• {u}</div>)}
        </div>
      )}

      {(engel || hata) && (
        <div style={{
          background: hata ? RENK.hata.zemin : RENK.uyari.zemin,
          color: hata ? RENK.hata.metin : RENK.uyari.metin,
          fontSize: 11.5, padding: "8px 10px", borderRadius: KOSE.s, lineHeight: 1.5,
        }}>{hata ?? engel}</div>
      )}

      <div style={{ display: "flex", gap: BOSLUK.s }}>
        <button onClick={kaydet} disabled={!!engel || islemde} style={{
          flex: 1, padding: "9px 0", borderRadius: KOSE.m, border: "none",
          background: engel ? "#ddd" : c.bg, color: "#fff",
          fontSize: YAZI.ikincil, fontWeight: 700, cursor: engel ? "default" : "pointer",
        }}>{islemde ? "Kaydediliyor..." : "Envanteri kaydet"}</button>
        <button onClick={onKapat} style={{
          padding: "9px 14px", borderRadius: KOSE.m, cursor: "pointer",
          border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
          fontSize: YAZI.ikincil, color: RENK.metinIkincil,
        }}>Vazgeç</button>
      </div>

      <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
        Envanter bir kez cevaplandıktan sonra <b>soruları değişmiyor</b>:
        cevaplar soru sırasına göre saklandığı için sıra değişse eski
        cevaplar başka soruya denk gelirdi. Adını değiştirebilirsiniz.
      </div>
    </div>
  );
}
