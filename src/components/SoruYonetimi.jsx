import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { SIKLAR } from "../lib/cevapAnahtari";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Koçun bir kitabın sorularını girip yönettiği ekran.
//
// ── ONAYLANMADAN ÖĞRENCİYE GİTMİYOR ─────────────────────────────
// Her sorunun bir `onayli` alanı var ve test yalnız onaylı sorulardan
// kuruluyor (test_basla RPC'si). Soru sonradan DEĞİŞİRSE onay
// kendiliğinden düşüyor (veritabanı tetikleyicisi). Sebebi: soruların
// asıl girdi yolu ileride PDF'ten içe aktarma olacak ve oradaki bir
// hata sessizce öğrencinin önüne gitmemeli.
//
// ── GÖRSEL ŞU AN YOK ────────────────────────────────────────────
// Veri modeli soru ve şık görselini destekliyor (gorsel_url), ama
// yükleme arayüzü bilerek yazılmadı: şekilli soruların kapsama
// girip girmeyeceği gerçek bir PDF ölçülmeden karara bağlanmayacak
// (bkz. DIJITAL_TEST.md). Şimdilik düz metin sorular.
export default function SoruYonetimi({ banka, bolumler, color: c, onKapat, onDegisti }) {
  const [sorular, setSorular] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState(false);
  const [form, setForm] = useState(null);     // { id?, numara, metin, siklar, dogru_cevap, ... }

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const { veri } = await calistir(
      supabase.from("sorular").select("*").eq("banka_id", banka.id).order("numara"),
      "Sorular", { sessiz: true }
    );
    setSorular(veri ?? []);
    setYukleniyor(false);
  }, [banka.id]);

  useEffect(() => { yukle(); }, [yukle]);

  const bosForm = () => ({
    numara: (sorular.at(-1)?.numara ?? 0) + 1,
    metin: "",
    sik_sayisi: 5,
    siklar: SIKLAR.slice(0, 5).map(h => ({ harf: h, metin: "" })),
    dogru_cevap: "",
    bolum_id: "",
    konu: "",
  });

  const sikSayisiDegistir = (n) => setForm(f => ({
    ...f,
    sik_sayisi: n,
    siklar: SIKLAR.slice(0, n).map(h => f.siklar.find(s => s.harf === h) ?? { harf: h, metin: "" }),
    // Şık sayısı düşünce aralık dışında kalan doğru cevap temizleniyor;
    // yoksa veritabanı kısıtı kaydı reddeder ve sebebi anlaşılmaz olur.
    dogru_cevap: SIKLAR.slice(0, n).includes(f.dogru_cevap) ? f.dogru_cevap : "",
  }));

  const kaydet = async () => {
    if (!gecerli) return;
    setIslemde(true);
    const satir = {
      banka_id: banka.id,
      bolum_id: form.bolum_id || null,
      numara: form.numara,
      metin: form.metin.trim(),
      sik_sayisi: form.sik_sayisi,
      siklar: form.siklar.map(s => ({ harf: s.harf, metin: s.metin.trim() })),
      dogru_cevap: form.dogru_cevap,
      konu: form.konu || null,
    };
    const { hata } = await calistir(
      form.id
        ? supabase.from("sorular").update(satir).eq("id", form.id)
        : supabase.from("sorular").insert(satir),
      form.id ? "Soru guncelleme" : "Soru ekleme"
    );
    setIslemde(false);
    if (hata) return;
    setForm(null);
    await yukle();
    onDegisti?.();
  };

  const sil = async (soru) => {
    if (!confirm(`${soru.numara}. soru silinsin mi?`)) return;
    const { hata } = await calistir(
      supabase.from("sorular").delete().eq("id", soru.id), "Soru silme");
    if (!hata) { await yukle(); onDegisti?.(); }
  };

  const onayDegistir = async (soru) => {
    const { hata } = await calistir(
      supabase.from("sorular").update({ onayli: !soru.onayli }).eq("id", soru.id),
      "Soru onayi");
    if (!hata) { await yukle(); onDegisti?.(); }
  };

  const gecerli = form
    && form.metin.trim().length > 0
    && form.dogru_cevap
    && form.siklar.slice(0, form.sik_sayisi).every(s => s.metin.trim().length > 0);

  const onayliAdet = sorular.filter(s => s.onayli).length;

  const girdi = {
    width: "100%", padding: "8px 10px", borderRadius: KOSE.s, boxSizing: "border-box",
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, fontFamily: "inherit",
  };

  return (
    <Modal title={`Sorular — ${banka.ad}`} onClose={onKapat} maxWidth={600}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: BOSLUK.m, fontSize: YAZI.ikincil, color: RENK.metinIkincil,
      }}>
        <span>{sorular.length} soru · <b style={{ color: onayliAdet ? RENK.basari.metin : RENK.uyari.metin }}>
          {onayliAdet} onaylı
        </b></span>
        {!form && (
          <button onClick={() => setForm(bosForm())} style={{
            padding: "6px 14px", borderRadius: KOSE.tam, border: "none",
            background: c.bg, color: "#fff", fontSize: YAZI.mikro, fontWeight: 700, cursor: "pointer",
          }}>+ Soru ekle</button>
        )}
      </div>

      {onayliAdet === 0 && sorular.length > 0 && (
        <div style={{
          background: RENK.uyari.zemin, color: RENK.uyari.metin, fontSize: 11.5,
          padding: "9px 11px", borderRadius: KOSE.s, marginBottom: BOSLUK.m, lineHeight: 1.5,
        }}>
          Hiçbir soru onaylanmamış. Test yalnız onaylı sorulardan kuruluyor;
          öğrenci şu an bu kitaptan test başlatamaz.
        </div>
      )}

      {form && (
        <div style={{
          display: "flex", flexDirection: "column", gap: BOSLUK.s,
          padding: BOSLUK.m, borderRadius: KOSE.m, border: `1.5px solid ${c.mid}`,
          marginBottom: BOSLUK.m,
        }}>
          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil, width: 80 }}>
              <div style={{ marginBottom: 3 }}>Soru no</div>
              <input type="number" min={1} value={form.numara} style={girdi}
                onChange={e => setForm(f => ({ ...f, numara: Number(e.target.value) || 1 }))} />
            </label>
            <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil, width: 90 }}>
              <div style={{ marginBottom: 3 }}>Şık sayısı</div>
              <select value={form.sik_sayisi} style={girdi}
                onChange={e => sikSayisiDegistir(Number(e.target.value))}>
                {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ fontSize: YAZI.mikro, color: RENK.metinIkincil, flex: 1 }}>
              <div style={{ marginBottom: 3 }}>Bölüm (isteğe bağlı)</div>
              <select value={form.bolum_id} style={girdi}
                onChange={e => setForm(f => ({ ...f, bolum_id: e.target.value }))}>
                <option value="">—</option>
                {bolumler.map(b => <option key={b.id} value={b.id}>{b.baslik}</option>)}
              </select>
            </label>
          </div>

          <textarea rows={3} placeholder="Soru metni" value={form.metin} style={{ ...girdi, resize: "vertical" }}
            onChange={e => setForm(f => ({ ...f, metin: e.target.value }))} />

          {form.siklar.slice(0, form.sik_sayisi).map((s, i) => (
            <div key={s.harf} style={{ display: "flex", gap: BOSLUK.s, alignItems: "center" }}>
              {/* Doğru şık buradan seçiliyor: ayrı bir açılır liste
                  yerine şıkkın kendisine basmak, yanlış şıkkı doğru
                  işaretleme ihtimalini azaltıyor. */}
              <button onClick={() => setForm(f => ({ ...f, dogru_cevap: s.harf }))} style={{
                width: 30, height: 30, borderRadius: KOSE.s, flexShrink: 0, cursor: "pointer",
                border: `2px solid ${form.dogru_cevap === s.harf ? RENK.basari.metin : RENK.cizgi}`,
                background: form.dogru_cevap === s.harf ? RENK.basari.zemin : "#fff",
                color: form.dogru_cevap === s.harf ? RENK.basari.metin : RENK.metinSoluk,
                fontWeight: 800, fontSize: 12,
              }}>{s.harf}</button>
              <input placeholder={`${s.harf} şıkkı`} value={s.metin} style={girdi}
                onChange={e => setForm(f => ({
                  ...f,
                  siklar: f.siklar.map((x, j) => j === i ? { ...x, metin: e.target.value } : x),
                }))} />
            </div>
          ))}

          <div style={{ fontSize: YAZI.mikro, color: form.dogru_cevap ? RENK.basari.metin : RENK.uyari.metin }}>
            {form.dogru_cevap ? `Doğru cevap: ${form.dogru_cevap}` : "Doğru şıkkı harfine basarak seçin."}
          </div>

          <div style={{ display: "flex", gap: BOSLUK.s }}>
            <button onClick={kaydet} disabled={!gecerli || islemde} style={{
              flex: 1, padding: "9px 0", borderRadius: KOSE.m, border: "none",
              background: gecerli ? c.bg : "#ddd", color: "#fff",
              fontSize: YAZI.ikincil, fontWeight: 700, cursor: gecerli ? "pointer" : "default",
            }}>{islemde ? "Kaydediliyor..." : form.id ? "Güncelle" : "Ekle"}</button>
            <button onClick={() => setForm(null)} style={{
              padding: "9px 14px", borderRadius: KOSE.m, cursor: "pointer",
              border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
              fontSize: YAZI.ikincil, color: RENK.metinIkincil,
            }}>Vazgeç</button>
          </div>
        </div>
      )}

      {yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      ) : sorular.length === 0 ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk, lineHeight: 1.5 }}>
          Bu kitapta henüz soru yok. Pilot için 10-20 soruluk bir set yeterli.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 320, overflowY: "auto" }}>
          {sorular.map(s => (
            <div key={s.id} style={{
              display: "flex", gap: BOSLUK.s, alignItems: "center",
              padding: "6px 4px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
              fontSize: YAZI.kucuk,
            }}>
              <span style={{ width: 26, color: RENK.metinSilik, flexShrink: 0 }}>{s.numara}.</span>
              <span style={{
                flex: 1, minWidth: 0, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{s.metin || "(görsel soru)"}</span>
              <span style={{
                flexShrink: 0, fontWeight: 800, color: RENK.basari.metin, width: 16,
              }}>{s.dogru_cevap}</span>
              <button onClick={() => onayDegistir(s)} title={s.onayli ? "Onayı kaldır" : "Onayla"} style={{
                flexShrink: 0, fontSize: YAZI.mikro, cursor: "pointer",
                padding: "2px 8px", borderRadius: KOSE.tam,
                border: `1px solid ${s.onayli ? RENK.basari.metin + "55" : RENK.cizgi}`,
                background: s.onayli ? RENK.basari.zemin : "#fff",
                color: s.onayli ? RENK.basari.metin : RENK.metinSoluk,
              }}>{s.onayli ? "✓ onaylı" : "onayla"}</button>
              <button onClick={() => setForm({
                id: s.id, numara: s.numara, metin: s.metin ?? "",
                sik_sayisi: s.sik_sayisi,
                siklar: SIKLAR.slice(0, s.sik_sayisi).map(h =>
                  (s.siklar ?? []).find(x => x.harf === h) ?? { harf: h, metin: "" }),
                dogru_cevap: s.dogru_cevap, bolum_id: s.bolum_id ?? "", konu: s.konu ?? "",
              })} style={{
                flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                color: c.mid, fontSize: YAZI.mikro,
              }}>düzenle</button>
              <button onClick={() => sil(s)} style={{
                flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                color: RENK.hata.metin, fontSize: YAZI.mikro,
              }}>sil</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
