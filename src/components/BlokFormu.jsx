import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { useTopics } from "../lib/TopicsContext";
import { GUNLER, DILIMLER, TURLER, videoCoz, dilimTahmini, saatDakika, saatKisalt } from "../lib/calismaPlani";
import { saatEkle } from "../lib/lessonHelpers";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Plan bloğu ekleme / düzenleme.
//
// ── GÜN VE DİLİM FORMDA DA VAR ──────────────────────────────────
// Sürükle-bırak asıl yol ama tek yol olmamalı: dokunmatik ekranda
// basılı tutup sürüklemek her zaman rahat değil, klavyeyle ya da ekran
// okuyucuyla gezinen biri de sürükleyemez. Blok yeri formdan da
// değiştirilebiliyor.
//
// ── BAŞLIK KENDİLİĞİNDEN DOLUYOR, AMA EZİLMİYOR ─────────────────
// Konu/bölüm seçilince başlık öneriliyor. Koç başlığı elle değiştirdiği
// anda öneri durur; sonradan konu değiştirmek yazdığını silmesin.
const bosForm = (gun, dilim) => ({
  tur: "konu", gun, dilim,
  baslik: "", ders: "", konu: "", sure_dk: "",
  exam_type: "",
  banka_id: "", bolum_id: "", sayfa_bas: "", sayfa_son: "",
  video_url: "", aciklama: "",
  baslangic_saati: "", bitis_saati: "",
});

