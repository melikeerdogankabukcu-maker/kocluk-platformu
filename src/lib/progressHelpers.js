// Konu ilerlemesi artık elle girilmiyor — görevlerden otomatik hesaplanıyor.
// Bir konunun ilerlemesi = o konuya atanan görevlerden tamamlananların oranı.
// Konusu olmayan eski görevlerde başlık konu yerine geçer.
export function computeTopicProgress(tasks) {
  const map = new Map();
  tasks.forEach(t => {
    const subject = t.subject || "Genel";
    const topic   = t.topic || t.title || "—";
    const key     = `${subject}||${topic}`;
    const g = map.get(key) ?? { subject, topic, total: 0, done: 0 };
    g.total += 1;
    if (t.is_done) g.done += 1;
    map.set(key, g);
  });
  return [...map.values()]
    .map(g => ({ ...g, percentage: Math.round((g.done / g.total) * 100) }))
    .sort((a, b) => b.percentage - a.percentage);
}
