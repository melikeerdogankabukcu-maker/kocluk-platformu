// ⏸ ERTELENDİ (2026-10-14, kullanıcı kararı)
//
// Bu bileşen ARAYÜZE BAĞLI DEĞİL. Optik form yolu şu an kapsamda yok:
// öğrenci testi DİJİTAL ortamda çözecek ve kontrol oradan sağlanacak,
// yani basılı cevap kâğıdına ihtiyaç kalmıyor.
//
// Kod ve `cevap_kagidi_migration.sql` ileride lazım olursa diye
// duruyor (kimlik şeridi tasarımı ve ölçümü işe yarar bir parça).
// Yeniden açılacaksa önce akışın tamamı doğrulanmalı — bu iş bir kez
// önkabul sınanmadan yazıldı.

import { useState } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { SIKLAR } from "../lib/cevapAnahtari";
import { kodBitleri, yeniKod, kodYaz, sutunDuzeni } from "../lib/cevapKagidi";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Basılacak cevap kâğıdı.
//
// ── NEDEN HARİCİ PDF KÜTÜPHANESİ YOK ────────────────────────────
// VeliRaporu ve HaftalikProgram'daki kararın aynısı: jsPDF'in gömülü
// fontları Türkçe karakterleri bozuyor. Tarayıcının yazdırma motoru
// hem Türkçe'yi doğru basıyor hem "PDF olarak kaydet" seçeneğini
// zaten veriyor.
//
// ── OKUYAN TARAF İÇİN GEOMETRİ ──────────────────────────────────
// Kâğıt yalnız insana değil, sonra onu okuyacak koda da hitap ediyor:
//   • Dört köşedeki DOLU KARELER perspektif düzeltmenin dayanağı.
//     Sayfanın dört köşesinde ve sabit oranda duruyorlar.
//   • KİMLİK ŞERİDİ kâğıdın kodunu taşıyor (dolu/boş kare). QR yerine
//     bu seçildi: aynı doluluk ölçümüyle okunuyor, kütüphane
//     gerektirmiyor ve iOS'ta olmayan BarcodeDetector'a bağlı değil.
//   • Baloncuk ızgarasının sütun/satır düzeni cevapKagidi.js'teki
//     hesapla ÜRETİLİYOR; okuyan taraf aynı hesapla yerini biliyor.
//     Yerleşim, kâğıtla kod arasında paylaşılan tek gerçek.
const KOSE_KARE = 34;        // köşe işaretinin kenarı (px, baskıda ~9mm)

