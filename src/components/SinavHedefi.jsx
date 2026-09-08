import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";

// Öğrencinin sınav hedefi.
//
// ── ANA EKRANDA DURUYOR ─────────────────────────────────────────
// Hedef önce yalnızca profil penceresinin içindeydi: öğrenci onu
// görmek için profilini açmak zorundaydı, yani pratikte hiç görmüyordu.
// Hedefin işi hatırlatmak; görünmeyen hedefin motive edici bir yanı yok.
//
// ── BOŞKEN GİZLENMİYOR ──────────────────────────────────────────
// Hedef girilmemişse kart kaybolmuyor, yerine hatırlatma çıkıyor.
// Gizleseydik hedef belirlemeyen öğrenci böyle bir şeyin var olduğunu
// hiç öğrenemezdi.
//
// ── HEDEFE UZAKLIK HESAPLANMIYOR ────────────────────────────────
// exam_results'ta puan ve sıralama tutulmuyor, yalnızca net var.
// "Hedefine %62 kaldı" gibi bir sayı üretmek için olmayan veriyi
// uydurmak gerekirdi. Onun yerine hedefin yanında o güne kadarki EN İYİ
// NET duruyor; karşılaştırmayı öğrenci ve koçu yapıyor.
export default function SinavHedefi({ profil, enIyiNet = null, color: c, onDuzenle, sikistir = false }) {
  const hedefVar = !!(profil?.hedef_siralama || profil?.hedef_puan || profil?.hedef_aciklama);

  if (!hedefVar) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: BOSLUK.m,
        padding: `${BOSLUK.m}px ${BOSLUK.l}px`,
        background: RENK.uyari.zemin, borderRadius: KOSE.kart,
        border: "1px solid #F0E2C4", borderLeft: "4px solid #EF9F27",
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden="true">🎯</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: YAZI.govde, fontWeight: 700, color: RENK.uyari.metin, marginBottom: 2 }}>
            Sınav hedefini belirle
          </div>
          <div style={{ fontSize: YAZI.ikincil, color: "#8a6420", lineHeight: 1.5 }}>
            Hedeflediğin sıralamayı ve puanı yaz; koçun da görsün, her gün
            burada karşına çıksın.
          </div>
        </div>
        {onDuzenle && (
          <button onClick={onDuzenle} style={{
            flexShrink: 0, padding: "8px 14px", borderRadius: KOSE.m, border: "none",
            background: "#EF9F27", color: "#fff", fontSize: YAZI.ikincil,
            fontWeight: 700, cursor: "pointer",
          }}>Belirle</button>
        )}
      </div>
    );
  }

  const kutu = (etiket, deger, vurgulu = false) => (
    <div key={etiket}>
      <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>{etiket}</div>
      <div style={{
        fontSize: sikistir ? 15 : 17, fontWeight: 800, lineHeight: 1.2,
        color: vurgulu ? c.mid : c.text,
      }}>{deger}</div>
    </div>
  );

  return (
    <div style={{
      padding: `${BOSLUK.m}px ${BOSLUK.l}px`,
      background: c.light, borderRadius: KOSE.kart,
      border: `1px solid ${c.mid}22`, borderLeft: `4px solid ${c.mid}`,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: BOSLUK.s, marginBottom: BOSLUK.s,
      }}>
        <div style={{ fontSize: YAZI.mikro, fontWeight: 700, letterSpacing: 0.4, color: c.text }}>
          🎯 HEDEFİM{profil.hedef_sinav ? ` · ${profil.hedef_sinav}` : ""}
        </div>
        {onDuzenle && (
          <button onClick={onDuzenle} style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: c.mid, fontSize: YAZI.kucuk, fontWeight: 600, flexShrink: 0,
          }}>✏️ düzenle</button>
        )}
      </div>

      <div style={{ display: "flex", gap: BOSLUK.xl, flexWrap: "wrap" }}>
        {profil.hedef_siralama &&
          kutu("Sıralama", Number(profil.hedef_siralama).toLocaleString("tr-TR"))}
        {profil.hedef_puan && kutu("Puan", profil.hedef_puan)}
        {/* En iyi net hedefin değil, bugünün ölçüsü — farklı renkte
            duruyor ki hedefle karıştırılmasın. */}
        {enIyiNet != null && kutu("En iyi netin", enIyiNet, true)}
      </div>

      {profil.hedef_aciklama && (
        <div style={{
          fontSize: YAZI.ikincil, color: RENK.metinIkincil,
          marginTop: BOSLUK.s, lineHeight: 1.5,
        }}>{profil.hedef_aciklama}</div>
      )}
    </div>
  );
}
