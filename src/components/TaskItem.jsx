import { testOzetMetni } from "../lib/testHelpers";

// Görev öğesi: durum + koç doğrulaması.
//
// ── ÖĞRENCİ İŞARETLEMİYOR ───────────────────────────────────────
// Görevi yalnızca koç kapatıyor. İşaretleme kutusu duruyor ama SALT
// OKUNUR: görevin durumunu göstermeye devam ediyor, tıklanmıyor.
// Kutucuk tıklanabilir kalsaydı öğrenci tıklar, veritabanı yazmayı
// reddeder ve nedenini anlamazdı — sessiz bir arıza olurdu.
//
// ── KANIT TESTTEN GELİYOR ───────────────────────────────────────
// Ödev dosyası yükleme akışı kaldırıldı. Öğrenci testi göreve bağlayıp
// görsellerini oraya yüklüyor; koç puanı ve görselleri görüp doğruluyor.
export default function TaskItem({ done, label, sub, color,
  ogretmenOnayi = null, onayNotu = null, testler = [] }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 0", borderBottom: "1px solid #f5f2ee",
    }}>
      {/* Durum göstergesi (salt okunur) */}
      <div title={done ? "Koç tarafından tamamlandı işaretlendi" : "Henüz tamamlanmadı"} style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
        border: done ? "none" : `2px solid ${color}55`,
        background: done ? color : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: done ? "#bbb" : "#222",
          textDecoration: done ? "line-through" : "none",
        }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{sub}</div>}

        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {/* Koçun kararı */}
          {ogretmenOnayi && (
            <span style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 99, fontWeight: 600,
              background: ogretmenOnayi === "onaylandi" ? "#E8F9F0" : "#FFF0F0",
              color:      ogretmenOnayi === "onaylandi" ? "#1A6B3C" : "#A32D2D",
            }}>{ogretmenOnayi === "onaylandi" ? "Koç doğruladı ✓" : "İade edildi ↩"}</span>
          )}

          {/* Bu göreve bağlanmış testler — kanıt buradan veriliyor.
              Test onaylandıktan sonra "Test Çözdüm" listesinden kalkıyor,
              o yüzden görevin altında görünmesi önemli: öğrencinin
              gönderdiği şeye ulaşabildiği tek yer burası. */}
          {testler.map(t => (
            <span key={t.id} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, padding: "2px 9px", borderRadius: 99,
              background: "#F8F3FC", color: "#7a5c92", fontWeight: 600,
            }}>
              🧪 {testOzetMetni(t)}
              {(t.dosyalar ?? []).map((d, i, hepsi) => (
                <a key={d.url} href={d.url} target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()} title={d.ad}
                  style={{ color: "#7a5c92", textDecoration: "none" }}
                >📎{hepsi.length > 1 ? i + 1 : ""}</a>
              ))}
            </span>
          ))}

          {/* Koç henüz bakmadıysa ne yapılacağını söyle */}
          {!ogretmenOnayi && testler.length === 0 && !done && (
            <span style={{ fontSize: 10.5, color: "#aaa" }}>
              Yaptığında “Test Çözdüm”den bu görevi seçerek gönder
            </span>
          )}
          {!ogretmenOnayi && testler.length > 0 && (
            <span style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 99,
              background: "#FFF7E6", color: "#854F0B", fontWeight: 600,
            }}>Koç incelemesi bekliyor</span>
          )}
        </div>

        {onayNotu && (
          <div style={{ fontSize: 11, color: "#A32D2D", marginTop: 4, fontStyle: "italic" }}>
            Koç: "{onayNotu}"
          </div>
        )}
      </div>
    </div>
  );
}
