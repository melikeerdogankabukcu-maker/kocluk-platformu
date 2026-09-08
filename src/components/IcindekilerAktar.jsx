import { useState, useRef } from "react";
import { icindekileriAyristir, sayfaSayisi } from "../lib/icindekiler";
import { bolumleriEslestir } from "../lib/konuEslestir";
import { pdfMetni, fotografMetni } from "../lib/metinCikar";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";

// Bir kitabın içindekiler sayfasını sisteme aktarma akışı.
//
// ── ÜÇ KAYNAK, TEK KUTU ─────────────────────────────────────────
// Yapıştırma, PDF ve fotoğraf aynı düzenlenebilir metin kutusunda
// birleşiyor. PDF ve OCR o kutuyu DOLDURUYOR, doğrudan kaydetmiyor:
// ikisi de hata yapabilir ve hatayı düzeltmenin tek makul anı,
// veritabanına yazılmadan önceki an.
//
// ── İKİ AŞAMA ───────────────────────────────────────────────────
// 1) Metin → bölümler (başlık + sayfa aralığı)
// 2) Bölümler → müfredat konuları (bulanık eşleştirme)
// İkisi ayrı gösteriliyor çünkü ayrı şekillerde yanlış olabiliyorlar:
// satır yanlış okunmuş olabilir ya da doğru okunmuş ama yanlış konuya
// bağlanmış olabilir. Koç ikisini de tabloda düzeltiyor.

const KAYNAKLAR = [
  { kod: "yapistir", etiket: "📋 Yapıştır" },
  { kod: "pdf",      etiket: "📄 PDF" },
  { kod: "foto",     etiket: "📷 Fotoğraf" },
];

