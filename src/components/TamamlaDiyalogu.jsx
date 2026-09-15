import { useState } from "react";
import { supabase } from "../supabase";
import { TURLER, blokAltBilgi, saatAraligi, sureMetni, testDenetle, sayacGecen } from "../lib/calismaPlani";
import { odevDosyalari, yeniDosyaYolu, DOSYA_SINIRI, BOYUT_SINIRI_MB } from "../lib/odevDosyalari";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";
import GuvenliBaglanti from "./GuvenliBaglanti";

// Bloğu "yaptım" olarak işaretleme penceresi.
//
// ── TEST FORMU AYRICA DOLDURULMUYOR ─────────────────────────────
// Öğrenci soru bankası bloğunu bitirince ayrı bir "Test Çözdüm" formu
// açıp aynı dersi, konuyu yeniden seçmek zorundaydı ve çoğu zaman bunu
// yapmıyordu — plan yapılmış görünüyor ama sonucu hiçbir yere
// geçmiyordu. Sonuç işaretleme anında soruluyor; ders ve konu bloktan
// geliyor. Kayıt bloğa bağlı bir test olarak açılıyor, yani testlerde,
// haftalık özette ve sınav analizinde kendiliğinden görünüyor.
//
// ── ÇÖZÜM GÖRSELLERİ ────────────────────────────────────────────
// Koç bloğu onaylamadan önce çözülen testi görmek istiyor. Görseller
// testin kendisine bağlanıyor (görevdeki "Test Çözdüm" ile aynı yer ve
// biçim), bu yüzden bir görsel ancak test sonucuyla birlikte eklenebiliyor.
// Dosyalar önce depoya yükleniyor, sonra adresleri tamamlama işlemine
// gidiyor; sunucu adreslerin bu öğrencinin klasörünü gösterdiğini denetliyor.
//
// ── YAPILMIŞ BLOK DA BU PENCEREDEN ──────────────────────────────
// Öğrenci işaretledikten sonra görsel eklemek ya da sonucu düzeltmek
// isteyebiliyor. İşaretli bloğa tıklamak artık işareti doğrudan
// kaldırmıyor; bu pencere açılıyor, işareti kaldırmak içindeki ayrı düğme.
//
// ── SÜRE ÖNERİSİ ────────────────────────────────────────────────
// Kutu önceden dolu geliyor: sayaç çalıştıysa onun ölçtüğü, yoksa
// planlanan süre. Öğrenci değiştirebilir — ama sayaçla ölçülen kısım
// ayrı saklandığı için koç ikisini ayırt edebiliyor.
const TEST_SORULAN = new Set(["konu", "kaynak", "serbest"]);

