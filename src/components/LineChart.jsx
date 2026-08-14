import { useState, useRef, useLayoutEffect } from "react";

// Bağımlılıksız hafif SVG çizgi grafik — sınav net gelişimi için.
// Harici grafik kütüphanesi eklemek bundle'ı ikiye katlayacağı için elle çizildi.
// points: [{ tarih: "YYYY-MM-DD", ad, net }] — kronolojik artan sırada
export default function LineChart({ points = [], color = "#0F6E56", height = 190 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);

  // Genişliği ölç: viewBox ile ölçekleme yazıları bozduğu için gerçek px kullanıyoruz.
  // ResizeObserver kapsayıcı değişimini yakalar; window.resize ise observer'ın
  // çalışmadığı ortamlarda (gizli/arka plan sekme) yedek görevi görür.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const olc = () => setWidth(el.clientWidth);
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    window.addEventListener("resize", olc);
    return () => { ro.disconnect(); window.removeEventListener("resize", olc); };
  }, []);

  // Her render sonrası ölçümü doğrula. Kapsayıcı genişliği SVG'ye bağlı olmadığı
  // için (maxWidth %100 + overflow hidden) bu döngüye girmez, yalnızca sapmayı düzeltir.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el && el.clientWidth > 0 && el.clientWidth !== width) setWidth(el.clientWidth);
  });

  const pad = { top: 18, right: 14, bottom: 26, left: 36 };
  const iw = Math.max(width - pad.left - pad.right, 10);
  const ih = Math.max(height - pad.top - pad.bottom, 10);

  const n = points.length;
  const netler = points.map(p => p.net);
  const dataMin = n ? Math.min(...netler) : 0;
  const dataMax = n ? Math.max(...netler) : 0;
  const span    = (dataMax - dataMin) || Math.max(dataMax, 2);
  const yMin    = dataMin - span * 0.18;
  const yMax    = dataMax + span * 0.18;

  const x = (i) => pad.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => pad.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  const kisaTarih = (t) =>
    t ? new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "";

  // Etiket yoğunluğunu sınırla: çok nokta varsa ilk/son + aradan seyrek
  const etiketAdimi = n <= 5 ? 1 : Math.ceil(n / 4);
  const etiketVar   = (i) => i === 0 || i === n - 1 || i % etiketAdimi === 0;

  const cizgi = points.map((p, i) => `${x(i)},${y(p.net)}`).join(" ");
  const alan  = n > 1
    ? `M ${x(0)},${pad.top + ih} L ${points.map((p, i) => `${x(i)},${y(p.net)}`).join(" L ")} L ${x(n - 1)},${pad.top + ih} Z`
    : "";

  // Yatay kılavuz çizgileri: verinin alt / orta / üst değerleri
  const kilavuzlar = [dataMax, (dataMax + dataMin) / 2, dataMin];

  return (
    <div ref={wrapRef} style={{ width: "100%", overflow: "hidden" }}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} style={{ display: "block", maxWidth: "100%" }}>
          {/* Kılavuz çizgileri + Y ekseni değerleri */}
          {kilavuzlar.map((v, i) => (
            <g key={i}>
              <line x1={pad.left} x2={pad.left + iw} y1={y(v)} y2={y(v)}
                stroke="#f0ede8" strokeWidth="1" strokeDasharray={i === 2 ? "0" : "3 3"} />
              <text x={pad.left - 6} y={y(v) + 3} textAnchor="end"
                fontSize="9.5" fill="#bbb">{Math.round(v * 10) / 10}</text>
            </g>
          ))}

          {/* Alan dolgusu */}
          {alan && <path d={alan} fill={color} opacity="0.09" />}

          {/* Çizgi */}
          {n > 1 && (
            <polyline points={cizgi} fill="none" stroke={color}
              strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* Noktalar + değer etiketleri */}
          {points.map((p, i) => {
            const sonuncu = i === n - 1;
            return (
              <g key={i}>
                <circle cx={x(i)} cy={y(p.net)} r={sonuncu ? 5 : 3.5}
                  fill={sonuncu ? color : "#fff"} stroke={color} strokeWidth="2" />
                {(n <= 6 || sonuncu) && (
                  <text x={x(i)} y={y(p.net) - 10} textAnchor="middle"
                    fontSize="10.5" fontWeight={sonuncu ? 700 : 500}
                    fill={sonuncu ? color : "#888"}>{p.net}</text>
                )}
                {etiketVar(i) && (
                  <text x={x(i)} y={pad.top + ih + 16} textAnchor="middle"
                    fontSize="9.5" fill="#aaa">{kisaTarih(p.tarih)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
