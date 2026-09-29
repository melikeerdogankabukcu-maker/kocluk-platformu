import { useState, useEffect, useRef } from "react";
import { sayfaKutusu } from "../lib/goruntuIsle";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Fotoğrafta metnin sınırını elle çizme.
//
// ── NEDEN GEREKTİ ───────────────────────────────────────────────
// Sayfayı kendiliğinden bulan bir adım var (parlaklık + en büyük parlak
// bölge) ve çoğu fotoğrafta işe yarıyor. Ama gerçek fotoğraflarla
// ölçerken iki başarısızlık biçimi görüldü:
//   • Sayfanın bir kenarı gölgedeyse orası "sayfa değil" sayılıyor ve
//     o sütunun BÜTÜN sayfa numaraları kesiliyor.
//   • Kare içinde ikinci bir parlak yüzey varsa (ekran, beyaz masa,
//     yan sayfa) kutu gereğinden geniş kalıyor.
// İkisi de sessiz: kullanıcı yalnızca "okuma kötü" diye görüyor.
//
// Elle çizim bu belirsizliği ortadan kaldırıyor: çerçeve otomatik
// bulunan kutuyla AÇILIYOR, kullanıcı gerekiyorsa düzeltiyor.
//
// ── ÖLÇÜLER İKİ DÜZLEMDE ────────────────────────────────────────
// Ekranda gösterilen görüntü küçültülmüş; kırpma kutusu ise ÖZGÜN
// piksellerde döndürülmeli, yoksa OCR yanlış yeri okur. Bütün hesap
// ekran düzleminde yapılıp çıkışta ölçekle çarpılıyor.
const TUTAMAK = 22;        // köşe tutamağının dokunma alanı (ekran px)
const EN_KUCUK = 40;       // çerçevenin en küçük kenarı (ekran px)

