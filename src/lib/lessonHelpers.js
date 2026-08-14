// Takvim / ders planlama yardımcıları

export const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

// Pazartesi başlangıçlı gün başlıkları
export const DAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

// Yerel tarih → "YYYY-MM-DD" (UTC kaymasına takılmadan)
export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "HH:MM:SS" veya "HH:MM" → "HH:MM"
export function fmtTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

// Bir ayın ızgarasını Pazartesi başlangıçlı haftalar dizisi olarak üretir.
// Dönüş: [[{date, dateStr, inMonth}, ...7], ...] — boş kutular için date=null
export function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  // JS: 0=Paz ... 6=Cmt → Pazartesi başlangıcına çevir (0=Pzt ... 6=Paz)
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, dateStr: toDateStr(date), inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null });

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Ders durumu → rozet stili
export function lessonStatusStyle(status) {
  switch (status) {
    case "onaylandi":   return { label: "Onaylandı ✓",  bg: "#E8F9F0", color: "#1A6B3C" };
    case "beklemede":   return { label: "Onay bekliyor", bg: "#FFF7E6", color: "#854F0B" };
    case "reddedildi":  return { label: "Reddedildi",    bg: "#FFF0F0", color: "#A32D2D" };
    case "iptal":       return { label: "İptal edildi",  bg: "#f5f2ee", color: "#888"   };
    default:            return { label: status,          bg: "#f5f2ee", color: "#888"   };
  }
}

export const lessonTypeLabel = (t) => (t === "online" ? "Online" : "Yüz yüze");
