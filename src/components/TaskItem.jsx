import { useState, useRef } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { odevDosyalari, DOSYA_SINIRI } from "../lib/odevDosyalari";

// Görev öğesi: tamamlandı checkbox'ı + ödev yükleme / durum gösterimi
export default function TaskItem({ id, done, label, sub, color, onToggle, submission, uploading,
  onFileSelect, onFileRemove, ogretmenOnayi = null, onayNotu = null }) {
  const [checked, setChecked] = useState(done);
  const [saving,  setSaving]  = useState(false);
  const fileInputRef = useRef(null);

  // done DIŞARIDAN değiştiğinde kutucuk da değişmeli. checked yalnızca
  // ilk mount'ta done'dan alınıyor ve satır aynı key ile yeniden
  // kullanıldığı için React bileşeni yeniden kurmuyor: koç görevi
  // doğrulayıp is_done'ı değiştirdiğinde öğrencinin kutucuğu eski
  // halinde kalırdı. Effect yerine render sırasında ayarlanıyor —
  // React'in bu durum için önerdiği yol, fazladan bir render turu yok.
  const [oncekiDone, setOncekiDone] = useState(done);
  if (done !== oncekiDone) {
    setOncekiDone(done);
    setChecked(done);
  }

  // Hem yeni (dosyalar) hem eski (file_url) bicimi anliyor
  const dosyalar = odevDosyalari(submission);
  // Onaylanmis teslimin icerigi degismemeli
  const kaldirilabilir = !!onFileRemove && submission?.status !== "onaylandi";

  const handleToggle = async (e) => {
    e.stopPropagation();
    const next = !checked;
    setChecked(next);          // iyimser güncelleme: kutucuk hemen dolsun
    setSaving(true);
    const { hata } = await calistir(
      supabase.from("tasks").update({ is_done: next }).eq("id", id),
      "Görev güncelleme"
    );
    setSaving(false);
    if (hata) {
      setChecked(!next);       // yazma başarısızsa kutucuk yalan söylemesin
      return;
    }
    if (onToggle) onToggle(id, next);
  };

  // Durum rozeti stili
  const statusStyle = {
    beklemede:   { text: "İncelemede ⏳", bg: "#FFF7E6", color: "#854F0B" },
    onaylandi:   { text: "Onaylandı ✓",   bg: "#E8F9F0", color: "#1A6B3C" },
    iade_edildi: { text: "İade edildi ↩",  bg: "#FFF0F0", color: "#A32D2D" },
  };
  const badge = submission ? statusStyle[submission.status] : null;
  // Eskiden yalnızca "gönderim yok" ya da "iade edildi" halinde
  // yüklenebiliyordu; ilk dosya yüklenince buton kayboluyordu. Artık
  // ONAYLANANA KADAR dosya eklenebiliyor — ödev iki seferde teslim
  // edilebilsin diye. Onaylanmış teslime dokunulmuyor.
  const canUpload = !submission || submission.status !== "onaylandi";
  const doluMu    = dosyalar.length >= DOSYA_SINIRI;

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 0", borderBottom: "1px solid #f5f2ee",
      opacity: saving ? 0.6 : 1, transition: "opacity .15s",
    }}>
      {/* Checkbox */}
      <div onClick={handleToggle} style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
        border: checked ? "none" : `2px solid ${color}`,
        background: checked ? color : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "all .15s",
      }}>
        {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>

      {/* İçerik */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: checked ? "#bbb" : "#222",
          textDecoration: checked ? "line-through" : "none",
          transition: "all .15s",
        }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{sub}</div>}

        {/* Ödev alanı */}
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {/* Koçun fiziksel doğrulaması — ödev dosyası olmadan da olabilir */}
          {ogretmenOnayi && (
            <span style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 99, fontWeight: 600,
              background: ogretmenOnayi === "onaylandi" ? "#E8F9F0" : "#FFF0F0",
              color:      ogretmenOnayi === "onaylandi" ? "#1A6B3C" : "#A32D2D",
            }}>{ogretmenOnayi === "onaylandi" ? "Koç doğruladı ✓" : "İade edildi ↩"}</span>
          )}
          {/* Durum rozeti */}
          {badge && (
            <span style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 99,
              background: badge.bg, color: badge.color, fontWeight: 600,
            }}>{badge.text}</span>
          )}
          {/* Yüklenen dosyalar — her biri ayrı ayrı açılabilir ve
              (onaylanmadıysa) kaldırılabilir. Tek bir "Görüntüle" linki
              vardı; birden fazla dosyada hangisinin açıldığı belirsizdi. */}
          {dosyalar.map((d, i) => (
            <span key={d.url} style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 11, padding: "2px 4px 2px 9px", borderRadius: 99,
              background: "#f5f2ee", color: "#555", maxWidth: 190,
            }}>
              <a href={d.url} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                title={d.ad}
                style={{
                  color: "#555", textDecoration: "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                📎 {dosyalar.length > 1 ? `${i + 1}. ` : ""}{d.ad}
              </a>
              {kaldirilabilir && (
                <button
                  onClick={e => { e.stopPropagation(); onFileRemove?.(id, d.url); }}
                  disabled={uploading}
                  title="Bu dosyayı kaldır"
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    color: "#a99", fontSize: 12, lineHeight: 1, padding: "0 3px",
                  }}
                >✕</button>
              )}
            </span>
          ))}
          {/* Yükleme butonu */}
          {canUpload && !doluMu && (
            <button onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
              disabled={uploading} style={{
                fontSize: 11, padding: "2px 9px", borderRadius: 99,
                border: `1px solid ${color}55`, background: "transparent",
                color: color, cursor: uploading ? "not-allowed" : "pointer",
                fontWeight: 600, opacity: uploading ? 0.7 : 1,
              }}>
              {uploading
                ? "Yükleniyor..."
                : dosyalar.length > 0
                  ? `📎 Dosya ekle (${dosyalar.length}/${DOSYA_SINIRI})`
                  : submission?.status === "iade_edildi" ? "📎 Tekrar Yükle" : "📎 Ödev Yükle"}
            </button>
          )}
        </div>

        {/* Öğretmen notu — ödev incelemesinden ya da görev iadesinden */}
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

        {/* Gizli dosya seçici */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={e => {
            const secilenler = Array.from(e.target.files ?? []);
            if (secilenler.length > 0) onFileSelect?.(id, secilenler);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
