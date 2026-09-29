import { useState, useEffect, useRef } from "react";
import { sayfaKutusu } from "../lib/goruntuIsle";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Fotoğrafta metnin sınırını elle çizme.
//
// ── NEDEN GEREKTİ ───────────────────────────────────────────────
// Sayfayı kendiliğinden bulan adım (parlaklık + en büyük parlak bölge)
// çoğu fotoğrafta çalışıyor ama sessizce yanılabiliyor:
//   • Sayfanın bir kenarı gölgedeyse orası "sayfa değil" sayılıyor ve
//     o sütunun BÜTÜN sayfa numaraları kesiliyor.
//   • Karede ikinci bir parlak yüzey varsa (ekran, beyaz masa, yan
//     sayfa) kutu gereğinden geniş kalıyor.
// İkisi de sessiz: kullanıcı yalnızca "okuma kötü" diye görüyor.
//
// ── DÖRT KÖŞE, DİKDÖRTGEN DEĞİL ─────────────────────────────────
// Kitap elde tutularak çekiliyor: sayfa yalnızca eğik değil YAMUK
// görünüyor — üst kenar dar, satırlar bir yana yatık. Eksen hizalı bir
// dikdörtgen bu durumda ya sayfanın köşesini dışarıda bırakıyor ya da
// bol bol masa alıyor. Dört köşe AYRI AYRI taşınıyor; seçilen dörtgen
// okumadan önce dikdörtgene açılıyor (perspektif düzeltme,
// goruntuIsle.js) ve satırlar da düzleşiyor.
//
// ── ÖLÇÜLER İKİ DÜZLEMDE ────────────────────────────────────────
// Ekranda gösterilen görüntü küçültülmüş; köşeler ise ÖZGÜN piksellerde
// döndürülmeli, yoksa OCR yanlış yeri okur. Hesap ekran düzleminde
// yapılıp çıkışta ölçekle çarpılıyor.
const TUTAMAK = 26;        // tutamağın dokunma yarıçapı (görüntü px)
const EN_KUCUK = 40;       // iki köşe birbirine bundan fazla yaklaşamıyor
const EN_GENIS = 760;
const EKRAN_PAYI = 0.62;   // önizleme, pencere yüksekliğinin en çok bu kadarı

// Köşe sırası: sol-üst, sağ-üst, sağ-alt, sol-alt. Perspektif düzeltme
// de bu sırayı bekliyor.
const KOSE_ADI = ["sol üst", "sağ üst", "sağ alt", "sol alt"];

