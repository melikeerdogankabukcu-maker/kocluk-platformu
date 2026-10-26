import { useRef, useEffect, useState, useCallback } from "react";
import {
  KALEMLER, KALINLIK, SILGI_YARICAP, cizgileriSil, oranliNokta,
} from "../lib/karalama";
import { RENK, KOSE, YAZI } from "../lib/tasarim";

// Sayfa fotoğrafı + üstüne karalama katmanı.
//
// Kâğıt kitapta öğrenci sayfanın üstünde işlem yapıyor, şık çiziyor,
// şekle not düşüyor. Ekranda bunu yapamamak dijital testi kâğıttan
// geriye düşürüyordu.
//
// ── VARSAYILAN "KAYDIR", YAZMAK AÇIK SEÇİM ──────────────────────
// Tuval sürekli dokunmayı yakalasa telefonda sayfayı kaydırmak ve
// yakınlaştırmak imkânsız olurdu — öğrenci küçük yazıyı okuyamaz. Bu
// yüzden varsayılan kipte tuval dokunma almıyor (pointerEvents: none);
// yazmak için "✏️ Yaz"a basmak gerekiyor.
//
// ── ŞİMDİLİK KAYDEDİLMİYOR ──────────────────────────────────────
// Çizgiler çağıranın belleğinde (TestCoz) duruyor: sayfalar arasında
// gidip gelince kaybolmuyor, ama test penceresi kapanınca gidiyor.
// Sunucuya kaydetme (koçun öğrencinin çözümünü görmesi) yayına
// almadan önce yapılacak — bkz. YOL_HARITASI.md.
export default function SayfaKaralama({ src, cizgiler, onCizgiler, color: c }) {
  const [kip, setKip]   = useState(null);          // null | 'kalem' | 'silgi'
  const [renk, setRenk] = useState(KALEMLER[0].renk);
  const [olcu, setOlcu] = useState({ g: 0, y: 0 });

  const gorselRef = useRef(null);
  const tuvalRef  = useRef(null);
  const aktifRef  = useRef(null);                  // çizilmekte olan çizgi

  // Görselin EKRANDAKİ boyutu: tuval buna göre kuruluyor. Boyut
  // ekrana, yan çevirmeye ve görselin yüklenmesine göre değişiyor;
  // ResizeObserver üçünü de yakalıyor (yük anında yükseklik 0'dı).
  useEffect(() => {
    const el = gorselRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const gozlemci = new ResizeObserver(() => {
      setOlcu({ g: el.clientWidth, y: el.clientHeight });
    });
    gozlemci.observe(el);
    return () => gozlemci.disconnect();
  }, [src]);

  // Tüm çizgileri yeniden çiz. Çizgiler oranlı tutulduğu için boyut
  // değişince aynı yere düşüyorlar.
  useEffect(() => {
    const tuval = tuvalRef.current;
    if (!tuval || olcu.g === 0 || olcu.y === 0) return;
    const oran = window.devicePixelRatio || 1;
    tuval.width  = Math.round(olcu.g * oran);
    tuval.height = Math.round(olcu.y * oran);
    const ctx = tuval.getContext("2d");
    ctx.scale(oran, oran);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.clearRect(0, 0, olcu.g, olcu.y);
    (cizgiler ?? []).forEach(cz => yolCiz(ctx, cz, olcu));
  }, [cizgiler, olcu]);

  const kutu = () => gorselRef.current?.getBoundingClientRect();

  const basla = useCallback((e) => {
    if (!kip) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = oranliNokta(e.clientX, e.clientY, kutu());
    if (kip === "silgi") { onCizgiler(prev => cizgileriSil(prev, x, y, SILGI_YARICAP)); return; }
    aktifRef.current = { renk, noktalar: [[x, y]] };
  }, [kip, renk, onCizgiler]);

  const surukle = useCallback((e) => {
    if (!kip) return;
    const [x, y] = oranliNokta(e.clientX, e.clientY, kutu());
    if (kip === "silgi") { onCizgiler(prev => cizgileriSil(prev, x, y, SILGI_YARICAP)); return; }
    const aktif = aktifRef.current;
    if (!aktif) return;
    const onceki = aktif.noktalar.at(-1);
    aktif.noktalar.push([x, y]);
    // YALNIZ yeni parça çiziliyor, tuvalin tamamı değil: her harekette
    // state güncelleyip baştan çizmek telefonda gözle görülür takılma
    // yapıyordu. Çizgi state'e parmak kalkınca yazılıyor.
    const tuval = tuvalRef.current;
    if (!tuval) return;
    const ctx = tuval.getContext("2d");
    ctx.strokeStyle = aktif.renk;
    ctx.lineWidth = Math.max(1.5, KALINLIK * olcu.g);
    ctx.beginPath();
    ctx.moveTo(onceki[0] * olcu.g, onceki[1] * olcu.y);
    ctx.lineTo(x * olcu.g, y * olcu.y);
    ctx.stroke();
  }, [kip, olcu, onCizgiler]);

  const bitir = useCallback(() => {
    const aktif = aktifRef.current;
    aktifRef.current = null;
    if (!aktif || aktif.noktalar.length === 0) return;
    onCizgiler(prev => [...(prev ?? []), aktif]);
  }, [onCizgiler]);

  const dugme = (secili) => ({
    padding: "5px 10px", borderRadius: KOSE.tam, cursor: "pointer",
    fontSize: YAZI.mikro, fontWeight: secili ? 700 : 500, fontFamily: "inherit",
    border: `1.5px solid ${secili ? c.bg : RENK.cizgi}`,
    background: secili ? c.light : "#fff",
    color: secili ? c.text : RENK.metinIkincil,
  });

  const adet = (cizgiler ?? []).length;

  return (
    <div>
      <div style={{ position: "relative", lineHeight: 0 }}>
        <img ref={gorselRef} src={src} alt="" style={{
          width: "100%", display: "block", borderRadius: KOSE.s,
          border: `1px solid ${RENK.cizgi}`,
        }} />
        <canvas
          ref={tuvalRef}
          onPointerDown={basla}
          onPointerMove={surukle}
          onPointerUp={bitir}
          onPointerCancel={bitir}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            borderRadius: KOSE.s,
            // Kip kapalıyken dokunma tuvale GİRMİYOR: sayfa kaydırma ve
            // iki parmakla yakınlaştırma çalışsın.
            pointerEvents: kip ? "auto" : "none",
            touchAction: kip ? "none" : "auto",
            cursor: kip === "silgi" ? "cell" : "crosshair",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <button onClick={() => setKip(k => k === "kalem" ? null : "kalem")}
          style={dugme(kip === "kalem")}>✏️ Yaz</button>

        {kip === "kalem" && KALEMLER.map(k => (
          <button key={k.renk} onClick={() => setRenk(k.renk)} title={k.ad} style={{
            width: 24, height: 24, borderRadius: "50%", cursor: "pointer", padding: 0,
            background: k.renk,
            border: renk === k.renk ? `3px solid ${RENK.metin}` : `1.5px solid ${RENK.cizgi}`,
          }} />
        ))}

        <button onClick={() => setKip(k => k === "silgi" ? null : "silgi")}
          style={dugme(kip === "silgi")}>🧽 Sil</button>

        <button onClick={() => onCizgiler(prev => (prev ?? []).slice(0, -1))}
          disabled={adet === 0}
          style={{ ...dugme(false), opacity: adet === 0 ? 0.45 : 1 }}>↶ Geri al</button>

        <button onClick={() => { if (adet > 0 && confirm("Bu sayfadaki bütün karalama silinsin mi?")) onCizgiler([]); }}
          disabled={adet === 0}
          style={{ ...dugme(false), opacity: adet === 0 ? 0.45 : 1 }}>Temizle</button>

        {kip && (
          <span style={{ fontSize: YAZI.mikro, color: RENK.metinSilik }}>
            {kip === "kalem" ? "yazma açık — kaydırmak için kapatın" : "silmek için çizginin üstünden geçin"}
          </span>
        )}
      </div>
    </div>
  );
}

function yolCiz(ctx, cizgi, olcu) {
  const n = cizgi?.noktalar ?? [];
  if (n.length === 0) return;
  ctx.strokeStyle = cizgi.renk;
  ctx.lineWidth = Math.max(1.5, KALINLIK * olcu.g);
  ctx.beginPath();
  ctx.moveTo(n[0][0] * olcu.g, n[0][1] * olcu.y);
  // Tek noktalı çizgi (tek dokunuş) görünmezdi: aynı noktaya çizgi
  // çekmek lineCap 'round' ile bir nokta bırakıyor.
  if (n.length === 1) ctx.lineTo(n[0][0] * olcu.g, n[0][1] * olcu.y);
  else n.slice(1).forEach(([x, y]) => ctx.lineTo(x * olcu.g, y * olcu.y));
  ctx.stroke();
}
