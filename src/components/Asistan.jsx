import { useState, useRef, useEffect } from "react";
import { analizGetir, analizGonder } from "../lib/servisApi";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Yapay zekâ asistanı.
//
// Öğrenci panelinde çalışma asistanı (kendi verisiyle konuşur), koç
// panelinde yardımcı (seçtiği öğrenci hakkında). Aradaki fark yalnızca
// hangi öğrencinin sorulduğu; yönergeyi SUNUCU seçiyor — istemci "ben
// koçum" diyerek öğrenci kısıtlarından kaçamasın.
//
// ── YAZIŞMA SAKLANMIYOR ─────────────────────────────────────────
// Konuşma yalnızca bu bileşenin belleğinde. Kart kapanınca gidiyor.
// Kalıcı olsaydı yeni bir tablo, yeni bir RLS yüzeyi ve süregelen bir
// kişisel veri birikimi demekti; asistan bugün bir yardımcı, arşiv değil.

const ORNEK_OGRENCI = [
  "Bu hafta neye çalışmalıyım?",
  "Hangi dersim geride kalıyor?",
  "Son denemem nasıl geçmiş?",
];
const ORNEK_KOC = [
  "Bu öğrencinin son bir ayı nasıl geçti?",
  "Velisine gönderilecek kısa bir bilgilendirme yaz",
  "Hangi konulara ağırlık vermeliyim?",
];

