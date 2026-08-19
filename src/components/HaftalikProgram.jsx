import { useState } from "react";
import Modal from "./Modal";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Haftalık görev programının yazdırılabilir görünümü.
//
// PDF için harici kütüphane KULLANILMIYOR — VeliRaporu'ndaki kararın aynısı:
// jsPDF'in gömülü fontları Türkçe karakterleri (ş/ğ/ı/İ) bozuyor ve düzeltmek
// ~300KB font gömmeyi gerektiriyor. Tarayıcının yazdırma motoru hem Türkçe'yi
// doğru basıyor hem de "PDF olarak kaydet" seçeneğini zaten veriyor.
//
// İçerik yalnızca tasks tablosundan geliyor. Öğretmenin kendi yazdığı
// programlar zaten göreve dönüştüğü için burada görünür; gömülü hazır
// programların adımları (program_atamalari) DAHİL DEĞİL — onlar haftalık
// hedef olarak işleyen ayrı bir yapı.

const GUN_ADLARI = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const gunAnahtari = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Verilen tarihin içinde bulunduğu haftanın PAZARTESİ'si.
// getDay(): 0=Pazar ... 6=Cumartesi. Pazar'ı haftanın SONU sayıyoruz,
// o yüzden pazar için 6 gün geri gidiliyor.
function haftaBasi(tarih = new Date()) {
  const d = new Date(tarih);
  d.setHours(0, 0, 0, 0);
  const gun = d.getDay();
  d.setDate(d.getDate() - (gun === 0 ? 6 : gun - 1));
  return d;
}

const kisaTarih = (d) =>
  d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });

