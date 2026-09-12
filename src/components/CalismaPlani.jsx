import { useState, useEffect, useMemo } from "react";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, useDraggable, useDroppable,
} from "@dnd-kit/core";
import { useCalismaPlani } from "../hooks/useCalismaPlani";
import {
  GUNLER, GUN_KISA, DILIMLER, TURLER, haftaBasi, haftaKaydir, haftaAraligiMetni,
  tarihMetni, bugununGunu, hucreBloklari, ilerleme, sureMetni, blokAltBilgi,
  saatAraligi, sayacGecen,
} from "../lib/calismaPlani";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import Modal from "./Modal";
import BlokFormu from "./BlokFormu";
import VideoOynatici from "./VideoOynatici";
import TamamlaDiyalogu from "./TamamlaDiyalogu";

// Haftalık çalışma planı panosu.
//
// Koç: blokları gün × zaman dilimi ızgarasına sürükler, ekler, düzenler.
// Öğrenci: aynı panoyu görür, blokları "yaptım" diye işaretler, videoları
// izler. Görev sisteminden AYRI — görevler yerinde duruyor.
//
// ── DOKUNMATİK ─────────────────────────────────────────────────
// Tarayıcının yerleşik sürükle-bırakı (HTML5 DnD) dokunmatik ekranda
// ÇALIŞMIYOR. Uygulama telefonda da kullanılıyor; bu yüzden dnd-kit ve
// iki ayrı algılayıcı: fare için kısa bir mesafe eşiği (tık ile sürükleme
// karışmasın), dokunmatik için basılı tutma gecikmesi (parmakla sayfayı
// kaydıran kişi yanlışlıkla blok sürüklemesin).
//
// ── DAR ALANDA GÜN SEKMELERİ ───────────────────────────────────
// 7 sütun telefonda sığmıyor. Kart genişliği eşiğin altına inince tek gün
// gösteriliyor; gün sekmeleri de bırakma hedefi, yani bir bloğu başka
// güne taşımak için onu o günün sekmesine sürüklemek yeterli. Eşik
// pencereye değil KARTIN kendi genişliğine bakıyor: geniş ekranda iki
// bloklu düzende kart zaten dar kalabiliyor.
const DAR_ESIK = 760;

