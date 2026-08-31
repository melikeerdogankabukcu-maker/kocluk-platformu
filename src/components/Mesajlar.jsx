import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { useMesajlar } from "../hooks/useMesajlar";
import { odevDosyalari, yeniDosyaYolu, DOSYA_SINIRI, BOYUT_SINIRI_MB } from "../lib/odevDosyalari";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Mesajlaşma ekranı: solda kişiler, seçilince yazışma açılır.
//
// kisiler: [{ id, full_name, etiket? }] — kimin kiminle yazışabileceği
// veritabanında RLS ile sınırlı (mesajlasabilir_mi); buradaki liste
// yalnızca ARAYÜZ kolaylığı. Listede olmayan birine yazılmak istense
// bile insert politikası reddeder.
export default function Mesajlar({ userId, kisiler = [], color: c, baslik = "Mesajlar" }) {
  const { sohbetler, okunmamisSayisi, toplamOkunmamis, etkin, loading,
          gonder, okunduIsaretle, sil } = useMesajlar(userId);
  const [acik, setAcik]     = useState(false);
  const [secili, setSecili] = useState(null);
  const [metin, setMetin]   = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  // Gönderilmeyi bekleyen dosyalar (henüz yüklenmedi)
  const [ekler, setEkler]   = useState([]);
  const [arama, setArama]   = useState("");
  const sonRef = useRef(null);
  const dosyaRef = useRef(null);

  const konusma = secili ? (sohbetler[secili] ?? []) : [];

  // Sohbet açılınca ve yeni mesaj gelince en alta in
  useEffect(() => {
    if (secili) sonRef.current?.scrollIntoView({ block: "nearest" });
  }, [secili, konusma.length]);

  // Sohbet açıkken gelen mesajlar okundu sayılsın
  useEffect(() => {
    if (secili && acik) okunduIsaretle(secili);
    // okunduIsaretle her render'da yeniden üretiliyor; bağımlılığa
    // eklenirse döngü olur. Kasıtlı olarak dışarıda bırakıldı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secili, acik, konusma.length]);

  if (!etkin) return null;   // tablo yoksa kartı hiç gösterme

  const adBul = (id) => kisiler.find(k => k.id === id)?.full_name ?? "Bilinmeyen kişi";

  const gonderVeTemizle = async () => {
    if ((!metin.trim() && ekler.length === 0) || !secili) return;
    setGonderiliyor(true);
    try {
      // Dosyalar önce depoya, sonra mesaj. Ters sırada mesaj gider ama
      // ekleri boş kalırdı; karşı taraf "dosya gönderdi" görüp hiçbir şey
      // bulamazdı.
      const damga = Date.now();
      const yuklenen = [];
      for (let i = 0; i < ekler.length; i++) {
        const d = ekler[i];
        const yol = yeniDosyaYolu(userId, "mesaj", d.name, i, damga);
        const { error } = await supabase.storage
          .from("homework").upload(yol, d, { upsert: true, contentType: d.type });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from("homework").getPublicUrl(yol);
        yuklenen.push({ url: publicUrl, ad: d.name });
      }
      const { hata } = await gonder(secili, metin, yuklenen);
      if (!hata) { setMetin(""); setEkler([]); }
    } catch (err) {
      console.error("Mesaj eki yukleme hatasi:", err);
      alert("Dosya yüklenemedi: " + (err?.message ?? "bilinmeyen hata"));
    } finally {
      setGonderiliyor(false);
    }
  };

  // Arama yalnızca AÇIK sohbette: kişi listesi zaten kısa, asıl zorluk
  // uzun bir yazışmada eski bir mesajı bulmak.
  const aramaKucuk = arama.trim().toLocaleLowerCase("tr");
  const gorunenKonusma = aramaKucuk
    ? konusma.filter(m =>
        (m.content ?? "").toLocaleLowerCase("tr").includes(aramaKucuk) ||
        odevDosyalari(m).some(d => d.ad.toLocaleLowerCase("tr").includes(aramaKucuk)))
    : konusma;

  const saat = (t) => {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? "" :
      d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // Kişileri son mesaja göre sırala: konuşulan yukarıda kalsın
  const sirali = [...kisiler].sort((a, b) => {
    const sonA = (sohbetler[a.id] ?? []).slice(-1)[0]?.created_at ?? "";
    const sonB = (sohbetler[b.id] ?? []).slice(-1)[0]?.created_at ?? "";
    return sonB.localeCompare(sonA);
  });

  return (
    <Card id="bolum-mesaj">
      <SectionTitle
        title={`${baslik}${toplamOkunmamis > 0 ? ` (${toplamOkunmamis})` : ""}`}
        color={c.mid}
        acik={acik} onToggle={() => setAcik(v => !v)} />

      {!acik ? null : loading ? (
        <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : kisiler.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center", lineHeight: 1.6 }}>
          Henüz mesajlaşabileceğiniz kimse yok.<br />
          <span style={{ fontSize: 11.5 }}>
            Mesajlaşma yalnızca onaylı bağlantılarla açılır.
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Kişi listesi */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sirali.map(k => {
              const okunmamis = okunmamisSayisi(k.id);
              const bu = secili === k.id;
              return (
                <button key={k.id} onClick={() => setSecili(bu ? null : k.id)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 11px", borderRadius: 99, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${bu ? c.bg : "#f0ede8"}`,
                  background: bu ? c.bg : "#fff",
                  color: bu ? "#fff" : "#555", cursor: "pointer",
                }}>
                  {k.full_name}
                  {k.etiket && (
                    <span style={{ fontSize: 9.5, opacity: 0.75, fontWeight: 500 }}>{k.etiket}</span>
                  )}
                  {okunmamis > 0 && (
                    <span style={{
                      minWidth: 16, height: 16, borderRadius: 99, fontSize: 10, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: bu ? "#fff" : "#E24B4A", color: bu ? c.bg : "#fff", padding: "0 4px",
                    }}>{okunmamis}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Yazışma */}
          {secili && (
            <>
              {/* Arama — yalnızca 6'dan fazla mesaj varsa. Üç mesajlık
                  bir sohbette arama kutusu göstermek gürültü. */}
              {konusma.length > 6 && (
                <input value={arama} onChange={e => setArama(e.target.value)}
                  placeholder="Bu yazışmada ara..." style={{
                    padding: "7px 11px", borderRadius: 9, fontSize: 12,
                    border: "1.5px solid #f0ede8", outline: "none", boxSizing: "border-box",
                  }} />
              )}
              {aramaKucuk && (
                <div style={{ fontSize: 10.5, color: "#888" }}>
                  {gorunenKonusma.length} sonuç
                  <button onClick={() => setArama("")} style={{
                    marginLeft: 8, background: "none", border: "none",
                    color: c.mid, fontSize: 10.5, cursor: "pointer", fontWeight: 600,
                  }}>temizle</button>
                </div>
              )}

              <div style={{
                display: "flex", flexDirection: "column", gap: 6,
                maxHeight: 320, overflowY: "auto",
                border: "1px solid #f0ede8", borderRadius: 10, padding: 9,
                background: "#fcfcfb",
              }}>
                {gorunenKonusma.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "14px 0" }}>
                    {aramaKucuk
                      ? "Bu aramaya uyan mesaj yok"
                      : `${adBul(secili)} ile ilk mesajı siz yazın`}
                  </div>
                ) : gorunenKonusma.map(m => {
                  const benim = m.sender_id === userId;
                  return (
                    <div key={m.id} style={{
                      alignSelf: benim ? "flex-end" : "flex-start",
                      maxWidth: "82%", minWidth: 0,
                    }}>
                      <div style={{
                        padding: "7px 11px", borderRadius: 12,
                        borderBottomRightRadius: benim ? 3 : 12,
                        borderBottomLeftRadius:  benim ? 12 : 3,
                        background: benim ? c.bg : "#fff",
                        color: benim ? "#fff" : "#222",
                        border: benim ? "none" : "1px solid #f0ede8",
                        fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {m.content}
                        {/* Ekler. Görseller doğrudan gösteriliyor: bir
                            çalışma kâğıdını görmek için tıklamak
                            gerekmemeli. Diğer türler bağlantı olarak. */}
                        {odevDosyalari(m).map(d => {
                          const gorsel = /\.(png|jpe?g|gif|webp|heic)$/i.test(d.ad);
                          return gorsel ? (
                            <a key={d.url} href={d.url} target="_blank" rel="noreferrer"
                              style={{ display: "block", marginTop: m.content ? 6 : 0 }}>
                              <img src={d.url} alt={d.ad} style={{
                                maxWidth: "100%", maxHeight: 190, borderRadius: 8, display: "block",
                              }} />
                            </a>
                          ) : (
                            <a key={d.url} href={d.url} target="_blank" rel="noreferrer"
                              title={d.ad}
                              style={{
                                display: "block", marginTop: m.content ? 6 : 0,
                                fontSize: 11.5, fontWeight: 600,
                                color: benim ? "#fff" : c.text,
                                textDecoration: "underline",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>📎 {d.ad}</a>
                          );
                        })}
                      </div>
                      <div style={{
                        fontSize: 9.5, color: "#aaa", marginTop: 2,
                        textAlign: benim ? "right" : "left",
                        display: "flex", gap: 6, justifyContent: benim ? "flex-end" : "flex-start",
                      }}>
                        <span>{saat(m.created_at)}</span>
                        {benim && <span>{m.is_read ? "okundu" : "iletildi"}</span>}
                        {benim && (
                          <button onClick={() => sil(m.id)} title="Sil" style={{
                            background: "none", border: "none", padding: 0,
                            color: "#C98A8A", fontSize: 10, cursor: "pointer",
                          }}>sil</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={sonRef} />
              </div>

              {/* Gönderilmeyi bekleyen ekler */}
              {ekler.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {ekler.map((d, i) => (
                    <span key={`${d.name}-${i}`} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, padding: "3px 5px 3px 10px", borderRadius: 99,
                      background: c.light, color: c.text, maxWidth: 200,
                    }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        📎 {d.name}
                      </span>
                      <button onClick={() => setEkler(l => l.filter((_, j) => j !== i))}
                        title="Kaldır" style={{
                          border: "none", background: "transparent", cursor: "pointer",
                          color: c.text, fontSize: 12, lineHeight: 1, padding: "0 3px",
                        }}>✕</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Yazma alanı */}
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                <button onClick={() => dosyaRef.current?.click()}
                  disabled={gonderiliyor || ekler.length >= DOSYA_SINIRI}
                  title="Dosya ekle" style={{
                    padding: "10px 12px", borderRadius: 10, flexShrink: 0,
                    border: "1.5px solid #f0ede8", background: "#fff",
                    color: c.mid, fontSize: 15, cursor: "pointer", lineHeight: 1,
                  }}>📎</button>
                <input ref={dosyaRef} type="file" multiple
                  accept="image/*,application/pdf" style={{ display: "none" }}
                  onChange={e => {
                    const secilenler = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (secilenler.length === 0) return;
                    if (ekler.length + secilenler.length > DOSYA_SINIRI) {
                      alert(`Bir mesaja en fazla ${DOSYA_SINIRI} dosya eklenebilir.`);
                      return;
                    }
                    const buyuk = secilenler.find(f => f.size > BOYUT_SINIRI_MB * 1024 * 1024);
                    if (buyuk) {
                      alert(`"${buyuk.name}" çok büyük. Dosya başına sınır ${BOYUT_SINIRI_MB} MB.`);
                      return;
                    }
                    setEkler(l => [...l, ...secilenler]);
                  }} />
                <textarea
                  value={metin}
                  onChange={e => setMetin(e.target.value)}
                  onKeyDown={e => {
                    // Enter gönderir, Shift+Enter alt satıra geçer
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); gonderVeTemizle(); }
                  }}
                  placeholder={`${adBul(secili)} kişisine yazın...`}
                  rows={2}
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 10, fontSize: 12.5,
                    border: "1.5px solid #f0ede8", outline: "none", resize: "vertical",
                    boxSizing: "border-box", fontFamily: "inherit",
                  }} />
                {/* Yalnızca görsel de gönderilebilmeli: koşul metin
                    değil "metin YA DA dosya" */}
                <button onClick={gonderVeTemizle}
                  disabled={gonderiliyor || (!metin.trim() && ekler.length === 0)}
                  style={{
                    padding: "10px 16px", borderRadius: 10, border: "none", flexShrink: 0,
                    background: (metin.trim() || ekler.length) ? c.bg : "#ddd", color: "#fff",
                    fontSize: 12.5, fontWeight: 700,
                    cursor: (metin.trim() || ekler.length) ? "pointer" : "not-allowed",
                  }}>{gonderiliyor ? "..." : "Gönder"}</button>
              </div>
            </>
          )}

        </div>
      )}
    </Card>
  );
}
