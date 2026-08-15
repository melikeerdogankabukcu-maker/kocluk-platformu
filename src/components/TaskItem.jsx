import { useState, useRef } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";

// Görev öğesi: tamamlandı checkbox'ı + ödev yükleme / durum gösterimi
export default function TaskItem({ id, done, label, sub, color, onToggle, submission, uploading, onFileSelect }) {
  const [checked, setChecked] = useState(done);
  const [saving,  setSaving]  = useState(false);
  const fileInputRef = useRef(null);

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
  const badge     = submission ? statusStyle[submission.status] : null;
  const canUpload = !submission || submission.status === "iade_edildi";

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
          {/* Durum rozeti */}
          {badge && (
            <span style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 99,
              background: badge.bg, color: badge.color, fontWeight: 600,
            }}>{badge.text}</span>
          )}
          {/* Görüntüle linki */}
          {submission?.file_url && (
            <a href={submission.file_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 99,
              background: "#f5f2ee", color: "#555", textDecoration: "none",
            }}>📎 Görüntüle</a>
          )}
          {/* Yükleme butonu */}
          {canUpload && (
            <button onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
              disabled={uploading} style={{
                fontSize: 11, padding: "2px 9px", borderRadius: 99,
                border: `1px solid ${color}55`, background: "transparent",
                color: color, cursor: uploading ? "not-allowed" : "pointer",
                fontWeight: 600, opacity: uploading ? 0.7 : 1,
              }}>
              {uploading ? "Yükleniyor..." : submission?.status === "iade_edildi" ? "📎 Tekrar Yükle" : "📎 Ödev Yükle"}
            </button>
          )}
        </div>

        {/* Öğretmen notu */}
        {submission?.teacher_note && (
          <div style={{ fontSize: 11, color: "#888", marginTop: 4, fontStyle: "italic" }}>
            Öğretmen: "{submission.teacher_note}"
          </div>
        )}

        {/* Gizli dosya seçici */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onFileSelect?.(id, file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
