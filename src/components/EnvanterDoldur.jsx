import { useState, useMemo } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { SIKLIK, envanterDegerlendir } from "../lib/envanterler";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Envanter doldurma ekranı — hem hazır envanterler hem koçun kendi
// envanteri için.
//
// ── PUAN GÖSTERİLMİYOR ──────────────────────────────────────────
// Ölçekteki sayılar yalnız iç hesap. Ekranda "Hiç / Nadiren / Bazen /
// Sık sık / Her zaman" var, 1-5 yok. Sayı gösterilse öğrenci "yüksek
// puan iyidir" sanıp kendini olduğundan farklı işaretlerdi; ters
// sorularda bu beklenti doğrudan yanlış cevap üretir.
//
// ── GİZLİLİK BAŞTA YAZILI ───────────────────────────────────────
// Velinin cevapları görmediği ÖĞRENCİYE söyleniyor. Bu bir süs değil:
// dürüst cevap alınmazsa veri çöp. "Erteliyorum" demek, evde
// konuşulmayacağını bilmeyi gerektiriyor.
//
// ── KOÇ ENVANTERİNDE ÖNERİ YOK ──────────────────────────────────
// Hazır envanter bitince öneriler çıkıyor (yorum metinlerini biz
// yazdık). Koçun kendi envanterinde yorum metni yok, o yüzden sistem
// yorum UYDURMUYOR: "koçun değerlendirecek" diyor.
export default function EnvanterDoldur({
  envanter,            // hazır envanter tanımı (kodlu) ya da null
  kocEnvanteri,        // { id, ad, aciklama, tanim } ya da null
  studentId, color: c, onKapat, onKaydedildi,
}) {
  const tanim = envanter ?? kocEnvanteri?.tanim;
  const ad = envanter?.ad ?? kocEnvanteri?.ad ?? "Envanter";
  const sorular = tanim?.sorular ?? [];

  const [cevaplar, setCevaplar] = useState({});
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState(null);
  const [sonuc, setSonuc] = useState(null);     // hazır envanterde öneriler

  const doldurulan = sorular.filter(s => {
    const c2 = cevaplar[s.kod];
    return c2 != null && c2 !== "";
  }).length;

  // Hazır envanterin önerileri tarayıcıda hesaplanıyor: yorum
  // kuralları zaten kodda ve sunucuya bir tur atmanın faydası yok.
  const onIzleme = useMemo(
    () => (envanter ? envanterDegerlendir(envanter, cevaplar) : null),
    [envanter, cevaplar]);

  const kaydet = async () => {
    if (doldurulan === 0) { setHata("Hiçbir soru işaretlenmemiş."); return; }
    setIslemde(true);
    setHata(null);
    const { hata: h } = await calistir(
      supabase.from("envanter_sonuclari").insert({
        student_id: studentId,
        // Tam biri dolu: veritabanı kısıtı ikisini birden kabul etmiyor.
        envanter_kod:     envanter ? envanter.kod : null,
        koc_envanteri_id: kocEnvanteri ? kocEnvanteri.id : null,
        cevaplar,
      }),
      "Envanter kaydetme"
    );
    setIslemde(false);
    if (h) { setHata("Kaydedilemedi. Bağlantınızı kontrol edin."); return; }
    setSonuc(envanter ? onIzleme : "koc");
    onKaydedildi?.();
  };

  // ── Bitiş ekranı ──────────────────────────────────────────────
  if (sonuc) {
    return (
      <Modal title={`${ad} — tamamlandı`} onClose={onKapat} maxWidth={560}>
        {sonuc === "koc" ? (
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metin, lineHeight: 1.6 }}>
            Cevapların kaydedildi. Bu envanteri koçun hazırladı; sonucu
            koçun değerlendirip seninle paylaşacak.
          </div>
        ) : (
          <>
            <div style={{ fontSize: YAZI.ikincil, color: RENK.metin, lineHeight: 1.6, marginBottom: BOSLUK.m }}>
              Cevapların kaydedildi. Aşağıdakiler <b>puan değil</b>, çalışma
              biçimine göre öneriler — en çok fark yaratacak olan başta.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
              {sonuc.oneriler.map((o, i) => (
                <div key={o.boyut} style={{
                  padding: "11px 13px", borderRadius: KOSE.m,
                  background: i === 0 ? c.light : RENK.yuzey,
                  border: `1px solid ${i === 0 ? c.mid + "55" : RENK.cizgi}`,
                }}>
                  <div style={{ fontSize: YAZI.ikincil, fontWeight: 700, color: i === 0 ? c.text : RENK.metin, marginBottom: 3 }}>
                    {o.baslik}
                  </div>
                  <div style={{ fontSize: YAZI.kucuk, color: RENK.metinIkincil, lineHeight: 1.55 }}>
                    {o.metin}
                  </div>
                </div>
              ))}
            </div>
            {sonuc.eksik.length > 0 && (
              <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: BOSLUK.s, lineHeight: 1.5 }}>
                {sonuc.eksik.length} soru boş kaldı; onların alanında öneri
                çıkmadı. İstersen envanteri yeniden doldurabilirsin.
              </div>
            )}
          </>
        )}
        <button onClick={onKapat} style={{
          width: "100%", marginTop: BOSLUK.m, padding: "11px 0", borderRadius: KOSE.m,
          border: "none", background: c.bg, color: "#fff",
          fontSize: YAZI.ikincil, fontWeight: 700, cursor: "pointer",
        }}>Kapat</button>
      </Modal>
    );
  }

  // ── Doldurma ekranı ───────────────────────────────────────────
  return (
    <Modal title={ad} onClose={onKapat} maxWidth={620}>
      {(envanter?.aciklama || kocEnvanteri?.aciklama) && (
        <div style={{ fontSize: YAZI.kucuk, color: RENK.metinIkincil, lineHeight: 1.6, marginBottom: BOSLUK.s }}>
          {envanter?.aciklama ?? kocEnvanteri?.aciklama}
        </div>
      )}

      {/* Gizlilik güvencesi — dürüst cevabın ön koşulu */}
      <div style={{
        fontSize: YAZI.mikro, color: c.text, background: c.light,
        padding: "9px 11px", borderRadius: KOSE.s, lineHeight: 1.5,
        marginBottom: BOSLUK.m,
      }}>
        🔒 {envanter?.gizlilik ??
            "Cevaplarını yalnızca sen ve koçun görüyor. Velin cevapları değil, koçunun değerlendirmesini görüyor."}
      </div>

      {hata && (
        <div style={{
          background: RENK.hata.zemin, color: RENK.hata.metin, fontSize: 12,
          padding: "8px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.s,
        }}>{hata}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>
        {sorular.map((s, i) => (
          <div key={s.kod}>
            <div style={{ fontSize: YAZI.ikincil, color: RENK.metin, lineHeight: 1.5, marginBottom: 7 }}>
              <span style={{ color: RENK.metinSilik, marginRight: 5 }}>{i + 1}.</span>
              {s.metin}
            </div>

            {s.tur === "secim" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {s.secenekler.map(o => {
                  const secili = cevaplar[s.kod] === o.deger;
                  return (
                    <button key={o.deger}
                      onClick={() => setCevaplar(v => ({ ...v, [s.kod]: o.deger }))} style={{
                        textAlign: "left", padding: "9px 12px", borderRadius: KOSE.m,
                        cursor: "pointer", fontFamily: "inherit", fontSize: YAZI.kucuk,
                        border: `2px solid ${secili ? c.bg : RENK.cizgi}`,
                        background: secili ? c.light : "#fff",
                        color: secili ? c.text : RENK.metinIkincil,
                        fontWeight: secili ? 600 : 400,
                      }}>{o.etiket}</button>
                  );
                })}
              </div>
            ) : s.tur === "acik" ? (
              <textarea rows={2} value={cevaplar[s.kod] ?? ""}
                placeholder="Yazarak cevapla"
                onChange={e => setCevaplar(v => ({ ...v, [s.kod]: e.target.value }))}
                style={{
                  width: "100%", boxSizing: "border-box", padding: "9px 11px",
                  borderRadius: KOSE.s, border: `1.5px solid ${RENK.cizgi}`,
                  fontSize: YAZI.ikincil, fontFamily: "inherit", resize: "vertical",
                }} />
            ) : (
              // Sıklık ölçeği. Etiketler yazılı, SAYI YOK.
              <div style={{ display: "flex", gap: 4 }}>
                {SIKLIK.map(o => {
                  const secili = Number(cevaplar[s.kod]) === o.deger;
                  return (
                    <button key={o.deger}
                      onClick={() => setCevaplar(v => ({ ...v, [s.kod]: o.deger }))} style={{
                        flex: 1, padding: "8px 2px", borderRadius: KOSE.s,
                        cursor: "pointer", fontFamily: "inherit",
                        fontSize: 10.5, lineHeight: 1.3,
                        border: `2px solid ${secili ? c.bg : RENK.cizgi}`,
                        background: secili ? c.bg : "#fff",
                        color: secili ? "#fff" : RENK.metinSoluk,
                        fontWeight: secili ? 700 : 500,
                      }}>{o.etiket}</button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={kaydet} disabled={islemde} style={{
        width: "100%", marginTop: BOSLUK.l, padding: "12px 0", borderRadius: KOSE.m,
        border: "none", background: doldurulan === 0 ? "#ddd" : c.bg, color: "#fff",
        fontSize: YAZI.ikincil, fontWeight: 700,
        cursor: doldurulan === 0 ? "default" : "pointer",
      }}>
        {islemde ? "Kaydediliyor..." : `Bitir (${doldurulan}/${sorular.length})`}
      </button>

      {doldurulan < sorular.length && doldurulan > 0 && (
        <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: 6, textAlign: "center" }}>
          Boş bırakılan sorular hesaba katılmıyor; yarım da bitirebilirsin.
        </div>
      )}
    </Modal>
  );
}