export default function IcindekilerAktar({ konular = [], color: c, onKaydet, onVazgec, kaydediliyor }) {
  const [kaynak, setKaynak]   = useState("yapistir");
  const [metin,  setMetin]    = useState("");
  const [bolumler, setBolumler] = useState(null);   // null = henüz ayrıştırılmadı
  const [atlanan, setAtlanan] = useState([]);
  const [islemde, setIslemde] = useState(null);     // { mesaj, yuzde }
  const [hata,    setHata]    = useState(null);
  const dosyaRef = useRef(null);

  // Yeni çıkarılan metni kutuya YAZMAK YERİNE EKLİYOR.
  //
  // İçindekiler çoğu kitapta iki üç sayfa ve tek fotoğrafa sığmıyor.
  // Üzerine yazsaydık ikinci sayfayı okutan kullanıcı birincisini
  // kaybederdi — üstelik bunu ancak kaydettikten sonra fark ederdi.
  const metneEkle = (yeni) =>
    setMetin(onceki => (onceki.trim() ? `${onceki.replace(/\s+$/, "")}\n${yeni}` : yeni));

  const dosyaSec = async (e) => {
    const dosyalar = [...(e.target.files ?? [])];
    e.target.value = "";
    if (dosyalar.length === 0) return;
    setHata(null);
    setBolumler(null);

    try {
      if (kaynak === "pdf") {
        setIslemde({ mesaj: "PDF okunuyor..." });
        const dosya = dosyalar[0];
        const { metin: cikan, sayfaSayisi: okunan, toplamSayfa } = await pdfMetni(dosya);
        if (!cikan.trim()) {
          // Taranmış PDF'te metin katmanı yok. Sessizce boş kutu
          // bırakmak "çalışmadı mı acaba?" sorusu doğururdu.
          setHata("Bu PDF'te metin katmanı yok (taranmış olabilir). " +
                  "İçindekiler sayfasının fotoğrafını çekip 📷 Fotoğraf ile deneyin.");
        } else {
          metneEkle(cikan);
          if (toplamSayfa > okunan) {
            setHata(`PDF ${toplamSayfa} sayfa; ilk ${okunan} sayfa okundu. ` +
                    `İçindekiler daha ilerideyse yalnızca o sayfaları içeren bir PDF verin.`);
          }
        }
      } else {
        setIslemde({ mesaj: "Görsel okunuyor..." });
        const { metin: cikan, guven } = await fotografMetni(dosyalar, {
          ilerleme: ({ asama, yuzde, sira, toplam }) => setIslemde({
            mesaj: asama === "loading language traineddata"
              ? "Türkçe dil verisi indiriliyor (ilk kullanımda bir kez)..."
              : toplam > 1 ? `Görsel okunuyor (${sira ?? "?"}/${toplam})...`
              : "Görsel okunuyor...",
            yuzde,
          }),
        });
        metneEkle(cikan);
        if (!cikan.trim()) {
          setHata("Görselden metin çıkarılamadı. Daha net ve düz çekilmiş bir fotoğraf deneyin.");
        } else if (guven != null && guven < 70) {
          // Düşük güveni saklamıyoruz: koç satırları okumadan kaydederse
          // yanlış başlıklar kitaba yerleşir.
          setHata(`Okuma güveni düşük (%${Math.round(guven)}). Aşağıdaki metni satır satır kontrol edin.`);
        }
      }
    } catch (err) {
      console.error("Icindekiler cikarma:", err);
      setHata("Dosya okunamadı: " + (err?.message ?? "bilinmeyen hata"));
    } finally {
      setIslemde(null);
    }
  };

  const ayristir = () => {
    const { bolumler: b, atlanan: a } = icindekileriAyristir(metin);
    setBolumler(bolumleriEslestir(b, konular));
    setAtlanan(a);
  };

  const bolumGuncelle = (sira, alan, deger) =>
    setBolumler(list => list.map(b => (b.sira === sira ? { ...b, [alan]: deger } : b)));

  const bolumSil = (sira) =>
    setBolumler(list => list.filter(b => b.sira !== sira).map((b, i) => ({ ...b, sira: i + 1 })));

  const eslesen = bolumler?.filter(b => b.konu).length ?? 0;

  const kutuStil = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px",
    borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`,
    fontSize: YAZI.ikincil, fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>
      {/* Kaynak seçimi */}
      <div style={{ display: "flex", gap: BOSLUK.s }}>
        {KAYNAKLAR.map(k => (
          <button key={k.kod} onClick={() => { setKaynak(k.kod); setHata(null); }} style={{
            flex: 1, padding: "8px 0", borderRadius: KOSE.m,
            fontSize: YAZI.ikincil, fontWeight: 600, cursor: "pointer",
            border: `2px solid ${kaynak === k.kod ? c.bg : RENK.cizgi}`,
            background: kaynak === k.kod ? c.bg : "#fff",
            color: kaynak === k.kod ? "#fff" : RENK.metinSoluk,
          }}>{k.etiket}</button>
        ))}
      </div>

      {kaynak !== "yapistir" && (
        <div>
          <input ref={dosyaRef} type="file" style={{ display: "none" }} onChange={dosyaSec}
            multiple={kaynak === "foto"}
            accept={kaynak === "pdf" ? "application/pdf" : "image/*"} />
          <button onClick={() => dosyaRef.current?.click()} disabled={!!islemde} style={{
            width: "100%", padding: "11px 0", borderRadius: KOSE.m,
            border: `1.5px dashed ${c.mid}`, background: "transparent",
            color: c.mid, fontSize: YAZI.govde, fontWeight: 600,
            cursor: islemde ? "default" : "pointer", opacity: islemde ? 0.6 : 1,
          }}>
            {islemde ? islemde.mesaj
              : kaynak === "pdf" ? "PDF seç"
              : metin.trim() ? "+ Fotoğraf ekle (birden fazla seçebilirsiniz)"
              : "İçindekiler fotoğrafını seç (birden fazla seçebilirsiniz)"}
          </button>
          {islemde?.yuzde != null && (
            <div style={{ height: 5, borderRadius: KOSE.tam, background: RENK.cizgi, marginTop: 6, overflow: "hidden" }}>
              <div style={{ width: `${islemde.yuzde}%`, height: "100%", background: c.mid, transition: "width .3s ease" }} />
            </div>
          )}
          {kaynak === "foto" && !islemde && (
            <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: 5, lineHeight: 1.5 }}>
              İçindekiler birkaç sayfaysa hepsini seçin ya da tek tek ekleyin —
              okunan metin aşağıdaki kutuya <b>eklenir</b>, üzerine yazılmaz.
              Okuma tarayıcınızda yapılır, görsel hiçbir yere gönderilmez;
              ilk kullanımda Türkçe dil verisi indirilir.
            </div>
          )}
        </div>
      )}

      {hata && (
        <div style={{
          fontSize: YAZI.ikincil, color: RENK.uyari.metin, background: RENK.uyari.zemin,
          padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.m, lineHeight: 1.5,
        }}>{hata}</div>
      )}

      {/* Ortak metin kutusu */}
      <div>
        <div style={{ fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginBottom: 4 }}>
          İçindekiler metni — kaydetmeden önce düzeltebilirsiniz
        </div>
        <textarea value={metin} rows={10} onChange={e => { setMetin(e.target.value); setBolumler(null); }}
          placeholder={"1. Temel Kavramlar .......... 7\n2. Sayı Basamakları ......... 23\n3. Bölme ve Bölünebilme ..... 41"}
          style={{ ...kutuStil, resize: "vertical", lineHeight: 1.6 }} />
      </div>

      {bolumler === null ? (
        <button onClick={ayristir} disabled={!metin.trim()} style={{
          padding: "11px 0", borderRadius: KOSE.m, border: "none",
          background: metin.trim() ? c.bg : "#ddd", color: "#fff",
          fontSize: YAZI.govde, fontWeight: 700,
          cursor: metin.trim() ? "pointer" : "not-allowed",
        }}>Bölümleri çıkar</button>
      ) : bolumler.length === 0 ? (
        <div style={{
          fontSize: YAZI.ikincil, color: RENK.hata.metin, background: RENK.hata.zemin,
          padding: `${BOSLUK.m}px`, borderRadius: KOSE.m, lineHeight: 1.55,
        }}>
          Hiçbir bölüm çıkarılamadı. Her satır “başlık ... sayfa numarası”
          biçiminde olmalı. Sayfa numarası olmayan satırlar okunamıyor.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, lineHeight: 1.5 }}>
            <b>{bolumler.length}</b> bölüm çıkarıldı, <b>{eslesen}</b> tanesi müfredata bağlandı.
            {eslesen < bolumler.length && " Bağlanmayanları aşağıdan kendiniz seçebilirsiniz — bağlanmayan bölüm de kaydedilir, ödev önerisine girmez."}
          </div>

          {atlanan.length > 0 && (
            <details style={{ fontSize: YAZI.kucuk, color: RENK.metinSoluk }}>
              <summary style={{ cursor: "pointer" }}>{atlanan.length} satır okunamadı</summary>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {atlanan.map((s, i) => (
                  <div key={i} style={{ color: RENK.metinSilik, fontFamily: "monospace", fontSize: YAZI.mikro }}>{s}</div>
                ))}
              </div>
            </details>
          )}

          {/* Önizleme tablosu */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
            {bolumler.map(b => (
              <div key={b.sira} style={{
                display: "flex", gap: BOSLUK.s, alignItems: "center",
                padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.m,
                background: b.supheli ? RENK.uyari.zemin : RENK.yuzey,
                border: `1px solid ${b.konu ? RENK.cizgi : "#F0E2C4"}`,
              }}>
                <div style={{ flex: "2 1 0", minWidth: 0 }}>
                  <input value={b.baslik} onChange={e => bolumGuncelle(b.sira, "baslik", e.target.value)}
                    style={{ ...kutuStil, padding: "6px 8px", fontSize: YAZI.ikincil, background: "#fff" }} />
                  <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: 3 }}>
                    {b.sayfaBas}–{b.sayfaSon ?? "?"}
                    {sayfaSayisi(b) != null ? ` · ${sayfaSayisi(b)} sayfa` : " · bitiş bilinmiyor"}
                    {b.supheli && " · ⚠ sayfa numarası geriye gidiyor"}
                  </div>
                </div>

                {/* Konu seçici — otomatik eşleşme burada düzeltilebiliyor */}
                <select value={b.konu ?? ""} onChange={e => bolumGuncelle(b.sira, "konu", e.target.value || null)}
                  style={{
                    flex: "2 1 0", minWidth: 0, ...kutuStil, padding: "6px 8px",
                    fontSize: YAZI.ikincil, background: "#fff",
                    color: b.konu ? RENK.metin : RENK.metinCokSoluk,
                  }}>
                  <option value="">— müfredata bağlanmadı —</option>
                  {konular.map(k => <option key={k} value={k}>{k}</option>)}
                </select>

                <button onClick={() => bolumSil(b.sira)} title="Bu satırı çıkar" style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: RENK.metinSilik, fontSize: 14, flexShrink: 0, padding: 0,
                }}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <button onClick={() => onKaydet(bolumler)} disabled={kaydediliyor} style={{
              flex: 1, padding: "11px 0", borderRadius: KOSE.m, border: "none",
              background: c.bg, color: "#fff", fontSize: YAZI.govde, fontWeight: 700,
              cursor: "pointer", opacity: kaydediliyor ? 0.7 : 1,
            }}>{kaydediliyor ? "Kaydediliyor..." : `${bolumler.length} bölümü kaydet`}</button>
            <button onClick={() => setBolumler(null)} style={{
              padding: "11px 16px", borderRadius: KOSE.m,
              border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
              color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
            }}>Metne dön</button>
          </div>
        </div>
      )}

      <button onClick={onVazgec} style={{
        padding: "9px 0", borderRadius: KOSE.m,
        border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
        color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
      }}>Vazgeç</button>
    </div>
  );
}
