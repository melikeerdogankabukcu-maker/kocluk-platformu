// Konu ilerlemesi elle girilmiyor — yapılan işten hesaplanıyor.
//
// İki kaynak var ve ikisi de sayılıyor:
//   • Görevler (tasks): koçun atadığı tek seferlik işler.
//   • Haftalık plan blokları (calisma_bloklari): koçun haftaya yerleştirdiği
//     çalışma blokları. Plan ayrı bir sistem ama öğrenci açısından aynı şey —
//     yapılan çalışma. Yalnızca görevlere bakmak, planını eksiksiz yapan
//     öğrenciyi "hiç ilerlememiş" gösteriyordu.
//
// Ölçü "yapıldı" işareti: öğrenci bitirdiğini söyler söylemez sayılıyor,
// koç onayı beklenmiyor (görevlerdeki kuralın aynısı). Koç iade ederse
// blok yeniden açıldığı için oran kendiliğinden geri düşüyor.
//
// Konusu olmayan kayıtlarda başlık konu yerine geçiyor; dersi olmayanlar
// "Genel" altında toplanıyor.
const anahtar = (ders, konu) => `${ders || "Genel"}||${konu || "—"}`;

export function computeTopicProgress(tasks = [], planBloklari = []) {
  const map = new Map();

  const ekle = (subject, topic, yapildi, alan) => {
    const k = anahtar(subject, topic);
    const g = map.get(k) ?? {
      subject: subject || "Genel", topic: topic || "—",
      total: 0, done: 0, gorev: 0, blok: 0,
    };
    g.total += 1;
    if (yapildi) g.done += 1;
    g[alan] += 1;
    map.set(k, g);
  };

  tasks.forEach(t => ekle(t.subject, t.topic || t.title, t.is_done, "gorev"));
  planBloklari.forEach(b => ekle(b.ders, b.konu || b.baslik, b.yapildi, "blok"));

  return [...map.values()]
    .map(g => ({ ...g, percentage: Math.round((g.done / g.total) * 100) }))
    .sort((a, b) => b.percentage - a.percentage);
}

// Bir hafta için plan uyumu ve çalışılan süre.
// Bloklar zaten o haftaya süzülmüş geliyor.
export function planOzeti(bloklar = []) {
  const toplam = bloklar.length;
  const yapilan = bloklar.filter(b => b.yapildi).length;
  const dakika = bloklar.reduce((s, b) => s + (b.calisilan_dk || 0), 0);
  return {
    toplam, yapilan, dakika,
    // Plan yokken "%0" yazmak yanlış olurdu: yapılmamış bir iş değil,
    // hiç verilmemiş bir hafta.
    oran: toplam ? Math.round((yapilan / toplam) * 100) : null,
  };
}