export default function HaftalikProgram({
  tasks = [], ogrenciAdi, color: c, variant = "buton", baslik = "Haftalık Program",
}) {
  const [acik, setAcik] = useState(false);
  const [bas, setBas] = useState(() => haftaBasi());

  const gunler = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(bas);
    d.setDate(d.getDate() + i);
    return d;
  });
  const son = gunler[6];

  // Görevleri güne dağıt
  const gunlukler = gunler.map(d => {
    const anahtar = gunAnahtari(d);
    return {
      tarih: d,
      anahtar,
      gorevler: tasks
        .filter(t => t.due_date === anahtar)
        .sort((a, b) => (a.subject ?? "").localeCompare(b.subject ?? "")),
    };
  });

  const haftaToplam = gunlukler.reduce((s, g) => s + g.gorevler.length, 0);
  const haftaBiten  = gunlukler.reduce((s, g) => s + g.gorevler.filter(t => t.is_done).length, 0);

  // Tarihi olmayan bekleyen görevler haftaya düşmüyor ama öğrencinin yapması
  // gereken işler; çıktının altında ayrı bir bölümde listeleniyor.
  const tarihsiz = tasks.filter(t => !t.due_date && !t.is_done);

  const haftaKaydir = (yon) => {
    const d = new Date(bas);
    d.setDate(d.getDate() + yon * 7);
    setBas(d);
  };

  const govde = (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #haftalik-program, #haftalik-program * { visibility: visible !important; }
          #haftalik-program {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; padding: 0 !important;
            max-height: none !important; overflow: visible !important;
          }
          .yazdirma-gizle { display: none !important; }
          /* Bir gün kutusu sayfa sonunda ikiye bölünmesin */
          .gun-kutusu { break-inside: avoid; page-break-inside: avoid; }
          @page { margin: 14mm; }
        }
      `}</style>

      {/* Hafta seçimi ve yazdırma — çıktıda görünmez */}
      <div className="yazdirma-gizle" style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
        <button onClick={() => haftaKaydir(-1)} style={gezBtn(c)}>‹</button>
        <button onClick={() => setBas(haftaBasi())} style={{ ...gezBtn(c), width: "auto", padding: "0 12px" }}>
          Bu hafta
        </button>
        <button onClick={() => haftaKaydir(1)} style={gezBtn(c)}>›</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{
          padding: "9px 16px", borderRadius: 10, border: "none",
          background: c.bg, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>🖨️ Yazdır / PDF olarak kaydet</button>
      </div>

      <div id="haftalik-program" style={{ background: "#fff" }}>
        {/* Başlık */}
        <div style={{ borderBottom: "2px solid #222", paddingBottom: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#111" }}>
            Haftalık Çalışma Programı
          </div>
          <div style={{ fontSize: 12.5, color: "#555", marginTop: 3 }}>
            {ogrenciAdi ? `${ogrenciAdi} · ` : ""}
            {kisaTarih(bas)} – {kisaTarih(son)} {son.getFullYear()}
          </div>
          <div style={{ fontSize: 11.5, color: "#777", marginTop: 2 }}>
            {haftaToplam} görev{haftaToplam > 0 ? ` · ${haftaBiten} tamamlandı` : ""}
          </div>
        </div>

        {haftaToplam === 0 && (
          <div style={{ fontSize: 12.5, color: "#888", padding: "18px 0", textAlign: "center" }}>
            Bu haftaya atanmış görev yok.
          </div>
        )}

        {/* Günler */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {gunlukler.map((g, i) => {
            if (g.gorevler.length === 0) return null;
            return (
              <div key={g.anahtar} className="gun-kutusu" style={{
                border: "1px solid #ddd", borderRadius: 6, overflow: "hidden",
              }}>
                <div style={{
                  padding: "5px 10px", background: "#f4f4f2",
                  borderBottom: "1px solid #ddd",
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>
                    {GUN_ADLARI[i]}
                  </span>
                  <span style={{ fontSize: 10.5, color: "#777" }}>
                    {kisaTarih(g.tarih)} · {g.gorevler.length} görev
                  </span>
                </div>
                <div>
                  {g.gorevler.map((t, j) => (
                    <div key={t.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "6px 10px",
                      borderTop: j > 0 ? "1px solid #f0f0ee" : "none",
                    }}>
                      {/* Kağıt üzerinde işaretlenebilsin diye kutucuk */}
                      <span style={{
                        flexShrink: 0, marginTop: 1,
                        width: 11, height: 11, border: "1.3px solid #888", borderRadius: 2,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, color: "#222", lineHeight: 1,
                      }}>{t.is_done ? "✓" : ""}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#111", fontWeight: 600 }}>{t.title}</div>
                        {(t.subject || t.topic || t.estimated_minutes || t.description) && (
                          <div style={{ fontSize: 10.5, color: "#777", marginTop: 1 }}>
                            {[t.subject, t.topic,
                              t.estimated_minutes ? `${t.estimated_minutes} dk` : null,
                              t.description].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {tarihsiz.length > 0 && (
          <div className="gun-kutusu" style={{ marginTop: 12, border: "1px dashed #ccc", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "5px 10px", background: "#fafafa", borderBottom: "1px dashed #ddd",
              fontSize: 11.5, fontWeight: 700, color: "#666" }}>
              Tarihi belirtilmemiş görevler ({tarihsiz.length})
            </div>
            {tarihsiz.map((t, j) => (
              <div key={t.id} style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 10px",
                borderTop: j > 0 ? "1px solid #f0f0ee" : "none",
              }}>
                <span style={{
                  flexShrink: 0, marginTop: 1, width: 11, height: 11,
                  border: "1.3px solid #888", borderRadius: 2,
                }} />
                <div style={{ fontSize: 12, color: "#111" }}>
                  {t.title}
                  {t.subject && <span style={{ color: "#777" }}> · {t.subject}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, paddingTop: 8, borderTop: "1px solid #eee",
          fontSize: 9.5, color: "#aaa" }}>
          Koçluk Platformu · {new Date().toLocaleDateString("tr-TR")}
        </div>
      </div>
    </>
  );

  return (
    <>
      {variant === "buton" ? (
        <button onClick={() => setAcik(true)} style={{
          fontSize: 11, padding: "4px 12px", borderRadius: 99, fontWeight: 600,
          border: `1px solid ${c.mid}55`, background: "transparent", color: c.mid, cursor: "pointer",
        }}>🗓️ Haftalık Program</button>
      ) : (
        <Card id="bolum-haftalik">
          <SectionTitle title={baslik} color={c.mid} />
          <button onClick={() => setAcik(true)} style={{
            width: "100%", padding: "11px 0", borderRadius: 12,
            border: `1.5px dashed ${c.mid}`, background: "transparent",
            color: c.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>🗓️ Haftalık programı yazdır</button>
        </Card>
      )}

      {acik && (
        <Modal title={baslik} onClose={() => setAcik(false)} maxWidth={680}>
          {govde}
        </Modal>
      )}
    </>
  );
}

const gezBtn = (c) => ({
  width: 32, height: 32, borderRadius: 8, border: "1px solid #f0ede8",
  background: "#fff", color: c.mid, fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontWeight: 700, flexShrink: 0,
});