export default function Asistan({ students = null, color: c, baslik = "Asistan" }) {
  const [acik,    setAcik]    = useState(false);
  const [durum,   setDurum]   = useState(null);   // { hazir, model } | "hata"
  const [secili,  setSecili]  = useState(students?.[0]?.id ?? "");
  const [mesajlar, setMesajlar] = useState([]);
  const [metin,   setMetin]   = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const sonRef = useRef(null);

  // Durum yalnızca kart AÇILDIĞINDA sorulur: kapalı kartın panel
  // yüklenirken servise istek atmasının anlamı yok (Render uykudaysa
  // boşuna uyandırır).
  useEffect(() => {
    if (!acik || durum) return;
    analizGetir("/asistan/durum")
      .then(r => r.json())
      .then(setDurum)
      .catch(() => setDurum("hata"));
  }, [acik, durum]);

  useEffect(() => { sonRef.current?.scrollIntoView({ block: "nearest" }); }, [mesajlar.length, bekliyor]);

  // Öğrenci değişince konuşma sıfırlanıyor: önceki öğrenci hakkındaki
  // soruların yanıtları yeni öğrencinin bağlamıyla karışmasın.
  const ogrenciDegistir = (id) => { setSecili(id); setMesajlar([]); };

  const sor = async (soru) => {
    const icerik = (soru ?? metin).trim();
    if (!icerik || bekliyor) return;
    const yeni = [...mesajlar, { rol: "kullanici", metin: icerik }];
    setMesajlar(yeni);
    setMetin("");
    setBekliyor(true);
    try {
      const res = await analizGonder("/asistan", {
        mesajlar: yeni,
        ogrenci_id: students ? secili : null,
      });
      const govde = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Yapılandırma eksikliğini hata gibi göstermiyoruz: kullanıcının
        // yapabileceği bir şey yok, sistemin kurulması gerekiyor.
        const aciklama =
          govde.detail === "asistan_yapilandirilmadi" ? "Asistan henüz kurulmadı."
          : govde.detail === "asistan_anahtar_gecersiz" ? "Asistan anahtarı geçersiz."
          : govde.detail === "asistan_yogun" ? "Şu an yoğunluk var, biraz sonra tekrar deneyin."
          : `Yanıt alınamadı (${res.status}).`;
        setMesajlar([...yeni, { rol: "asistan", metin: aciklama, hata: true }]);
        return;
      }
      setMesajlar([...yeni, { rol: "asistan", metin: govde.yanit }]);
    } catch {
      setMesajlar([...yeni, {
        rol: "asistan", hata: true,
        metin: "Asistana ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
      }]);
    } finally {
      setBekliyor(false);
    }
  };

  const ornekler = students ? ORNEK_KOC : ORNEK_OGRENCI;

  return (
    <Card id="bolum-asistan">
      <SectionTitle title={baslik} color={c.mid} />

      {!acik ? (
        <button onClick={() => setAcik(true)} style={{
          width: "100%", padding: "11px 0", borderRadius: KOSE.l,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: YAZI.govde, fontWeight: 600, cursor: "pointer",
        }}>✨ {students ? "Yardımcıya sor" : "Asistana sor"}</button>
      ) : durum === null ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinCokSoluk, padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : durum === "hata" || !durum.hazir ? (
        // Anahtar yokken kart gizlenmiyor: özelliğin var olduğu ama
        // kurulmayı beklediği görünsün, "neden yok?" sorusu doğmasın.
        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
          <div style={{
            fontSize: YAZI.ikincil, color: RENK.uyari.metin, background: RENK.uyari.zemin,
            padding: `${BOSLUK.m}px ${BOSLUK.m}px`, borderRadius: KOSE.m, lineHeight: 1.55,
          }}>
            {durum === "hata"
              ? "Asistan servisine ulaşılamadı."
              : <>Asistan <b>henüz kurulmadı</b>. Çalışması için sunucuya bir
                 Anthropic API anahtarı tanımlanması gerekiyor. Anahtar
                 eklendiğinde bu kart kendiliğinden çalışmaya başlar.</>}
          </div>
          <button onClick={() => setAcik(false)} style={{
            padding: "9px 0", borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`,
            background: "#fff", color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
          }}>Kapat</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
          {students && students.length > 0 && (
            <select value={secili} onChange={e => ogrenciDegistir(e.target.value)} style={{
              width: "100%", padding: "8px 11px", borderRadius: KOSE.m,
              border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, boxSizing: "border-box",
            }}>
              {students.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          )}

          {/* Konuşma */}
          <div style={{
            display: "flex", flexDirection: "column", gap: BOSLUK.xs + 2,
            maxHeight: 300, overflowY: "auto",
            border: `1px solid ${RENK.cizgi}`, borderRadius: KOSE.m,
            padding: BOSLUK.s, background: "#fcfcfb",
          }}>
            {mesajlar.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.xs }}>
                <div style={{ fontSize: YAZI.kucuk, color: RENK.metinCokSoluk, marginBottom: 2 }}>
                  Örnek sorular:
                </div>
                {ornekler.map(o => (
                  <button key={o} onClick={() => sor(o)} style={{
                    textAlign: "left", padding: `${BOSLUK.s}px ${BOSLUK.m}px`,
                    borderRadius: KOSE.m, border: `1px solid ${RENK.cizgi}`,
                    background: "#fff", color: RENK.metinIkincil,
                    fontSize: YAZI.ikincil, cursor: "pointer",
                  }}>{o}</button>
                ))}
              </div>
            ) : mesajlar.map((m, i) => {
              const benim = m.rol === "kullanici";
              return (
                <div key={i} style={{
                  alignSelf: benim ? "flex-end" : "flex-start",
                  maxWidth: "88%", minWidth: 0,
                  padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.l,
                  background: benim ? c.bg : (m.hata ? RENK.hata.zemin : "#fff"),
                  color:      benim ? "#fff" : (m.hata ? RENK.hata.metin : RENK.metin),
                  border:     benim ? "none" : `1px solid ${RENK.cizgi}`,
                  fontSize: YAZI.ikincil, lineHeight: 1.6,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>{m.metin}</div>
              );
            })}
            {bekliyor && (
              <div style={{
                alignSelf: "flex-start", fontSize: YAZI.kucuk,
                color: RENK.metinCokSoluk, padding: `${BOSLUK.xs}px ${BOSLUK.m}px`,
              }}>düşünüyor…</div>
            )}
            <div ref={sonRef} />
          </div>

          <div style={{ display: "flex", gap: BOSLUK.xs + 2, alignItems: "flex-end" }}>
            <textarea value={metin} rows={2}
              onChange={e => setMetin(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sor(); }
              }}
              placeholder={students ? "Öğrenci hakkında sorun..." : "Bir şey sorun..."}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: KOSE.m, fontSize: YAZI.ikincil,
                border: `1.5px solid ${RENK.cizgi}`, outline: "none", resize: "vertical",
                boxSizing: "border-box", fontFamily: "inherit",
              }} />
            <button onClick={() => sor()} disabled={bekliyor || !metin.trim()} style={{
              padding: "10px 16px", borderRadius: KOSE.m, border: "none", flexShrink: 0,
              background: metin.trim() && !bekliyor ? c.bg : "#ddd", color: "#fff",
              fontSize: YAZI.ikincil, fontWeight: 700,
              cursor: metin.trim() && !bekliyor ? "pointer" : "not-allowed",
            }}>{bekliyor ? "…" : "Sor"}</button>
          </div>

          <div style={{ fontSize: YAZI.mikro, color: RENK.metinCokSoluk, lineHeight: 1.5 }}>
            Yapay zekâ yanıtları hata içerebilir; önemli kararlarda
            {students ? " öğrencinin verisini kendiniz doğrulayın." : " koçunuza danışın."}
            {" "}Bu yazışma kaydedilmiyor.
          </div>

          <button onClick={() => setAcik(false)} style={{
            padding: "9px 0", borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`,
            background: "#fff", color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
          }}>Kapat</button>
        </div>
      )}
    </Card>
  );
}