export default function CevapKagidi({ bolum, kitapAdi, ogrenciler, anahtar, color: c, onKapat }) {
  const [secili, setSecili] = useState(() => new Set(ogrenciler.map(o => o.id)));
  const [kagitlar, setKagitlar] = useState(null);   // [{ ogrenci, kod }]
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState(null);

  const soruSayisi = anahtar?.soru_sayisi ?? bolum.soru_sayisi ?? 20;
  const sikSayisi = anahtar?.sik_sayisi ?? 5;
  const { sutun, satir } = sutunDuzeni(soruSayisi);

  const uret = async () => {
    const listesi = ogrenciler.filter(o => secili.has(o.id));
    if (!listesi.length) return;
    setIslemde(true); setHata(null);

    // Kâğıt kayıtları ÖNCE açılıyor: basılan her kâğıdın karşılığı
    // veritabanında olmalı, yoksa okuyan taraf kâğıdı tanıyamaz.
    const satirlar = listesi.map(o => ({
      kod: yeniKod(),
      bolum_id: bolum.id,
      student_id: o.id,
      soru_sayisi: soruSayisi,
      sik_sayisi: sikSayisi,
    }));

    const { hata: h } = await calistir(
      supabase.from("cevap_kagitlari").insert(satirlar),
      "Cevap kagidi olusturma"
    );
    setIslemde(false);
    if (h) {
      // Kod çakışması teorik olarak mümkün (16.7 milyonda bir);
      // kullanıcıya "tekrar deneyin" demek yeterli, sessizce
      // numarayı değiştirip basmak kâğıdı izlenemez yapardı.
      setHata("Kâğıt oluşturulamadı. Tekrar deneyin.");
      return;
    }

    setKagitlar(listesi.map((o, i) => ({ ogrenci: o, kod: satirlar[i].kod })));
  };

  // ── Tek kâğıdın çizimi ────────────────────────────────────────
  const kagitCiz = ({ ogrenci, kod }) => (
    <div key={kod} className="cevap-kagidi" style={{
      position: "relative", padding: 48, background: "#fff", color: "#000",
      breakAfter: "page", minHeight: 900,
    }}>
      {/* Köşe işaretleri: perspektif düzeltmenin dayanağı */}
      {[[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => (
        <div key={`${x}${y}`} style={{
          position: "absolute", width: KOSE_KARE, height: KOSE_KARE, background: "#000",
          left: x ? "auto" : 10, right: x ? 10 : "auto",
          top: y ? "auto" : 10, bottom: y ? 10 : "auto",
        }} />
      ))}

      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }}>CEVAP KÂĞIDI</div>
        <div style={{ fontSize: 12, marginTop: 3 }}>{kitapAdi} · {bolum.baslik}</div>
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        borderBottom: "2px solid #000", paddingBottom: 6, marginBottom: 10, fontSize: 12,
      }}>
        <div><b>{ogrenciler.length ? ogrenci.full_name : ""}</b></div>
        <div>{soruSayisi} soru · {sikSayisi} şık · Kod: <b>{kodYaz(kod)}</b></div>
      </div>

      {/* Kimlik şeridi — kâğıdı makineye tanıtan kısım */}
      <div style={{ display: "flex", gap: 3, marginBottom: 14, alignItems: "center" }}>
        <span style={{ fontSize: 8, color: "#888", marginRight: 4 }}>▼</span>
        {kodBitleri(kod).map((dolu, i) => (
          <span key={i} style={{
            width: 11, height: 11, border: "1px solid #000",
            background: dolu ? "#000" : "#fff", display: "block",
          }} />
        ))}
        <span style={{ fontSize: 8, color: "#888", marginLeft: 6 }}>
          bu şeridi işaretlemeyin
        </span>
      </div>

      {/* Baloncuk ızgarası */}
      <div style={{ display: "flex", gap: 28 }}>
        {Array.from({ length: sutun }, (_, s) => (
          <div key={s} style={{ flex: 1 }}>
            {Array.from({ length: satir }, (_, r) => {
              const indeks = s * satir + r;
              if (indeks >= soruSayisi) return null;
              return (
                <div key={r} style={{
                  display: "flex", alignItems: "center", gap: 7, height: 26,
                }}>
                  <span style={{ width: 22, fontSize: 11, textAlign: "right" }}>{indeks + 1}.</span>
                  {SIKLAR.slice(0, sikSayisi).map(sik => (
                    <span key={sik} style={{
                      width: 17, height: 17, borderRadius: "50%", border: "1.5px solid #000",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color: "#999",
                    }}>{sik}</span>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, fontSize: 9.5, color: "#555", lineHeight: 1.5 }}>
        Baloncuğun içini tükenmez kalemle tamamen doldurun. Yanlış
        işaretlediğinizde üzerini karalamak yerine o soruyu boş bırakın.
        Kâğıdın dört köşesindeki kareler ve üstteki şerit okumaya yarıyor,
        üzerlerine yazmayın.
      </div>
    </div>
  );

  return (
    <Modal title="Cevap kâğıdı bas" onClose={onKapat} maxWidth={620}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #kagit-alani, #kagit-alani * { visibility: visible !important; }
          #kagit-alani {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; max-height: none !important; overflow: visible !important;
          }
          .yazdirma-gizle { display: none !important; }
          .cevap-kagidi { break-after: page; }
          @page { margin: 8mm; }
        }
      `}</style>

      {!kagitlar ? (
        <div className="yazdirma-gizle">
          {!anahtar && (
            <div style={{
              background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 12,
              padding: "9px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m, lineHeight: 1.5,
            }}>
              Bu bölümün cevap anahtarı girilmemiş. Kâğıt yine basılır ama
              gönderilen kâğıt puanlanamaz — anahtarı da girin.
            </div>
          )}
          {hata && (
            <div style={{
              background: RENK.hata.zemin, color: RENK.hata.metin, fontSize: 12,
              padding: "9px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m,
            }}>{hata}</div>
          )}

          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, marginBottom: BOSLUK.s }}>
            {soruSayisi} soru · {sikSayisi} şık · {sutun} sütun
          </div>

          <div style={{
            fontSize: 11, fontWeight: 700, color: RENK.metinIkincil,
            letterSpacing: 0.4, marginBottom: BOSLUK.s,
          }}>KİMLER İÇİN BASILSIN</div>

          {ogrenciler.length === 0 ? (
            <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>
              Bu kitabı kullanan öğrenci yok.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
              {ogrenciler.map(o => (
                <label key={o.id} style={{
                  display: "flex", alignItems: "center", gap: BOSLUK.s,
                  padding: "6px 8px", borderRadius: KOSE.s, cursor: "pointer",
                  background: secili.has(o.id) ? c.light : "transparent",
                  fontSize: YAZI.ikincil,
                }}>
                  <input type="checkbox" checked={secili.has(o.id)}
                    onChange={() => setSecili(s => {
                      const y = new Set(s);
                      y.has(o.id) ? y.delete(o.id) : y.add(o.id);
                      return y;
                    })} />
                  {o.full_name}
                </label>
              ))}
            </div>
          )}

          <button onClick={uret} disabled={islemde || secili.size === 0} style={{
            width: "100%", marginTop: BOSLUK.m, padding: "11px 0", borderRadius: KOSE.m,
            border: "none", background: secili.size ? c.bg : "#ddd", color: "#fff",
            fontSize: YAZI.ikincil, fontWeight: 700, cursor: secili.size ? "pointer" : "default",
          }}>{islemde ? "Hazırlanıyor..." : `${secili.size} kâğıt hazırla`}</button>
        </div>
      ) : (
        <>
          <div className="yazdirma-gizle" style={{ display: "flex", gap: BOSLUK.s, marginBottom: BOSLUK.m }}>
            <button onClick={() => window.print()} style={{
              flex: 1, padding: "10px 0", borderRadius: KOSE.m, border: "none",
              background: c.bg, color: "#fff", fontSize: YAZI.ikincil, fontWeight: 700, cursor: "pointer",
            }}>🖨️ Yazdır / PDF olarak kaydet</button>
          </div>
          <div className="yazdirma-gizle" style={{
            fontSize: YAZI.mikro, color: RENK.metinSoluk, marginBottom: BOSLUK.m, lineHeight: 1.5,
          }}>
            {kagitlar.length} kâğıt hazır. Her öğrenci ayrı sayfada; kâğıtlar
            kaydedildi, kodlarıyla birlikte tanınacaklar.
          </div>
          <div id="kagit-alani">{kagitlar.map(kagitCiz)}</div>
        </>
      )}
    </Modal>
  );
}