export default function TamamlaDiyalogu({ blok, test, studentId, saatFarki = 0, color: c, onKaydet, onGeriAl, onKapat }) {
  const acikSayac = sayacGecen(blok.sayac_baslangic, saatFarki);
  const olculen = (blok.sayacla_olculen_dk || 0) + acikSayac;
  const onerilenSure = blok.calisilan_dk ?? (olculen > 0 ? olculen : blok.sure_dk) ?? "";

  const [sure, setSure]     = useState(onerilenSure === null ? "" : String(onerilenSure));
  const [soru, setSoru]     = useState(test ? String(test.question_count ?? "") : "");
  const [dogru, setDogru]   = useState(test ? String(test.correct_count ?? "") : "");
  const [yanlis, setYanlis] = useState(test?.yanlis_count != null ? String(test.yanlis_count) : "");
  const [mevcut, setMevcut] = useState(() => odevDosyalari(test));
  const [yeniler, setYeniler] = useState([]);
  const [gorselDegisti, setGorselDegisti] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const testSorulur = TEST_SORULAN.has(blok.tur);
  const denetim = testSorulur ? testDenetle({ soru, dogru, yanlis }) : { gecerli: true, bos: true };
  const sureSayi = sure === "" ? null : Number(sure);
  const sureGecerli = sureSayi == null || (Number.isInteger(sureSayi) && sureSayi >= 0 && sureSayi <= 1440);
  const gorselSayisi = mevcut.length + yeniler.length;
  // Görsel testin parçası: sonucu olmayan teste görsel eklenemiyor
  const gorselGecerli = gorselSayisi === 0 || !denetim.bos;
  const gecerli = denetim.gecerli && sureGecerli && gorselGecerli;

  const dosyaSec = (e) => {
    const secilen = Array.from(e.target.files ?? []);
    e.target.value = "";
    const buyuk = secilen.filter(f => f.size > BOYUT_SINIRI_MB * 1024 * 1024);
    if (buyuk.length) alert(`${buyuk.map(f => f.name).join(", ")} ${BOYUT_SINIRI_MB} MB'tan büyük; eklenmedi.`);
    const uygun = secilen.filter(f => f.size <= BOYUT_SINIRI_MB * 1024 * 1024);
    const yer = DOSYA_SINIRI - gorselSayisi;
    if (uygun.length > yer) alert(`Bir teste en fazla ${DOSYA_SINIRI} görsel eklenebilir.`);
    if (uygun.length && yer > 0) {
      setYeniler(l => [...l, ...uygun.slice(0, yer)]);
      setGorselDegisti(true);
    }
  };

  const kaydet = async () => {
    if (!gecerli) return;
    setKaydediliyor(true);
    try {
      // Görseller değişmediyse null gidiyor: sunucu var olanlara dokunmuyor.
      let dosyalar = null;
      if (gorselDegisti) {
        const damga = Date.now();
        const yuklenen = [];
        for (let i = 0; i < yeniler.length; i++) {
          const dosya = yeniler[i];
          const yol = yeniDosyaYolu(studentId, `plan-${blok.id}`, dosya.name, i, damga);
          const { error } = await supabase.storage
            .from("homework").upload(yol, dosya, { upsert: true, contentType: dosya.type });
          if (error) throw error;
          const { data: { publicUrl } } = supabase.storage.from("homework").getPublicUrl(yol);
          yuklenen.push({ url: publicUrl, ad: dosya.name });
        }
        dosyalar = [...mevcut, ...yuklenen];
      }

      const { hata } = (await onKaydet({
        yapildi: true,
        calisilanDk: sureSayi,
        // Test alanları boşsa null gidiyor: var olan teste dokunulmuyor
        soru:   denetim.bos ? null : denetim.soru,
        dogru:  denetim.bos ? null : denetim.dogru,
        yanlis: denetim.bos ? null : denetim.yanlis,
        dosyalar,
      })) ?? {};
      if (!hata) onKapat();
    } catch (err) {
      console.error("[Plan gorseli yukleme]", err);
      alert("Görsel yüklenemedi: " + err.message);
    } finally {
      setKaydediliyor(false);
    }
  };

  const t = TURLER[blok.tur] ?? TURLER.serbest;
  const girdi = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px",
    borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.govde,
    textAlign: "center", fontWeight: 700, background: "#fff",
  };
  const etiket = { fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginBottom: 4, display: "block", textAlign: "center" };
  const cip = {
    display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%",
    fontSize: YAZI.kucuk, padding: "3px 8px", borderRadius: KOSE.tam,
    background: RENK.yuzey, color: RENK.metinIkincil,
  };
  const kucukX = {
    background: "none", border: "none", padding: 0, cursor: "pointer",
    color: RENK.hata.metin, fontSize: YAZI.kucuk, lineHeight: 1,
  };

  return (
    <Modal title={blok.tur === "video" ? "İzledim" : "Yaptım"} onClose={onKapat} maxWidth={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>

        <div style={{ padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.m, background: RENK.yuzey, borderLeft: `3px solid ${c.mid}` }}>
          <div style={{ fontSize: YAZI.govde, fontWeight: 700, color: RENK.metin }}>{t.simge} {blok.baslik}</div>
          <div style={{ fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginTop: 2 }}>
            {[saatAraligi(blok), blokAltBilgi(blok)].filter(Boolean).join(" · ")}
          </div>
        </div>

        {blok.koc_onayi === "iade_edildi" && (
          <div style={{ fontSize: YAZI.kucuk, lineHeight: 1.5, padding: BOSLUK.s, borderRadius: KOSE.m, background: RENK.uyari.zemin, color: RENK.uyari.metin }}>
            ↩ Koçun bu bloğu iade etti{blok.onay_notu ? `: “${blok.onay_notu}”` : "."} Kaydedince yeniden onaya gider.
          </div>
        )}

        {/* Süre */}
        <div>
          <label style={etiket}>Ne kadar çalıştın? (dakika)</label>
          <input type="number" inputMode="numeric" min="0" max="1440" value={sure}
            onChange={e => setSure(e.target.value)} style={girdi} />
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: 4, textAlign: "center", lineHeight: 1.5 }}>
            {blok.sure_dk ? `Planlanan ${sureMetni(blok.sure_dk)}` : "Planlanan süre yok"}
            {olculen > 0 && ` · sayaç ${sureMetni(olculen)} ölçtü`}
            {blok.sayac_baslangic && " (sayaç şimdi durdurulacak)"}
          </div>
          {!sureGecerli && (
            <div style={{ fontSize: YAZI.kucuk, color: RENK.hata.metin, marginTop: 4, textAlign: "center" }}>
              Süre 0 ile 1440 dakika arasında bir tam sayı olmalı.
            </div>
          )}
        </div>

        {/* Test sonucu + görseller */}
        {testSorulur && (
          <div style={{ borderTop: `1px solid ${RENK.cizgi}`, paddingTop: BOSLUK.m }}>
            <div style={{ fontSize: YAZI.ikincil, fontWeight: 700, color: RENK.metin, marginBottom: 2, textAlign: "center" }}>
              Soru çözdün mü?
            </div>
            <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginBottom: BOSLUK.s, textAlign: "center", lineHeight: 1.5 }}>
              {test
                ? "Bu blok için daha önce girdiğin sonuç aşağıda; değiştirebilirsin."
                : "Çözmediysen boş bırak. Girersen sonuç testlerine ve gelişimine eklenir."}
            </div>
            <div style={{ display: "flex", gap: BOSLUK.s }}>
              {[
                ["Soru", soru, setSoru],
                ["Doğru", dogru, setDogru],
                ["Yanlış", yanlis, setYanlis],
              ].map(([ad, deger, set]) => (
                <div key={ad} style={{ flex: 1 }}>
                  <label style={etiket}>{ad}</label>
                  <input type="number" inputMode="numeric" min="0" value={deger}
                    onChange={e => set(e.target.value)} style={girdi} />
                </div>
              ))}
            </div>
            {!denetim.gecerli ? (
              <div style={{ fontSize: YAZI.kucuk, color: RENK.hata.metin, marginTop: 6, textAlign: "center" }}>{denetim.hata}</div>
            ) : !denetim.bos && (
              <div style={{ fontSize: YAZI.kucuk, color: c.text, marginTop: 6, textAlign: "center" }}>
                {denetim.soru - denetim.dogru - (denetim.yanlis ?? 0)} boş
                {denetim.net != null ? ` · ${denetim.net} net` : " · net için yanlış sayısını gir"}
              </div>
            )}

            <div style={{ marginTop: BOSLUK.m }}>
              <label style={etiket}>Çözüm görselleri (koçun görecek)</label>
              {gorselSayisi > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: BOSLUK.s }}>
                  {mevcut.map((d, i) => (
                    <span key={`m${i}`} style={cip}>
                      <GuvenliBaglanti url={d.url} style={{ color: c.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
                        📎 {d.ad}
                      </GuvenliBaglanti>
                      <button aria-label={`${d.ad} kaldır`} style={kucukX}
                        onClick={() => { setMevcut(l => l.filter((_, k) => k !== i)); setGorselDegisti(true); }}>✕</button>
                    </span>
                  ))}
                  {yeniler.map((f, i) => (
                    <span key={`y${i}`} style={cip}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>🆕 {f.name}</span>
                      <button aria-label={`${f.name} kaldır`} style={kucukX}
                        onClick={() => { setYeniler(l => l.filter((_, k) => k !== i)); setGorselDegisti(true); }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              {gorselSayisi < DOSYA_SINIRI && (
                <label style={{
                  display: "block", textAlign: "center", padding: "9px 0", borderRadius: KOSE.m,
                  border: `1.5px dashed ${c.mid}`, color: c.text, fontSize: YAZI.ikincil, fontWeight: 600, cursor: "pointer",
                }}>
                  📷 Fotoğraf ya da dosya ekle
                  <input type="file" accept="image/*,application/pdf" multiple onChange={dosyaSec} style={{ display: "none" }} />
                </label>
              )}
              {!gorselGecerli && (
                <div style={{ fontSize: YAZI.kucuk, color: RENK.hata.metin, marginTop: 6, textAlign: "center" }}>
                  Görsel eklemek için soru sayısını da gir.
                </div>
              )}
            </div>
          </div>
        )}

        <button onClick={kaydet} disabled={!gecerli || kaydediliyor} style={{
          padding: "12px 0", borderRadius: KOSE.m, border: "none",
          background: gecerli ? c.bg : "#ddd", color: "#fff",
          fontSize: YAZI.govde, fontWeight: 700, cursor: gecerli ? "pointer" : "not-allowed",
        }}>{kaydediliyor ? "Kaydediliyor..." : blok.yapildi ? "✓ Güncelle" : "✓ Kaydet ve koça gönder"}</button>

        {blok.yapildi && onGeriAl && (
          <button onClick={async () => {
            const { hata } = (await onGeriAl()) ?? {};
            if (!hata) onKapat();
          }} disabled={kaydediliyor} style={{
            padding: "9px 0", borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`,
            background: "#fff", color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
          }}>Yapılmadı olarak işaretle</button>
        )}
      </div>
    </Modal>
  );
}
