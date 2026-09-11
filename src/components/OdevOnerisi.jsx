import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { useTopics } from "../lib/TopicsContext";
import { oneriUret, SEBEP_ETIKET, SAYFA_DILIMI, RED_BEKLEME_GUN } from "../lib/odevOnerisi";
import { sadelestir } from "../lib/konuEslestir";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Ödev önerisi.
//
// Kitaplıktaki bölümleri öğrencinin zayıf olduğu konularla eşleştirip
// koça bir liste sunuyor. Koç seçtiklerini onaylıyor, görevler o zaman
// oluşuyor.
//
// ── ONAYSIZ GÖREV AÇILMIYOR ─────────────────────────────────────
// Puanlama az veriyle çalışıyor, konu eşleştirmesi bulanık. Doğrudan
// görev açsaydık yanlış eşleşmiş bir bölümden ödev giden öğrenci
// yanlış sayfaları çözer, koç bunu iş bittikten sonra fark ederdi.
//
// ── HER SATIR GEREKÇESİNİ TAŞIYOR ───────────────────────────────
// "Şunu ata" demek yetmiyor; koçun katılıp katılmayacağına karar
// verebilmesi için nedenini görmesi gerekiyor. Gerekçe, ölçüme
// dayanıyorsa kaç soruda kaç doğru olduğunu yazıyor; ölçüm yoksa
// bunu da açıkça söylüyor.
export default function OdevOnerisi({ userId, students = [], color: c, onAtandi }) {
  const { sinavTurleri, examSubjectsOf, topicsOf } = useTopics();

  const [acik,   setAcik]   = useState(false);
  const [secili, setSecili] = useState(students[0]?.id ?? "");
  const [adet,   setAdet]   = useState(5);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [islemde, setIslemde] = useState(false);
  const [kaynak,  setKaynak]  = useState({ bolumler: [], bankalar: [] });
  const [veri,    setVeri]    = useState({ tests: [], tasks: [] });
  // bolumId -> { karar, created_at }. Koçun daha önce ne dediği.
  const [kararlar, setKararlar] = useState({});
  const [oneriler, setOneriler] = useState(null);   // null = henüz üretilmedi
  const [secimler, setSecimler] = useState({});     // anahtar -> bool
  const [sonuc,   setSonuc]   = useState(null);

  // Öğrenci listesi sonradan dolduğu için ilk seçimi burada bağlıyoruz
  useEffect(() => {
    if (!secili && students.length > 0) setSecili(students[0].id);
  }, [students, secili]);

  // Müfredat sırası: aynı puandaki konularda temel olanı öne almak için
  const konuSirasi = useMemo(() => {
    const m = {};
    sinavTurleri.forEach(tur => {
      examSubjectsOf(tur).forEach(ders => {
        topicsOf(tur, ders).forEach((konu, i) => {
          m[`${sadelestir(ders)}||${sadelestir(konu)}`] = i;
        });
      });
    });
    return m;
  }, [sinavTurleri, examSubjectsOf, topicsOf]);

  const kaynaklariYukle = useCallback(async () => {
    const [{ veri: bankalar }, { veri: bolumler }] = await Promise.all([
      calistir(supabase.from("soru_bankalari").select("*"), "Kaynaklar", { sessiz: true }),
      calistir(supabase.from("soru_bankasi_bolumleri").select("*").not("konu", "is", null),
        "Kaynak bolumleri", { sessiz: true }),
    ]);
    setKaynak({ bankalar: bankalar ?? [], bolumler: bolumler ?? [] });
  }, []);

  useEffect(() => { if (acik) kaynaklariYukle(); }, [acik, kaynaklariYukle]);

  // Öğrencinin TÜM testleri gerekiyor, son haftanınkiler değil: bir
  // konudaki doğruluk aylar içinde birikiyor ve dar bir pencere
  // ölçümü örneklem eşiğinin altına düşürüp konuyu "verisi yok"
  // gösterirdi.
  const ogrenciVerisi = useCallback(async (id) => {
    if (!id) return;
    setYukleniyor(true);
    const [{ veri: tests }, { veri: tasks }, { veri: kararSatir }] = await Promise.all([
      calistir(supabase.from("test_sessions").select("*").eq("student_id", id),
        "Ogrenci testleri", { sessiz: true }),
      calistir(supabase.from("tasks").select("*").eq("student_id", id),
        "Ogrenci gorevleri", { sessiz: true }),
      // Tablo yoksa (migration çalışmadıysa) sessizce boş geçiyor:
      // öneri motoru kararlar olmadan da çalışır, yalnızca öğrenmez.
      calistir(supabase.from("oneri_kararlari").select("*").eq("student_id", id),
        "Oneri kararlari", { sessiz: true }),
    ]);
    setVeri({ tests: tests ?? [], tasks: tasks ?? [] });
    setKararlar(Object.fromEntries((kararSatir ?? []).map(k => [k.bolum_id, k])));
    setYukleniyor(false);
  }, []);

  useEffect(() => {
    if (acik && secili) { setOneriler(null); setSonuc(null); ogrenciVerisi(secili); }
  }, [acik, secili, ogrenciVerisi]);

  const uret = () => {
    const liste = oneriUret({
      bolumler: kaynak.bolumler, bankalar: kaynak.bankalar,
      tests: veri.tests, tasks: veri.tasks,
      konuSirasi, kararlar, adet,
    });
    setOneriler(liste);
    // Hepsi baştan seçili: koçun işi onaylamak, tek tek işaretlemek değil.
    setSecimler(Object.fromEntries(liste.map(o => [o.anahtar, true])));
    setSonuc(null);
  };

  const guncelle = (anahtar, alan, deger) =>
    setOneriler(l => l.map(o => (o.anahtar === anahtar ? { ...o, [alan]: deger } : o)));

  const secilenler = (oneriler ?? []).filter(o => secimler[o.anahtar]);

  const ata = async () => {
    if (secilenler.length === 0) return;
    setIslemde(true);
    const elenenler = (oneriler ?? []).filter(o => !secimler[o.anahtar]);
    const satirlar = secilenler.map(o => ({
      student_id: secili,
      teacher_id: userId,
      title:   o.baslik,
      subject: o.ders || null,
      topic:   o.konu || null,
      // Kaynağın adı ve sayfası açıklamaya giriyor: öğrenci görevi
      // açtığında hangi kitabın neresini çözeceğini görmeli.
      description: [o.bankaAdi, o.sayfaMetni].filter(Boolean).join(" · ") || null,
      due_date: o.tarih || null,
    }));
    const { hata } = await calistir(
      supabase.from("tasks").insert(satirlar), "Onerilen gorevleri atama"
    );
    if (hata) { setIslemde(false); return; }

    // ── KARARI KAYDET ─────────────────────────────────────────
    // Atananlar "kabul", işareti kaldırılanlar "red". Red olmadan
    // koç aynı öneriyi her hafta yeniden elemek zorunda kalıyordu.
    //
    // Kayıt BAŞARISIZ OLURSA görev atamasını geri almıyoruz: görevler
    // asıl iş, karar kaydı öğrenme kolaylığı. Tabloyu henüz
    // oluşturmamış bir kurulumda da akış çalışmaya devam etmeli.
    const kararSatirlari = [
      ...secilenler.map(o => ({ student_id: secili, bolum_id: o.bolumId, karar: "kabul", karar_veren: userId })),
      ...elenenler.map(o => ({ student_id: secili, bolum_id: o.bolumId, karar: "red", karar_veren: userId })),
    ].filter(k => k.bolum_id);

    if (kararSatirlari.length > 0) {
      await calistir(
        supabase.from("oneri_kararlari").upsert(kararSatirlari, { onConflict: "student_id,bolum_id" }),
        "Oneri karari kaydetme", { sessiz: true }
      );
    }

    setIslemde(false);
    setSonuc(
      `${satirlar.length} görev atandı.` +
      (elenenler.length > 0 ? ` Elediğiniz ${elenenler.length} öneri ${RED_BEKLEME_GUN} gün boyunca tekrar çıkmayacak.` : "")
    );
    setOneriler(null);
    onAtandi?.();
    ogrenciVerisi(secili);      // yeni görevler ve kararlar yansısın
  };

  const girdiStil = {
    padding: "7px 10px", borderRadius: KOSE.m,
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, boxSizing: "border-box",
  };

  const bolumSayisi = kaynak.bolumler.length;

  return (
    <Card id="bolum-oneri">
      <SectionTitle title="Ödev Öner" color={c.mid}
        acik={acik} onToggle={() => setAcik(v => !v)} />

      {!acik ? null : students.length === 0 ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinCokSoluk, padding: "12px 0", textAlign: "center" }}>
          Öğrenci yok.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>

          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <select value={secili} onChange={e => setSecili(e.target.value)}
              style={{ ...girdiStil, flex: 1, minWidth: 0 }}>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <select value={adet} onChange={e => setAdet(Number(e.target.value))}
              style={{ ...girdiStil, width: 96, flexShrink: 0 }}>
              {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} ödev</option>)}
            </select>
          </div>

          {/* Kaynak yoksa motorun önerecek bir şeyi yok — bunu açıkça
              söylüyoruz, boş liste gösterip kafa karıştırmıyoruz. */}
          {bolumSayisi === 0 ? (
            <div style={{
              fontSize: YAZI.ikincil, color: RENK.uyari.metin, background: RENK.uyari.zemin,
              padding: `${BOSLUK.m}px`, borderRadius: KOSE.m, lineHeight: 1.55,
            }}>
              Öneri üretebilmek için önce <b>Soru Bankası</b>'na bir kitap ekleyip
              içindekilerini aktarmanız gerekiyor. Öneriler o kitapların
              bölümlerinden çıkıyor.
            </div>
          ) : (
            <>
              <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik }}>
                {bolumSayisi} bölüm, {kaynak.bankalar.length} kaynak taranıyor
                {oneriler?.redEdilen > 0 &&
                  ` · daha önce elediğiniz ${oneriler.redEdilen} bölüm beklemede`}
              </div>

              {sonuc && (
                <div style={{
                  fontSize: YAZI.ikincil, color: RENK.basari.metin, background: RENK.basari.zemin,
                  padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.m,
                }}>{sonuc}</div>
              )}

              {oneriler === null ? (
                <button onClick={uret} disabled={yukleniyor} style={{
                  padding: "11px 0", borderRadius: KOSE.m, border: "none",
                  background: yukleniyor ? "#ddd" : c.bg, color: "#fff",
                  fontSize: YAZI.govde, fontWeight: 700,
                  cursor: yukleniyor ? "default" : "pointer",
                }}>{yukleniyor ? "Veri okunuyor..." : "Öneri üret"}</button>
              ) : oneriler.length === 0 ? (
                <div style={{
                  fontSize: YAZI.ikincil, color: RENK.metinIkincil, background: RENK.yuzey,
                  padding: BOSLUK.m, borderRadius: KOSE.m, lineHeight: 1.55,
                }}>
                  Bu öğrenci için önerilecek bölüm çıkmadı. Kitaplıktaki konular
                  öğrencinin çalıştığı derslerle örtüşmüyor ya da hepsine yakın
                  zamanda görev verilmiş olabilir.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
                  {oneriler.map(o => {
                    const e = SEBEP_ETIKET[o.sebep] ?? SEBEP_ETIKET.bos;
                    const isaretli = !!secimler[o.anahtar];
                    return (
                      <div key={o.anahtar} style={{
                        display: "flex", gap: BOSLUK.s, alignItems: "flex-start",
                        padding: `${BOSLUK.s}px ${BOSLUK.m}px`, borderRadius: KOSE.m,
                        background: isaretli ? RENK.yuzey : "#fff",
                        border: `1px solid ${isaretli ? RENK.cizgi : "#f7f5f2"}`,
                        opacity: isaretli ? 1 : 0.6,
                      }}>
                        <input type="checkbox" checked={isaretli}
                          onChange={e2 => setSecimler(s => ({ ...s, [o.anahtar]: e2.target.checked }))}
                          style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16, cursor: "pointer" }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                            <span style={{
                              fontSize: YAZI.mikro, fontWeight: 700, padding: "1px 7px", borderRadius: KOSE.tam,
                              background: e.zemin, color: e.renk,
                            }}>{e.ad}</span>
                            <span style={{ fontSize: YAZI.ikincil, fontWeight: 700, color: RENK.metin }}>
                              {o.konu}
                            </span>
                            {o.ders && (
                              <span style={{ fontSize: YAZI.mikro, color: RENK.metinSilik }}>{o.ders}</span>
                            )}
                          </div>

                          <div style={{ fontSize: YAZI.kucuk, color: RENK.metinIkincil, lineHeight: 1.45 }}>
                            {o.bankaAdi} · {o.bolumBasligi}
                          </div>
                          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk, marginTop: 2, lineHeight: 1.45 }}>
                            {o.gerekce}
                            {o.dilimSayisi > 1 && ` · bölüm ${o.dilimSayisi} parçaya bölündü, ilki öneriliyor`}
                          </div>

                          <div style={{ display: "flex", gap: BOSLUK.xs, marginTop: 6, flexWrap: "wrap" }}>
                            <input type="number" min="1" value={o.sayfaBas ?? ""} title="Başlangıç sayfası"
                              onChange={e2 => guncelle(o.anahtar, "sayfaBas", e2.target.value ? Number(e2.target.value) : null)}
                              style={{ ...girdiStil, width: 72, padding: "5px 8px", fontSize: YAZI.kucuk }} />
                            <input type="number" min="1" value={o.sayfaSon ?? ""} title="Bitiş sayfası"
                              onChange={e2 => guncelle(o.anahtar, "sayfaSon", e2.target.value ? Number(e2.target.value) : null)}
                              style={{ ...girdiStil, width: 72, padding: "5px 8px", fontSize: YAZI.kucuk }} />
                            <input type="date" value={o.tarih}
                              onChange={e2 => guncelle(o.anahtar, "tarih", e2.target.value)}
                              style={{ ...girdiStil, flex: "1 1 130px", padding: "5px 8px", fontSize: YAZI.kucuk }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ display: "flex", gap: BOSLUK.s }}>
                    <button onClick={ata} disabled={islemde || secilenler.length === 0} style={{
                      flex: 1, padding: "11px 0", borderRadius: KOSE.m, border: "none",
                      background: secilenler.length > 0 ? c.bg : "#ddd", color: "#fff",
                      fontSize: YAZI.govde, fontWeight: 700,
                      cursor: secilenler.length > 0 ? "pointer" : "not-allowed",
                    }}>
                      {islemde ? "Atanıyor..." : `${secilenler.length} görevi ata`}
                    </button>
                    <button onClick={() => setOneriler(null)} style={{
                      padding: "11px 14px", borderRadius: KOSE.m,
                      border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
                      color: RENK.metinSoluk, fontSize: YAZI.ikincil, cursor: "pointer",
                    }}>Vazgeç</button>
                  </div>

                  <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
                    Sayfa aralığı ve tarih düzenlenebilir. Uzun bölümler en fazla
                    {" "}{SAYFA_DILIMI} sayfaya bölünüyor.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
