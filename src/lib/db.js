// Supabase çağrıları için ortak hata kontrolü.
//
// Neden var: kod tabanında 18 yerde çağrının dönüşü hiç okunmuyordu.
// Supabase hata fırlatmaz, { data, error } döndürür — okunmayan error
// sessizce kaybolur. Auth.jsx'teki users insert'i tam olarak böyle
// bozuldu ve kimse fark etmedi. Öğretmen politikaları ogrencim_mi() ile
// daraltıldıktan sonra yazma çağrıları gerçekten reddedilebiliyor, yani
// sessiz başarısızlık artık teorik değil.
//
// Kullanım:
//   const { veri, hata } = await calistir(
//     supabase.from("tasks").update({ is_done: true }).eq("id", id),
//     "Görev güncelleme"
//   );
//
// sessiz: true  -> kullanıcıya uyarı gösterme, yalnızca konsola yaz.
//                  Arka planda kendiliğinden olan işler için (bildirim
//                  okundu işaretleme gibi); orada uyarı rahatsız edici olur.

// Promise.all ile yapılan toplu okumalar için. Bu çağrılar başarısız
// olduğunda sonuç `?? []` ile boş listeye düşüyor: ekranda hata değil,
// "veri yok" görünüyor. Render'da anon anahtar yanlış girildiğinde tam
// olarak bu tuzağa düştük — her şey 200 dönüyordu, sadece boştu.
// Kullanıcıya uyarı basmıyoruz (boş liste zaten görünür bir sonuç) ama
// konsola yazıyoruz ki sebep aranabilsin.
export function hatalariBildir(sonuclar, etiketler) {
  sonuclar.forEach((s, i) => {
    if (s?.error) console.error(`[${etiketler[i] ?? "sorgu " + i}]`, s.error);
  });
  return sonuclar;
}

export async function calistir(sorgu, aciklama, { sessiz = false } = {}) {
  const { data, error } = await sorgu;

  if (error) {
    console.error(`[${aciklama}]`, error);
    if (!sessiz) {
      alert(`${aciklama} başarısız:\n${error.message}`);
    }
    return { veri: null, hata: error };
  }

  return { veri: data, hata: null };
}
