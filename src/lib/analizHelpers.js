// Sınav sonuçlarından hızlı, lokal "içgörü" kartları üretir (öğrenci ekranındaki
// son sınavlar listesi için). Asıl derinlemesine analiz Python backend'inden gelir.
export function generateInsights(exams) {
  if (exams.length === 0) return [];
  const insights = [];

  if (exams.length >= 2) {
    const diff = Number(exams[0].total_net) - Number(exams[1].total_net);
    if (diff > 0.5)
      insights.push({ type: "success", text: `Son denemede +${diff.toFixed(1)} net artış 📈` });
    else if (diff < -0.5)
      insights.push({ type: "danger", text: `Son denemede ${diff.toFixed(1)} net düşüş, analiz et 📉` });
    else
      insights.push({ type: "warn", text: "Son iki deneme benzer seviyede, ivme kazan! 💪" });
  }

  const latest = exams[0];
  if (latest.subject_nets && Object.keys(latest.subject_nets).length > 0) {
    const nets = Object.entries(latest.subject_nets)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => [k, Number(v)]);
    if (nets.length > 1) {
      nets.sort((a, b) => b[1] - a[1]);
      insights.push({ type: "success", text: `En güçlü ders: ${nets[0][0]} (${nets[0][1].toFixed(1)} net) 🏆` });
      insights.push({ type: "warn",    text: `Gelişim alanı: ${nets[nets.length - 1][0]} (${nets[nets.length - 1][1].toFixed(1)} net) 💡` });
    }
  }

  return insights;
}

// Backend'den gelen "genel_degerlendirme.durum" değerine göre kart stili (renk + emoji).
// Öğrenci, öğretmen ve veli ekranlarındaki "Genel Değerlendirme" kartlarında ortak kullanılır.
export function genelDegerlendirmeStil(durum) {
  const stiller = {
    mukemmel:        { bg: "#E1F5EE", renk: "#085041", emoji: "🌟" },
    yontem_sorunu:   { bg: "#FFF7E6", renk: "#854F0B", emoji: "🤔" },
    istikrarli_emek: { bg: "#EEEDFE", renk: "#3C3489", emoji: "⏳" },
    potansiyel_var:  { bg: "#FFF7E6", renk: "#854F0B", emoji: "💪" },
    acil_mudahale:   { bg: "#FFF0F0", renk: "#A32D2D", emoji: "🚨" },
    ilgi_dusuk:      { bg: "#FFF0F0", renk: "#A32D2D", emoji: "📉" },
    gelisiyor:       { bg: "#E1F5EE", renk: "#085041", emoji: "🌱" },
  };
  return stiller[durum] || { bg: "#fafaf8", renk: "#888", emoji: "📊" };
}
