import { useState } from "react";
import { TURLER, blokAltBilgi, saatAraligi, sureMetni, testDenetle, sayacGecen } from "../lib/calismaPlani";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

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
// ── SÜRE ÖNERİSİ ────────────────────────────────────────────────
// Kutu önceden dolu geliyor: sayaç çalıştıysa onun ölçtüğü, yoksa
// planlanan süre. Öğrenci değiştirebilir — ama sayaçla ölçülen kısım
// ayrı saklandığı için koç ikisini ayırt edebiliyor.
const TEST_SORULAN = new Set(["konu", "kaynak", "serbest"]);

export default function TamamlaDiyalogu({ blok, test, saatFarki = 0, color: c, onKaydet, onKapat }) {
  const acikSayac = sayacGecen(blok.sayac_baslangic, saatFarki);
  const olculen = (blok.sayacla_olculen_dk || 0) + acikSayac;
  const onerilenSure = blok.calisilan_dk ?? (olculen > 0 ? olculen : blok.sure_dk) ?? "";

  const [sure, setSure]     = useState(onerilenSure === null ? "" : String(onerilenSure));
  const [soru, setSoru]     = useState(test ? String(test.question_count ?? "") : "");
  const [dogru, setDogru]   = useState(test ? String(test.correct_count ?? "") : "");
  const [yanlis, setYanlis] = useState(test?.yanlis_count != null ? String(test.yanlis_count) : "");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const testSorulur = TEST_SORULAN.has(blok.tur);
  const denetim = testSorulur ? testDenetle({ soru, dogru, yanlis }) : { gecerli: true, bos: true };
  const sureSayi = sure === "" ? null : Number(sure);
  const sureGecerli = sureSayi == null || (Number.isInteger(sureSayi) && sureSayi >= 0 && sureSayi <= 1440);
  const gecerli = denetim.gecerli && sureGecerli;

  const kaydet = async () => {
    if (!gecerli) return;
    setKaydediliyor(true);
    const { hata } = (await onKaydet({
      yapildi: true,
      calisilanDk: sureSayi,
      // Test alanları boşsa null gidiyor: var olan teste dokunulmuyor
      soru:   denetim.bos ? null : denetim.soru,
      dogru:  denetim.bos ? null : denetim.dogru,
      yanlis: denetim.bos ? null : denetim.yanlis,
    })) ?? {};
    setKaydediliyor(false);
    if (!hata) onKapat();
  };

  const t = TURLER[blok.tur] ?? TURLER.serbest;
  const girdi = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px",
    borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.govde,
    textAlign: "center", fontWeight: 700, background: "#fff",
  };
  const etiket = { fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginBottom: 4, display: "block", textAlign: "center" };

  return (
    <Modal title={blok.tur === "video" ? "İzledim" : "Yaptım"} onClose={onKapat} maxWidth={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>

        <div style={{ padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.m, background: RENK.yuzey, borderLeft: `3px solid ${c.mid}` }}>
          <div style={{ fontSize: YAZI.govde, fontWeight: 700, color: RENK.metin }}>{t.simge} {blok.baslik}</div>
          <div style={{ fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginTop: 2 }}>
            {[saatAraligi(blok), blokAltBilgi(blok)].filter(Boolean).join(" · ")}
          </div>
        </div>

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

        {/* Test sonucu */}
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
          </div>
        )}

        <button onClick={kaydet} disabled={!gecerli || kaydediliyor} style={{
          padding: "12px 0", borderRadius: KOSE.m, border: "none",
          background: gecerli ? c.bg : "#ddd", color: "#fff",
          fontSize: YAZI.govde, fontWeight: 700, cursor: gecerli ? "pointer" : "not-allowed",
        }}>{kaydediliyor ? "Kaydediliyor..." : "✓ Kaydet"}</button>
      </div>
    </Modal>
  );
}
