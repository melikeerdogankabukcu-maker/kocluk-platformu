import { odevDosyalari } from "../lib/odevDosyalari";
import { testOzetMetni } from "../lib/testHelpers";

// Görev öğesi: durum + koç doğrulaması.
//
// ── ARTIK ÖĞRENCİ İŞARETLEMİYOR ─────────────────────────────────
// Görevi yalnızca koç kapatıyor. İşaretleme kutusu duruyor ama SALT
// OKUNUR: görevin durumunu göstermeye devam ediyor, tıklanmıyor.
// Kutucuk tıklanabilir kalsaydı öğrenci tıklar, veritabanı yazmayı
// reddeder ve nedenini anlamazdı — yetkiyi kaldırıp arayüzde bırakmak
// sessiz bir arıza olurdu.
//
// ── ÖDEV YÜKLEME BURADAN KALKTI ─────────────────────────────────
// Kanıt artık "Test Çözdüm" üzerinden veriliyor: öğrenci testi göreve
// bağlayıp görsellerini oraya yüklüyor. Daha önce yüklenmiş ödev
// dosyaları burada SALT OKUNUR olarak görünmeye devam ediyor; yoksa
// öğrenci teslim ettiği işin kaybolduğunu sanırdı.
export default function TaskItem({ done, label, sub, color, submission,
  ogretmenOnayi = null, onayNotu = null, testler = [] }) {
  const eskiDosyalar = odevDosyalari(submission);

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

          {/* Bu göreve bağlanmış testler — kanıt buradan veriliyor */}
          {testler.map(t => (
            <span key={t.id} style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 99,
              background: "#F8F3FC", color: "#7a5c92", fontWeight: 600,
            }}>
              🧪 {testOzetMetni(t)}
              {(t.dosyalar?.length || t.file_url) ? " · görselli" : ""}
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

          {/* Eskiden yüklenmiş ödev dosyaları — salt okunur */}
          {eskiDosyalar.map((d, i) => (
            <a key={d.url} href={d.url} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()} title={d.ad}
              style={{
                fontSize: 11, padding: "2px 9px", borderRadius: 99,
                background: "#f5f2ee", color: "#555", textDecoration: "none",
                maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>📎 {eskiDosyalar.length > 1 ? `${i + 1}. ` : ""}{d.ad}</a>
          ))}
        </div>

        {submission?.teacher_note && (
          <div style={{ fontSize: 11, color: "#888", marginTop: 4, fontStyle: "italic" }}>
            Öğretmen: "{submission.teacher_note}"
          </div>
        )}
        {onayNotu && (
          <div style={{ fontSize: 11, color: "#A32D2D", marginTop: 4, fontStyle: "italic" }}>
            Koç: "{onayNotu}"
          </div>
        )}
      </div>
    </div>
  );
}
