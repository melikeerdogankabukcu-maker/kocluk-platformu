import { useState, useMemo } from "react";
import { useStudyPrograms } from "../hooks/useStudyPrograms";
import { useTopics } from "../lib/TopicsContext";
import { DILIMLER, GUN_KISA, haftaBasi, haftaKaydir, haftaAraligiMetni, tarihMetni, sureMetni } from "../lib/calismaPlani";
import { secilenHaftalar, haftaBloklari, gunDagilimi } from "../lib/programAktar";
import { programiPlanaAktar } from "../lib/programPlanaAktar";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";
import Modal from "./Modal";

// Program kütüphanesindeki bir programı (ya da bir kısmını) çalışma
// planına ekleme penceresi. İki yerden açılıyor:
//  - Plan panosundan: öğrenci ve hafta panoda seçili olan, sabit.
//  - Program kütüphanesinden: program sabit, öğrenci/grup oradaki
//    seçimden geliyor, başlangıç haftası burada seçiliyor.
//
// Program haftaları ARDIŞIK plan haftalarına yayılıyor. Blokların saati
// yok (programda saat yazılmıyor); hepsi seçilen zaman dilimine giriyor,
// koç sonra sürükleyerek dağıtabilir.
const yerelTarih = (s) => {
  const [y, a, g] = String(s).split("-").map(Number);
  return new Date(y, a - 1, g);
};

