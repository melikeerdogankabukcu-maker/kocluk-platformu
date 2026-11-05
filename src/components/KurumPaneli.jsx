import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Kurum yöneticisinin paneli: koçlar, öğrenciler, devir, özet.
//
// ── HER ŞEY RPC ÜZERİNDEN ───────────────────────────────────────
// Yöneticinin ihtiyaç duyduğu her iş BAŞKASININ satırına dokunuyor:
// başka koçun öğrenci bağı, başka kullanıcının kurum_id'si.
// `teacher_students` politikası yalnız tarafları geçiriyor ve
// `users` üzerinde UPDATE yalnız kendi satırına açık. Bunları RLS ile
// açmak o genişliği yalnız bu ekran için değil HER SORGU için açardı;
// onun yerine kurallar tek tek SECURITY DEFINER fonksiyonlarında.
//
// ── KOÇ E-POSTAYLA EKLENİYOR ────────────────────────────────────
// E-posta artık istemciye hiç inmiyor, dolayısıyla seçilebilecek bir
// liste yok: yönetici adresi yazıyor, SUNUCU çözüyor.
export default function KurumPaneli({ color: c, baslik = "Kurum Yönetimi" }) {
  const [koclar, setKoclar] = useState([]);
  const [ogrenciler, setOgrenciler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [eposta, setEposta] = useState("");
  const [islemde, setIslemde] = useState(false);
  const [mesaj, setMesaj] = useState(null);      // { tur: 'iyi'|'kotu', metin }
  const [devir, setDevir] = useState({});        // ogrenci_id -> yeni koc id

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const [{ veri: k }, { veri: o }] = await Promise.all([
      calistir(supabase.rpc("kurum_koclari"), "Kurum koclari", { sessiz: true }),
      calistir(supabase.rpc("kurum_ogrencileri"), "Kurum ogrencileri", { sessiz: true }),
    ]);
    setKoclar(k ?? []);
    setOgrenciler(o ?? []);
    setYukleniyor(false);
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  // RPC'ler hatayı MESAJLA döndürüyor ("bu koç başka kuruma bağlı"
  // gibi); o metin kullanıcıya olduğu gibi gösteriliyor çünkü ne
  // yapması gerektiğini söyleyen tek şey o.
  const calistirIslem = async (sozPromise, basariMetni) => {
    setIslemde(true);
    setMesaj(null);
    const { veri, hata } = await calistir(sozPromise, "Kurum islemi", { sessiz: true });
    setIslemde(false);
    if (hata) {
      setMesaj({ tur: "kotu", metin: hata.message ?? "İşlem yapılamadı." });
      return false;
    }
    setMesaj({ tur: "iyi", metin: basariMetni(veri) });
    await yukle();
    return true;
  };

  const kocEkle = async () => {
    if (!eposta.trim()) return;
    const oldu = await calistirIslem(
      supabase.rpc("kuruma_koc_ekle", { p_eposta: eposta.trim() }),
      (ad) => `${ad || "Koç"} kuruma eklendi.`);
    if (oldu) setEposta("");
  };

  const kocCikar = (koc) => {
    if (!confirm(`${koc.ad} kurumdan çıkarılsın mı? Kurum içeriğine erişimi kalkar.`)) return;
    calistirIslem(
      supabase.rpc("kurumdan_koc_cikar", { p_koc: koc.koc_id }),
      () => `${koc.ad} kurumdan çıkarıldı.`);
  };

  const ogrenciDevret = (o) => {
    const yeni = devir[o.ogrenci_id];
    if (!yeni || yeni === o.koc_id) return;
    const yeniAd = koclar.find(k => k.koc_id === yeni)?.ad ?? "yeni koç";
    if (!confirm(`${o.ad}, ${o.koc_adi} yerine ${yeniAd} koçuna aktarılsın mı?`)) return;
    calistirIslem(
      supabase.rpc("ogrenci_devret", {
        p_ogrenci: o.ogrenci_id, p_eski_koc: o.koc_id, p_yeni_koc: yeni,
      }),
      () => `${o.ad} aktarıldı.`)
      .then(() => setDevir(d => ({ ...d, [o.ogrenci_id]: "" })));
  };

  const oran = (biten, toplam) =>
    toplam > 0 ? Math.round((Number(biten) / Number(toplam)) * 100) : null;

  const girdi = {
    flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: KOSE.s, boxSizing: "border-box",
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, fontFamily: "inherit",
  };

  return (
    <Card id="bolum-kurum">
      <SectionTitle title={baslik} color={c.mid} />

      {yukleniyor ? (
        <div style={{ fontSize: YAZI.ikincil, color: RENK.metinSoluk }}>Yükleniyor...</div>
      ) : (
        <>
          <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, marginBottom: BOSLUK.m }}>
            {koclar.length} koç · {ogrenciler.length} öğrenci
          </div>

          {/* Koç ekleme */}
          <div style={{ display: "flex", gap: BOSLUK.s, marginBottom: 6 }}>
            <input value={eposta} placeholder="Koçun e-posta adresi" type="email"
              onChange={e => { setEposta(e.target.value); setMesaj(null); }}
              onKeyDown={e => { if (e.key === "Enter") kocEkle(); }}
              style={girdi} />
            <button onClick={kocEkle} disabled={islemde || !eposta.trim()} style={{
              flexShrink: 0, padding: "0 16px", borderRadius: KOSE.s, border: "none",
              background: eposta.trim() ? c.bg : "#ddd", color: "#fff",
              fontSize: YAZI.ikincil, fontWeight: 700,
              cursor: eposta.trim() ? "pointer" : "default",
            }}>{islemde ? "..." : "Ekle"}</button>
          </div>
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5, marginBottom: BOSLUK.m }}>
            Koçun sistemde kayıtlı ve öğretmen rolünde olması gerekiyor.
            Başka bir kuruma bağlıysa önce oradan ayrılmalı.
          </div>

          {mesaj && (
            <div style={{
              background: mesaj.tur === "iyi" ? RENK.basari.zemin : RENK.hata.zemin,
              color:      mesaj.tur === "iyi" ? RENK.basari.metin : RENK.hata.metin,
              fontSize: 11.5, padding: "8px 11px", borderRadius: KOSE.s,
              marginBottom: BOSLUK.m, lineHeight: 1.5,
            }}>{mesaj.metin}</div>
          )}

          {/* Koçlar ve özet */}
          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
            KOÇLAR
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: BOSLUK.l }}>
            {koclar.map(k => {
              const o = oran(k.gorev_biten, k.gorev_toplam);
              const saat = Math.round(Number(k.calisma_dk_30g ?? 0) / 60);
              return (
                <div key={k.koc_id} style={{
                  display: "flex", alignItems: "center", gap: BOSLUK.s,
                  padding: "8px 2px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: YAZI.kucuk, fontWeight: 600, color: RENK.metin }}>
                      {k.ad}
                      {k.kurum_rolu === "yonetici" && (
                        <span style={{
                          marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: "1px 6px",
                          borderRadius: KOSE.tam, background: c.light, color: c.text,
                        }}>yönetici</span>
                      )}
                    </div>
                    <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>
                      {[
                        `${k.ogrenci_sayisi} öğrenci`,
                        o != null ? `görev %${o}` : null,
                        Number(k.test_30g) > 0 ? `${k.test_30g} test/30g` : null,
                        saat > 0 ? `${saat} sa çalışma/30g` : null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {k.kurum_rolu !== "yonetici" && (
                    <button onClick={() => kocCikar(k)} disabled={islemde} style={{
                      flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                      color: RENK.hata.metin, fontSize: YAZI.mikro,
                    }}>çıkar</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Öğrenciler ve devir */}
          <div style={{ fontSize: YAZI.mikro, fontWeight: 700, color: RENK.metinSoluk, marginBottom: 6 }}>
            ÖĞRENCİLER
          </div>
          {ogrenciler.length === 0 ? (
            <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
              Kuruma bağlı koçların henüz onaylı öğrencisi yok.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 340, overflowY: "auto" }}>
              {ogrenciler.map(o => (
                <div key={`${o.ogrenci_id}-${o.koc_id}`} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 2px", borderBottom: `1px solid ${RENK.cizgiSolgun}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: YAZI.kucuk, color: RENK.metin }}>{o.ad}</div>
                    <div style={{ fontSize: YAZI.mikro, color: RENK.metinSoluk }}>{o.koc_adi}</div>
                  </div>
                  {/* Devir yalnız kurumda birden fazla koç varsa anlamlı */}
                  {koclar.length > 1 && (
                    <>
                      <select value={devir[o.ogrenci_id] ?? ""}
                        onChange={e => setDevir(d => ({ ...d, [o.ogrenci_id]: e.target.value }))}
                        style={{
                          flexShrink: 0, maxWidth: 140, padding: "4px 6px", borderRadius: KOSE.s,
                          border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.mikro,
                          fontFamily: "inherit", color: devir[o.ogrenci_id] ? RENK.metin : RENK.metinSilik,
                        }}>
                        <option value="">devret…</option>
                        {koclar.filter(k => k.koc_id !== o.koc_id).map(k => (
                          <option key={k.koc_id} value={k.koc_id}>{k.ad}</option>
                        ))}
                      </select>
                      {devir[o.ogrenci_id] && (
                        <button onClick={() => ogrenciDevret(o)} disabled={islemde} style={{
                          flexShrink: 0, padding: "4px 10px", borderRadius: KOSE.tam, border: "none",
                          background: c.bg, color: "#fff", fontSize: YAZI.mikro,
                          fontWeight: 700, cursor: "pointer",
                        }}>aktar</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.55, marginTop: BOSLUK.m }}>
            Devirde öğrencinin geçmişi de yeni koça geçiyor: görev, sınav ve
            plan erişimi koça değil <b>öğrenci bağına</b> bakıyor. Öğrencisi
            olan koç kurumdan çıkarılamıyor; önce devredilmesi gerekiyor.
          </div>
        </>
      )}
    </Card>
  );
}