export default function BlokFormu({ studentId, blok = null, gun = 0, dilim = "aksam",
  color: c, onKaydet, onSil, onKapat }) {
  const { sinavTurleri, examSubjectsOf, topicsOf, dersinTuru } = useTopics();

  const [form, setForm] = useState(() => {
    if (!blok) return { ...bosForm(gun, dilim), exam_type: sinavTurleri[0] ?? "TYT" };
    return {
      ...bosForm(blok.gun, blok.dilim),
      ...Object.fromEntries(Object.entries(blok).map(([k, v]) => [k, v ?? ""])),
      exam_type: dersinTuru?.(blok.ders, blok.konu) ?? sinavTurleri[0] ?? "TYT",
      // DB "18:00:00" veriyor; input[type=time] saniyeli değerde BOŞ açılıyor
      // ve koç saati silinmiş sanıyordu (ders planlamada da aynı tuzak vardı).
      baslangic_saati: saatKisalt(blok.baslangic_saati),
      bitis_saati: saatKisalt(blok.bitis_saati),
    };
  });
  // Bitiş saati kendiliğinden mi dolduruldu? Koç elle yazdıysa artık
  // dokunulmuyor (ders planlamadaki "1 saat önerisi" ile aynı kural).
  const [bitisOto, setBitisOto] = useState(!blok?.bitis_saati);
  const [baslikElle, setBaslikElle] = useState(!!blok);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kaynak, setKaynak] = useState({ bankalar: [], bolumler: [] });

  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Başlangıç saati girilince: zaman dilimi saate göre seçiliyor ve
  // bitiş, süre biliniyorsa başlangıç + süre olarak öneriliyor. Böylece
  // 19:00'a konan blok "sabah" hücresinde kalmıyor.
  const baslangicDegisti = (saat) => setForm(f => {
    const dilimYeni = dilimTahmini(saat) ?? f.dilim;
    const sure = Number(f.sure_dk);
    const bitis = bitisOto && saat && sure > 0 ? saatEkle(saat, sure) : f.bitis_saati;
    return { ...f, baslangic_saati: saat, dilim: dilimYeni, bitis_saati: bitis };
  });

  const sureDegisti = (v) => setForm(f => {
    const sure = Number(v);
    const bitis = bitisOto && f.baslangic_saati && sure > 0 ? saatEkle(f.baslangic_saati, sure) : f.bitis_saati;
    return { ...f, sure_dk: v, bitis_saati: bitis };
  });

  const saatGecerli = !form.baslangic_saati || !form.bitis_saati
    || saatDakika(form.bitis_saati) > saatDakika(form.baslangic_saati);

  // Kaynaklar yalnızca "Soru bankası" türü seçilince okunuyor.
  useEffect(() => {
    if (form.tur !== "kaynak" || kaynak.bankalar.length) return;
    (async () => {
      const [{ veri: bankalar }, { veri: bolumler }, { veri: atamalar }] = await Promise.all([
        calistir(supabase.from("soru_bankalari").select("id, ad, ders, sinav_turu"), "Kaynaklar", { sessiz: true }),
        calistir(supabase.from("soru_bankasi_bolumleri").select("id, banka_id, sira, baslik, konu, sayfa_bas, sayfa_son").order("sira"), "Bolumler", { sessiz: true }),
        calistir(supabase.from("soru_bankasi_atamalari").select("banka_id, student_id"), "Kaynak atamalari", { sessiz: true }),
      ]);
      // Öğrencide olmayan kitaptan blok çıkmasın: tanımlaması olan kitap
      // yalnızca tanımlandığı öğrencilere, tanımlaması hiç olmayan kitap
      // herkese (Ödev Öner'deki kuralın aynısı).
      const tanimli = new Map();
      (atamalar ?? []).forEach(a => {
        if (!tanimli.has(a.banka_id)) tanimli.set(a.banka_id, new Set());
        tanimli.get(a.banka_id).add(a.student_id);
      });
      const uygun = (bankalar ?? []).filter(b => {
        const k = tanimli.get(b.id);
        return !k || k.size === 0 || k.has(studentId);
      });
      setKaynak({ bankalar: uygun, bolumler: bolumler ?? [] });
    })();
  }, [form.tur, kaynak.bankalar.length, studentId]);

  const bankaBolumleri = useMemo(
    () => kaynak.bolumler.filter(b => b.banka_id === form.banka_id),
    [kaynak.bolumler, form.banka_id]
  );

  // Başlık önerisi
  useEffect(() => {
    if (baslikElle) return;
    let oneri = "";
    if (form.tur === "konu") oneri = form.konu || form.ders;
    if (form.tur === "kaynak") {
      const bol = kaynak.bolumler.find(b => b.id === form.bolum_id);
      oneri = bol?.baslik ?? "";
    }
    if (form.tur === "video") oneri = form.konu ? `${form.konu} — konu anlatımı` : "Konu videosu";
    setForm(f => (f.baslik === oneri ? f : { ...f, baslik: oneri }));
  }, [form.tur, form.konu, form.ders, form.bolum_id, kaynak.bolumler, baslikElle]);

  const bolumSec = (id) => {
    const bol = kaynak.bolumler.find(b => b.id === id);
    const banka = kaynak.bankalar.find(b => b.id === bol?.banka_id);
    setForm(f => ({
      ...f, bolum_id: id,
      sayfa_bas: bol?.sayfa_bas ?? "", sayfa_son: bol?.sayfa_son ?? "",
      konu: bol?.konu ?? "", ders: banka?.ders ?? f.ders,
    }));
  };

  const video = form.tur === "video" ? videoCoz(form.video_url) : null;

  const gecerli =
    form.baslik.trim() && saatGecerli &&
    (form.tur !== "video" || video?.tur === "youtube" || video?.tur === "vimeo" || video?.tur === "baglanti") &&
    (form.tur !== "kaynak" || form.banka_id);

  const kaydet = async () => {
    if (!gecerli) return;
    setKaydediliyor(true);
    const sayi = (v) => (v === "" || v == null ? null : Number(v));
    const { hata } = await onKaydet({
      tur: form.tur,
      gun: Number(form.gun),
      dilim: form.dilim,
      baslik: form.baslik.trim(),
      ders: form.ders || null,
      konu: form.konu || null,
      sure_dk: sayi(form.sure_dk),
      // Türe ait olmayan alanlar temizleniyor: türü "kaynak"tan "serbest"e
      // çeviren koçun eski kitap bağı blokta sessizce kalmasın.
      banka_id:  form.tur === "kaynak" ? (form.banka_id || null) : null,
      bolum_id:  form.tur === "kaynak" ? (form.bolum_id || null) : null,
      sayfa_bas: form.tur === "kaynak" ? sayi(form.sayfa_bas) : null,
      sayfa_son: form.tur === "kaynak" ? sayi(form.sayfa_son) : null,
      video_url: form.tur === "video" ? form.video_url.trim() : null,
      aciklama:  form.aciklama?.trim() || null,
      baslangic_saati: form.baslangic_saati || null,
      // Başlangıç yoksa bitiş anlamsız; tek başına kalmasın.
      bitis_saati: form.baslangic_saati ? (form.bitis_saati || null) : null,
    }) ?? {};
    setKaydediliyor(false);
    if (!hata) onKapat();
  };

  const girdi = {
    width: "100%", boxSizing: "border-box", padding: "9px 12px",
    borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil,
    fontFamily: "inherit", background: "#fff",
  };
  const etiket = { fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginBottom: 4, display: "block" };

  return (
    <Modal title={blok ? "Bloğu düzenle" : "Plana blok ekle"} onClose={onKapat}>
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>

        {/* Tür */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: BOSLUK.xs }}>
          {Object.entries(TURLER).map(([kod, t]) => (
            <button key={kod} onClick={() => alan("tur", kod)} style={{
              padding: "8px 6px", borderRadius: KOSE.m, cursor: "pointer",
              fontSize: YAZI.ikincil, fontWeight: 600,
              border: `2px solid ${form.tur === kod ? c.bg : RENK.cizgi}`,
              background: form.tur === kod ? c.bg : "#fff",
              color: form.tur === kod ? "#fff" : RENK.metinSoluk,
            }}>{t.simge} {t.ad}</button>
          ))}
        </div>

        {/* Konu / video için müfredat seçimi */}
        {(form.tur === "konu" || form.tur === "video") && (
          <>
            <div style={{ display: "flex", gap: BOSLUK.xs, flexWrap: "wrap" }}>
              {sinavTurleri.map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, exam_type: t, ders: "", konu: "" }))} style={{
                  flex: 1, padding: "6px 0", borderRadius: KOSE.m, cursor: "pointer",
                  fontSize: YAZI.kucuk, fontWeight: 600,
                  border: `1.5px solid ${form.exam_type === t ? c.mid : RENK.cizgi}`,
                  background: form.exam_type === t ? c.light : "#fff",
                  color: form.exam_type === t ? c.text : RENK.metinSoluk,
                }}>{t}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: BOSLUK.s }}>
              <select value={form.ders} onChange={e => setForm(f => ({ ...f, ders: e.target.value, konu: "" }))}
                style={{ ...girdi, flex: 1 }}>
                <option value="">Ders{form.tur === "video" ? " (isteğe bağlı)" : ""}...</option>
                {examSubjectsOf(form.exam_type).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={form.konu} onChange={e => alan("konu", e.target.value)}
                disabled={!form.ders} style={{ ...girdi, flex: 1 }}>
                <option value="">Konu...</option>
                {form.ders && topicsOf(form.exam_type, form.ders).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </>
        )}

        {/* Soru bankası */}
        {form.tur === "kaynak" && (
          <>
            {kaynak.bankalar.length === 0 ? (
              <div style={{ fontSize: YAZI.ikincil, color: RENK.uyari.metin, background: RENK.uyari.zemin, padding: BOSLUK.m, borderRadius: KOSE.m, lineHeight: 1.5 }}>
                Bu öğrenci için tanımlı bir kaynak yok. Önce <b>Soru Bankası</b>'na kitap
                ekleyip içindekilerini aktarın.
              </div>
            ) : (
              <>
                <select value={form.banka_id}
                  onChange={e => setForm(f => ({ ...f, banka_id: e.target.value, bolum_id: "", sayfa_bas: "", sayfa_son: "" }))}
                  style={girdi}>
                  <option value="">Kaynak seç...</option>
                  {kaynak.bankalar.map(b => (
                    <option key={b.id} value={b.id}>{b.ad}{b.ders ? ` · ${b.ders}` : ""}</option>
                  ))}
                </select>
                {form.banka_id && (
                  <select value={form.bolum_id} onChange={e => bolumSec(e.target.value)} style={girdi}>
                    <option value="">{bankaBolumleri.length ? "Bölüm seç..." : "Bu kaynağın içindekileri aktarılmamış"}</option>
                    {bankaBolumleri.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.baslik}{b.sayfa_bas ? ` (${b.sayfa_bas}${b.sayfa_son ? `–${b.sayfa_son}` : ""})` : ""}
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ display: "flex", gap: BOSLUK.s }}>
                  <div style={{ flex: 1 }}>
                    <label style={etiket}>Başlangıç sayfası</label>
                    <input type="number" min="1" value={form.sayfa_bas} onChange={e => alan("sayfa_bas", e.target.value)} style={girdi} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={etiket}>Bitiş sayfası</label>
                    <input type="number" min="1" value={form.sayfa_son} onChange={e => alan("sayfa_son", e.target.value)} style={girdi} />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Video adresi + canlı önizleme */}
        {form.tur === "video" && (
          <div>
            <label style={etiket}>Video adresi</label>
            <input value={form.video_url} onChange={e => alan("video_url", e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..." style={girdi} />
            {form.video_url.trim() && (
              <div style={{ marginTop: BOSLUK.s }}>
                {video.tur === "youtube" ? (
                  <div style={{ display: "flex", gap: BOSLUK.s, alignItems: "center" }}>
                    <img src={video.kapak} alt="" style={{ width: 96, height: 54, objectFit: "cover", borderRadius: KOSE.s, flexShrink: 0 }} />
                    <span style={{ fontSize: YAZI.kucuk, color: RENK.basari.metin }}>
                      ✓ YouTube videosu — uygulama içinde oynatılacak
                      {video.bas ? ` (${Math.floor(video.bas / 60)}:${String(video.bas % 60).padStart(2, "0")}'dan başlar)` : ""}
                    </span>
                  </div>
                ) : video.tur === "vimeo" ? (
                  <span style={{ fontSize: YAZI.kucuk, color: RENK.basari.metin }}>✓ Vimeo videosu — uygulama içinde oynatılacak</span>
                ) : video.tur === "baglanti" ? (
                  <span style={{ fontSize: YAZI.kucuk, color: RENK.bilgi.metin }}>
                    {video.host} tanınan bir video sağlayıcısı değil; öğrenci için yeni sekmede açılacak.
                  </span>
                ) : (
                  <span style={{ fontSize: YAZI.kucuk, color: RENK.hata.metin }}>
                    Geçerli bir adres değil. http:// ya da https:// ile başlamalı.
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ortak alanlar */}
        <div>
          <label style={etiket}>Başlık</label>
          <input value={form.baslik}
            onChange={e => { setBaslikElle(true); alan("baslik", e.target.value); }}
            placeholder={form.tur === "serbest" ? "ör. Haftalık tekrar, TYT denemesi, Paragraf 20 soru" : ""}
            style={girdi} />
        </div>

        <div style={{ display: "flex", gap: BOSLUK.s, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 120px" }}>
            <label style={etiket}>Gün</label>
            <select value={form.gun} onChange={e => alan("gun", Number(e.target.value))} style={girdi}>
              {GUNLER.map((g, i) => <option key={g} value={i}>{g}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={etiket}>Zaman</label>
            <select value={form.dilim} onChange={e => alan("dilim", e.target.value)} style={girdi}>
              {DILIMLER.map(d => <option key={d.kod} value={d.kod}>{d.ad}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={etiket}>Süre (dk)</label>
            <input type="number" min="1" value={form.sure_dk} onChange={e => sureDegisti(e.target.value)} style={girdi} />
          </div>
        </div>

        {/* Çalışma saati — isteğe bağlı. Girilirse blok hücresinde saatine
            göre sıralanıyor ve öğrenci panelinde saatiyle görünüyor. */}
        <div style={{ display: "flex", gap: BOSLUK.s, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 120px" }}>
            <label style={etiket}>Başlangıç saati (isteğe bağlı)</label>
            <input type="time" value={form.baslangic_saati} onChange={e => baslangicDegisti(e.target.value)} style={girdi} />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={etiket}>
              Bitiş saati{bitisOto && form.bitis_saati && form.sure_dk ? " · süreden önerildi" : ""}
            </label>
            <input type="time" value={form.bitis_saati} disabled={!form.baslangic_saati}
              onChange={e => { setBitisOto(false); alan("bitis_saati", e.target.value); }}
              style={{ ...girdi, opacity: form.baslangic_saati ? 1 : 0.5 }} />
          </div>
        </div>
        {!saatGecerli && (
          <div style={{ fontSize: YAZI.kucuk, color: RENK.hata.metin, marginTop: -BOSLUK.s }}>
            Bitiş saati başlangıçtan sonra olmalı.
          </div>
        )}

        <div>
          <label style={etiket}>Not (isteğe bağlı)</label>
          <textarea rows={2} value={form.aciklama} onChange={e => alan("aciklama", e.target.value)}
            style={{ ...girdi, resize: "vertical" }} />
        </div>

        <div style={{ display: "flex", gap: BOSLUK.s }}>
          <button onClick={kaydet} disabled={!gecerli || kaydediliyor} style={{
            flex: 1, padding: "11px 0", borderRadius: KOSE.m, border: "none",
            background: gecerli ? c.bg : "#ddd", color: "#fff",
            fontSize: YAZI.govde, fontWeight: 700, cursor: gecerli ? "pointer" : "not-allowed",
          }}>{kaydediliyor ? "Kaydediliyor..." : blok ? "Kaydet" : "Plana ekle"}</button>
          {blok && onSil && (
            <button onClick={async () => {
              if (!window.confirm(`"${blok.baslik}" bloğu plandan silinsin mi?`)) return;
              const { hata } = (await onSil()) ?? {};
              if (!hata) onKapat();
            }} style={{
              padding: "11px 14px", borderRadius: KOSE.m, border: `1.5px solid ${RENK.hata.zemin}`,
              background: "#fff", color: RENK.hata.metin, fontSize: YAZI.ikincil, cursor: "pointer",
            }}>Sil</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