export default function KirpmaSecici({ dosya, sira, toplam, color: c, onTamam, onIptal }) {
  const [gorsel, setGorsel] = useState(null);     // { url, g, y, olcek }
  const [kutu, setKutu] = useState(null);         // ekran düzleminde
  const [surukle, setSurukle] = useState(null);   // { tur, bas, kutu }
  const kapRef = useRef(null);

  // Görseli çöz, ekrana sığacak ölçeği bul, otomatik kutuyu hesapla.
  useEffect(() => {
    let iptal = false;
    let url = null;
    (async () => {
      const bitmap = await createImageBitmap(dosya);
      if (iptal) { bitmap.close?.(); return; }

      // Ekran ölçeği: dar telefonda da tamamı görünsün.
      const enFazla = Math.min(520, (window.innerWidth || 400) - 80);
      const olcek = Math.min(1, enFazla / bitmap.width);
      const g = Math.round(bitmap.width * olcek);
      const y = Math.round(bitmap.height * olcek);

      const tuval = document.createElement("canvas");
      tuval.width = g; tuval.height = y;
      const ctx = tuval.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, g, y);
      bitmap.close?.();

      // Otomatik kutu: aynı işi OCR hattı da yapıyor; burada yalnızca
      // başlangıç çerçevesi olarak kullanılıyor.
      let baslangic = { x: 0, y: 0, genislik: g, yukseklik: y };
      try {
        const veri = ctx.getImageData(0, 0, g, y);
        const bulunan = sayfaKutusu({ data: veri.data, genislik: g, yukseklik: y });
        if (bulunan.kirpildi) {
          baslangic = {
            x: bulunan.x, y: bulunan.y,
            genislik: bulunan.genislik, yukseklik: bulunan.yukseklik,
          };
        }
      } catch {
        // Bulunamadıysa tüm kare: kullanıcı kendisi daraltır.
      }

      url = tuval.toDataURL("image/jpeg", 0.85);
      if (iptal) return;
      setGorsel({ url, g, y, olcek });
      setKutu(baslangic);
    })();
    return () => { iptal = true; };
  }, [dosya]);

  // İşaretçi konumu → görüntünün kendi düzlemi.
  //
  // Kapsayıcı dar ekranda küçülebiliyor (maxWidth: 100%). O zaman
  // ekrandaki piksel ile görüntünün pikseli aynı değil; oran hesaba
  // katılmazsa çerçeve parmağın altından kaçıyor.
  const nokta = (e) => {
    const kap = kapRef.current?.getBoundingClientRect();
    if (!kap || !gorsel) return { x: 0, y: 0 };
    const oran = kap.width ? gorsel.g / kap.width : 1;
    return { x: (e.clientX - kap.left) * oran, y: (e.clientY - kap.top) * oran };
  };

  // Çerçeve ve tutamaklar yüzdeyle konumlanıyor: kapsayıcı küçülse de
  // görüntüyle birlikte küçülüyorlar.
  const yuzde = (deger, tam) => `${(deger / tam) * 100}%`;

  const tutamakNeresi = (p) => {
    if (!kutu) return null;
    const { x, y, genislik, yukseklik } = kutu;
    const koseler = {
      solUst:  { x, y },
      sagUst:  { x: x + genislik, y },
      solAlt:  { x, y: y + yukseklik },
      sagAlt:  { x: x + genislik, y: y + yukseklik },
    };
    for (const [ad, k] of Object.entries(koseler)) {
      if (Math.abs(p.x - k.x) <= TUTAMAK && Math.abs(p.y - k.y) <= TUTAMAK) return ad;
    }
    const icerde = p.x > x && p.x < x + genislik && p.y > y && p.y < y + yukseklik;
    return icerde ? "tasi" : null;
  };

  const basla = (e) => {
    if (!kutu) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = nokta(e);
    const tur = tutamakNeresi(p);
    if (tur) setSurukle({ tur, bas: p, kutu });
  };

  const hareket = (e) => {
    if (!surukle || !gorsel) return;
    const p = nokta(e);
    const dx = p.x - surukle.bas.x, dy = p.y - surukle.bas.y;
    const k = surukle.kutu;
    const sinir = (v, alt, ust) => Math.max(alt, Math.min(ust, v));

    let yeni;
    if (surukle.tur === "tasi") {
      yeni = {
        x: sinir(k.x + dx, 0, gorsel.g - k.genislik),
        y: sinir(k.y + dy, 0, gorsel.y - k.yukseklik),
        genislik: k.genislik, yukseklik: k.yukseklik,
      };
    } else {
      // Köşe: karşı köşe sabit kalıyor.
      const sol = surukle.tur.startsWith("sol");
      const ust = surukle.tur.endsWith("Ust");
      const x0 = sol ? sinir(k.x + dx, 0, k.x + k.genislik - EN_KUCUK) : k.x;
      const y0 = ust ? sinir(k.y + dy, 0, k.y + k.yukseklik - EN_KUCUK) : k.y;
      const x1 = sol ? k.x + k.genislik : sinir(k.x + k.genislik + dx, k.x + EN_KUCUK, gorsel.g);
      const y1 = ust ? k.y + k.yukseklik : sinir(k.y + k.yukseklik + dy, k.y + EN_KUCUK, gorsel.y);
      yeni = { x: x0, y: y0, genislik: x1 - x0, yukseklik: y1 - y0 };
    }
    setKutu(yeni);
  };

  const bitir = () => setSurukle(null);

  const onayla = () => {
    if (!gorsel || !kutu) { onTamam(null); return; }
    const tamKare =
      kutu.x <= 1 && kutu.y <= 1 &&
      kutu.genislik >= gorsel.g - 2 && kutu.yukseklik >= gorsel.y - 2;
    // Çerçeve neredeyse tüm kareyse kırpma göndermiyoruz: OCR kendi
    // otomatik kutusunu kullansın.
    if (tamKare) { onTamam(null); return; }
    onTamam({
      x: Math.round(kutu.x / gorsel.olcek),
      y: Math.round(kutu.y / gorsel.olcek),
      genislik: Math.round(kutu.genislik / gorsel.olcek),
      yukseklik: Math.round(kutu.yukseklik / gorsel.olcek),
    });
  };

  const dugme = (arka, renk, kenar) => ({
    flex: 1, padding: "10px 0", borderRadius: KOSE.m, cursor: "pointer",
    border: kenar ? `1.5px solid ${kenar}` : "none",
    background: arka, color: renk, fontSize: YAZI.ikincil, fontWeight: 700,
  });

  const kose = (ad, x, y) => (
    <div key={ad} style={{
      position: "absolute", left: yuzde(x, gorsel.g), top: yuzde(y, gorsel.y),
      width: 18, height: 18, marginLeft: -9, marginTop: -9,
      borderRadius: 4, background: "#fff", border: `2px solid ${c.bg}`,
      boxShadow: "0 1px 3px rgba(0,0,0,.35)", pointerEvents: "none",
    }} />
  );

  return (
    <Modal title={toplam > 1 ? `Metin sınırı (${sira}/${toplam})` : "Metin sınırını çizin"}
      onClose={onIptal} maxWidth={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>
        <div style={{ fontSize: YAZI.kucuk, color: RENK.metinIkincil, lineHeight: 1.55 }}>
          Çerçeveyi <b>yalnızca içindekiler listesini</b> kapsayacak şekilde ayarlayın:
          köşelerden boyutlandırın, ortasından sürükleyin. Masa, sayfa kenarı ve
          gölge dışarıda kalırsa okuma belirgin biçimde düzeliyor.
        </div>

        {!gorsel ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: RENK.metinCokSoluk, fontSize: YAZI.ikincil }}>
            Görsel hazırlanıyor...
          </div>
        ) : (
          <div ref={kapRef}
            onPointerDown={basla} onPointerMove={hareket}
            onPointerUp={bitir} onPointerCancel={bitir}
            style={{
              position: "relative", width: gorsel.g, aspectRatio: `${gorsel.g} / ${gorsel.y}`,
              maxWidth: "100%", margin: "0 auto", touchAction: "none",
              userSelect: "none", cursor: surukle ? "grabbing" : "crosshair",
              borderRadius: KOSE.s, overflow: "hidden",
            }}>
            <img src={gorsel.url} alt="" draggable="false"
              style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />

            {kutu && (
              <>
                {/* Çerçevenin dışı karartılıyor (dev gölge): ne okunacağı
                    bir bakışta görünsün. */}
                <div style={{
                  position: "absolute",
                  left: yuzde(kutu.x, gorsel.g), top: yuzde(kutu.y, gorsel.y),
                  width: yuzde(kutu.genislik, gorsel.g), height: yuzde(kutu.yukseklik, gorsel.y),
                  border: `2px solid ${c.bg}`, borderRadius: 2,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,.42)",
                  pointerEvents: "none",
                }} />
                {kose("solUst", kutu.x, kutu.y)}
                {kose("sagUst", kutu.x + kutu.genislik, kutu.y)}
                {kose("solAlt", kutu.x, kutu.y + kutu.yukseklik)}
                {kose("sagAlt", kutu.x + kutu.genislik, kutu.y + kutu.yukseklik)}
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: BOSLUK.s }}>
          <button onClick={() => setKutu(gorsel ? { x: 0, y: 0, genislik: gorsel.g, yukseklik: gorsel.y } : null)}
            disabled={!gorsel} style={dugme("#fff", RENK.metinSoluk, RENK.cizgi)}>
            Tüm fotoğraf
          </button>
          <button onClick={onayla} disabled={!gorsel} style={dugme(c.bg, "#fff")}>
            {toplam > 1 && sira < toplam ? "Sonraki fotoğraf →" : "Okumaya başla"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