// Geri çağırmalı ref: öğe DOM'a her girişinde yeniden ölçülüyor. Düz
// useRef + useEffect([ref]) yalnızca ilk çizimde çalışıyordu; kart kapalı
// başlayıp sonra açılınca öğe hiç ölçülmüyor, genişlik 0 kalıyor ve
// telefonda 7 sütunlu geniş düzen çiziliyordu.
function useKapsayiciGenisligi() {
  const [el, setEl] = useState(null);
  const [g, setG] = useState(0);
  useEffect(() => {
    if (!el) return;
    const olc = () => setG(el.clientWidth);
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, g];
}

export default function CalismaPlani({
  rol = "ogrenci", studentId: sabitOgrenci = null, ogrenciler = null,
  color: c, baslik = "Haftalık Çalışma Planı", varsayilanAcik = true, onDegisti = null,
}) {
  const koc = rol === "koc";
  // Veli: planı ve ilerlemeyi salt okunur görür; işaret koyamaz, sayaç
  // başlatamaz. Öğrenci işaretler; koç düzenler.
  const ogrenci = rol === "ogrenci";
  const [acik, setAcik] = useState(varsayilanAcik);
  const [secili, setSecili] = useState(sabitOgrenci ?? ogrenciler?.[0]?.id ?? "");
  const [pazartesi, setPazartesi] = useState(() => haftaBasi());
  const buHafta = tarihMetni(pazartesi) === tarihMetni(haftaBasi());

  // Öğrenci listesi sonradan doluyor
  useEffect(() => {
    if (!secili && ogrenciler?.length) setSecili(ogrenciler[0].id);
  }, [ogrenciler, secili]);

  const studentId = sabitOgrenci ?? secili;
  const p = useCalismaPlani(acik ? studentId : null, pazartesi);

  const [kapRef, genislik] = useKapsayiciGenisligi();
  const dar = genislik > 0 && genislik < DAR_ESIK;

  const [seciliGun, setSeciliGun] = useState(bugununGunu());
  // Hafta değişince: bu haftaysa bugünü, değilse pazartesiyi göster
  useEffect(() => { setSeciliGun(buHafta ? bugununGunu() : 0); }, [buHafta, tarihMetni(pazartesi)]); // eslint-disable-line

  const [form, setForm]   = useState(null);   // { blok } | { gun, dilim }
  const [video, setVideo] = useState(null);   // blok
  const [surukle, setSurukle] = useState(null);
  const [tamamlanan, setTamamlanan] = useState(null);   // blok

  // Açık bir sayaç varken ekrandaki süre akmalı. Yalnızca o durumda
  // saniyede değil 20 saniyede bir tazeleniyor: dakika gösteriliyor,
  // daha sık çizmek boşa pil harcardı.
  const [simdi, setSimdi] = useState(Date.now());
  const sayacVar = p.bloklar.some(b => b.sayac_baslangic);
  useEffect(() => {
    if (!sayacVar) return;
    setSimdi(Date.now());
    const t = setInterval(() => setSimdi(Date.now()), 20000);
    return () => clearInterval(t);
  }, [sayacVar]);

  const sayacCevir = async (b) => {
    const { kirpildi, hata } = await p.sayac(b.id, b.sayac_baslangic ? "durdur" : "basla");
    if (!hata && kirpildi) {
      alert("Sayaç 4 saatten uzun açık kalmış; bu bloğa en fazla 4 saat yazıldı. " +
            "Gerçek süreyi \"Yaptım\" derken düzeltebilirsin.");
    }
  };

  // İşaret: yapılmamış bloğa tıklamak tamamlama penceresini açar
  // (süre + test sonucu). Yapılmış bloğun işaretini kaldırmak doğrudan;
  // girilmiş test SİLİNMİYOR, yeniden işaretlenince form onunla açılıyor.
  const isaretCevir = (b) => {
    if (b.yapildi) p.tamamla(b.id, { yapildi: false });
    else setTamamlanan(b);
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const bitisHandler = async ({ active, over }) => {
    setSurukle(null);
    if (!over) return;
    const blok = p.bloklar.find(b => b.id === active.id);
    const hedef = over.data.current;
    if (!blok || !hedef) return;
    // Gün sekmesine bırakıldıysa zaman dilimi korunuyor
    const dilim = hedef.dilim ?? blok.dilim;
    await p.tasi(blok.id, hedef.gun, dilim, hedef.hedefId ?? null);
    if (dar && hedef.gun !== seciliGun) setSeciliGun(hedef.gun);
  };

  const ozet = useMemo(() => ilerleme(p.bloklar), [p.bloklar]);

  // Bloklar değişince dışarıya haber ver. Koç panelindeki öğrenci satırı
  // planı ayrı okuyor; bu olmadan panoda işaretlenen blok, satırdaki
  // "📅 3/7" rozetinde sayfa yenilenene kadar görünmezdi.
  useEffect(() => { onDegisti?.(); }, [p.bloklar]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p.etkin) return null;      // tablo yok: migration çalışmamış

  const gunTarihi = (i) => {
    const d = new Date(pazartesi);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  };

  const hucre = (gun, dilim) => (
    <Hucre key={`${gun}-${dilim}`} gun={gun} dilim={dilim} koc={koc} color={c}
      bugun={buHafta && gun === bugununGunu()}
      bloklar={hucreBloklari(p.bloklar, gun, dilim)}
      onEkle={() => setForm({ gun, dilim })}
      onBlok={(b) => (koc ? setForm({ blok: b }) : null)}
      onCevir={isaretCevir}
      onVideo={setVideo}
      onSayac={sayacCevir}
      ogrenci={ogrenci}
      testler={p.testler}
      saatFarki={p.saatFarki}
      simdi={simdi}
      dar={dar}
    />
  );

  return (
    <Card id="bolum-plan">
      <SectionTitle title={baslik} color={c.mid} acik={acik} onToggle={() => setAcik(v => !v)} />

      {acik && (
        <div ref={kapRef} style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>

          {/* Öğrenci seçici (koç) + hafta gezinme */}
          <div style={{ display: "flex", gap: BOSLUK.s, flexWrap: "wrap", alignItems: "center" }}>
            {ogrenciler && ogrenciler.length > 0 && (
              <select value={secili} onChange={e => setSecili(e.target.value)} style={{
                flex: "1 1 180px", padding: "8px 11px", borderRadius: KOSE.m,
                border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, background: "#fff",
              }}>
                {ogrenciler.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: BOSLUK.xs, flex: "1 1 240px", justifyContent: "flex-end" }}>
              <GezinmeDugmesi onClick={() => setPazartesi(h => haftaKaydir(h, -1))} etiket="‹" baslik="Önceki hafta" />
              <div style={{ textAlign: "center", minWidth: 128 }}>
                <div style={{ fontSize: YAZI.ikincil, fontWeight: 700, color: RENK.metin }}>{haftaAraligiMetni(pazartesi)}</div>
                {buHafta ? (
                  <div style={{ fontSize: YAZI.mikro, color: c.mid, fontWeight: 600 }}>bu hafta</div>
                ) : (
                  <button onClick={() => setPazartesi(haftaBasi())} style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontSize: YAZI.mikro, color: c.mid, fontWeight: 600,
                  }}>bu haftaya dön</button>
                )}
              </div>
              <GezinmeDugmesi onClick={() => setPazartesi(h => haftaKaydir(h, 1))} etiket="›" baslik="Sonraki hafta" />
            </div>
          </div>

          {p.yukleniyor ? (
            <div style={{ fontSize: YAZI.ikincil, color: RENK.metinCokSoluk, padding: "18px 0", textAlign: "center" }}>
              Yükleniyor...
            </div>
          ) : !p.plan ? (
            <BosPlan koc={koc} color={c} buHafta={buHafta} onOlustur={p.olustur} />
          ) : (
            <>
              {/* İlerleme */}
              {ozet.toplam > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: BOSLUK.s, flexWrap: "wrap", fontSize: YAZI.kucuk, color: RENK.metinIkincil, marginBottom: 5 }}>
                    <span>
                      <b style={{ color: c.text }}>{ozet.yapilan}/{ozet.toplam}</b> blok yapıldı
                      {ozet.dakika > 0 && <> · planlanan {sureMetni(ozet.dakika)}</>}
                      {ozet.calisilanDk > 0 && <> · çalışılan <b style={{ color: c.text }}>{sureMetni(ozet.calisilanDk)}</b></>}
                      {/* Sayaçla ölçülen ayrıca: koç bildirilen süreyle
                          ölçüleni karşılaştırabilsin. */}
                      {ozet.sayacDk > 0 && <> (sayaçla {sureMetni(ozet.sayacDk)})</>}
                    </span>
                    {ozet.devreden > 0 && (
                      <span style={{ color: RENK.uyari.metin, fontWeight: 600 }}>
                        ↻ {ozet.devreden} blok geçen haftadan devretti
                      </span>
                    )}
                  </div>
                  <div style={{ height: 6, borderRadius: KOSE.tam, background: RENK.cizgi, overflow: "hidden" }}>
                    <div style={{ width: `${ozet.oran}%`, height: "100%", background: c.mid, transition: "width .4s ease" }} />
                  </div>
                </div>
              )}

              {/* Algılayıcılar herkese veriliyor; öğrencide bloklar
                  disabled olduğu için sürükleme başlamıyor. "undefined"
                  geçmek dnd-kit'in VARSAYILAN algılayıcılarını açardı. */}
              <DndContext sensors={sensors}
                onDragStart={({ active }) => setSurukle(p.bloklar.find(b => b.id === active.id) ?? null)}
                onDragCancel={() => setSurukle(null)}
                onDragEnd={bitisHandler}>

                {dar ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
                      {GUN_KISA.map((g, i) => (
                        <GunSekmesi key={g} gun={i} etiket={g} tarih={gunTarihi(i)}
                          secili={seciliGun === i} bugun={buHafta && i === bugununGunu()}
                          adet={p.bloklar.filter(b => b.gun === i).length}
                          yapilan={p.bloklar.filter(b => b.gun === i && b.yapildi).length}
                          koc={koc} color={c} onClick={() => setSeciliGun(i)} />
                      ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
                      {DILIMLER.map(d => (
                        <div key={d.kod}>
                          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinCokSoluk, letterSpacing: 0.3, marginBottom: 4 }}>
                            {d.ad.toLocaleUpperCase("tr")}
                          </div>
                          {hucre(seciliGun, d.kod)}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "64px repeat(7, minmax(96px, 1fr))", gap: 4, minWidth: 64 + 7 * 100 }}>
                      <div />
                      {GUNLER.map((g, i) => {
                        const bugun = buHafta && i === bugununGunu();
                        return (
                          <div key={g} style={{
                            textAlign: "center", padding: "4px 2px", borderRadius: KOSE.s,
                            background: bugun ? c.light : "transparent",
                          }}>
                            <div style={{ fontSize: YAZI.kucuk, fontWeight: 700, color: bugun ? c.text : RENK.metin }}>{GUN_KISA[i]}</div>
                            <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik }}>{gunTarihi(i)}</div>
                          </div>
                        );
                      })}
                      {DILIMLER.map(d => (
                        <Satir key={d.kod}>
                          <div style={{
                            fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinCokSoluk,
                            display: "flex", alignItems: "flex-start", paddingTop: 8, lineHeight: 1.3,
                          }}>{d.ad}</div>
                          {GUNLER.map((_, i) => hucre(i, d.kod))}
                        </Satir>
                      ))}
                    </div>
                  </div>
                )}

                <DragOverlay dropAnimation={null}>
                  {surukle ? <BlokGovde blok={surukle} koc color={c} surukleniyor testler={p.testler} /> : null}
                </DragOverlay>
              </DndContext>

              {koc && (
                <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
                  Blokları sürükleyerek taşıyın (telefonda basılı tutup sürükleyin). Bir bloğa
                  tıklayınca düzenlenir; hücredeki <b>+</b> yeni blok ekler.
                  {dar && " Başka güne taşımak için bloğu üstteki gün sekmesine bırakın."}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {form && (
        <BlokFormu studentId={studentId} color={c}
          blok={form.blok ?? null} gun={form.gun} dilim={form.dilim}
          onKaydet={(alanlar) => (form.blok ? p.blokGuncelle(form.blok.id, alanlar) : p.blokEkle(alanlar))}
          onSil={form.blok ? () => p.blokSil(form.blok.id) : null}
          onKapat={() => setForm(null)} />
      )}

      {tamamlanan && (
        <TamamlaDiyalogu
          blok={p.bloklar.find(b => b.id === tamamlanan.id) ?? tamamlanan}
          test={p.testler[tamamlanan.id] ?? null}
          saatFarki={p.saatFarki} color={c}
          onKaydet={(alanlar) => p.tamamla(tamamlanan.id, alanlar)}
          onKapat={() => setTamamlanan(null)} />
      )}

      {video && (
        <Modal title={video.baslik} onClose={() => setVideo(null)} maxWidth={760}>
          <VideoOynatici adres={video.video_url} color={c} />
          {ogrenci && (
            <button onClick={() => {
              const b = video; setVideo(null);
              if (b.yapildi) p.tamamla(b.id, { yapildi: false }); else setTamamlanan(b);
            }} style={{
              marginTop: BOSLUK.m, width: "100%", padding: "11px 0", borderRadius: KOSE.m, border: "none",
              background: video.yapildi ? RENK.yuzey : c.bg, color: video.yapildi ? RENK.metinSoluk : "#fff",
              fontSize: YAZI.govde, fontWeight: 700, cursor: "pointer",
            }}>{video.yapildi ? "İzlenmedi olarak işaretle" : "✓ İzledim"}</button>
          )}
        </Modal>
      )}
    </Card>
  );
}

// Grid içinde satırı gruplamak için: CSS grid çocuklarını düz sırada
// istiyor, sarmalayıcı div eklemek ızgarayı bozardı.
const Satir = ({ children }) => <>{children}</>;

function GezinmeDugmesi({ onClick, etiket, baslik }) {
  return (
    <button onClick={onClick} title={baslik} aria-label={baslik} style={{
      width: 32, height: 32, borderRadius: KOSE.m, flexShrink: 0,
      border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
      fontSize: 18, lineHeight: 1, color: RENK.metinSoluk, cursor: "pointer",
    }}>{etiket}</button>
  );
}

function BosPlan({ koc, color: c, buHafta, onOlustur }) {
  const [islemde, setIslemde] = useState(false);
  const calistir = async (kopyala) => {
    setIslemde(true);
    await onOlustur(kopyala);
    setIslemde(false);
  };

  if (!koc) {
    return (
      <div style={{ fontSize: YAZI.ikincil, color: RENK.metinCokSoluk, padding: "18px 0", textAlign: "center", lineHeight: 1.6 }}>
        Bu hafta için henüz bir çalışma planı hazırlanmadı.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s, padding: `${BOSLUK.s}px 0` }}>
      <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, lineHeight: 1.55 }}>
        Bu hafta için plan yok. Son planı kopyalarsanız blokları, işaretleri sıfırlanmış
        olarak gelir; geçen hafta yapılmayanlar ayrıca işaretlenir. Önceki plan yoksa boş başlar.
      </div>
      <div style={{ display: "flex", gap: BOSLUK.s, flexWrap: "wrap" }}>
        <button onClick={() => calistir(true)} disabled={islemde} style={{
          flex: "1 1 200px", padding: "11px 0", borderRadius: KOSE.m, border: "none",
          background: c.bg, color: "#fff", fontSize: YAZI.govde, fontWeight: 700,
          cursor: islemde ? "default" : "pointer", opacity: islemde ? 0.7 : 1,
        }}>{islemde ? "Hazırlanıyor..." : "↻ Son plandan kopyala"}</button>
        <button onClick={() => calistir(false)} disabled={islemde} style={{
          flex: "1 1 140px", padding: "11px 0", borderRadius: KOSE.m,
          border: `1.5px dashed ${c.mid}`, background: "transparent",
          color: c.mid, fontSize: YAZI.govde, fontWeight: 600, cursor: "pointer",
        }}>Boş başla</button>
      </div>
    </div>
  );
}

