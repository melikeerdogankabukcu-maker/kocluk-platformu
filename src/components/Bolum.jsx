import { useState, useEffect } from "react";
import { BolumIcinde } from "../lib/bolumBaglam";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";

// ── SEKME KAYIT DEFTERİ ─────────────────────────────────────────
// Bildirimler bolum-test, bolum-sinav gibi kimliklere kaydırıyor.
// Bölümler sekmeli olunca KAPALI sekmenin içeriği DOM'da hiç bulunmuyor:
// bildirime tıklayan kullanıcı için hiçbir şey olmuyor ve hata da
// görünmüyor, çünkü scrollIntoView çağrılacak bir eleman yok.
//
// Her Bolum, sekmelerinin kimliklerini buraya yazıyor. bolumeGit önce
// buradan sorup ilgili sekmeyi AÇIYOR, sonra kaydırıyor.
import { sekmeSahibi } from "../lib/bolumBaglam";

// Aynı alana ait kartları TEK bir bölümde toplar; içeride sekme olur.
//
// Koç panelinde 19 ayrı kart alt alta diziliyordu ve aradığını bulmak
// için kaydırmak gerekiyordu. Bunlar birbirinden bağımsız işler değil:
// "Öğrencilerim", "Veli Bağlantıları" ve "Gruplar" aynı alana ait.
//
// ── ALT KARTLARA DOKUNULMUYOR ───────────────────────────────────
// Bileşenlerin çoğu kendi <Card>'ını çiziyor. Her birine "çerçevesiz
// çiz" diye bir prop eklemek on küsur dosyayı değiştirmek olurdu ve
// biri unutulunca iç içe iki kart çıkardı. Onun yerine Card bir bağlam
// okuyor: bir Bolum'un içindeyse çerçevesini çizmiyor. Böylece alt
// bileşenler hiç değişmeden hem tek başına hem sekme içinde çalışıyor.
export default function Bolum({ baslik, sekmeler, color: c, id, varsayilan = 0 }) {
  // Boş sekmeler (yetkisi olmayan kullanıcıda gizlenenler) elenmeli,
  // yoksa tıklanınca boş bir bölüm açılırdı.
  const aktifSekmeler = sekmeler.filter(s => s && s.icerik);
  const [secili, setSecili] = useState(Math.min(varsayilan, Math.max(aktifSekmeler.length - 1, 0)));

  // Sekme kimliklerini kayıt defterine yaz. Sekme listesi değişebildiği
  // için (yetkiye göre gizlenenler) bağımlılık uzunluk ve adlar.
  useEffect(() => {
    aktifSekmeler.forEach((s, i) => {
      if (s.id) sekmeSahibi.set(s.id, () => setSecili(i));
    });
    return () => aktifSekmeler.forEach(s => { if (s.id) sekmeSahibi.delete(s.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifSekmeler.map(s => s.id ?? s.ad).join("|")]);

  if (aktifSekmeler.length === 0) return null;

  const gecerli = Math.min(secili, aktifSekmeler.length - 1);
  const tek = aktifSekmeler.length === 1;

  return (
    <section id={id} style={{
      background: RENK.kart,
      borderRadius: KOSE.kart,
      border: `1px solid ${RENK.cizgi}`,
      overflow: "hidden",
    }}>
      {/* Başlık + sekme şeridi */}
      <div style={{
        padding: `${BOSLUK.m}px ${BOSLUK.l}px ${tek ? BOSLUK.m : 0}px`,
        borderBottom: tek ? `1px solid ${RENK.cizgi}` : "none",
      }}>
        {baslik && (
          <h2 style={{
            margin: 0, marginBottom: tek ? 0 : BOSLUK.s,
            fontSize: YAZI.vurgu, fontWeight: 700, color: RENK.metinBaslik,
          }}>{baslik}</h2>
        )}

        {!tek && (
          // Dar ekranda sekmeler alt alta düşmek yerine YATAY KAYIYOR:
          // sarmalayınca başlık şeridi üç sıraya çıkıyor ve içerik
          // ekrandan aşağı itiliyordu.
          <div style={{
            display: "flex", gap: BOSLUK.xs,
            overflowX: "auto", paddingBottom: BOSLUK.s,
            scrollbarWidth: "none",
          }}>
            {aktifSekmeler.map((s, i) => {
              const aktif = i === gecerli;
              return (
                <button key={s.ad} onClick={() => setSecili(i)} style={{
                  flexShrink: 0,
                  padding: `${BOSLUK.xs + 2}px ${BOSLUK.m}px`,
                  borderRadius: KOSE.tam,
                  border: "none",
                  background: aktif ? c.light : "transparent",
                  color: aktif ? c.text : RENK.metinSoluk,
                  fontSize: YAZI.ikincil,
                  fontWeight: aktif ? 700 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}>
                  {s.ad}
                  {s.rozet > 0 && (
                    <span style={{
                      marginLeft: BOSLUK.xs, padding: "1px 6px", borderRadius: KOSE.tam,
                      background: aktif ? c.bg : RENK.uyari.zemin,
                      color:      aktif ? "#fff" : RENK.uyari.metin,
                      fontSize: YAZI.mikro, fontWeight: 700,
                    }}>{s.rozet}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Seçili sekmenin içeriği. Yalnızca o çiziliyor: hepsini birden
          çizip gizlemek, kapalı sekmelerin de veri çekmesi demekti. */}
      <BolumIcinde.Provider value={true}>
        <div style={{ padding: `${BOSLUK.m}px ${BOSLUK.l}px ${BOSLUK.l}px` }}>
          {aktifSekmeler[gecerli].icerik}
        </div>
      </BolumIcinde.Provider>
    </section>
  );
}