export default function ProgramdanEkle({
  ogrenciler = [], pazartesi = null, program: sabitProgram = null,
  baslangicTarihi = null,   // "YYYY-MM-DD" — pazartesi verilmediğinde önerilen hafta
  color: c, onBitti, onKapat,
}) {
  const { programlar, loading } = useStudyPrograms();
  const { tumDersler } = useTopics();
  const bilinenDersler = useMemo(() => tumDersler?.() ?? [], [tumDersler]);

  const [kod, setKod]       = useState(sabitProgram?.kod ?? "");
  const [basNo, setBasNo]   = useState(1);
  const [adet, setAdet]     = useState(1);
  const [dilim, setDilim]   = useState("aksam");
  const [tarih, setTarih]   = useState(() => tarihMetni(
    pazartesi ?? haftaBasi(baslangicTarihi ? yerelTarih(baslangicTarihi) : new Date())
  ));
  const [islemde, setIslemde] = useState(false);
  const [sonuc, setSonuc]   = useState(null);

  const program = sabitProgram ?? programlar.find(p => p.kod === kod) ?? null;
  const tumHaftalar = program?.icerik?.weeks ?? [];
  const ilkPazartesi = pazartesi ?? haftaBasi(yerelTarih(tarih));

  const programSec = (yeni) => {
    setKod(yeni); setBasNo(1); setSonuc(null);
    // Tek haftalık programda "kaç hafta" 1; uzun programda varsayılan
    // yine 1 — koç bütün programı bilerek seçsin, 8 haftayı yanlışlıkla
    // plana dökmesin.
    setAdet(1);
  };

  const haftalar = useMemo(
    () => (program ? secilenHaftalar(program.icerik, basNo, adet) : []),
    [program, basNo, adet]
  );
  const onizleme = useMemo(
    () => haftalar.map(w => haftaBloklari(w, { dilim, bilinenDersler })),
    [haftalar, dilim, bilinenDersler]
  );
  const toplamBlok = onizleme.reduce((s, b) => s + b.length, 0);
  const basIndeks = Math.max(0, tumHaftalar.findIndex(w => w.week === basNo));
  const kalanHafta = tumHaftalar.length - basIndeks;

  const ekle = async () => {
    if (!program || toplamBlok === 0 || ogrenciler.length === 0) return;
    setIslemde(true);
    let eklenen = 0, atlanan = 0;
    const hatalar = [];
    for (const o of ogrenciler) {
      const r = await programiPlanaAktar({
        studentId: o.id, haftalar, ilkPazartesi, dilim, bilinenDersler,
      });
      eklenen += r.eklenen; atlanan += r.atlanan;
      if (r.hata) {
        console.error("[Programdan plana aktarma]", r.hata);
        hatalar.push(`${o.full_name}: ${r.hataHaftasi} haftasında durdu (${r.hata.message})`);
      }
    }
    setIslemde(false);
    setSonuc({ eklenen, atlanan, hatalar });
    onBitti?.();
  };

  const girdi = {
    width: "100%", boxSizing: "border-box", padding: "9px 12px",
    borderRadius: KOSE.m, border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil,
    fontFamily: "inherit", background: "#fff",
  };
  const etiket = { fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginBottom: 4, display: "block" };

  const kime = ogrenciler.length === 1 ? ogrenciler[0].full_name : `${ogrenciler.length} öğrenci`;

  return (
    <Modal title="Programdan plana ekle" onClose={onKapat} maxWidth={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.m }}>

        {sonuc ? (
          <>
            <div style={{
              fontSize: YAZI.govde, lineHeight: 1.6, padding: BOSLUK.m, borderRadius: KOSE.m,
              background: sonuc.hatalar.length ? RENK.uyari.zemin : RENK.basari.zemin,
              color: sonuc.hatalar.length ? RENK.uyari.metin : RENK.basari.metin,
            }}>
              <b>{sonuc.eklenen}</b> blok {kime} için plana eklendi.
              {sonuc.atlanan > 0 && <> {sonuc.atlanan} blok planda zaten olduğu için atlandı.</>}
              {sonuc.hatalar.map(h => <div key={h} style={{ fontSize: YAZI.kucuk, marginTop: 4 }}>⚠ {h}</div>)}
            </div>
            <button onClick={onKapat} style={{
              padding: "11px 0", borderRadius: KOSE.m, border: "none",
              background: c.bg, color: "#fff", fontSize: YAZI.govde, fontWeight: 700, cursor: "pointer",
            }}>Tamam</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil }}>
              Kime: <b style={{ color: RENK.metin }}>{kime || "—"}</b>
            </div>

            {!sabitProgram && (
              <div>
                <label style={etiket}>Program</label>
                <select value={kod} onChange={e => programSec(e.target.value)} style={girdi} disabled={loading}>
                  <option value="">{loading ? "Yükleniyor..." : "Program seç..."}</option>
                  {programlar.map(p => (
                    <option key={p.kod} value={p.kod}>
                      {p.title} · {(p.icerik?.weeks ?? []).length} hafta{p.hazir ? " (hazır)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {sabitProgram && (
              <div style={{ fontSize: YAZI.govde, fontWeight: 700, color: RENK.metin }}>
                {sabitProgram.title}
                <span style={{ fontSize: YAZI.kucuk, fontWeight: 400, color: RENK.metinSoluk }}> · {tumHaftalar.length} hafta</span>
              </div>
            )}

            {program && tumHaftalar.length === 0 && (
              <div style={{ fontSize: YAZI.ikincil, color: RENK.uyari.metin }}>Bu programda hafta yok.</div>
            )}

            {program && tumHaftalar.length > 0 && (
              <>
                <div style={{ display: "flex", gap: BOSLUK.s, flexWrap: "wrap" }}>
                  <div style={{ flex: "2 1 180px" }}>
                    <label style={etiket}>Programın hangi haftasından</label>
                    <select value={basNo} onChange={e => { setBasNo(Number(e.target.value)); setAdet(1); }} style={girdi}>
                      {tumHaftalar.map(w => (
                        <option key={w.week} value={w.week}>{w.week}. hafta{w.title ? ` — ${w.title}` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 110px" }}>
                    <label style={etiket}>Kaç hafta</label>
                    <select value={adet} onChange={e => setAdet(Number(e.target.value))} style={girdi}>
                      {Array.from({ length: kalanHafta }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n === kalanHafta && n > 1 ? `${n} (sonuna kadar)` : n}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: BOSLUK.s, flexWrap: "wrap" }}>
                  {!pazartesi && (
                    <div style={{ flex: "1 1 160px" }}>
                      <label style={etiket}>Başlangıç haftası</label>
                      <input type="date" value={tarih} onChange={e => e.target.value && setTarih(e.target.value)} style={girdi} />
                      {tarihMetni(ilkPazartesi) !== tarih && (
                        <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, marginTop: 3 }}>
                          Plan haftası pazartesiden başlar: {haftaAraligiMetni(ilkPazartesi)}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ flex: "1 1 160px" }}>
                    <label style={etiket}>Zaman dilimi</label>
                    <select value={dilim} onChange={e => setDilim(e.target.value)} style={girdi}>
                      {DILIMLER.map(d => <option key={d.kod} value={d.kod}>{d.ad}</option>)}
                    </select>
                  </div>
                </div>

                {/* Önizleme: hangi program haftası hangi plan haftasına düşüyor */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {haftalar.map((w, i) => {
                    const b = onizleme[i];
                    const dag = gunDagilimi(b);
                    const dk = b.reduce((s, x) => s + (x.sure_dk || 0), 0);
                    return (
                      <div key={w.week} style={{ padding: "8px 10px", borderRadius: KOSE.m, background: RENK.yuzey }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: BOSLUK.s, flexWrap: "wrap", fontSize: YAZI.ikincil }}>
                          <span style={{ fontWeight: 700, color: RENK.metin }}>
                            {haftaAraligiMetni(haftaKaydir(ilkPazartesi, i))}
                          </span>
                          <span style={{ color: RENK.metinSoluk }}>
                            ← {w.week}. hafta{w.title ? ` · ${w.title}` : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: YAZI.kucuk, color: RENK.metinSoluk, marginTop: 3 }}>
                          {b.length} blok{dk > 0 ? ` · ${sureMetni(dk)}` : ""}
                          {" · "}
                          {dag.map((n, g) => (n ? `${GUN_KISA[g]} ${n}` : null)).filter(Boolean).join(" · ") || "boş"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: YAZI.kucuk, color: RENK.metinSilik, lineHeight: 1.5 }}>
                  Blokların hepsi seçilen zaman dilimine girer; sonra panoda sürükleyerek
                  dağıtabilirsiniz. Haftada plan varsa bloklar mevcutların yanına eklenir,
                  planda zaten olan blok ikinci kez eklenmez. Deneme, tekrar gibi dersi
                  olmayan satırlar serbest blok olur.
                </div>

                <button onClick={ekle} disabled={islemde || toplamBlok === 0 || ogrenciler.length === 0} style={{
                  padding: "11px 0", borderRadius: KOSE.m, border: "none",
                  background: toplamBlok && ogrenciler.length ? c.bg : "#ddd", color: "#fff",
                  fontSize: YAZI.govde, fontWeight: 700,
                  cursor: toplamBlok && ogrenciler.length && !islemde ? "pointer" : "not-allowed",
                  opacity: islemde ? 0.7 : 1,
                }}>
                  {islemde ? "Ekleniyor..." : `${toplamBlok} bloğu ${haftalar.length > 1 ? `${haftalar.length} haftalık ` : ""}plana ekle`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