export default function KirpmaSecici({ dosya, sira, toplam, color: c, onTamam, onIptal }) {
  const [gorsel, setGorsel] = useState(null);     // { url, g, y, olcek }
  const [koseler, setKoseler] = useState(null);   // 4 nokta, ekran düzlemi
  const [surukle, setSurukle] = useState(null);   // { tur, sira, bas, koseler }
  const kapRef = useRef(null);

  // Görseli çöz, ekrana sığacak ölçeği bul, otomatik kutuyu hesapla.
  useEffect(() => {
    let iptal = false;
    (async () => {
      const bitmap = await createImageBitmap(dosya);
      if (iptal) { bitmap.close?.(); return; }

      // Ekran ölçeği: dar telefonda tamamı görünsün, geniş ekranda
      // gereksiz küçük kalmasın. Yükseklik de sınırlanıyor — yoksa
      // dikey fotoğrafta alt köşelerin tutamağına ulaşılamıyor.
      const enFazlaG = Math.min(EN_GENIS, (window.innerWidth || 400) - 72);
      const enFazlaY = Math.max(240, (window.innerHeight || 700) * EKRAN_PAYI);
      const olcek = Math.min(1, enFazlaG / bitmap.width, enFazlaY / bitmap.height);
      const g = Math.round(bitmap.width * olcek);
      const y = Math.round(bitmap.height * olcek);

      // ── ÖNİZLEME EKRAN YOĞUNLUĞUNDA ─────────────────────────
      // Tuval yerleşim boyutunda çizilirse telefonda (dpr 2-3) görüntü
      // yumuşak çıkıyor ve küçük sayfa numaraları seçilemiyor — oysa
      // köşeyi tam oraya dayamak gerekiyor.
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const tg = Math.round(g * dpr), ty = Math.round(y * dpr);

      const tuval = document.createElement("canvas");
      tuval.width = tg; tuval.height = ty;
      const ctx = tuval.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, tg, ty);
      bitmap.close?.();

      // Otomatik kutu yalnızca BAŞLANGIÇ çerçevesi.
      let kutu = { x: 0, y: 0, genislik: g, yukseklik: y };
      try {
        const veri = ctx.getImageData(0, 0, tg, ty);
        const bulunan = sayfaKutusu({ data: veri.data, genislik: tg, yukseklik: ty });
        if (bulunan.kirpildi) {
          // Kutu tuval (dpr katı) düzleminde geliyor; çerçeve yerleşim
          // düzleminde tutuluyor.
          kutu = {
            x: bulunan.x / dpr, y: bulunan.y / dpr,
            genislik: bulunan.genislik / dpr, yukseklik: bulunan.yukseklik / dpr,
          };
        }
      } catch {
        // Bulunamadıysa tüm kare: kullanıcı kendisi daraltır.
      }

      const url = tuval.toDataURL("image/jpeg", 0.95);
      if (iptal) return;
      setGorsel({ url, g, y, olcek });
      setKoseler([
        { x: kutu.x, y: kutu.y },
        { x: kutu.x + kutu.genislik, y: kutu.y },
        { x: kutu.x + kutu.genislik, y: kutu.y + kutu.yukseklik },
        { x: kutu.x, y: kutu.y + kutu.yukseklik },
      ]);
    })();
    return () => { iptal = true; };
  }, [dosya]);

  // İşaretçi konumu → görüntünün kendi düzlemi. Kapsayıcı dar ekranda
  // küçülebiliyor; oran hesaba katılmazsa çerçeve parmağın altından kaçıyor.
  const nokta = (e) => {
    const kap = kapRef.current?.getBoundingClientRect();
    if (!kap || !gorsel) return { x: 0, y: 0 };
    const oran = kap.width ? gorsel.g / kap.width : 1;
    return { x: (e.clientX - kap.left) * oran, y: (e.clientY - kap.top) * oran };
  };

  const yuzde = (deger, tam) => `${(deger / tam) * 100}%`;

  // Dörtgenin içinde mi? Işın atma: kenarları tek sayıda kesiyorsa içeride.
  const icerideMi = (p, dortgen) => {
    let icerde = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const a = dortgen[i], b = dortgen[j];
      const kesiyor = (a.y > p.y) !== (b.y > p.y)
        && p.x < ((b.x - a.x) * (p.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
      if (kesiyor) icerde = !icerde;
    }
    return icerde;
  };

  const tutamakNeresi = (p) => {
    if (!koseler) return null;
    // En yakın köşe, dokunma yarıçapı içindeyse onu tutuyoruz.
    let enIyi = -1, enIyiUzaklik = TUTAMAK;
    koseler.forEach((k, i) => {
      const u = Math.hypot(p.x - k.x, p.y - k.y);
      if (u <= enIyiUzaklik) { enIyi = i; enIyiUzaklik = u; }
    });
    if (enIyi >= 0) return { tur: "kose", sira: enIyi };
    return icerideMi(p, koseler) ? { tur: "tasi" } : null;
  };

  const basla = (e) => {
    if (!koseler) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = nokta(e);
    const hedef = tutamakNeresi(p);
    if (hedef) setSurukle({ ...hedef, bas: p, koseler });
  };

  const hareket = (e) => {
    if (!surukle || !gorsel) return;
    const p = nokta(e);
    const dx = p.x - surukle.bas.x, dy = p.y - surukle.bas.y;
    const sinir = (v, alt, ust) => Math.max(alt, Math.min(ust, v));

    if (surukle.tur === "tasi") {
      // Dörtgenin tamamı: hepsi görüntünün içinde kalacak kadar kaydır.
      const xs = surukle.koseler.map(k => k.x), ys = surukle.koseler.map(k => k.y);
      const kdx = sinir(dx, -Math.min(...xs), gorsel.g - Math.max(...xs));
      const kdy = sinir(dy, -Math.min(...ys), gorsel.y - Math.max(...ys));
      setKoseler(surukle.koseler.map(k => ({ x: k.x + kdx, y: k.y + kdy })));
      return;
    }

    // Tek köşe SERBEST: yalnızca görüntünün içinde kalıyor ve komşu
    // köşelere yapışmıyor — yoksa dörtgen kendi üstüne katlanır ve
    // perspektif dönüşümü anlamsızlaşırdı.
    const i = surukle.sira;
    const yeni = surukle.koseler.map((k, j) => (j === i
      ? { x: sinir(k.x + dx, 0, gorsel.g), y: sinir(k.y + dy, 0, gorsel.y) }
      : k));
    const komsular = [yeni[(i + 1) % 4], yeni[(i + 3) % 4]];
    const cokYakin = komsular.some(k =>
      Math.abs(k.x - yeni[i].x) < EN_KUCUK && Math.abs(k.y - yeni[i].y) < EN_KUCUK);
    if (!cokYakin) setKoseler(yeni);
  };

  const bitir = () => setSurukle(null);

  const tumKare = () => gorsel && setKoseler([
    { x: 0, y: 0 }, { x: gorsel.g, y: 0 },
    { x: gorsel.g, y: gorsel.y }, { x: 0, y: gorsel.y },
  ]);

  // Köşeleri en dış sınırlarına oturtarak dikdörtgene çevir: fotoğraf
  // düzgün çekildiyse tek dokunuşta hizalanıyor.
  const dikdortgenYap = () => setKoseler(k => {
    if (!k) return k;
    const x0 = Math.min(...k.map(p => p.x)), x1 = Math.max(...k.map(p => p.x));
    const y0 = Math.min(...k.map(p => p.y)), y1 = Math.max(...k.map(p => p.y));
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  });

  const onayla = () => {
    if (!gorsel || !koseler) { onTamam(null); return; }
    const tamKare = koseler[0].x <= 1 && koseler[0].y <= 1
      && koseler[2].x >= gorsel.g - 2 && koseler[2].y >= gorsel.y - 2
      && Math.abs(koseler[1].y - koseler[0].y) <= 1 && Math.abs(koseler[3].x - koseler[0].x) <= 1;
    // Çerçeve neredeyse tüm kareyse kırpma göndermiyoruz: OCR kendi
    // otomatik kutusunu kullansın.
    if (tamKare) { onTamam(null); return; }
    onTamam({
      koseler: koseler.map(k => ({
        x: Math.round(k.x / gorsel.olcek),
        y: Math.round(k.y / gorsel.olcek),
      })),
    });
  };

  const dugme = (arka, renk, kenar) => ({
    flex: "1 1 130px", padding: "10px 0", borderRadius: KOSE.m, cursor: "pointer",
    border: kenar ? `1.5px solid ${kenar}` : "none",
    background: arka, color: renk, fontSize: YAZI.ikincil, fontWeight: 700,
  });

  // Karartma maskesi: dış dikdörtgenden dörtgeni oyuyor.
  const poligon = koseler && gorsel
    ? koseler.map(k => `${(k.x / gorsel.g) * 100}% ${(k.y / gorsel.y) * 100}%`).join(", ")
    : "";

  return (
    <Modal title={toplam > 1 ? `Metin sınırı (${sira}/${toplam})` : "Metin sınırını çizin"}
      onClose={onIptal} maxWidth={840}>
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>
        <div style={{ fontSize: YAZI.kucuk, color: RENK.metinIkincil, lineHeight: 1.55 }}>
          Dört köşeyi <b>içindekiler listesinin köşelerine</b> taşıyın; ortasından
          sürükleyerek çerçeveyi kaydırabilirsiniz. Köşeler serbest: sayfa eğik ya da
          yamuk göründüyse öylece işaretleyin — okumadan önce <b>düzleştiriliyor</b>.
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

            {koseler && (
              <>
                {/* Dışarıda kalan alan karartılıyor: ne okunacağı bir
                    bakışta görünsün. Dörtgen olduğu için clip-path. */}
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: "rgba(0,0,0,.45)",
                  clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${poligon}, 0% 0%)`,
                }} />
                {/* Çerçeve: köşeler serbest olduğu için düz çizgi yerine
                    çokgen çiziliyor. */}
                <svg viewBox={`0 0 ${gorsel.g} ${gorsel.y}`} preserveAspectRatio="none"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                  <polygon points={koseler.map(k => `${k.x},${k.y}`).join(" ")}
                    fill="none" stroke={c.bg} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                {koseler.map((k, i) => (
                  <div key={KOSE_ADI[i]} title={KOSE_ADI[i]} style={{
                    position: "absolute",
                    left: yuzde(k.x, gorsel.g), top: yuzde(k.y, gorsel.y),
                    width: 22, height: 22, marginLeft: -11, marginTop: -11,
                    borderRadius: "50%", background: "#fff", border: `3px solid ${c.bg}`,
                    boxShadow: "0 1px 4px rgba(0,0,0,.4)", pointerEvents: "none",
                    transform: surukle?.tur === "kose" && surukle.sira === i ? "scale(1.3)" : "none",
                  }} />
                ))}
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: BOSLUK.s, flexWrap: "wrap" }}>
          <button onClick={tumKare} disabled={!gorsel} style={dugme("#fff", RENK.metinSoluk, RENK.cizgi)}>
            Tüm fotoğraf
          </button>
          <button onClick={dikdortgenYap} disabled={!gorsel} style={dugme("#fff", RENK.metinSoluk, RENK.cizgi)}>
            Dikdörtgene çevir
          </button>
          <button onClick={onayla} disabled={!gorsel} style={dugme(c.bg, "#fff")}>
            {toplam > 1 && sira < toplam ? "Sonraki fotoğraf →" : "Okumaya başla"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
