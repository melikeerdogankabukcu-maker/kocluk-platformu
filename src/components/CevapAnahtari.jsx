import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { anahtarCoz, SIKLAR, IPTAL } from "../lib/cevapAnahtari";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Bir kitap bölümünün cevap anahtarını girme ekranı.
//
// ── İKİ GİRİŞ YOLU BİRDEN ───────────────────────────────────────
// Koç 40 soruluk bir anahtarı tek tek tıklayarak girmek istemez:
// kitabın arkasındaki anahtar sayfasından okuyarak yazmak çok daha
// hızlı. Bu yüzden metin kutusu da var, ızgara da — ikisi aynı veriyi
// gösteriyor ve biri değişince diğeri güncelleniyor. Izgara düzeltme
// için (tek bir soruyu değiştirmek), metin kutusu toplu giriş için.
//
// ── ANAHTAR ÖĞRENCİYE KAPALI ────────────────────────────────────
// Bu bileşen yalnızca kitabın sahibi koça gösteriliyor; veritabanında
// da öğrenci için hiçbir politika yok (cevap_anahtari_migration.sql).
// Puanlama sunucuda yapılacak, anahtar öğrencinin cihazına hiç inmiyor.
export default function CevapAnahtari({ bolum, color: c, onKapat, onKaydedildi }) {
  const [soruSayisi, setSoruSayisi] = useState(bolum.soru_sayisi ?? 20);
  const [sikSayisi, setSikSayisi] = useState(5);
  const [cevaplar, setCevaplar] = useState("");
  const [metin, setMetin] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState(false);
  const [vardi, setVardi] = useState(false);

  useEffect(() => {
    let iptal = false;
    calistir(
      supabase.from("cevap_anahtarlari")
        .select("soru_sayisi, sik_sayisi, cevaplar").eq("bolum_id", bolum.id).maybeSingle(),
      "Cevap anahtari okuma", { sessiz: true }
    ).then(({ veri }) => {
      if (iptal) return;
      if (veri) {
        setSoruSayisi(veri.soru_sayisi);
        setSikSayisi(veri.sik_sayisi);
        setCevaplar(veri.cevaplar);
        setMetin(veri.cevaplar);
        setVardi(true);
      }
      setYukleniyor(false);
    });
    return () => { iptal = true; };
  }, [bolum.id]);

  const { dizi, hata, tamam } = anahtarCoz(cevaplar, soruSayisi, sikSayisi);

  // Izgaradan tek soru değiştirme
  const sikSec = (i, sik) => {
    const yeni = dizi.slice();
    yeni[i] = yeni[i] === sik ? "" : sik;       // aynısına basınca temizliyor
    const birlesik = yeni.join("");
    setCevaplar(birlesik);
    setMetin(birlesik);
  };

  const metinDegisti = (ham) => {
    // Harf dışı her şey atılıyor: koç anahtarı "1-A 2-B" diye de
    // yazabiliyor, araya boşluk ve numara karışıyor.
    const temiz = ham.toUpperCase().replace(/[^A-E-]/g, "");
    setMetin(ham);
    setCevaplar(temiz);
  };

  const kaydet = async () => {
    if (!tamam) return;
    setIslemde(true);
    const { hata: h } = await calistir(
      supabase.from("cevap_anahtarlari").upsert({
        bolum_id: bolum.id,
        soru_sayisi: soruSayisi,
        sik_sayisi: sikSayisi,
        cevaplar,
      }, { onConflict: "bolum_id" }),
      "Cevap anahtari kaydetme"
    );
    setIslemde(false);
    if (h) return;
    // Çağıran hem soru hem şık sayısını tutuyor: kâğıt ızgarası
    // ikisine birden bağlı.
    onKaydedildi?.(bolum.id, { soru_sayisi: soruSayisi, sik_sayisi: sikSayisi });
    onKapat();
  };

  const sil = async () => {
    if (!confirm("Bu bölümün cevap anahtarı silinsin mi?")) return;
    setIslemde(true);
    const { hata: h } = await calistir(
      supabase.from("cevap_anahtarlari").delete().eq("bolum_id", bolum.id),
      "Cevap anahtari silme"
    );
    setIslemde(false);
    if (h) return;
    onKaydedildi?.(bolum.id, null);
    onKapat();
  };

  const sayiGirdi = {
    width: 68, padding: "7px 9px", borderRadius: KOSE.s,
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, boxSizing: "border-box",
  };

  return (
    <Modal title={`Cevap anahtarı — ${bolum.baslik}`} onClose={onKapat} maxWidth={520}>
      {yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: BOSLUK.m, alignItems: "flex-end", marginBottom: BOSLUK.m }}>
            <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil }}>
              <div style={{ marginBottom: 4 }}>Soru sayısı</div>
              <input type="number" min={1} max={200} value={soruSayisi} style={sayiGirdi}
                onChange={e => setSoruSayisi(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
            </label>
            <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil }}>
              <div style={{ marginBottom: 4 }}>Şık sayısı</div>
              <select value={sikSayisi} style={sayiGirdi}
                onChange={e => setSikSayisi(Number(e.target.value))}>
                {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div style={{ flex: 1, fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.45 }}>
              LGS 4 şık, YKS 5 şık. İptal edilen soru için <b>-</b> kullanın;
              o soru ne doğru ne yanlış sayılır.
            </div>
          </div>

          {/* Toplu giriş: kitabın anahtar sayfasından okuyup yazmak için */}
          <textarea value={metin} onChange={e => metinDegisti(e.target.value)} rows={2}
            placeholder="ABCDE ABCDE ... (numara ve boşluk yazabilirsiniz, atılır)"
            style={{
              width: "100%", padding: "9px 11px", borderRadius: KOSE.m, boxSizing: "border-box",
              border: `1.5px solid ${RENK.cizgi}`, fontSize: 13, fontFamily: "monospace",
              letterSpacing: 1.5, resize: "vertical", marginBottom: BOSLUK.s,
            }} />

          <div style={{
            fontSize: YAZI.mikro, marginBottom: BOSLUK.m,
            color: hata ? RENK.hata.metin : RENK.basari.metin,
          }}>
            {hata ?? `✓ ${soruSayisi} sorunun tamamı girildi`}
          </div>

          {/* Izgara: tek bir soruyu düzeltmek için */}
          <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: BOSLUK.m }}>
            {Array.from({ length: soruSayisi }, (_, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "2px 0",
                borderBottom: `1px solid ${RENK.cizgiSolgun}`,
              }}>
                <span style={{
                  width: 26, fontSize: YAZI.mikro, color: RENK.metinSilik,
                  textAlign: "right", flexShrink: 0,
                }}>{i + 1}.</span>
                {SIKLAR.slice(0, sikSayisi).concat(IPTAL).map(sik => {
                  const secili = dizi[i] === sik;
                  return (
                    <button key={sik} onClick={() => sikSec(i, sik)} style={{
                      width: 28, height: 26, borderRadius: KOSE.s, cursor: "pointer",
                      border: `1.5px solid ${secili ? c.bg : RENK.cizgi}`,
                      background: secili ? c.bg : "#fff",
                      color: secili ? "#fff" : RENK.metinSoluk,
                      fontSize: 11.5, fontWeight: secili ? 800 : 500, padding: 0,
                    }}>{sik}</button>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <button onClick={kaydet} disabled={!tamam || islemde} style={{
              flex: 1, padding: "10px 0", borderRadius: KOSE.m, border: "none",
              background: tamam ? c.bg : "#ddd", color: "#fff",
              fontSize: YAZI.ikincil, fontWeight: 700, cursor: tamam ? "pointer" : "default",
            }}>{islemde ? "Kaydediliyor..." : vardi ? "Anahtarı güncelle" : "Anahtarı kaydet"}</button>
            {vardi && (
              <button onClick={sil} disabled={islemde} style={{
                padding: "10px 14px", borderRadius: KOSE.m, cursor: "pointer",
                border: `1.5px solid ${RENK.hata.metin}44`, background: "#fff",
                color: RENK.hata.metin, fontSize: YAZI.ikincil,
              }}>Sil</button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