function GunSekmesi({ gun, etiket, tarih, secili, bugun, adet, yapilan, koc, color: c, onClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gun:${gun}`, data: { gun, dilim: null }, disabled: !koc });
  return (
    <button ref={setNodeRef} onClick={onClick} style={{
      padding: "6px 0", borderRadius: KOSE.m, cursor: "pointer", minWidth: 0,
      border: `1.5px solid ${isOver ? c.mid : secili ? c.bg : RENK.cizgi}`,
      background: isOver ? c.light : secili ? c.bg : bugun ? c.light : "#fff",
      color: secili ? "#fff" : RENK.metin,
    }}>
      <div style={{ fontSize: YAZI.kucuk, fontWeight: 700 }}>{etiket}</div>
      <div style={{ fontSize: 9, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden" }}>{tarih}</div>
      {adet > 0 && (
        <div style={{ fontSize: 9, fontWeight: 700, marginTop: 1, opacity: 0.9 }}>
          {yapilan === adet ? "✓" : `${yapilan}/${adet}`}
        </div>
      )}
    </button>
  );
}

function Hucre({ gun, dilim, bloklar, koc, bugun, color: c, onEkle, onBlok, onCevir, onVideo, onSayac,
  ogrenci, testler, saatFarki, simdi, dar }) {
  const { setNodeRef, isOver } = useDroppable({ id: `hucre:${gun}:${dilim}`, data: { gun, dilim }, disabled: !koc });
  return (
    <div ref={setNodeRef} style={{
      minHeight: dar ? 44 : 72, padding: 4, borderRadius: KOSE.m,
      display: "flex", flexDirection: "column", gap: 4,
      background: isOver ? c.light : bugun ? "#fcfaf5" : RENK.yuzey,
      border: `1.5px ${isOver ? "solid" : "dashed"} ${isOver ? c.mid : "transparent"}`,
      transition: "background .12s ease",
    }}>
      {bloklar.map(b => (
        <BlokKart key={b.id} blok={b} koc={koc} color={c}
          ogrenci={ogrenci} test={testler?.[b.id]} saatFarki={saatFarki} simdi={simdi}
          onClick={() => onBlok(b)} onCevir={() => onCevir(b)} onVideo={() => onVideo(b)}
          onSayac={() => onSayac(b)} />
      ))}
      {koc && (
        <button onClick={onEkle} title="Blok ekle" style={{
          marginTop: "auto", padding: bloklar.length ? "2px 0" : "8px 0", borderRadius: KOSE.s,
          border: "none", background: "transparent", color: RENK.metinSilik,
          fontSize: bloklar.length ? 14 : 18, cursor: "pointer", lineHeight: 1,
        }}>+</button>
      )}
    </div>
  );
}

function BlokKart({ blok, koc, color: c, onClick, onCevir, onVideo, onSayac, ogrenci, test, saatFarki, simdi }) {
  const drag = useDraggable({ id: blok.id, data: { blok }, disabled: !koc });
  // Blok aynı zamanda bırakma hedefi: üstüne bırakılan blok ONUN ÖNÜNE girer
  const drop = useDroppable({ id: `blok:${blok.id}`, data: { gun: blok.gun, dilim: blok.dilim, hedefId: blok.id }, disabled: !koc });
  const ref = (el) => { drag.setNodeRef(el); drop.setNodeRef(el); };

  return (
    <div ref={ref} {...(koc ? drag.listeners : {})} {...(koc ? drag.attributes : {})}
      style={{
        opacity: drag.isDragging ? 0.35 : 1,
        borderTop: drop.isOver && !drag.isDragging ? `3px solid ${c.mid}` : "3px solid transparent",
        touchAction: koc ? "manipulation" : undefined,
      }}>
      <BlokGovde blok={blok} koc={koc} color={c} onClick={onClick} onCevir={onCevir} onVideo={onVideo}
        onSayac={onSayac} ogrenci={ogrenci} test={test} saatFarki={saatFarki} simdi={simdi} />
    </div>
  );
}

function BlokGovde({ blok: b, koc, color: c, onClick, onCevir, onVideo, onSayac,
  ogrenci, test, saatFarki = 0, simdi, surukleniyor }) {
  const t = TURLER[b.tur] ?? TURLER.serbest;
  const alt = blokAltBilgi(b);
  const saat = saatAraligi(b);
  const acik = !!b.sayac_baslangic;
  const gecen = acik ? sayacGecen(b.sayac_baslangic, saatFarki, simdi) : 0;
  const olculen = (b.sayacla_olculen_dk || 0) + gecen;

  // Etkileşimli düğmeler sürükleme algılayıcısını BAŞLATMAMALI; yoksa
  // ▶'ye ya da sayaca basmak bazen düğmeyi değil bloğu tutuyordu.
  const dugmeKorumasi = {
    onPointerDown: e => e.stopPropagation(),
    onTouchStart:  e => e.stopPropagation(),
  };

  return (
    <div onClick={koc ? onClick : undefined} style={{
      background: b.yapildi ? RENK.basari.zemin : acik ? "#FFFBEA" : "#fff",
      border: `1px solid ${acik ? "#F2D27A" : b.devreden && !b.yapildi ? "#F0D9A8" : RENK.cizgi}`,
      borderLeft: `3px solid ${b.yapildi ? RENK.basari.metin : acik ? "#E0A526" : b.devreden ? "#EF9F27" : c.mid}`,
      borderRadius: KOSE.s, padding: "5px 6px",
      cursor: koc ? (surukleniyor ? "grabbing" : "grab") : "default",
      boxShadow: surukleniyor ? "0 8px 20px rgba(0,0,0,.18)" : "none",
      width: surukleniyor ? 180 : undefined,
    }}>
      <div style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
        {ogrenci ? (
          <input type="checkbox" checked={!!b.yapildi} aria-label="Yaptım"
            onChange={onCevir} onClick={e => e.stopPropagation()} {...dugmeKorumasi}
            style={{ marginTop: 1, width: 15, height: 15, flexShrink: 0, cursor: "pointer", accentColor: c.bg }} />
        ) : !koc && b.yapildi ? (
          <span aria-label="Yapıldı" style={{ fontSize: 11, color: RENK.basari.metin, fontWeight: 800, flexShrink: 0 }}>✓</span>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          {saat && (
            <div style={{ fontSize: 9.5, fontWeight: 700, color: c.text, marginBottom: 1 }}>🕘 {saat}</div>
          )}
          <div style={{
            fontSize: YAZI.kucuk, fontWeight: 700, lineHeight: 1.3,
            color: b.yapildi ? RENK.metinSoluk : RENK.metin,
            textDecoration: b.yapildi && ogrenci ? "line-through" : "none",
            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            wordBreak: "break-word",
          }}>
            <span aria-hidden="true">{t.simge} </span>{b.baslik}
          </div>
          {alt && (
            <div style={{ fontSize: 9.5, color: RENK.metinSoluk, marginTop: 1, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {alt}
            </div>
          )}

          {/* Sonuç şeridi: çalışılan süre ve bağlı test. Koç ve veli bloğa
              bakınca "yapıldı"nın ne demek olduğunu görsün — işaretin
              arkasında 5 dakika mı, 50 soru mu var. */}
          {!surukleniyor && (b.calisilan_dk != null || test) && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
              {b.calisilan_dk != null && (
                <span title={b.sayacla_olculen_dk ? `Sayaçla ölçülen: ${sureMetni(b.sayacla_olculen_dk)}` : "Öğrencinin bildirdiği süre"}
                  style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: KOSE.tam, background: c.light, color: c.text }}>
                  ⏱ {sureMetni(b.calisilan_dk) || "0 dk"}{b.sayacla_olculen_dk > 0 ? " ⚲" : ""}
                </span>
              )}
              {test && (
                <span title={test.yanlis_count != null
                    ? `${test.question_count} soru · ${test.correct_count} doğru · ${test.yanlis_count} yanlış`
                    : `${test.question_count} soru · ${test.correct_count} doğru`}
                  style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: KOSE.tam, background: RENK.mor.zemin, color: RENK.mor.metin }}>
                  📝 {test.correct_count}/{test.question_count}
                  {test.yanlis_count != null ? ` · ${Math.round((test.correct_count - test.yanlis_count / 4) * 100) / 100} net` : ""}
                </span>
              )}
            </div>
          )}

          {(b.devreden && !b.yapildi) && (
            <div style={{ fontSize: 9, fontWeight: 700, color: RENK.uyari.metin, marginTop: 2 }}>↻ geçen hafta yapılmadı</div>
          )}
          {b.aciklama && !surukleniyor && (
            <div style={{ fontSize: 9.5, color: RENK.metinSilik, marginTop: 2, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {b.aciklama}
            </div>
          )}
        </div>
      </div>

      {!surukleniyor && (
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {b.tur === "video" && b.video_url && (
            <button onClick={e => { e.stopPropagation(); onVideo?.(); }} {...dugmeKorumasi} style={{
              flex: 1, padding: "3px 0", borderRadius: KOSE.s, border: "none",
              background: c.light, color: c.text, fontSize: 10, fontWeight: 700, cursor: "pointer",
            }}>▶ İzle</button>
          )}
          {/* Sayaç yalnızca öğrencide ve yapılmamış blokta. Veli ve koç
              açık sayacı GÖRÜYOR (kart sarı, süre akıyor) ama kontrol edemiyor. */}
          {ogrenci && !b.yapildi && (
            <button onClick={e => { e.stopPropagation(); onSayac?.(); }} {...dugmeKorumasi}
              aria-label={acik ? "Sayacı durdur" : "Sayacı başlat"} style={{
                flex: 1, padding: "3px 0", borderRadius: KOSE.s, cursor: "pointer",
                border: acik ? "none" : `1px solid ${RENK.cizgi}`,
                background: acik ? "#E0A526" : "#fff", color: acik ? "#fff" : RENK.metinSoluk,
                fontSize: 10, fontWeight: 700,
              }}>{acik ? `⏸ ${olculen} dk` : olculen > 0 ? `⏱ ${olculen} dk · sürdür` : "⏱ Başla"}</button>
          )}
          {!ogrenci && acik && (
            <span style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#9A6B00", padding: "3px 0" }}>
              ⏱ şu an çalışıyor · {olculen} dk
            </span>
          )}
        </div>
      )}
    </div>
  );
}
