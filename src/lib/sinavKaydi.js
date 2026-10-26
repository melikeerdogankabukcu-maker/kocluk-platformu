// Sınav kaydı ↔ form dönüşümü — SAF, Node'da sınanabilir.
//
// ── NEDEN GEREKİYOR ────────────────────────────────────────────
// Kayıt veritabanında DİZİ olarak duruyor: aynı konudan iki yanlış
// varsa `["Türev","Türev"]`. Form ise ADETLİ harita tutuyor
// (`{Türev: 2}`) çünkü ekranda "×2" gösterip + / − ile değiştiriyor.
// Düzenleme bu iki biçim arasında gidip gelmek demek; dönüşüm iki
// yönlü ve ters çevrilebilir olmak zorunda, yoksa kaydı açıp hiçbir
// şey değiştirmeden kaydetmek veriyi bozardı.

// ["Türev","Türev","Limit"] → { Türev: 2, Limit: 1 }
export function adetHaritasi(dizi) {
  const harita = {};
  (Array.isArray(dizi) ? dizi : []).forEach(konu => {
    if (konu == null || konu === "") return;
    harita[konu] = (harita[konu] ?? 0) + 1;
  });
  return harita;
}

// { Türev: 2, Limit: 1 } → ["Türev","Türev","Limit"]
export function haritayiAc(harita) {
  return Object.entries(harita ?? {})
    .flatMap(([konu, adet]) => Array(Math.max(0, adet | 0)).fill(konu));
}

// Kayıttan formun ders haritasını kurar.
//
// Sayılar DİZE olarak dönüyor: form alanları metin girdisi ve sayıya
// çevirince 0 ile boş ayırt edilemez oluyor — "0 doğru" ile "hiç
// girilmemiş" aynı şeye düşerdi.
export function kayittanDersler(kayit) {
  const ayrinti = kayit?.subject_details ?? null;
  if (!ayrinti || typeof ayrinti !== "object") return {};
  return Object.fromEntries(Object.entries(ayrinti).map(([ders, v]) => [ders, {
    dogru:  v?.dogru  == null ? "" : String(v.dogru),
    yanlis: v?.yanlis == null ? "" : String(v.yanlis),
    yanlisKonular: adetHaritasi(v?.yanlis_konular),
    bosKonular:    adetHaritasi(v?.bos_konular),
  }]));
}

// Eski kayıtlarda ders ayrıntısı olmayabiliyor: yalnız `subject_nets`
// yazılmış. O kayıt forma açıldığında doğru/yanlış sayıları
// KURTARILAMIYOR (netten geriye çıkmıyor) ve kaydetmek netleri
// silerdi. Çağıran taraf bunu kullanıcıya söylüyor.
export function ayrintiEksikMi(kayit) {
  if (!kayit) return false;
  const ayrinti = kayit.subject_details;
  const netler  = kayit.subject_nets;
  const bos = (o) => !o || typeof o !== "object" || Object.keys(o).length === 0;
  return bos(ayrinti) && !bos(netler);
}

// Listede gösterilecek özet satır.
export function kayitOzeti(kayit, adBul) {
  const net = kayit?.total_net;
  return {
    ogrenci: adBul?.(kayit?.student_id) ?? "—",
    ad:      kayit?.exam_name ?? "—",
    tur:     kayit?.exam_type ?? "—",
    tarih:   kayit?.exam_date ?? null,
    net:     net == null ? null : Number(net),
    dersSayisi: Object.keys(kayit?.subject_nets ?? {}).length,
  };
}
