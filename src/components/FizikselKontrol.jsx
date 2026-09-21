import { useState } from "react";
import { GUN_KISA, DILIMLER, TURLER, hucreBloklari, blokAltBilgi, saatKisalt, sureMetni } from "../lib/calismaPlani";
import { odevDosyalari } from "../lib/odevDosyalari";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";
import GuvenliBaglanti from "./GuvenliBaglanti";

// Haftanın tamamını tek seferde gözden geçirme penceresi.
//
// ── NEDEN ───────────────────────────────────────────────────────
// Koç defteri elde kontrol ediyor: "bunu yapmış, bunu yapmış, şunu
// yapmamış". Bu iş blok blok panoda yapılınca hücreleri tek tek açmak
// gerekiyordu. Burada haftanın bütün blokları gün sırasıyla tek listede;
// koç işaretler, bir kez onaylar.
//
// ── ÖĞRENCİNİN İŞARETİ ÖN SEÇİM, KARAR DEĞİL ────────────────────
// Öğrencinin "yaptım" dediği ve henüz bakılmamış bloklar kutuları işaretli
// geliyor — koçun en sık yapacağı şey onları onaylamak. Ama öğrenci hiç
// işaretlememiş bir blok da seçilebiliyor: fiziksel kontrolün asıl
// karşılığı bu, koç yapıldığını gördüyse işaretlenmemiş olması engel değil.
//
// Onay bloğu "yapıldı"ya çekiyor. SÜRE SORULMUYOR: koçun tahmini dakika,
// öğrencinin bildirdiği süreyle aynı sütuna yazılsaydı grafiklerdeki
// çalışma süresi uydurma sayılarla şişerdi.
export default function FizikselKontrol({ bloklar, testler = {}, haftaMetni, color: c, onOnayla, onKapat }) {
  const [secili, setSecili] = useState(
    () => new Set(bloklar.filter(b => b.yapildi && !b.koc_onayi).map(b => b.id))
  );
  const [islemde, setIslemde] = useState(false);

  const onayli = (b) => b.koc_onayi === "onaylandi";
  const secilebilir = bloklar.filter(b => !onayli(b));
  const cevir = (id) => setSecili(s => {
    const y = new Set(s);
    if (y.has(id)) y.delete(id); else y.add(id);
    return y;
  });
  const hepsiSecili = secilebilir.length > 0 && secilebilir.every(b => secili.has(b.id));
  const tumunuCevir = () =>
    setSecili(hepsiSecili ? new Set() : new Set(secilebilir.map(b => b.id)));

  const onayla = async () => {
    if (secili.size === 0) return;
    setIslemde(true);
    const { hata } = (await onOnayla([...secili])) ?? {};
    setIslemde(false);
    if (!hata) onKapat();
  };

  // Gün → zaman dilimi sırasıyla: panodaki okuma sırasının aynısı
  const gunler = [0, 1, 2, 3, 4, 5, 6]
    .map(g => ({ gun: g, bloklar: DILIMLER.flatMap(d => hucreBloklari(bloklar, g, d.kod)) }))
    .filter(x => x.bloklar.length > 0);

  const zatenOnayli = bloklar.length - secilebilir.length;

  return (
    <Modal title={`Fiziksel kontrol · ${haftaMetni}`} onClose={onKapat} maxWidth={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>

        {bloklar.length === 0 ? (
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinCokSoluk, textAlign: "center", padding: "18px 0" }}>
            Bu haftanın planında blok yok.
          </div>
        ) : (
          <>
            <div style={{ fontSize: YAZI.kucuk, color: RENK.metinIkincil, lineHeight: 1.55 }}>
              Defteri kontrol ederken işaretleyin: seçtiğiniz bloklar <b>yapıldı</b> sayılıp
              onaylanır, öğrenci işaretlememiş olsa bile. Öğrencinin “yaptım” dediği
              bloklar hazır işaretli geldi. Bir bloğu iade etmek için panodaki ↩ düğmesini
              kullanın.
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: BOSLUK.s, flexWrap: "wrap" }}>
              <button onClick={tumunuCevir} style={{
                padding: "5px 11px", borderRadius: KOSE.tam, cursor: "pointer",
                border: `1.5px solid ${c.mid}`, background: "#fff", color: c.text,
                fontSize: YAZI.kucuk, fontWeight: 700,
              }}>{hepsiSecili ? "Seçimi temizle" : "Tümünü seç"}</button>
              <span style={{ fontSize: YAZI.kucuk, color: RENK.metinSoluk }}>
                {secili.size} blok seçili
                {zatenOnayli > 0 && ` · ${zatenOnayli} blok zaten onaylı`}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s, maxHeight: "52vh", overflowY: "auto" }}>
              {gunler.map(({ gun, bloklar: gunBloklari }) => (
                <div key={gun}>
                  <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinCokSoluk, letterSpacing: 0.3, marginBottom: 4 }}>
                    {GUN_KISA[gun].toLocaleUpperCase("tr")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {gunBloklari.map(b => {
                      const kilitli = onayli(b);
                      const isaretli = secili.has(b.id);
                      const test = testler[b.id];
                      const t = TURLER[b.tur] ?? TURLER.serbest;
                      return (
                        <label key={b.id} style={{
                          display: "flex", alignItems: "flex-start", gap: BOSLUK.s,
                          padding: "7px 9px", borderRadius: KOSE.m,
                          background: kilitli ? RENK.basari.zemin : isaretli ? c.light : RENK.yuzey,
                          cursor: kilitli ? "default" : "pointer",
                          opacity: kilitli ? 0.75 : 1,
                        }}>
                          <input type="checkbox" checked={kilitli || isaretli} disabled={kilitli}
                            onChange={() => cevir(b.id)}
                            style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: c.bg }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: YAZI.ikincil, fontWeight: 600, color: RENK.metin }}>
                              <span aria-hidden="true">{t.simge} </span>{b.baslik}
                            </div>
                            <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk, marginTop: 1 }}>
                              {[saatKisalt(b.baslangic_saati), blokAltBilgi(b)].filter(Boolean).join(" · ")}
                            </div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                              {kilitli && (
                                <Etiket zemin={RENK.basari.zemin} renk={RENK.basari.metin}>✓ onaylandı</Etiket>
                              )}
                              {!kilitli && b.yapildi && (
                                <Etiket zemin={RENK.uyari.zemin} renk={RENK.uyari.metin}>⏳ öğrenci yaptım dedi</Etiket>
                              )}
                              {!b.yapildi && b.koc_onayi === "iade_edildi" && (
                                <Etiket zemin={RENK.hata.zemin} renk={RENK.hata.metin}>↩ iade edildi</Etiket>
                              )}
                              {!b.yapildi && !b.koc_onayi && (
                                <Etiket zemin={RENK.yuzey} renk={RENK.metinSilik}>işaretlenmedi</Etiket>
                              )}
                              {b.calisilan_dk != null && (
                                <Etiket zemin={c.light} renk={c.text}>⏱ {sureMetni(b.calisilan_dk) || "0 dk"}</Etiket>
                              )}
                              {test && (
                                <Etiket zemin={RENK.mor.zemin} renk={RENK.mor.metin}>
                                  📝 {test.correct_count}/{test.question_count}
                                </Etiket>
                              )}
                              {/* Çözüm görselleri: fiziksel kontrolde koç
                                  öğrencinin gönderdiğine de bakabilsin */}
                              {odevDosyalari(test).map((d, i) => (
                                <span key={d.url} onClick={e => e.preventDefault()}>
                                  <GuvenliBaglanti url={d.url} baslik={d.ad} style={{
                                    fontSize: YAZI.mikro, fontWeight: 700, padding: "1px 6px", borderRadius: KOSE.tam,
                                    background: "#fff", color: c.text, textDecoration: "none", display: "inline-block",
                                  }}>📎{odevDosyalari(test).length > 1 ? i + 1 : ""}</GuvenliBaglanti>
                                </span>
                              ))}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={onayla} disabled={islemde || secili.size === 0} style={{
              padding: "12px 0", borderRadius: KOSE.m, border: "none",
              background: secili.size ? c.bg : "#ddd", color: "#fff",
              fontSize: YAZI.govde, fontWeight: 700,
              cursor: secili.size && !islemde ? "pointer" : "not-allowed",
              opacity: islemde ? 0.7 : 1,
            }}>
              {islemde ? "Onaylanıyor..." : `✓ ${secili.size} bloğu onayla`}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

const Etiket = ({ zemin, renk, children }) => (
  <span style={{
    fontSize: YAZI.mikro, fontWeight: 700, padding: "1px 6px",
    borderRadius: KOSE.tam, background: zemin, color: renk,
  }}>{children}</span>
);
